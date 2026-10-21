import type { ClipEvidence } from '../../../../packages/core/src/contracts/generation.ts';
import { decimalSeed } from '../../../../packages/core/src/contracts/validation.ts';

/** Evidence decision only. The native reader must supply independent observations. */
export function validateClip(input: ClipEvidence) {
  const reasons: string[] = [];
  if (!Number.isSafeInteger(input.requestedFrames) || input.requestedFrames <= 0) reasons.push('Invalid requested frame count');
  if (!Number.isSafeInteger(input.nativeFrames) || input.nativeFrames < input.requestedFrames) reasons.push('Native output is shorter than requested or invalid');
  if (input.fps !== '24/1') reasons.push('Native frame rate must be exactly 24/1');
  if (!input.decodes) reasons.push('Encoded video could not be decoded');
  if (input.rawOrigin !== 'pre-encode') reasons.push('Original images were not retained before encoding');
  if (input.frames.length !== input.nativeFrames || input.observedFrames.length !== input.nativeFrames) reasons.push('Incomplete native image batch');
  const paths = new Set<string>();
  for (const [i, frame] of input.frames.entries()) {
    const observed = input.observedFrames[i];
    if (frame.index !== i + 1) reasons.push(`Source index/order mismatch at ${i + 1}`);
    if (!frame.path || paths.has(frame.path)) reasons.push(`Missing or duplicate source path at ${i + 1}`);
    paths.add(frame.path);
    if (!/^[a-f0-9]{64}$/.test(frame.sha256) || !observed || observed.index !== frame.index ||
        observed.path !== frame.path || observed.sha256 !== frame.sha256) reasons.push(`Observed frame mismatch at ${i + 1}`);
  }
  if (Object.keys(input.actualSeeds).length === 0) reasons.push('Actual native seed is missing');
  for (const [name, value] of Object.entries(input.actualSeeds)) {
    try { decimalSeed(value, name); } catch { reasons.push(`Unresolved/invalid actual seed: ${name}`); }
  }
  if (!input.nativeJobId?.trim()) reasons.push('Native job identity is missing');
  if (!input.expectedCall?.nativeJobId?.trim() || input.nativeJobId !== input.expectedCall.nativeJobId) {
    reasons.push('Observed native job does not match the expected call');
  }
  const expectedSeeds = input.expectedCall?.seeds ?? {};
  if (Object.keys(expectedSeeds).length === 0) reasons.push('Expected native stage/seed mapping is missing');
  for (const [stage, expected] of Object.entries(expectedSeeds)) {
    try { decimalSeed(expected, `expected ${stage}`); } catch { reasons.push(`Invalid expected seed: ${stage}`); }
    if (input.actualSeeds[stage] !== expected) reasons.push(`Actual seed missing or changed for expected stage: ${stage}`);
  }
  for (const stage of Object.keys(input.actualSeeds)) {
    if (!Object.hasOwn(expectedSeeds, stage)) reasons.push(`Unregistered actual seed stage: ${stage}`);
  }
  const accepted = reasons.length === 0;
  // A confident agent message is deliberately not evidence used by this decision.
  return {
    accepted, reasons,
    initialPlacementFrames: accepted ? input.requestedFrames : 0,
    retainedSourceFrames: input.observedFrames.length,
    clipAudioAvailable: input.audioPresent,
  };
}
