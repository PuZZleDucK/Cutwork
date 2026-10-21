import { beforeAll, describe, expect, test } from 'vitest';
import { loadContractDriver } from '../support/load-driver.ts';
import { evidence } from '../support/fixtures.ts';
import type { ClipEvidence, SliceOneDriver } from '../support/slice1-contract.ts';

let driver: SliceOneDriver;
beforeAll(async () => { driver = await loadContractDriver(); });

describe('S1-MEDIA: validate independent observations, not the agent completion message', () => {
  test('retains all native originals while initially placing only the requested frames', () => {
    expect(driver.validateClip(evidence())).toEqual({
      accepted: true, reasons: [], initialPlacementFrames: 48,
      retainedSourceFrames: 64, clipAudioAvailable: true,
    });
  });
  const invalid: Array<[string, (e: ClipEvidence) => void]> = [
    ['non-native fps', e => { e.fps = '30/1'; }],
    ['undecodable video', e => { e.decodes = false; }],
    ['frames reconstructed from lossy video', e => { e.rawOrigin = 'decoded-video'; }],
    ['missing frame', e => { e.observedFrames.pop(); }],
    ['reordered frame manifest', e => { e.frames.reverse(); }],
    ['duplicate source index', e => { e.frames[1]!.index = 1; }],
    ['duplicate frame path', e => { e.frames[1]!.path = e.frames[0]!.path; }],
    ['mismatched actual file hash', e => { e.observedFrames[0]!.sha256 = 'f'.repeat(64); }],
    ['too few native frames', e => { e.nativeFrames = 32; }],
    ['missing actual seed', e => { e.actualSeeds = {}; }],
    ['unresolved random seed', e => { e.actualSeeds.video = '-1'; }],
    ['untracked native job', e => { e.nativeJobId = null; }],
  ];
  test.each(invalid)('refuses ordinary verified success for %s', (_, mutate) => {
    const input = evidence(); mutate(input);
    const result = driver.validateClip(input);
    expect(input.agentSaysSuccess).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
  test('missing clip audio leaves a usable original-song path, not fabricated audio', () => {
    const result = driver.validateClip({ ...evidence(), audioPresent: false });
    expect(result.accepted).toBe(true);
    expect(result.clipAudioAvailable).toBe(false);
  });
});
