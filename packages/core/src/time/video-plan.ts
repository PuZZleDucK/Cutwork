import type { VideoPlan, VideoRequest } from '../contracts/generation.ts';
import { nonnegativeInteger } from '../contracts/validation.ts';
import { decimal } from './decimal.ts';

export const FPS = 24;

/** Input is an already-realised, zero-based, half-open frame interval. */
export function planVideo(input: VideoRequest): VideoPlan {
  const start = nonnegativeInteger(input.startFrame, 'startFrame');
  const end = nonnegativeInteger(input.endFrame, 'endFrame');
  const songSamples = nonnegativeInteger(input.songSamples, 'songSamples');
  const rate = nonnegativeInteger(input.sampleRate, 'sampleRate');
  if (!rate || end <= start) throw new Error('A positive sample rate and nonempty interval are required');
  const requestedFrames = end - start;
  let durationWarning = requestedFrames > 15 * FPS;
  if (input.requestedIntervalSeconds) {
    const s = decimal(input.requestedIntervalSeconds.start);
    const e = decimal(input.requestedIntervalSeconds.end);
    const durationNumerator = e.numerator * s.denominator - s.numerator * e.denominator;
    if (durationNumerator <= 0n) throw new Error('Requested time interval must be positive');
    const realisedStart = s.numerator * BigInt(FPS) / s.denominator;
    const realisedEnd = (e.numerator * BigInt(FPS) + e.denominator - 1n) / e.denominator;
    if (realisedStart !== BigInt(start) || realisedEnd !== BigInt(end)) {
      throw new Error('Realised frames do not cover the supplied exact interval');
    }
    durationWarning = durationNumerator > 15n * s.denominator * e.denominator;
  }
  for (const count of input.supportedFrameCounts) {
    if (!nonnegativeInteger(count, 'native frame count')) throw new Error('Native frame count must be positive');
  }
  const nativeFrames = [...input.supportedFrameCounts].sort((a, b) => a - b).find(n => n >= requestedFrames);
  if (nativeFrames === undefined) throw new Error('No supported native frame count covers the request');
  nonnegativeInteger(start + nativeFrames, 'native end frame');
  // Integer arithmetic avoids float drift. Floor sample boundaries consistently;
  // at the 48 kHz supported profile each frame is exactly 2,000 samples.
  const sampleAt = (frame: number): number => {
    const sample = BigInt(frame) * BigInt(rate) / BigInt(FPS);
    if (sample > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Sample position exceeds safe range');
    return Number(sample);
  };
  const startSample = sampleAt(start);
  const totalSamples = sampleAt(start + nativeFrames) - startSample;
  const availableSamples = Math.min(totalSamples, Math.max(0, songSamples - startSample));
  return {
    fps: '24/1', requestedFrames, nativeFrames,
    placement: { startFrame: start, endFrame: end },
    conditioning: { startSample, availableSamples, silenceSamples: totalSamples - availableSamples, totalSamples },
    durationWarning,
  };
}
