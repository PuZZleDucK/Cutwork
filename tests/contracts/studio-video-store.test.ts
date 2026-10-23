/** Persistence decisions only: no files decoded and no agent/model executions. */
import { afterEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore, StudioStoreError } from '../../apps/server/src/studio/store.ts';
import type { StudioStore, VideoOutputInput } from '../../apps/server/src/studio/store-contract.ts';
import type { VideoInput } from '../../packages/core/src/contracts/studio.ts';
const stores: StudioStore[] = [], directories: string[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'studio-video-')); directories.push(dir);
  const path = join(dir, 'studio.sqlite'), s = openStudioStore(path); stores.push(s);
  const p = s.createProject('Video'); const song = addSong(s, p.id);
  const input: VideoInput = { songId: song.id, clipPrompt: 'A robot dances', style: 'Neon', startFrame: 0, endFrame: 4,
    requestedIntervalSeconds: { start: '0', end: '0.12500000000000000001' } };
  return { s, p, song, input, path };
}
function addSong(s: StudioStore, projectId: string) {
  const a = s.submitMusic(projectId, randomUUID(), { musicPrompt: 'Synthetic music', lyrics: '' });
  return s.finishMusic(a.id, { title: 'Fixture', assetId: randomUUID(), assetPath: `/managed/${projectId}/${randomUUID()}.wav`, sha256: 'a'.repeat(64),
    sampleCount: '480000', sampleRate: 48000, channels: 2, durationSeconds: 10, truncated: false,
    analysis: { state: 'available', estimatedBpm: 120, sampleIndices: ['0', '24000'], waveformBucketSamples: 1, peaks: [1.25], error: null, version: 'fixture' } }, {});
}
function asset(extension: string) { return { assetId: randomUUID(), path: `/managed/${randomUUID()}.${extension}`, sha256: 'b'.repeat(64) }; }
function output(count = 5): VideoOutputInput {
  return { title: 'Clip', video: asset('mp4'), audio: { ...asset('flac'), sampleCount: '10000', sampleRate: 48000, channels: 2 },
    frames: Array.from({ length: count }, (_, index) => ({ ...asset('png'), index, pixelSha256: 'c'.repeat(64), bytes: 100 })),
    frameCount: count, width: 640, height: 480, fps: '24/1' };
}
function failure(fn: () => unknown, statusCode: number) {
  try { fn(); throw new Error('Expected failure'); } catch (error) { expect(error).toBeInstanceOf(StudioStoreError); expect(error).toMatchObject({ statusCode }); }
}
test('captures exact interval, song identity, provider/seeds and globally ordered acceptance; dedup survives reopen', () => {
  const { s, p, song, input, path } = setup(), key = randomUUID(), a = s.submitVideo(p.id, key, input);
  expect(a.song).toEqual({ id: song.id, assetId: song.assetId, sha256: song.sha256, sampleCount: song.sampleCount, sampleRate: song.sampleRate, channels: song.channels });
  expect(a.input).toEqual(input); expect(a.seeds.h3).toMatch(/^(0|[1-9][0-9]*)$/); expect(BigInt(a.seeds.h3)).toBeLessThan(1n << 63n);
  const music = s.submitMusic(p.id, randomUUID(), { musicPrompt: 'Next', lyrics: '' });
  const next = s.submitVideo(p.id, randomUUID(), { songId: input.songId, clipPrompt: input.clipPrompt, style: input.style, startFrame: 4, endFrame: 8 });
  expect(s.attempts()[0]!.sequence).toBeLessThan(a.sequence); expect(a.sequence).toBeLessThan(music.sequence); expect(music.sequence).toBeLessThan(next.sequence);
  s.setProvider('claude'); expect(s.submitVideo(p.id, key, input)).toEqual(a);
  failure(() => s.submitVideo(p.id, key, { ...input, style: 'Changed' }), 409);
  s.close(); const reopened = openStudioStore(path); stores.push(reopened);
  expect(reopened.submitVideo(p.id, key, input)).toEqual(a); expect(reopened.project(p.id).reservations).toHaveLength(2);
});
test('rejects invalid intervals, exact intent mismatch, foreign songs and unsafe JSON without reserving', () => {
  const { s, p, input } = setup(), other = s.createProject('Other');
  for (const bad of [{ ...input, endFrame: 0 }, { ...input, startFrame: -1 }, { ...input, startFrame: 0.25 }, { ...input, endFrame: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, clipPrompt: ' ' }, { ...input, extra: true }, { ...input, requestedIntervalSeconds: { start: '0', end: '1' } },
    { ...input, requestedIntervalSeconds: { start: 'NaN', end: '1' } }]) failure(() => s.submitVideo(p.id, randomUUID(), bad), 400);
  failure(() => s.submitVideo(other.id, randomUUID(), input), 404);
  expect(s.videoAttempts()).toEqual([]); expect(s.project(p.id).reservations).toEqual([]);
});
test('once-only ingestion preserves every raw frame and auto-places captured range on original unselected song', () => {
  const { s, p, song, input } = setup(), a = s.submitVideo(p.id, randomUUID(), input), newest = addSong(s, p.id), out = output();
  s.patchVideoAttempt(a.id, { state: 'running', details: { prompt: 'Processed tool prompt' } });
  const clip = s.finishVideo(a.id, out, { prompt: 'Processed tool prompt' });
  expect(clip.nativeFrames).toBe(5); expect(clip.requestedFrames).toBe(4); expect(clip.rawFrames).toHaveLength(5);
  expect(clip.rawFrames.map(f => f.index)).toEqual([0, 1, 2, 3, 4]); expect(JSON.stringify(clip)).not.toContain('/managed/');
  expect(s.asset(clip.assetId)!.mediaType).toBe('video/mp4'); expect(s.asset(clip.rawFrames[0]!.assetId)!.mediaType).toBe('image/png');
  expect(s.asset(clip.audioAssetId!)!.mediaType).toBe('audio/flac'); expect(s.asset(song.assetId)!.mediaType).toBe('audio/wav');
  const arrangement = s.arrangement(p.id, song.id); expect(arrangement.revision).toBe(1);
  expect(arrangement.placements).toEqual([{ id: expect.any(String), clipId: clip.id, startFrame: 0, endFrame: 4, sourceStartFrame: 0, priority: 1 }]);
  expect(s.arrangement(p.id, newest.id).placements).toEqual([]); expect(s.project(p.id).project.selectedSongId).toBe(newest.id);
  expect(s.project(p.id).reservations).toEqual([]); expect(s.finishVideo(a.id, out, { ignored: 'must not overwrite' })).toEqual(clip);
  expect(s.arrangement(p.id, song.id)).toEqual(arrangement); expect(s.videoAttempt(a.id)!.details).toEqual({ prompt: 'Processed tool prompt' });
  failure(() => s.finishVideo(a.id, { ...out, title: 'Overwrite' }, {}), 409);
});
test('ingestion validates complete contiguous source manifest and rolls back every registration on conflict', () => {
  const { s, p, input } = setup(), a = s.submitVideo(p.id, randomUUID(), input);
  const bad = output(); bad.frames[2]!.index = 3;
  failure(() => s.finishVideo(a.id, bad, {}), 400); expect(s.asset(bad.video.assetId)).toBeNull();
  const short = output(3); failure(() => s.finishVideo(a.id, short, {}), 400);
  const duplicate = output(); duplicate.frames[2]!.path = duplicate.video.path;
  failure(() => s.finishVideo(a.id, duplicate, {}), 409); expect(s.asset(duplicate.video.assetId)).toBeNull();
  expect(s.project(p.id).clips).toEqual([]); expect(s.videoAttempt(a.id)!.state).toBe('queued'); expect(s.arrangement(p.id, input.songId).revision).toBe(0);
});
test('arrangements enforce revisions/project ownership/source bounds and preserve moved holes', () => {
  const { s, p, song, input } = setup(), clip = s.finishVideo(s.submitVideo(p.id, randomUUID(), input).id, output(), {}), original = s.arrangement(p.id, song.id);
  const moved = s.movePlacement(p.id, song.id, original.revision, original.placements[0]!.id, 20);
  expect(moved.placements[0]).toMatchObject({ startFrame: 20, endFrame: 24, sourceStartFrame: 0 });
  failure(() => s.removePlacement(p.id, song.id, original.revision, original.placements[0]!.id), 409);
  failure(() => s.addPlacement(p.id, song.id, moved.revision, { clipId: clip.id, startFrame: 0, sourceStartFrame: 4, frameCount: 2 }), 400);
  const other = s.createProject('Other'), otherSong = addSong(s, other.id);
  failure(() => s.addPlacement(other.id, otherSong.id, 0, { clipId: clip.id, startFrame: 0 }), 404);
  const added = s.addPlacement(p.id, song.id, moved.revision, { clipId: clip.id, startFrame: 22, frameCount: 3 });
  expect(added.placements[1]!.priority).toBeGreaterThan(added.placements[0]!.priority);
  const removed = s.removePlacement(p.id, song.id, added.revision, added.placements[0]!.id); expect(removed.placements).toHaveLength(1);
  expect(s.clip(clip.id)!.rawFrames).toHaveLength(5);
});
test('project coverage counts union of real placements only, not reservations or beyond-song frames', () => {
  const { s, p, input } = setup();
  s.submitVideo(p.id, randomUUID(), { ...input, endFrame: 240, requestedIntervalSeconds: { start: '0', end: '10' } });
  expect(s.listProjects()[0]!.coveragePercent).toBe(0);
  const clip = s.finishVideo(s.submitVideo(p.id, randomUUID(), { ...input, endFrame: 24, requestedIntervalSeconds: { start: '0', end: '1' } }).id, output(25), {});
  expect(s.listProjects()[0]!.coveragePercent).toBe(10);
  s.addPlacement(p.id, input.songId, 1, { clipId: clip.id, startFrame: 0 }); expect(s.listProjects()[0]!.coveragePercent).toBe(10);
});
test('render captures revision-bound immutable snapshot, completes once and does not adopt later edits', () => {
  const { s, p, song, input, path } = setup(), clip = s.finishVideo(s.submitVideo(p.id, randomUUID(), input).id, output(), {});
  const key = randomUUID(), r = s.enqueueRender(p.id, song.id, 1, key);
  expect(r.snapshot.clips[0]).toEqual(clip); expect(r.snapshotHash).toMatch(/^[0-9a-f]{64}$/); expect(r.assetId).toBeNull();
  expect(s.enqueueRender(p.id, song.id, 1, key)).toEqual(r);
  s.movePlacement(p.id, song.id, 1, r.snapshot.arrangement.placements[0]!.id, 100);
  expect(s.enqueueRender(p.id, song.id, 1, key)).toEqual(r); // network replay remains original even after edits
  failure(() => s.enqueueRender(p.id, song.id, 1, randomUUID()), 409);
  failure(() => s.enqueueRender(p.id, song.id, 2, key), 409);
  const out = { ...asset('mp4'), frameCount: 240, planHash: 'd'.repeat(64), receiptPath: '/managed/render/receipt.json' };
  const done = s.finishRender(r.id, out, { fullDecode: true }); expect(done.state).toBe('succeeded'); expect(done.revision).toBe(1);
  expect(s.finishRender(r.id, out, {})).toEqual(done); failure(() => s.finishRender(r.id, { ...out, frameCount: 241 }, {}), 409);
  s.close(); const reopened = openStudioStore(path); stores.push(reopened);
  expect(reopened.render(r.id)).toEqual(done); expect(reopened.arrangement(p.id, song.id).revision).toBe(2);
});
test('render rejects wrong frame length and project ownership and terminal mutation', () => {
  const { s, p, song } = setup(), other = s.createProject('Other');
  failure(() => s.enqueueRender(other.id, song.id, 0, randomUUID()), 404);
  const r = s.enqueueRender(p.id, song.id, 0, randomUUID());
  const out = { ...asset('mp4'), frameCount: 239, planHash: 'd'.repeat(64), receiptPath: '/managed/receipt.json' };
  failure(() => s.finishRender(r.id, out, {}), 400); expect(s.asset(out.assetId)).toBeNull();
  s.patchRender(r.id, { state: 'failed', error: 'Synthetic failure' }); failure(() => s.finishRender(r.id, { ...out, frameCount: 240 }, {}), 409);
  failure(() => s.patchRender(r.id, { state: 'running' }), 409);
});
test('restart leaves queued reservations but marks dispatched video and renders reconciling', () => {
  const { s, p, song, input } = setup(), queued = s.submitVideo(p.id, randomUUID(), input), active = s.submitVideo(p.id, randomUUID(), input);
  s.patchVideoAttempt(active.id, { state: 'running' });
  const rq = s.enqueueRender(p.id, song.id, 0, randomUUID()), secondSong = addSong(s, p.id), ra = s.enqueueRender(p.id, secondSong.id, 0, randomUUID()); s.patchRender(ra.id, { state: 'running' });
  s.markInterrupted(); expect(s.videoAttempt(queued.id)!.state).toBe('queued'); expect(s.videoAttempt(active.id)!.state).toBe('reconciling');
  expect(s.render(rq.id)!.state).toBe('queued'); expect(s.render(ra.id)!.state).toBe('reconciling');
  expect(s.project(p.id).reservations).toHaveLength(2);
  failure(() => s.finishVideo(active.id, output(), {}), 409);
  s.patchVideoAttempt(queued.id, { state: 'failed' }); expect(s.project(p.id).reservations).toHaveLength(1);
});
test('schema v1 migration retains music/history/assets and establishes empty arrangements and ordering', () => {
  const { s, p, song, path } = setup(), original = s.project(p.id).attempts[0]!; s.close();
  const db = new Database(path); db.exec(`UPDATE studio_meta SET version=1; DROP TABLE studio_video_attempts; DROP TABLE studio_clips; DROP TABLE studio_arrangements; DROP TABLE studio_renders; DROP TABLE studio_acceptance; ALTER TABLE studio_assets DROP COLUMN media_type;`); db.close();
  const reopened = openStudioStore(path); stores.push(reopened);
  expect(reopened.attempt(original.id)).toEqual(original); expect(reopened.asset(song.assetId)!.mediaType).toBe('audio/wav');
  expect(reopened.arrangement(p.id, song.id)).toMatchObject({ revision: 0, placements: [] });
  const next = reopened.submitVideo(p.id, randomUUID(), { songId: song.id, clipPrompt: 'New', style: '', startFrame: 0, endFrame: 1 });
  expect(next.sequence).toBeGreaterThan(original.sequence);
});

test('different render keys alias matching active/completed profile+media snapshot durably, but changed revision does not', () => {
  const { s, p, song, input, path } = setup();
  const clip = s.finishVideo(s.submitVideo(p.id, randomUUID(), input).id, output(), {});
  const first = s.enqueueRender(p.id, song.id, 1, randomUUID()), aliasKey = randomUUID();
  expect(s.enqueueRender(p.id, song.id, 1, aliasKey)).toEqual(first); expect(s.renders()).toHaveLength(1);
  const done = s.finishRender(first.id, { ...asset('mp4'), frameCount: 240, planHash: 'd'.repeat(64), receiptPath: '/managed/receipt.json' }, {});
  expect(s.enqueueRender(p.id, song.id, 1, randomUUID())).toEqual(done);
  s.addPlacement(p.id, song.id, 1, { clipId: clip.id, startFrame: 20 });
  const changed = s.enqueueRender(p.id, song.id, 2, randomUUID()); expect(changed.id).not.toBe(first.id);
  failure(() => s.enqueueRender(p.id, song.id, 2, aliasKey), 409);
  s.close(); const reopened = openStudioStore(path); stores.push(reopened);
  expect(reopened.enqueueRender(p.id, song.id, 1, aliasKey)).toEqual(done); expect(reopened.renders()).toHaveLength(2);
});
test('failed, reconciling and invalidated successful renders are never reused by new keys; immutable history remains', () => {
  const { s, p, song } = setup(), failedKey = randomUUID(), first = s.enqueueRender(p.id, song.id, 0, failedKey);
  s.patchRender(first.id, { state: 'failed', error: 'Synthetic' });
  const second = s.enqueueRender(p.id, song.id, 0, randomUUID()); expect(second.id).not.toBe(first.id);
  s.patchRender(second.id, { state: 'reconciling' });
  const third = s.enqueueRender(p.id, song.id, 0, randomUUID()); expect(third.id).not.toBe(second.id);
  const done = s.finishRender(third.id, { ...asset('mp4'), frameCount: 240, planHash: 'e'.repeat(64), receiptPath: '/managed/third.json' }, {});
  s.invalidateRenderCache(third.id); expect(s.render(third.id)).toEqual(done);
  const fresh = s.enqueueRender(p.id, song.id, 0, randomUUID()); expect(fresh.id).not.toBe(third.id);
  expect(s.enqueueRender(p.id, song.id, 0, failedKey).state).toBe('failed');
});
