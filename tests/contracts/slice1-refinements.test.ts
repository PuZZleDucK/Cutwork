/**
 * Approved regression cases from implementation review (21 October 2026).
 * Original counterexamples reproduced 8 failures before the implementation fixes.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContractDriver } from '../support/load-driver.ts';
import { evidence, video } from '../support/fixtures.ts';
import type { CancelInput, SliceOneDriver } from '../support/slice1-contract.ts';

let driver: SliceOneDriver;
beforeAll(async () => { driver = await loadContractDriver(); });

describe('S1-REVIEW: preserve facts across cancellation polling', () => {
  test('a still-queued Comfy prompt needs queue deletion after cancellation was already requested', () => {
    const input: CancelInput & { nativePhase: 'queued' } = {
      phase: 'cancel_requested', nativePhase: 'queued',
      owner: { kind: 'comfy', promptId: 'owned-1' },
      observedOwner: { kind: 'comfy', promptId: 'owned-1' },
      stopped: false, resourcesReleased: false, successCommitted: false,
    };
    expect(driver.cancel(input).actions).toEqual([{ type: 'delete-queued-comfy', promptId: 'owned-1' }]);
  });

  test('a verified never-submitted attempt remains cancellable after the application phase changes', () => {
    const owner = { kind: 'not-submitted' as const, attemptId: 'not-started' };
    const result = driver.cancel({
      phase: 'cancel_requested', owner, observedOwner: owner,
      stopped: false, resourcesReleased: false, successCommitted: false,
    });
    expect(result.state).toBe('cancelled');
    expect(result.actions).toEqual([]);
    expect(result.releaseGpu).toBe(false);
    expect(result.maySubmit).toBe(false);
  });
});

test('exactly 15 requested seconds is not overlong merely because covering frames span more time', () => {
  const request = {
    ...video(), startFrame: 0, endFrame: 361,
    requestedIntervalSeconds: { start: '0.01', end: '15.01' },
  };
  const plan = driver.planVideo(request);
  expect(plan.requestedFrames).toBe(361);
  expect(plan.durationWarning).toBe(false);
});

describe('S1-REVIEW: metadata snapshot happens before the first await', () => {
  test('capture does not pick up caller edits made while filesystem operations are pending', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-capture-review-'));
    try {
      const original = join(directory, 'original-score');
      const changed = join(directory, 'later-score');
      await writeFile(original, 'ORIGINAL'); await writeFile(changed, 'CHANGED');
      const input = {
        id: 'call-original', attemptId: 'attempt-original', argv: ['native-tool', 'original-argument'],
        seeds: { audio: '1002' }, sourceFiles: { score: original }, snapshotDirectory: join(directory, 'snapshots'),
      };
      const pending = driver.captureCall(input);
      input.id = 'call-changed'; input.attemptId = 'attempt-changed';
      input.argv[1] = 'changed-argument'; input.seeds.audio = '9999'; input.sourceFiles.score = changed;
      const captured = await pending;
      expect(captured.id).toBe('call-original');
      expect(captured.attemptId).toBe('attempt-original');
      expect(captured.argv).toEqual(['native-tool', 'original-argument']);
      expect(captured.seeds).toEqual({ audio: '1002' });
      expect(await readFile(captured.files.score!.snapshotPath, 'utf8')).toBe('ORIGINAL');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('replay does not pick up caller metadata edits made during hash verification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-replay-review-'));
    try {
      const source = join(directory, 'score'); await writeFile(source, 'ORIGINAL');
      const captured = await driver.captureCall({
        id: 'call-original', attemptId: 'attempt-original', argv: ['native-tool', 'original-argument'],
        seeds: { audio: '1002' }, sourceFiles: { score: source }, snapshotDirectory: join(directory, 'snapshots'),
      });
      const expected = structuredClone(captured);
      const pending = driver.replayCall(captured);
      captured.argv[1] = 'changed-argument'; captured.seeds.audio = '9999';
      const replay = await pending;
      expect(replay.argv).toEqual(expected.argv);
      expect(replay.seeds).toEqual(expected.seeds);
      expect(replay.files.score).toBe(expected.files.score!.snapshotPath);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe('S1-REVIEW: well-formed output must belong to the expected call', () => {
  test.each(['job', 'seed', 'missing-stage'] as const)('rejects mismatched %s evidence', mismatch => {
    const input = {
      ...evidence(),
      expectedCall: { nativeJobId: 'owned-prompt-1', seeds: { video: '1002' } as Record<string, string> },
    };
    if (mismatch === 'job') input.nativeJobId = 'another-prompts-output';
    if (mismatch === 'seed') input.actualSeeds.video = '1003';
    if (mismatch === 'missing-stage') input.expectedCall.seeds.audio = '2001';
    const result = driver.validateClip(input);
    expect(result.accepted).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.initialPlacementFrames).toBe(0);
  });
});
