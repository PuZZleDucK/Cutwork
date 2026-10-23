import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {fileHash,verifyExecutionSource} from './execution-snapshot.ts';
import { validateNativeSubmission } from '../generation/native-command.ts';
import { isAbsolute, resolve } from 'node:path';
import { continuationFrameInput, nativeVideoPlan } from './video.ts';
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
export function validateStudioNativeCall(store: StudioStore, call: CallInput, runtime?:string): void {
 validateNativeSubmission(call);
 const recovering=store.videoAttempt(call.attemptId)??store.attempt(call.attemptId);
 if(recovering?.details?.nativeReplayRequest){
  try{assert.equal(call.tool,'song' in recovering?'h3':'yue2');assert.ok(recovering.projectId===call.projectId&&recovering.nativeCallId===call.id&&['preparing','waiting_gpu','running','validating'].includes(recovering.state)&&!recovering.cancellation);assert.deepEqual(call.request,recovering.details.nativeReplayRequest);}catch{throw new GpuQueueError('GPU_QUEUE_INPUT','Native recovery request differs from its captured resolved call');}
  return;
 }
 if (call.tool === 'h3') {
  try {
   const attempt = store.videoAttempt(call.attemptId);
   assert.ok(attempt && attempt.projectId === call.projectId && attempt.nativeCallId === call.id &&
    ['preparing','waiting_gpu','running','validating'].includes(attempt.state)&&!attempt.cancellation);
   const r = call.request as Record<string, unknown>, asset = store.asset(attempt.song.assetId);
   assert.ok(asset && asset.projectId === attempt.projectId && asset.sha256 === attempt.song.sha256);
   assert.equal(r.seed, attempt.seeds.h3); const expectedSong=attempt.details?.nativeRecoverySong??{path:asset.path,sha256:asset.sha256};assert.deepEqual(r.song,expectedSong);assert.equal((r.song as {sha256:string}).sha256,asset.sha256);
   if(attempt.continuation){assert.ok(runtime&&isAbsolute(runtime)&&resolve(runtime)===runtime,'Trusted runtime required for continuation');assert.deepEqual(r.firstFrame,continuationFrameInput(runtime,attempt));}
   else assert.equal(r.firstFrame,undefined);
   assert.deepEqual(r.plan, nativeVideoPlan(attempt)); assert.ok(typeof r.prompt === 'string' && r.prompt.trim());
  } catch { throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native video request differs from its active captured parent, song, interval or seed'); }
  return;
 }
 const attempt = store.attempt(call.attemptId);
 if (!attempt || attempt.projectId !== call.projectId || attempt.nativeCallId !== call.id || call.tool !== 'yue2' ||
  (!['preparing','waiting_gpu','running','validating'].includes(attempt.state)||attempt.cancellation)) throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native call does not match an active captured studio attempt');
 const r = call.request as { seeds?: unknown }, seeds = r.seeds;
 if (!seeds || typeof seeds !== 'object' || Array.isArray(seeds) || !('semantic' in seeds) || !('nar' in seeds) || Object.entries(seeds).some(([key,value]) => value !== attempt.seeds[key])) {
  throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native seeds differ from the captured assignment');
 }
}

/** Composition hook for the existing native resolver; no alternative executor. */
export async function studioNativeSource(store:StudioStore,call:CallInput,fallbackSource:string):Promise<string>{
 const attempt=store.videoAttempt(call.attemptId)??store.attempt(call.attemptId);
 if(!attempt?.details.planPath||!attempt.details.planSha256)return fallbackSource; // Legacy captured tasks retain their old path boundary.
 const path=String(attempt.details.planPath);assert.ok((await stat(path)).size<=4000000);assert.equal(await fileHash(path),attempt.details.planSha256,'Captured native task changed');
 const plan=JSON.parse(await readFile(path,'utf8'));assert.equal(plan.attempt.id,attempt.id);assert.equal(plan.attempt.nativeCallId,call.id);
 return plan.executionSource?verifyExecutionSource(plan.executionSource):fallbackSource;
}
