import assert from 'node:assert/strict';
import { validateNativeSubmission } from '../generation/native-command.ts';
import { nativeVideoPlan } from './video.ts';
import { GpuQueueError } from '../jobs/gpu-queue.ts';
import type { CallInput, GpuQueue } from '../jobs/gpu-queue-contract.ts';
import type { StudioStore } from './store-contract.ts';

/** Must run before the native worker is started. A queued native call came from
 * an already-dispatched agent; never replay it after losing its parent process.
 * Retained active ownership is left untouched for explicit reconciliation. */
export function reconcileStudioStartup(store: StudioStore, queue: GpuQueue): void {
 store.markInterrupted();
 const held = queue.heldLease(), heldAttempt = held ? queue.get(held.callId)?.attemptId : undefined;
 for (const call of queue.list()) if (call.state === 'queued' && call.attemptId !== heldAttempt) queue.cancelAttempt(call.attemptId);
}
export function validateStudioNativeCall(store: StudioStore, call: CallInput): void {
 validateNativeSubmission(call);
 if (call.tool === 'h3') {
  try {
   const attempt = store.videoAttempt(call.attemptId);
   assert.ok(attempt && attempt.projectId === call.projectId && attempt.nativeCallId === call.id &&
    ['preparing','waiting_gpu','running','validating'].includes(attempt.state));
   const r = call.request as Record<string, unknown>, asset = store.asset(attempt.song.assetId);
   assert.ok(asset && asset.projectId === attempt.projectId && asset.sha256 === attempt.song.sha256);
   assert.equal(r.seed, attempt.seeds.h3); assert.deepEqual(r.song, { path: asset.path, sha256: asset.sha256 });
   assert.deepEqual(r.plan, nativeVideoPlan(attempt)); assert.ok(typeof r.prompt === 'string' && r.prompt.trim());
  } catch { throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native video request differs from its active captured parent, song, interval or seed'); }
  return;
 }
 const attempt = store.attempt(call.attemptId);
 if (!attempt || attempt.projectId !== call.projectId || attempt.nativeCallId !== call.id || call.tool !== 'yue2' ||
  !['preparing','waiting_gpu','running','validating'].includes(attempt.state)) throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native call does not match an active captured studio attempt');
 const r = call.request as { seeds?: unknown }, seeds = r.seeds;
 if (!seeds || typeof seeds !== 'object' || Array.isArray(seeds) || !('semantic' in seeds) || !('nar' in seeds) || Object.entries(seeds).some(([key,value]) => value !== attempt.seeds[key])) {
  throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native seeds differ from the captured assignment');
 }
}
