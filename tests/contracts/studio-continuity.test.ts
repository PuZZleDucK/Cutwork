/** Cross-context persistence regressions. Synthetic metadata only; no generators or media I/O. */
import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore, StudioStoreError } from '../../apps/server/src/studio/store.ts';
import type { SongInput, StudioStore, VideoOutputInput } from '../../apps/server/src/studio/store-contract.ts';
import type { VideoInput } from '../../packages/core/src/contracts/studio.ts';
const stores: StudioStore[] = [], dirs: string[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
function open(path: string) { const s = openStudioStore(path); stores.push(s); return s; }
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'studio-continuity-')); dirs.push(dir); const path = join(dir, 'studio.sqlite'); return { s: open(path), path }; }
function songOutput(projectId: string): SongInput {
  return { title: 'Synthetic continuity fixture', assetId: randomUUID(), assetPath: `/managed/projects/${projectId}/${randomUUID()}.wav`, sha256: 'a'.repeat(64), sampleCount: '480000', sampleRate: 48000, channels: 2, durationSeconds: 10, truncated: false,
    analysis: { state: 'available', estimatedBpm: 120, sampleIndices: ['0', '24000'], waveformBucketSamples: 4800, peaks: [1.25], error: null, version: 'fixture' } };
}
function song(s: StudioStore, projectId: string, prompt = 'Original music') {
  const attempt = s.submitMusic(projectId, randomUUID(), { musicPrompt: prompt, lyrics: `Lyrics for ${prompt}` }), output = songOutput(projectId);
  return { attempt, output, song: s.finishMusic(attempt.id, output, { toolPrompt: `Translated ${prompt}` }) };
}
function videoInput(songId: string, startFrame = 24): VideoInput { return { songId, clipPrompt: 'Clockwork lights', style: 'Original visual style', startFrame, endFrame: startFrame + 4 }; }
function videoOutput(projectId: string): VideoOutputInput {
  const asset = (ext: string) => ({ assetId: randomUUID(), path: `/managed/projects/${projectId}/${randomUUID()}.${ext}`, sha256: 'b'.repeat(64) });
  return { title: 'Fixture clip', video: asset('mp4'), audio: { ...asset('flac'), sampleCount: '10000', sampleRate: 48000, channels: 2 }, frames: Array.from({ length: 5 }, (_, index) => ({ ...asset('png'), index, pixelSha256: 'c'.repeat(64), bytes: 100 })), frameCount: 5, width: 640, height: 480, fps: '24/1' };
}
function status(action: () => unknown, statusCode: number) { try { action(); } catch (error) { expect(error).toBeInstanceOf(StudioStoreError); expect(error).toMatchObject({ statusCode }); return; } throw new Error('Expected rejected store operation'); }

test('late music completion selects exactly once in its own project without replay stealing a manual selection', () => {
  const { s, path } = fixture(), a = s.createProject('A'), first = song(s, a.id, 'First'), pending = s.submitMusic(a.id, randomUUID(), { musicPrompt: 'Second', lyrics: '' });
  const b = s.createProject('B'), bSong = song(s, b.id, 'Unrelated'), bBefore = s.project(b.id), output = songOutput(a.id), second = s.finishMusic(pending.id, output, { verified: true });
  expect(s.selectedProject()).toBe(b.id); expect(s.project(b.id)).toEqual(bBefore); expect(s.project(a.id).project.selectedSongId).toBe(second.id);
  const current = s.project(a.id).project; s.selectSong(a.id, first.song.id, current.revision);
  const before = s.project(a.id); s.close(); const reopened = open(path), secondConnection = open(path);
  expect(secondConnection.finishMusic(pending.id, output, { maliciousOverwrite: true })).toEqual(second);
  expect(reopened.project(a.id)).toEqual(before); expect(reopened.project(b.id).project.selectedSongId).toBe(bSong.song.id); expect(reopened.selectedProject()).toBe(b.id);
  expect(before.events.filter(e => e.kind === 'song.selected' && e.data.after === second.id)).toHaveLength(1);
  expect(reopened.project(a.id).songs).toHaveLength(2); expect(reopened.attempt(pending.id)!.details).toEqual({ verified: true });
});

test('new songs start empty and an old arrangement retains independent source windows, placement priority and gaps after reopen', () => {
  const { s, path } = fixture(), p = s.createProject('A'), first = song(s, p.id), input = videoInput(first.song.id), attempt = s.submitVideo(p.id, randomUUID(), input), clip = s.finishVideo(attempt.id, videoOutput(p.id), {});
  const initial = s.arrangement(p.id, first.song.id), added = s.addPlacement(p.id, first.song.id, initial.revision, { clipId: clip.id, startFrame: 70, sourceStartFrame: 2, frameCount: 2 });
  const edited = s.movePlacement(p.id, first.song.id, added.revision, added.placements[0]!.id, 9), next = song(s, p.id, 'Replacement');
  expect(s.arrangement(p.id, next.song.id)).toMatchObject({ revision: 0, placements: [] }); expect(s.project(p.id).clips).toEqual([clip]);
  s.selectSong(p.id, first.song.id, s.project(p.id).project.revision); s.close(); const reopened = open(path);
  expect(reopened.arrangement(p.id, first.song.id)).toEqual(edited); expect(reopened.project(p.id).project.selectedSongId).toBe(first.song.id);
  expect(edited.placements).toEqual([expect.objectContaining({ startFrame: 9, endFrame: 13, sourceStartFrame: 0, priority: 1 }), expect.objectContaining({ startFrame: 70, endFrame: 72, sourceStartFrame: 2, priority: 2 })]);
  const reused = reopened.addPlacement(p.id, next.song.id, 0, { clipId: clip.id, startFrame: 0, sourceStartFrame: 1, frameCount: 3 });
  expect(reused.placements).toHaveLength(1); expect(reopened.arrangement(p.id, first.song.id)).toEqual(edited); expect(reopened.clip(clip.id)).toEqual(clip);
});

test.each(['queued', 'running'] as const)('%s work retains captured project/song/provider/seeds across all selections and later completion', state => {
  const { s, path } = fixture(), a = s.createProject('A'), original = song(s, a.id), key = randomUUID(), input = videoInput(original.song.id), video = s.submitVideo(a.id, key, input), music = s.submitMusic(a.id, randomUUID(), { musicPrompt: 'Pending A music', lyrics: '' });
  if (state === 'running') { s.patchAttempt(music.id, { state }); s.patchVideoAttempt(video.id, { state }); }
  const capturedMusic = s.attempt(music.id), capturedVideo = s.videoAttempt(video.id), next = song(s, a.id, 'New selected A song'), b = s.createProject('B'), bSong = song(s, b.id);
  s.setProvider('claude'); const newMusic = s.submitMusic(b.id, randomUUID(), { musicPrompt: 'Future B', lyrics: '' }), newVideo = s.submitVideo(b.id, randomUUID(), videoInput(bSong.song.id));
  const bBefore = s.project(b.id); expect(newMusic.provider).toBe('claude'); expect(newVideo.provider).toBe('claude');
  s.close(); const reopened = open(path); expect(reopened.attempt(music.id)).toEqual(capturedMusic); expect(reopened.videoAttempt(video.id)).toEqual(capturedVideo); expect(reopened.submitVideo(a.id, key, input)).toEqual(capturedVideo);
  const output = videoOutput(a.id), clip = reopened.finishVideo(video.id, output, { verified: true });
  expect(reopened.project(b.id)).toEqual(bBefore); expect(reopened.selectedProject()).toBe(b.id); expect(reopened.project(a.id).project.selectedSongId).toBe(next.song.id);
  expect(reopened.arrangement(a.id, original.song.id).placements).toEqual([expect.objectContaining({ clipId: clip.id, startFrame: 24, endFrame: 28 })]); expect(reopened.arrangement(a.id, next.song.id).placements).toEqual([]);
  const after = reopened.project(a.id); reopened.finishVideo(video.id, output, {}); expect(reopened.project(a.id)).toEqual(after);
  expect(reopened.videoAttempt(video.id)).toMatchObject({ provider: 'codex', projectId: a.id, input, seeds: video.seeds, nativeCallId: video.nativeCallId });
});

test('submission keys are scoped to project and operation; changed replays conflict without replacing originals', () => {
  const { s, path } = fixture(), a = s.createProject('A'), aSong = song(s, a.id), b = s.createProject('B'), bSong = song(s, b.id), key = randomUUID(), musicInput = { musicPrompt: 'Shared text', lyrics: '' };
  const am = s.submitMusic(a.id, key, musicInput); s.setProvider('claude'); const bm = s.submitMusic(b.id, key, musicInput);
  const av = s.submitVideo(a.id, key, videoInput(aSong.song.id)), bv = s.submitVideo(b.id, key, videoInput(bSong.song.id));
  const ar = s.enqueueRender(a.id, aSong.song.id, 0, key), br = s.enqueueRender(b.id, bSong.song.id, 0, key);
  expect(new Set([am.id, bm.id, av.id, bv.id, ar.id, br.id]).size).toBe(6); expect(am.provider).toBe('codex'); expect(bm.provider).toBe('claude');
  const before = [s.project(a.id), s.project(b.id)];
  status(() => s.submitMusic(a.id, key, { ...musicInput, lyrics: 'Different' }), 409); status(() => s.submitVideo(a.id, key, { ...av.input, startFrame: 0 }), 409); status(() => s.enqueueRender(a.id, aSong.song.id, 1, key), 409);
  expect([s.project(a.id), s.project(b.id)]).toEqual(before); s.close(); const r = open(path);
  expect(r.submitMusic(a.id, key, musicInput)).toEqual(am); expect(r.submitMusic(b.id, key, musicInput)).toEqual(bm); expect(r.submitVideo(a.id, key, av.input)).toEqual(av); expect(r.enqueueRender(b.id, bSong.song.id, 0, key)).toEqual(br);
});

test('foreign song/clip/placement identities and asset collisions cannot contaminate either project', () => {
  const { s } = fixture(), a = s.createProject('A'), sa = song(s, a.id), va = s.submitVideo(a.id, randomUUID(), videoInput(sa.song.id)), out = videoOutput(a.id), clip = s.finishVideo(va.id, out, {}), b = s.createProject('B'), sb = song(s, b.id);
  const before = [s.project(a.id), s.project(b.id)], placement = s.arrangement(a.id, sa.song.id).placements[0]!;
  for (const action of [() => s.selectSong(b.id, sa.song.id, 1), () => s.submitVideo(b.id, randomUUID(), videoInput(sa.song.id)), () => s.arrangement(b.id, sa.song.id), () => s.enqueueRender(b.id, sa.song.id, 1, randomUUID()), () => s.addPlacement(b.id, sb.song.id, 0, { clipId: clip.id, startFrame: 0 }), () => s.movePlacement(b.id, sb.song.id, 0, placement.id, 5), () => s.removePlacement(b.id, sb.song.id, 0, placement.id)]) status(action, 404);
  expect([s.project(a.id), s.project(b.id)]).toEqual(before);
  const pending = s.submitVideo(b.id, randomUUID(), videoInput(sb.song.id)), fresh = videoOutput(b.id), failedBefore = s.project(b.id);
  for (const frame of [{ ...fresh.frames[2]!, assetId: out.frames[0]!.assetId }, { ...fresh.frames[2]!, path: out.frames[0]!.path }]) {
    const colliding = { ...fresh, frames: fresh.frames.map((f, i) => i === 2 ? frame : f) }; status(() => s.finishVideo(pending.id, colliding, {}), 409);
    expect(s.asset(fresh.video.assetId)).toBeNull(); expect(s.asset(fresh.frames[0]!.assetId)).toBeNull(); expect(s.project(b.id)).toEqual(failedBefore);
  }
  expect(s.asset(out.frames[0]!.assetId)).toEqual({ projectId: a.id, path: out.frames[0]!.path, sha256: out.frames[0]!.sha256, mediaType: 'image/png' }); expect(s.project(a.id)).toEqual(before[0]);
});

test('stale project/arrangement writes conflict after interleaved completions and leave committed context untouched', () => {
  const { s, path } = fixture(), other = open(path), p = s.createProject('A'), first = song(s, p.id), staleProject = s.project(p.id).project;
  song(other, p.id, 'Concurrent result'); const currentProject = s.project(p.id);
  status(() => s.saveDraft(p.id, staleProject.revision, { musicPrompt: 'Stale', lyrics: '', style: '' }), 409); status(() => s.selectSong(p.id, first.song.id, staleProject.revision), 409); expect(s.project(p.id)).toEqual(currentProject);
  const firstVideo = s.submitVideo(p.id, randomUUID(), videoInput(first.song.id)), clip = s.finishVideo(firstVideo.id, videoOutput(p.id), {}), staleArrangement = s.arrangement(p.id, first.song.id);
  const next = other.submitVideo(p.id, randomUUID(), videoInput(first.song.id, 30)); other.finishVideo(next.id, videoOutput(p.id), {}); const current = s.project(p.id);
  for (const action of [() => s.addPlacement(p.id, first.song.id, staleArrangement.revision, { clipId: clip.id, startFrame: 0 }), () => s.movePlacement(p.id, first.song.id, staleArrangement.revision, staleArrangement.placements[0]!.id, 0), () => s.removePlacement(p.id, first.song.id, staleArrangement.revision, staleArrangement.placements[0]!.id), () => s.enqueueRender(p.id, first.song.id, staleArrangement.revision, randomUUID())]) status(action, 409);
  expect(s.project(p.id)).toEqual(current);
});

test('interruption marks active work uncertain without retargeting, blind retry, duplicate completion or new acceptance', () => {
  const { s, path } = fixture(), p = s.createProject('A'), first = song(s, p.id), key = randomUUID(), queued = s.submitVideo(p.id, key, videoInput(first.song.id));
  const active = s.submitVideo(p.id, randomUUID(), videoInput(first.song.id, 30)); s.patchVideoAttempt(active.id, { state: 'running', details: { nativePid: 123 } });
  const music = s.submitMusic(p.id, randomUUID(), { musicPrompt: 'Running music', lyrics: '' }); s.patchAttempt(music.id, { state: 'validating' });
  const qmusic = s.submitMusic(p.id, randomUUID(), { musicPrompt: 'Queued music', lyrics: '' }); const b = s.createProject('B'); s.setProvider('claude'); s.close(); const r = open(path); r.markInterrupted();
  expect(r.videoAttempt(queued.id)).toEqual(queued); expect(r.attempt(qmusic.id)).toEqual(qmusic); expect(r.videoAttempt(active.id)).toMatchObject({ state: 'reconciling', input: active.input, song: active.song, provider: active.provider, seeds: active.seeds, nativeCallId: active.nativeCallId, details: { nativePid: 123 } }); expect(r.attempt(music.id)!.state).toBe('reconciling');
  const before = r.project(p.id); status(() => r.finishVideo(active.id, videoOutput(p.id), {}), 409); status(() => r.finishMusic(music.id, songOutput(p.id), {}), 409); expect(r.project(p.id)).toEqual(before);
  r.markInterrupted(); expect(r.project(p.id)).toEqual(before); expect(r.submitVideo(p.id, key, videoInput(first.song.id))).toEqual(queued); expect(r.selectedProject()).toBe(b.id); expect(r.provider()).toBe('claude');
});

test('accepted identity fields cannot be patched or mutated through returned objects while requests wait or run', () => {
  const { s } = fixture(), p = s.createProject('A'), first = song(s, p.id), music = s.submitMusic(p.id, randomUUID(), { musicPrompt: 'Accepted music', lyrics: 'Original lyrics' }), video = s.submitVideo(p.id, randomUUID(), videoInput(first.song.id));
  s.patchAttempt(music.id, { state: 'running' }); s.patchVideoAttempt(video.id, { state: 'running' });
  const beforeMusic = s.attempt(music.id)!, beforeVideo = s.videoAttempt(video.id)!;
  const copyMusic = s.attempt(music.id)!, copyVideo = s.videoAttempt(video.id)!;
  copyMusic.input.musicPrompt = 'Local mutation'; copyMusic.seeds.abc = '1'; copyVideo.input.startFrame = 100; copyVideo.song.sha256 = 'd'.repeat(64); copyVideo.seeds.h3 = '1';
  expect(s.attempt(music.id)).toEqual(beforeMusic); expect(s.videoAttempt(video.id)).toEqual(beforeVideo);
  for (const patch of [{ provider: 'claude' }, { model: 'Other model' }, { projectId: randomUUID() }, { nativeCallId: randomUUID() }, { input: { musicPrompt: 'Replacement', lyrics: '' } }, { seeds: { abc: '1', semantic: '2', nar: '3' } }]) {
    status(() => s.patchAttempt(music.id, patch as Parameters<StudioStore['patchAttempt']>[1]), 400);
  }
  for (const patch of [{ provider: 'claude' }, { projectId: randomUUID() }, { song: { ...video.song, id: randomUUID() } }, { input: { ...video.input, startFrame: 10 } }, { seeds: { h3: '1' } }]) {
    status(() => s.patchVideoAttempt(video.id, patch as Parameters<StudioStore['patchVideoAttempt']>[1]), 400);
  }
  expect(s.attempt(music.id)).toEqual(beforeMusic); expect(s.videoAttempt(video.id)).toEqual(beforeVideo);
});
