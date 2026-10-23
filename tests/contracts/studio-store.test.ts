import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore, StudioStoreError } from '../../apps/server/src/studio/store.ts';
import type { SongInput, StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { MusicDraft, MusicInput, SongAnalysis } from '../../packages/core/src/contracts/studio.ts';

const directories: string[] = [], stores: StudioStore[] = [];
const draft: MusicDraft = { musicPrompt: 'French electronica about programming', lyrics: '', style: 'Industrial' };
const musicInput: MusicInput = { musicPrompt: draft.musicPrompt, lyrics: draft.lyrics };
const pending: SongAnalysis = { state: 'pending', estimatedBpm: null, sampleIndices: [], waveformBucketSamples: 0, peaks: [], error: null, version: null };
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'studio-store-')); directories.push(dir);
  const path = join(dir, 'studio.sqlite'), store = openStudioStore(path); stores.push(store);
  return { store, path, dir };
}
function song(overrides: Partial<SongInput> = {}): SongInput {
  return { title: 'Example song', assetId: randomUUID(), assetPath: `/managed/project/${randomUUID()}/audio.wav`, sha256: 'a'.repeat(64),
    sampleCount: '96000', sampleRate: 48000, channels: 2, durationSeconds: 2, truncated: false,
    analysis: structuredClone(pending), ...overrides };
}
function failure(action: () => unknown, statusCode: number) {
  expect(action).toThrow(StudioStoreError);
  try { action(); } catch (error) { expect(error).toMatchObject({ statusCode }); return; }
  throw new Error('Expected store failure');
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Durable project studio store (CPU SQLite; no tool executions)', () => {
  test('uses actual persistent WAL, preserves global selection/provider and isolated drafts after reopen', () => {
    const { store: s, path } = setup();
    expect(s.provider()).toBe('codex'); expect(s.selectedProject()).toBeNull();
    const a = s.createProject('  One  '), b = s.createProject('Two');
    expect(a.name).toBe('One'); expect(s.selectedProject()).toBe(b.id);
    s.saveDraft(a.id, a.revision, draft); s.selectProject(a.id); s.setProvider('claude');
    const db = new Database(path); expect(db.pragma('journal_mode', { simple: true })).toBe('wal'); db.close();
    s.close(); const reopened = openStudioStore(path); stores.push(reopened);
    expect(reopened.provider()).toBe('claude'); expect(reopened.selectedProject()).toBe(a.id);
    expect(reopened.project(a.id).project.draft).toEqual(draft);
    expect(reopened.project(b.id).project.draft.musicPrompt).toBe('');
    expect(reopened.listProjects().map(p => p.name)).toEqual(['One', 'Two']);
    reopened.setProvider('codex'); expect(reopened.provider()).toBe('codex');
  });
  test('UUID validation, missing projects and revision conflicts leave state intact', () => {
    const { store: s } = setup(), p = s.createProject('Test');
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    failure(() => s.project('../project'), 400); failure(() => s.project(randomUUID()), 404);
    failure(() => s.selectProject(randomUUID()), 404);
    failure(() => s.saveDraft(p.id, -1, draft), 400);
    const edited = s.saveDraft(p.id, p.revision, draft);
    expect(edited.revision).toBe(p.revision + 1);
    failure(() => s.saveDraft(p.id, p.revision, { ...draft, lyrics: 'stale' }), 409);
    expect(s.project(p.id).project).toEqual(edited);
  });
  test.each(['', '   ', 'x'.repeat(121), 'nul\0name'])('rejects invalid project name %j', name => {
    const { store: s } = setup(); failure(() => s.createProject(name), 400); expect(s.listProjects()).toEqual([]);
  });
  test('validates draft limits, unsupported providers, unknown fields and UUID idempotency keys', () => {
    const { store: s } = setup(), p = s.createProject('Test');
    failure(() => s.setProvider('other' as never), 400);
    for (const input of [ { ...draft, musicPrompt: 'x'.repeat(16001) }, { ...draft, lyrics: 'x'.repeat(32001) },
      { ...draft, style: 'x'.repeat(16001) }, { ...draft, unknown: true }, { ...draft, lyrics: null } ]) {
      failure(() => s.saveDraft(p.id, 0, input as MusicDraft), 400);
    }
    expect(s.saveDraft(p.id, 0, { musicPrompt: '', lyrics: '', style: '' }).revision).toBe(1);
    failure(() => s.submitMusic(p.id, randomUUID(), { ...musicInput, musicPrompt: '   ' }), 400);
    failure(() => s.submitMusic(p.id, 'not-uuid', musicInput), 400);
    expect(s.attempts()).toEqual([]);
  });
  test('submission snapshots provider/model and distinct bounded seeds; repeat is idempotent after provider changes', () => {
    const { store: s } = setup(), p = s.createProject('Test'), key = randomUUID();
    const input = structuredClone(musicInput), original = s.submitMusic(p.id, key, input);
    input.musicPrompt = 'changed';
    expect(original.provider).toBe('codex'); expect(original.model).toBe('gpt-6.1-sol');
    expect(original.input).toEqual(musicInput); expect(original.state).toBe('queued');
    expect(original.nativeCallId).not.toBe(original.id); expect(original.projectId).toBe(p.id);
    expect(Object.keys(original.seeds).sort()).toEqual(['abc', 'nar', 'semantic']);
    expect(new Set(Object.values(original.seeds)).size).toBe(3);
    for (const value of Object.values(original.seeds)) {
      expect(value).toMatch(/^(0|[1-9][0-9]*)$/); expect(BigInt(value)).toBeLessThanOrEqual((1n << 63n) - 1n);
    }
    s.setProvider('claude'); expect(s.submitMusic(p.id, key, musicInput)).toEqual(original);
    const next = s.submitMusic(p.id, randomUUID(), musicInput);
    expect(next.provider).toBe('claude'); expect(next.model).toBe('claude-opus-5-5');
    expect(next.sequence).toBeGreaterThan(original.sequence); expect(next.seeds).not.toEqual(original.seeds);
    failure(() => s.submitMusic(p.id, key, { ...musicInput, lyrics: 'changed' }), 409);
    expect(s.attempts()).toHaveLength(2);
  });
  test('new music captures exclude visual style and reject extra style rather than silently sending it to an agent', () => {
    const { store: s } = setup(), p = s.createProject('Separate modalities');
    s.saveDraft(p.id, p.revision, { ...draft, style: 'VISUAL ONLY: flooded neon city' });
    const a = s.submitMusic(p.id, randomUUID(), musicInput);
    expect(Object.keys(a.input).sort()).toEqual(['lyrics', 'musicPrompt']); expect(a.input).toEqual(musicInput);
    expect(JSON.stringify(a)).not.toContain('VISUAL ONLY');
    failure(() => s.submitMusic(p.id, randomUUID(), { ...musicInput, style: 'Do not capture this' } as never), 400);
    expect(s.attempts()).toHaveLength(1); expect(s.project(p.id).project.draft.style).toBe('VISUAL ONLY: flooded neon city');
  });
  test('legacy idempotent replay compares only music inputs and returns untouched historical style/provider/seeds', () => {
    const { store: s, path } = setup(), p = s.createProject('Legacy capture'), key = randomUUID();
    const a = s.submitMusic(p.id, key, musicInput), legacyInput = { ...musicInput, style: 'Historical captured visual context' };
    const legacy = { ...a, input: legacyInput };
    // Bounded fixture representing the prior schema; never edits a live project database.
    const db = new Database(path);
    db.prepare('UPDATE studio_attempts SET input_json=?,data=? WHERE id=?').run(JSON.stringify(legacyInput), JSON.stringify(legacy), a.id);
    const before = db.prepare('SELECT input_json,data FROM studio_attempts WHERE id=?').get(a.id);
    s.setProvider('claude'); const edited = s.saveDraft(p.id, p.revision, { ...draft, style: 'Current visual context' });
    expect(s.submitMusic(p.id, key, musicInput)).toEqual(legacy);
    failure(() => s.submitMusic(p.id, key, { ...musicInput, lyrics: 'changed words' }), 409);
    expect(db.prepare('SELECT input_json,data FROM studio_attempts WHERE id=?').get(a.id)).toEqual(before); db.close();
    expect(s.project(p.id).project).toEqual(edited);
    s.close(); const reopened = openStudioStore(path); stores.push(reopened);
    expect(reopened.submitMusic(p.id, key, musicInput)).toEqual(legacy);
  });
  test('idempotency is scoped by project and returned snapshots cannot mutate persistence', () => {
    const { store: s } = setup(), a = s.createProject('A'), b = s.createProject('B'), key = randomUUID();
    const first = s.submitMusic(a.id, key, musicInput), second = s.submitMusic(b.id, key, musicInput);
    first.input.lyrics = 'mutated'; first.seeds.abc = '999';
    expect(s.attempt(first.id)?.input).toEqual(musicInput);
    expect(second.id).not.toBe(first.id);
    expect(s.project(a.id).attempts.map(x => x.id)).toEqual([first.id]);
    expect(s.project(b.id).attempts.map(x => x.id)).toEqual([second.id]);
    expect(s.attempt(randomUUID())).toBeNull(); expect(s.asset(randomUUID())).toBeNull();
  });
  test('atomic once-only ingestion inserts asset/song/selects it and duplicate completion never reselects old song', () => {
    const { store: s, path } = setup(), p = s.createProject('Test');
    const a = s.submitMusic(p.id, randomUUID(), musicInput), input = song(), completed = s.finishMusic(a.id, input, { source: 'native' });
    expect(s.attempt(a.id)).toMatchObject({ state: 'succeeded', songId: completed.id, details: { source: 'native' } });
    expect(s.asset(input.assetId)).toEqual({ projectId: p.id, path: input.assetPath, sha256: input.sha256, mediaType: 'audio/wav' });
    expect(s.project(p.id).project.selectedSongId).toBe(completed.id);
    const b = s.submitMusic(p.id, randomUUID(), musicInput), second = s.finishMusic(b.id, song(), {});
    expect(s.finishMusic(a.id, input, { source: 'later duplicate' })).toEqual(completed);
    expect(s.project(p.id).project.selectedSongId).toBe(second.id);
    expect(s.attempt(a.id)?.details).toEqual({ source: 'native' });
    expect(s.project(p.id).songs).toHaveLength(2);
    const db = new Database(path); expect(db.prepare('select count(*) as n from studio_assets').get()).toEqual({ n: 2 }); db.close();
    expect(s.listProjects()[0]).toMatchObject({ songCount: 2, activeAttempts: 0, coveragePercent: 0 });
  });
  test('changed duplicate completion, cross-project asset reuse and invalid path cannot overwrite or partially commit', () => {
    const { store: s } = setup(), a = s.createProject('A'), b = s.createProject('B');
    const original = s.submitMusic(a.id, randomUUID(), musicInput), input = song(); s.finishMusic(original.id, input, {});
    failure(() => s.finishMusic(original.id, { ...input, assetPath: '/different.wav' }, {}), 409);
    const other = s.submitMusic(b.id, randomUUID(), musicInput);
    failure(() => s.finishMusic(other.id, input, {}), 409);
    failure(() => s.finishMusic(other.id, song({ assetPath: '../bad.wav' }), {}), 400);
    expect(s.project(b.id).songs).toEqual([]); expect(s.attempt(other.id)?.state).toBe('queued');
    expect(s.asset(input.assetId)?.projectId).toBe(a.id);
  });
  test('song selection is project-specific and revision guarded', () => {
    const { store: s } = setup(), a = s.createProject('A'), b = s.createProject('B');
    const sa = s.finishMusic(s.submitMusic(a.id, randomUUID(), musicInput).id, song(), {});
    const sb = s.finishMusic(s.submitMusic(b.id, randomUUID(), musicInput).id, song(), {});
    const current = s.project(a.id).project;
    failure(() => s.selectSong(a.id, sb.id, current.revision), 404);
    failure(() => s.selectSong(a.id, sa.id, current.revision - 1), 409);
    expect(s.selectSong(a.id, sa.id, current.revision).selectedSongId).toBe(sa.id);
  });
  test('switching songs restores the original user inputs, not agent-processed prompts, while preserving current visual style and history', () => {
    const { store: s } = setup(), p = s.createProject('Switch inputs');
    const originalA = { musicPrompt: '  Warm French electronica\nwith a dubstep pulse  ', lyrics: 'One user line\nSecond user line' };
    const originalB = { musicPrompt: 'Instrumental chiptune', lyrics: '' };
    const a = s.submitMusic(p.id, randomUUID(), originalA);
    const sa = s.finishMusic(a.id, song(), { nativeRequest: { parameters: { style: 'Agent synthesized genre vocabulary', lyrics: '[verse]\nAgent-formatted lyrics' } } });
    s.setProvider('claude');
    const b = s.submitMusic(p.id, randomUUID(), originalB), sb = s.finishMusic(b.id, song(), { nativeRequest: { parameters: { style: 'Agent B rewrite', lyrics: '[instrumental]' } } });
    const before = s.project(p.id), history = structuredClone(before.attempts);
    const edited = s.saveDraft(p.id, before.project.revision, { musicPrompt: 'Unsubmitted edit', lyrics: 'Unsubmitted lyrics', style: 'Current shared neon style' });
    const selectedA = s.selectSong(p.id, sa.id, edited.revision);
    expect(selectedA).toMatchObject({ selectedSongId: sa.id, revision: edited.revision + 1,
      draft: { musicPrompt: originalA.musicPrompt, lyrics: originalA.lyrics, style: 'Current shared neon style' } });
    const selectedB = s.selectSong(p.id, sb.id, selectedA.revision);
    expect(selectedB).toMatchObject({ selectedSongId: sb.id, revision: selectedA.revision + 1,
      draft: { musicPrompt: originalB.musicPrompt, lyrics: '', style: 'Current shared neon style' } });
    expect(s.project(p.id).attempts).toEqual(history); expect(s.project(p.id).songs).toEqual(before.songs);
    expect(s.provider()).toBe('claude');
  });
  test('selecting the already-selected song preserves all current edits and still enforces revision guards', () => {
    const { store: s } = setup(), p = s.createProject('Keep edits');
    const completed = s.finishMusic(s.submitMusic(p.id, randomUUID(), musicInput).id, song(), {});
    const current = s.project(p.id).project;
    const edited = s.saveDraft(p.id, current.revision, { musicPrompt: 'A new direction', lyrics: 'New words', style: 'Changed visuals' });
    const selected = s.selectSong(p.id, completed.id, edited.revision);
    expect(selected.draft).toEqual(edited.draft); expect(selected.selectedSongId).toBe(completed.id);
    failure(() => s.selectSong(p.id, completed.id, edited.revision), 409);
    expect(s.project(p.id).project).toEqual(selected);
  });
  test('restored song inputs and visual style persist across reopen and rejected switches leave them unchanged', () => {
    const { store: s, path } = setup(), p = s.createProject('Persist switch'), other = s.createProject('Separate project');
    const original = { musicPrompt: 'Original song concept', lyrics: 'Original words' };
    const first = s.finishMusic(s.submitMusic(p.id, randomUUID(), original).id, song(), {});
    const second = s.finishMusic(s.submitMusic(p.id, randomUUID(), musicInput).id, song(), {});
    const foreign = s.finishMusic(s.submitMusic(other.id, randomUUID(), musicInput).id, song(), {});
    const current = s.project(p.id).project, edited = s.saveDraft(p.id, current.revision, { ...draft, style: 'Keep current project style' });
    failure(() => s.selectSong(p.id, first.id, edited.revision - 1), 409);
    failure(() => s.selectSong(p.id, foreign.id, edited.revision), 404);
    expect(s.project(p.id).project).toEqual(edited); expect(edited.selectedSongId).toBe(second.id);
    const selected = s.selectSong(p.id, first.id, edited.revision);
    expect(selected.draft).toEqual({ ...original, style: 'Keep current project style' });
    s.close(); const reopened = openStudioStore(path); stores.push(reopened);
    expect(reopened.project(p.id).project).toEqual(selected);
    expect(reopened.project(other.id).project.selectedSongId).toBe(foreign.id);
    expect(reopened.attempt(first.attemptId)?.input).toEqual(original);
  });
  test('analysis can independently fail or be partial without losing successful song and requires valid numeric data', () => {
    const { store: s } = setup(), p = s.createProject('Test'), a = s.submitMusic(p.id, randomUUID(), musicInput);
    const completed = s.finishMusic(a.id, song(), {});
    const partial: SongAnalysis = { state: 'partial', estimatedBpm: null, sampleIndices: [], waveformBucketSamples: 480,
      peaks: [0, 0.2, 1, 1.25], error: 'No reliable beat grid', version: 'librosa-test' };
    expect(s.setAnalysis(completed.id, partial).analysis).toEqual(partial);
    expect(s.attempt(a.id)?.state).toBe('succeeded'); expect(s.project(p.id).project.selectedSongId).toBe(completed.id);
    expect(s.setAnalysis(completed.id, { ...pending, state: 'failed', error: 'Analysis unavailable' }).analysis.state).toBe('failed');
    for (const bad of [{ ...partial, peaks: [NaN] }, { ...partial, peaks: [Infinity] }, { ...partial, estimatedBpm: -2 }, { ...partial, sampleIndices: ['5', '4'] },
      { ...partial, sampleIndices: ['96000'] }, { ...partial, peaks: [-0.1] }]) {
      failure(() => s.setAnalysis(completed.id, bad), 400);
    }
  });
  test('unsafe/lossy JSON and accessors are rejected without executing getters or partially completing', () => {
    const { store: s } = setup(), p = s.createProject('Test'), a = s.submitMusic(p.id, randomUUID(), musicInput);
    let calls = 0; const accessor = Object.defineProperty({}, 'run', { enumerable: true, get() { calls++; return 'oops'; } });
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const details of [{ n: Infinity }, { n: 9007199254740992 }, { n: undefined }, { n: 1n }, accessor, cyclic,
      JSON.parse('{"__proto__":{"polluted":true}}'), { nested: new Date() }]) {
      failure(() => s.patchAttempt(a.id, { details }), 400);
      failure(() => s.finishMusic(a.id, song(), details), 400);
    }
    expect(calls).toBe(0); expect(s.project(p.id).songs).toHaveLength(0);
  });
  test('patch attempts records progress but cannot forge success or alter finalized attempts', () => {
    const { store: s } = setup(), p = s.createProject('Test'), a = s.submitMusic(p.id, randomUUID(), musicInput);
    expect(s.patchAttempt(a.id, { state: 'running', stage: 'Generating', details: { job: 'native-id' } })).toMatchObject({ state: 'running', stage: 'Generating' });
    failure(() => s.patchAttempt(a.id, { state: 'succeeded' }), 409);
    failure(() => s.patchAttempt(a.id, { projectId: randomUUID() } as never), 400);
    s.finishMusic(a.id, song(), {});
    failure(() => s.patchAttempt(a.id, { state: 'failed', error: 'Late exception' }), 409);
    expect(s.attempt(a.id)?.state).toBe('succeeded');
  });
  test('accepted requests, immutable completion and analysis survive reopen without changing selection', () => {
    const { store: s, path } = setup(), p = s.createProject('Durable'), key = randomUUID();
    const a = s.submitMusic(p.id, key, musicInput), input = song(), completed = s.finishMusic(a.id, input, {});
    const updatedAnalysis: SongAnalysis = { ...pending, state: 'partial', waveformBucketSamples: 480,
      peaks: [0.1], error: 'Beat grid unavailable' };
    s.setAnalysis(completed.id, updatedAnalysis);
    s.close(); const reopened = openStudioStore(path); stores.push(reopened);
    expect(reopened.submitMusic(p.id, key, musicInput)).toMatchObject({ id: a.id, nativeCallId: a.nativeCallId, seeds: a.seeds, state: 'succeeded' });
    expect(reopened.finishMusic(a.id, input, {})).toMatchObject({ id: completed.id, analysis: updatedAnalysis });
    expect(reopened.project(p.id).songs).toHaveLength(1);
    expect(reopened.asset(input.assetId)?.path).toBe(input.assetPath);
  });
  test('a SQLite write failure rolls back asset, song, attempt and selected-song updates together', () => {
    const { store: s, path } = setup(), p = s.createProject('Atomic'), a = s.submitMusic(p.id, randomUUID(), musicInput), input = song();
    const external = new Database(path);
    external.exec("CREATE TRIGGER reject_song BEFORE INSERT ON studio_songs BEGIN SELECT RAISE(ABORT, 'fixture storage failure'); END;");
    expect(() => s.finishMusic(a.id, input, {})).toThrow('fixture storage failure');
    expect(s.asset(input.assetId)).toBeNull(); expect(s.project(p.id).songs).toEqual([]);
    expect(s.project(p.id).project.selectedSongId).toBeNull(); expect(s.attempt(a.id)?.state).toBe('queued');
    external.exec('DROP TRIGGER reject_song'); external.close();
    expect(s.finishMusic(a.id, input, {}).assetId).toBe(input.assetId);
  });
  test('a newer database schema is rejected without overwriting its version or contents', () => {
    const { store: s, path } = setup(); s.createProject('Keep this'); s.close();
    const external = new Database(path); external.exec('UPDATE studio_meta SET version=999');
    failure(() => openStudioStore(path), 409);
    expect(external.prepare('SELECT version FROM studio_meta').get()).toEqual({ version: 999 });
    expect(external.prepare('SELECT count(*) AS n FROM studio_projects').get()).toEqual({ n: 1 }); external.close();
  });
  test('independent connections deduplicate accepted submissions and setup jobs through the database', () => {
    const { store: s, path } = setup(), other = openStudioStore(path); stores.push(other);
    const p = s.createProject('One writer protocol'), key = randomUUID(), accepted = s.submitMusic(p.id, key, musicInput);
    expect(other.submitMusic(p.id, key, musicInput)).toEqual(accepted);
    expect(other.enqueueSetup('h3')).toEqual(s.enqueueSetup('h3'));
    expect(s.attempts()).toHaveLength(1); expect(other.setupJobs()).toHaveLength(1);
  });
  test('setup status/jobs are shared, persistent and active duplicate requests are deduplicated', () => {
    const { store: s, path } = setup();
    expect(s.tools().map(t => t.id)).toEqual(['agent', 'yue2', 'comfyui', 'h3', 'analysis']);
    expect(s.tool('yue2')).toMatchObject({ state: 'missing', installed: false, queued: 0, active: false });
    const job = s.enqueueSetup('yue2'); expect(s.enqueueSetup('yue2')).toEqual(job);
    s.patchSetup(job.id, 'running'); expect(s.enqueueSetup('yue2').id).toBe(job.id);
    s.patchTool('yue2', { state: 'ready', installed: true, detail: 'Verified', log: 'Done', checkedAt: new Date().toISOString() });
    s.patchSetup(job.id, 'succeeded');
    const next = s.enqueueSetup('yue2'); expect(next.id).not.toBe(job.id); expect(next.sequence).toBeGreaterThan(job.sequence);
    s.close(); const reopened = openStudioStore(path); stores.push(reopened);
    expect(reopened.tool('yue2').installed).toBe(true); expect(reopened.setupJobs()).toHaveLength(2);
    failure(() => reopened.enqueueSetup('other' as never), 400);
    failure(() => reopened.patchTool('yue2', { queued: -1 }), 400);
  });
  test('startup interruption marks only started music/setup work reconciling, never restarts or marks queued successful', () => {
    const { store: s } = setup(), p = s.createProject('Test');
    const queued = s.submitMusic(p.id, randomUUID(), musicInput);
    const active = ['preparing', 'waiting_gpu', 'running', 'validating'].map(state => {
      const attempt = s.submitMusic(p.id, randomUUID(), musicInput); s.patchAttempt(attempt.id, { state: state as never }); return attempt;
    });
    const failed = s.submitMusic(p.id, randomUUID(), musicInput); s.patchAttempt(failed.id, { state: 'failed', error: 'Native failure' });
    const queuedSetup = s.enqueueSetup('yue2'), activeSetup = s.enqueueSetup('h3'); s.patchSetup(activeSetup.id, 'running');
    s.patchTool('h3', { state: 'installing' }); s.markInterrupted(); s.markInterrupted();
    expect(s.attempt(queued.id)?.state).toBe('queued');
    for (const a of active) expect(s.attempt(a.id)?.state).toBe('reconciling');
    expect(s.attempt(failed.id)?.state).toBe('failed');
    expect(s.setupJobs().find(j => j.id === queuedSetup.id)?.state).toBe('queued');
    expect(s.setupJobs().find(j => j.id === activeSetup.id)?.state).toBe('reconciling');
    expect(s.tool('h3').state).toBe('reconciling'); expect(s.enqueueSetup('h3').id).toBe(activeSetup.id);
    expect(s.project(p.id).songs).toEqual([]);
  });
});
