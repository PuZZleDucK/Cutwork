import { afterEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { MusicDraft, VideoInput } from '../../packages/core/src/contracts/studio.ts';
const stores: StudioStore[] = [], directories: string[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'studio-history-')); directories.push(directory);
  const path = join(directory, 'studio.sqlite'), store = openStudioStore(path); stores.push(store);
  return { store, path, project: store.createProject('History fixture') };
}
function song(store: StudioStore, projectId: string) {
  const attempt = store.submitMusic(projectId, randomUUID(), { musicPrompt: 'Original user music input', lyrics: 'Original lyrics' });
  return store.finishMusic(attempt.id, { title: 'Song', assetId: randomUUID(), assetPath: `/managed/${randomUUID()}.wav`, sha256: 'a'.repeat(64), sampleCount: '480000', sampleRate: 48000, channels: 2, durationSeconds: 10, truncated: false,
    analysis: { state: 'available', estimatedBpm: 120, sampleIndices: ['0', '24000', '48000'], waveformBucketSamples: 480, peaks: [1.25], version: 'test-1', error: null } }, { toolPrompt: 'Agent-translated prompt' });
}
function clip(store: StudioStore, projectId: string, songId: string) {
  const a = store.submitVideo(projectId, randomUUID(), { songId, startFrame: 0, endFrame: 1, clipPrompt: 'Original clip prompt', style: 'Current visual direction' });
  return store.finishVideo(a.id, { title: 'Clip', video: { assetId: randomUUID(), path: `/managed/${randomUUID()}.mp4`, sha256: 'b'.repeat(64) }, audio: null, frameCount: 1, width: 640, height: 480, fps: '24/1',
    frames: [{ index: 0, assetId: randomUUID(), path: `/managed/${randomUUID()}.png`, sha256: 'c'.repeat(64), pixelSha256: 'd'.repeat(64), bytes: 100 }] }, {});
}
test('committed style edits retain exact before/after and timestamps; no-op/conflict/invalid save writes no event', () => {
  const { store: s, project: p, path } = fixture();
  expect(s.project(p.id).events.map(e => e.kind)).toEqual(['project.created']);
  const first: MusicDraft = { musicPrompt: 'Idea', lyrics: 'Words', style: ' Neon  ' };
  s.saveDraft(p.id, 0, first);
  const events = s.project(p.id).events, style = events.find(e => e.kind === 'style.changed')!;
  expect(style).toMatchObject({ projectId: p.id, data: { before: '', after: ' Neon  ', revision: 1 } }); expect(Number.isFinite(Date.parse(style.createdAt))).toBe(true);
  expect(events.find(e => e.kind === 'draft.saved')!.data).toMatchObject({ before: { musicPrompt: '', lyrics: '' }, after: { musicPrompt: 'Idea', lyrics: 'Words' } });
  s.saveDraft(p.id, 1, first); expect(s.project(p.id).events).toEqual(events);
  expect(() => s.saveDraft(p.id, 1, { ...first, style: 'Stale' })).toThrow();
  expect(() => s.saveDraft(p.id, 2, { ...first, style: 'x'.repeat(16001) })).toThrow(); expect(s.project(p.id).events).toEqual(events);
  s.close(); const reopened = openStudioStore(path); stores.push(reopened); expect(reopened.project(p.id).events).toEqual(events);
});
test('song selection, analysis and placement changes join the ledger without no-op or foreign-project pollution', () => {
  const { store: s, project: p } = fixture(), one = song(s, p.id), two = song(s, p.id), c = clip(s, p.id, one.id);
  const selected = s.project(p.id).project; s.selectSong(p.id, one.id, selected.revision);
  let events = s.project(p.id).events;
  expect(events.filter(e => e.kind === 'song.selected').map(e => e.data.cause)).toEqual(['generation', 'generation', 'user']);
  s.selectSong(p.id, one.id, selected.revision + 1); expect(s.project(p.id).events).toEqual(events);
  s.setAnalysis(one.id, one.analysis); expect(s.project(p.id).events).toEqual(events);
  s.setAnalysis(one.id, { ...one.analysis, version: 'test-2', estimatedBpm: 121 });
  expect(s.project(p.id).events.at(-1)).toMatchObject({ kind: 'analysis.updated', data: { songId: one.id, before: { estimatedBpm: 120, version: 'test-1' }, after: { estimatedBpm: 121, version: 'test-2' } } });
  const initial = s.arrangement(p.id, one.id), placement = initial.placements[0]!;
  s.movePlacement(p.id, one.id, initial.revision, placement.id, 10);
  expect(s.project(p.id).events.at(-1)).toMatchObject({ kind: 'placement.moved', data: { songId: one.id, before: { startFrame: 0 }, after: { startFrame: 10 }, revision: 2 } });
  events = s.project(p.id).events; s.movePlacement(p.id, one.id, 2, placement.id, 10); expect(s.project(p.id).events).toEqual(events);
  s.removePlacement(p.id, one.id, 3, placement.id); expect(s.project(p.id).events.at(-1)).toMatchObject({ kind: 'placement.removed', data: { placement: { clipId: c.id, startFrame: 10 } } });
  const other = s.createProject('Other'); const otherEvents = s.project(other.id).events;
  expect(() => s.selectSong(other.id, two.id, 0)).toThrow(); expect(s.project(other.id).events).toEqual(otherEvents);
  expect(s.project(other.id).events.every(e => e.projectId === other.id)).toBe(true);
});
test('selection navigation and cached render reuse log only actual new operations, not idempotent replay', () => {
  const { store: s, project: p } = fixture(), audio = song(s, p.id), other = s.createProject('Other');
  const initial = s.project(p.id).events.length; s.selectProject(p.id); s.selectProject(p.id);
  expect(s.project(p.id).events.slice(initial).map(e => e.kind)).toEqual(['project.selected']);
  const render = s.enqueueRender(p.id, audio.id, 0, randomUUID()), key = randomUUID();
  expect(s.enqueueRender(p.id, audio.id, 0, key).id).toBe(render.id); const events = s.project(p.id).events;
  expect(events.at(-1)).toMatchObject({ kind: 'render.reused', data: { renderId: render.id, revision: 0 } });
  s.enqueueRender(p.id, audio.id, 0, key); expect(s.project(p.id).events).toEqual(events);
  s.invalidateRenderCache(render.id); const invalidated = s.project(p.id).events; expect(invalidated.at(-1)!.kind).toBe('render.cache_invalidated');
  s.invalidateRenderCache(render.id); expect(s.project(p.id).events).toEqual(invalidated);
  expect(s.project(other.id).events).toHaveLength(1);
});
test.each([1, 2])('schema %i migration preserves existing rows bytewise and does not invent old edit events', version => {
  const { store: s, project: p, path } = fixture(); const audio = song(s, p.id); clip(s, p.id, audio.id); s.saveDraft(p.id, s.project(p.id).project.revision, { musicPrompt: 'Saved', lyrics: '', style: 'Old unlogged style' }); s.close();
  const before = new Database(path), tables = ['studio_projects', 'studio_attempts', 'studio_songs', 'studio_assets', 'studio_video_attempts', 'studio_clips', 'studio_arrangements'];
  const rows = Object.fromEntries(tables.map(table => [table, before.prepare(`SELECT * FROM ${table}`).all()]));
  before.exec(`DROP TABLE studio_events; UPDATE studio_meta SET version=${version}`); before.close();
  const reopened = openStudioStore(path); stores.push(reopened); expect(reopened.project(p.id).events).toEqual([]);
  const check = new Database(path, { readonly: true }); expect(check.prepare('SELECT version FROM studio_meta').get()).toEqual({ version: 8 });
  for (const table of tables) expect(check.prepare(`SELECT * FROM ${table}`).all()).toEqual(rows[table]); check.close();
  const old = reopened.project(p.id).project; reopened.saveDraft(p.id, old.revision, { ...old.draft, style: 'New logged style' });
  expect(reopened.project(p.id).events).toEqual([expect.objectContaining({ kind: 'style.changed', data: { before: 'Old unlogged style', after: 'New logged style', revision: old.revision + 1 } })]);
});
test('exact typed timing intent is immutable, validated against song beats and unchanged on replay after analysis changes', () => {
  const { store: s, project: p, path } = fixture(), audio = song(s, p.id), key = randomUUID();
  const input: VideoInput = { songId: audio.id, clipPrompt: 'Beat timed', style: '', startFrame: 4, endFrame: 24,
    timingIntent: { start: { unit: 'beats', value: '1.3333333333333333334' }, end: { unit: 'seconds', value: '1.000000000000000000' } } };
  const a = s.submitVideo(p.id, key, input); expect(a.input).toEqual(input);
  expect(() => s.submitVideo(p.id, randomUUID(), { ...input, startFrame: 5 })).toThrow();
  expect(() => s.submitVideo(p.id, randomUUID(), { ...input, timingIntent: { ...input.timingIntent!, start: { unit: 'frames', value: '0' } } })).toThrow();
  expect(() => s.submitVideo(p.id, randomUUID(), { ...input, timingIntent: { ...input.timingIntent!, start: { unit: 'seconds', value: 'NaN' } } })).toThrow();
  s.setAnalysis(audio.id, { ...audio.analysis, sampleIndices: ['0', '48000', '96000'], estimatedBpm: 60 });
  expect(s.submitVideo(p.id, key, input)).toEqual(a); expect(() => s.submitVideo(p.id, randomUUID(), input)).toThrow();
  s.close(); const reopened = openStudioStore(path); stores.push(reopened); expect(reopened.videoAttempt(a.id)).toEqual(a);
});
