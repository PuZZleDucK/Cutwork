import { beforeAll, describe, expect, test } from 'vitest';
import { loadContractDriver } from '../support/load-driver.ts';
import { video } from '../support/fixtures.ts';
import type { SliceOneDriver, VideoRequest } from '../support/slice1-contract.ts';

let driver: SliceOneDriver;
beforeAll(async () => { driver = await loadContractDriver(); });

describe('S1-TIME: requested edit versus supported native output', () => {
  test('two seconds remains a two-second placement, with extra native originals retained', () => {
    const result = driver.planVideo(video());
    expect(result.fps).toBe('24/1');
    expect(result.requestedFrames).toBe(48);
    expect(result.nativeFrames).toBe(64);
    expect(result.placement).toEqual({ startFrame: 24, endFrame: 72 });
    expect(result.conditioning).toEqual({
      startSample: 48_000, availableSamples: 128_000, silenceSamples: 0, totalSamples: 128_000,
    });
    expect(result.durationWarning).toBe(false);
  });
  test('accepts a one-second request without imposing a four-second minimum', () => {
    const result = driver.planVideo({ ...video(), endFrame: 48 });
    expect(result.requestedFrames).toBe(24);
    expect(result.placement).toEqual({ startFrame: 24, endFrame: 48 });
  });
  test('uses the smallest supplied native count that covers the request', () => {
    const result = driver.planVideo({ ...video(), supportedFrameCounts: [128, 48, 64] });
    expect(result.nativeFrames).toBe(48);
  });
  test('native conditioning uses extra real song samples before adding silence', () => {
    const result = driver.planVideo({ ...video(), songSamples: 144_000 });
    expect(result.conditioning).toEqual({
      startSample: 48_000, availableSamples: 96_000, silenceSamples: 32_000, totalSamples: 128_000,
    });
    expect(result.placement.endFrame).toBe(72);
  });
  test('wholly post-song conditioning is silent, not a repeated song excerpt', () => {
    const result = driver.planVideo({ ...video(), songSamples: 24_000 });
    expect(result.conditioning).toEqual({
      startSample: 48_000, availableSamples: 0, silenceSamples: 128_000, totalSamples: 128_000,
    });
  });
  test('does not confuse audio sample rate with the fixed video frame rate', () => {
    const result = driver.planVideo({ ...video(), sampleRate: 24_000 });
    expect(result.fps).toBe('24/1');
    expect(result.conditioning.startSample).toBe(24_000);
    expect(result.conditioning.totalSamples).toBe(64_000);
  });
  test.each([[360, false], [361, true], [384, true]] as const)(
    '%i frames gets warning=%s, never a product cap', (frames, warning) => {
      const result = driver.planVideo({ ...video(), startFrame: 0, endFrame: frames });
      expect(result.requestedFrames).toBe(frames);
      expect(result.placement.endFrame).toBe(frames);
      expect(result.durationWarning).toBe(warning);
    },
  );
  test.each<[string, Partial<VideoRequest>]>([
    ['empty interval', { startFrame: 24, endFrame: 24 }],
    ['negative start', { startFrame: -1 }],
    ['fractional realised frame', { startFrame: 1.5 }],
    ['no supported native output long enough', { supportedFrameCounts: [16, 32] }],
  ])('rejects %s rather than inventing or stretching output', (_, change) => {
    expect(() => driver.planVideo({ ...video(), ...change })).toThrow();
  });
});
