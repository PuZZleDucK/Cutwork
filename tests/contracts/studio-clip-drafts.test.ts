/** Draft persistence is independent from generation validity and immutable accepted intent. */
import { afterEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStudioStore, StudioStoreError } from '../../apps/server/src/studio/store.ts';
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { ClipTimingIntent } from '../../packages/core/src/time/linked-timing.ts';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { registerStudioApi } from '../../apps/server/src/studio/api.ts';
import type { StudioRuntime } from '../../apps/server/src/studio/runtime-contract.ts';
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
function open(path: string) { const store = openStudioStore(path); cleanup.push(() => store.close()); return store; }
function song(store: StudioStore, projectId: string) {
  const a = store.submitMusic(projectId, randomUUID(), { musicPrompt: 'Synthetic fixture', lyrics: '' });
  return store.finishMusic(a.id, { title: 'Fixture', assetId: randomUUID(), assetPath: `/managed/projects/${projectId}/${randomUUID()}.wav`, sha256: 'a'.repeat(64), sampleCount: '480000', sampleRate: 48000, channels: 2, durationSeconds: 10, truncated: false,
    analysis: { state: 'available', estimatedBpm: 120, sampleIndices: ['0', '24000'], waveformBucketSamples: 1, peaks: [1.25], error: null, version: 'fixture' } }, {});
}
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'studio-clip-drafts-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true })); const path = join(dir, 'studio.sqlite'), s = open(path), p = s.createProject('A'), audio = song(s, p.id); return { dir, path, s, p, audio }; }
function status(action: () => unknown, statusCode: number) { try { action(); } catch (error) { expect(error).toBeInstanceOf(StudioStoreError); expect(error).toMatchObject({ statusCode }); return; } throw new Error('Expected rejection'); }
const intent: ClipTimingIntent = { start: { unit: 'seconds', value: '0.00000000000000000001' }, end: { unit: 'rational', value: { numerator: '1', denominator: '3' } } };
const draft = { clipPrompt: '  A light made of gears\n  ', timingIntent: intent };

test('each song has a durable independent empty draft; saved exact text survives selection, reopen and newer song ingestion', () => {
  const { s, p, audio, path } = fixture();
  expect(s.project(p.id).clipDrafts).toEqual([{ projectId: p.id, songId: audio.id, revision: 0, clipPrompt: '', timingIntent: null }]);
  const projectBefore = s.project(p.id).project, arrangementBefore = s.arrangement(p.id, audio.id);
  const saved = s.saveClipDraft(p.id, audio.id, 0, draft);
  expect(saved).toEqual({ projectId: p.id, songId: audio.id, revision: 1, ...draft }); expect(s.project(p.id).project).toEqual(projectBefore); expect(s.arrangement(p.id, audio.id)).toEqual(arrangementBefore);
  const second = song(s, p.id), other = s.createProject('Other'), otherSong = song(s, other.id);
  s.saveClipDraft(other.id, otherSong.id, 0, { clipPrompt: 'Other project', timingIntent: null });
  s.selectSong(p.id, audio.id, s.project(p.id).project.revision); s.close(); const reopened = open(path);
  expect(reopened.project(p.id).clipDrafts).toEqual([saved, { projectId: p.id, songId: second.id, revision: 0, clipPrompt: '', timingIntent: null }]);
  expect(reopened.project(other.id).clipDrafts).toEqual([expect.objectContaining({ songId: otherSong.id, clipPrompt: 'Other project' })]);
});

test('no-op saves do not revise or log, concurrent and stale clears cannot overwrite a newer draft', () => {
  const { s, p, audio, path } = fixture(), other = open(path), first = s.saveClipDraft(p.id, audio.id, 0, draft);
  const before = s.project(p.id); expect(other.saveClipDraft(p.id, audio.id, 1, structuredClone(draft))).toEqual(first); expect(s.project(p.id)).toEqual(before);
  const changed = other.saveClipDraft(p.id, audio.id, 1, { ...draft, clipPrompt: 'Edited in another tab' }), committed = s.project(p.id);
  status(() => s.saveClipDraft(p.id, audio.id, 1, { clipPrompt: '', timingIntent: null }), 409); status(() => s.saveClipDraft(p.id, audio.id, 1, { ...draft, clipPrompt: changed.clipPrompt }), 409); expect(s.project(p.id)).toEqual(committed);
  const events = committed.events.filter(e => e.kind === 'clip_draft.saved');
  expect(events).toEqual([expect.objectContaining({ data: { songId: audio.id, revision: 1, changedFields: ['clipPrompt', 'timingIntent'] } }), expect.objectContaining({ data: { songId: audio.id, revision: 2, changedFields: ['clipPrompt'] } })]);
  expect(JSON.stringify(events)).not.toContain('Edited in another tab'); expect(JSON.stringify(events)).not.toContain(draft.clipPrompt);
});

test('unfinished, inverted and currently invalid timing text remains editable but is never accepted as generation', () => {
  const { s, p, audio } = fixture(); let revision = 0;
  const inputs: ClipTimingIntent[] = [
    { start: { unit: 'seconds', value: '-' }, end: { unit: 'beats', value: '' } },
    { start: { unit: 'frames', value: '200' }, end: { unit: 'seconds', value: '0.1' } },
    { start: { unit: 'rational', value: { numerator: '', denominator: '0' } }, end: { unit: 'seconds', value: 'NaN' } },
  ];
  for (const timingIntent of inputs) {
    const saved = s.saveClipDraft(p.id, audio.id, revision++, { clipPrompt: '', timingIntent }); expect(saved.timingIntent).toEqual(timingIntent);
    status(() => s.submitVideo(p.id, randomUUID(), { songId: audio.id, clipPrompt: 'Ready prompt', style: '', startFrame: 0, endFrame: 3, timingIntent }), 400);
  }
  expect(s.videoAttempts()).toEqual([]); expect(s.project(p.id).reservations).toEqual([]);
  expect(s.saveClipDraft(p.id, audio.id, revision, { clipPrompt: '', timingIntent: null }).timingIntent).toBeNull();
});

test('draft editing and clearing cannot rewrite submitted requests; late clear conflicts preserve new work', () => {
  const { s, p, audio } = fixture(), saved = s.saveClipDraft(p.id, audio.id, 0, draft), key = randomUUID();
  const accepted = s.submitVideo(p.id, key, { songId: audio.id, clipPrompt: saved.clipPrompt, style: 'Submitted style', startFrame: 0, endFrame: 8, timingIntent: saved.timingIntent! });
  s.saveClipDraft(p.id, audio.id, saved.revision, { clipPrompt: 'Next shot', timingIntent: null });
  status(() => s.saveClipDraft(p.id, audio.id, saved.revision, { clipPrompt: '', timingIntent: null }), 409);
  s.setProvider('claude'); expect(s.videoAttempt(accepted.id)).toEqual(accepted); expect(s.submitVideo(p.id, key, accepted.input)).toEqual(accepted);
  expect(s.project(p.id).clipDrafts[0]!.clipPrompt).toBe('Next shot'); expect(s.project(p.id).reservations).toHaveLength(1);
});

test('draft shape, bounded text, project membership and revision validation reject atomically', () => {
  const { s, p, audio } = fixture(), other = s.createProject('Other'), foreign = song(s, other.id), before = [s.project(p.id), s.project(other.id)];
  status(() => s.saveClipDraft(p.id, foreign.id, 0, draft), 404); status(() => s.saveClipDraft(p.id, randomUUID(), 0, draft), 404);
  for (const revision of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) status(() => s.saveClipDraft(p.id, audio.id, revision, draft), 400);
  const bad: unknown[] = [{ ...draft, style: 'Not per song' }, { ...draft, clipPrompt: 'x'.repeat(16001) }, { ...draft, clipPrompt: '\0' }, { clipPrompt: '', timingIntent: { start: { unit: 'seconds', value: 'x'.repeat(1001) }, end: { unit: 'seconds', value: '' } } }, { ...draft, timingIntent: { ...intent, extra: true } }, { ...draft, timingIntent: { ...intent, start: { unit: 'invalid', value: '' } } }, { ...draft, timingIntent: { ...intent, start: { unit: 'seconds', value: 1 } } }, { ...draft, timingIntent: { ...intent, end: { unit: 'rational', value: { numerator: '1', denominator: '3', extra: true } } } }, { clipPrompt: '' }, null, Object.defineProperty({ timingIntent: null }, 'clipPrompt', { enumerable: true, get() { throw new Error('Accessor must not run'); } })];
  for (const input of bad) status(() => s.saveClipDraft(p.id, audio.id, 0, input as typeof draft), 400);
  expect([s.project(p.id), s.project(other.id)]).toEqual(before);
});

test.each([2, 3])('schema %i to current adds empty drafts without modifying existing creative rows or fabricating history', version => {
  const { s, p, audio, path } = fixture(); s.saveDraft(p.id, 1, { musicPrompt: 'Saved music', lyrics: 'Saved lyrics', style: 'Saved style' });
  const a = s.submitVideo(p.id, randomUUID(), { songId: audio.id, clipPrompt: 'Captured', style: 'Old style', startFrame: 0, endFrame: 1 });
  const asset = (ext: string) => ({ assetId: randomUUID(), path: `/managed/projects/${p.id}/${randomUUID()}.${ext}`, sha256: 'b'.repeat(64) });
  s.finishVideo(a.id, { title: 'Old clip', video: asset('mp4'), audio: null, frames: [{ ...asset('png'), index: 0, pixelSha256: 'c'.repeat(64), bytes: 1 }], frameCount: 1, width: 640, height: 480, fps: '24/1' }, { actualSettings: 'unchanged' });
  s.enqueueRender(p.id, audio.id, 1, randomUUID()); s.setProvider('claude'); s.close();
  const before = new Database(path), tables = ['studio_projects', 'studio_attempts', 'studio_songs', 'studio_assets', 'studio_video_attempts', 'studio_clips', 'studio_arrangements', 'studio_renders', 'studio_render_keys', 'studio_acceptance', 'studio_tools', 'studio_setup_jobs', ...(version === 3 ? ['studio_events'] : [])];
  const original = Object.fromEntries(tables.map(t => [t, before.prepare(`SELECT * FROM ${t}`).all()])), meta = before.prepare('SELECT provider,selected_project FROM studio_meta').get();
  before.exec(`DROP TABLE IF EXISTS studio_clip_drafts; ${version === 2 ? 'DROP TABLE studio_events;' : ''} UPDATE studio_meta SET version=${version}`); before.close();
  const reopened = open(path), check = new Database(path, { readonly: true });
  expect(check.prepare('SELECT version FROM studio_meta').get()).toEqual({ version: 8 }); expect(check.prepare('SELECT provider,selected_project FROM studio_meta').get()).toEqual(meta);
  for (const t of tables) expect(check.prepare(`SELECT * FROM ${t}`).all(), t).toEqual(original[t]); check.close();
  expect(reopened.project(p.id).clipDrafts).toEqual([{ projectId: p.id, songId: audio.id, revision: 0, clipPrompt: '', timingIntent: null }]);
  expect(reopened.project(p.id).events.filter(e => e.kind === 'clip_draft.saved')).toEqual([]);
  if (version === 2) expect(reopened.project(p.id).events).toEqual([]);
});

async function httpFixture() {
  const f = fixture(), queue = openGpuQueue(join(f.dir, 'queue.sqlite')); cleanup.push(() => queue.close());
  const host = 'drafts.local:9122', app = createNativeApi({ queue, allowedHosts: [host], validateSubmission() {}, hasAttempt: () => false }); cleanup.push(() => app.close());
  // These tests use only direct store routes, never runtime dispatch.
  await registerStudioApi(app, { store: f.s, runtime: {} as StudioRuntime, dataRoot: f.dir, webRoot: null });
  const request = (url: string, body: unknown) => app.inject({ method: 'PUT', url, headers: { host, 'content-type': 'application/json' }, payload: JSON.stringify(body) });
  return { ...f, app, request, host, url: `/api/projects/${f.p.id}/songs/${f.audio.id}/clip-draft` };
}
test('HTTP saves exact/unfinished drafts, exposes them on snapshots and returns conflicts without clearing newer work', async () => {
  const f = await httpFixture(), body = { revision: 0, clipPrompt: '', timingIntent: { start: { unit: 'beats', value: '-' }, end: { unit: 'rational', value: { numerator: '', denominator: '' } } } };
  const response = await f.request(f.url, body); expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ ...body, revision: 1, projectId: f.p.id, songId: f.audio.id });
  expect((await f.request(f.url, body)).statusCode).toBe(409);
  const snapshot = await f.app.inject({ method: 'GET', url: `/api/projects/${f.p.id}`, headers: { host: f.host } }); expect(snapshot.json().clipDrafts).toEqual([response.json()]);
  const exact = await f.request(f.url, { revision: 1, ...draft }); expect(exact.statusCode).toBe(200); expect(exact.json().timingIntent).toEqual(intent);
});
test('HTTP rejects extra fields, invalid types and cross-project songs with no writes', async () => {
  const f = await httpFixture(), other = f.s.createProject('Other'), before = f.s.project(f.p.id);
  const bad = [{ revision: 0, ...draft, provider: 'claude' }, { revision: 0, ...draft, timingIntent: { ...intent, start: { unit: 'seconds', value: '', extra: true } } }, { revision: '0', ...draft }, { revision: 0, ...draft, clipPrompt: 'x'.repeat(16001) }, { revision: 0, ...draft, timingIntent: { ...intent, start: { unit: 'seconds', value: 'x'.repeat(1001) } } }];
  for (const body of bad) expect((await f.request(f.url, body)).statusCode).toBe(400);
  expect((await f.request(`/api/projects/${other.id}/songs/${f.audio.id}/clip-draft`, { revision: 0, ...draft })).statusCode).toBe(404); expect(f.s.project(f.p.id)).toEqual(before);
});
