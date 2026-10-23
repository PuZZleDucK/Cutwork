import {setTimeout as delay} from 'node:timers/promises';
import type {StudioStore} from './store-contract.ts';
import type {GpuQueue} from '../jobs/gpu-queue-contract.ts';
import type {StudioAttempt} from '../../../../packages/core/src/contracts/studio.ts';
import {verifyNativeRelease} from './native-release.ts';
export const readAttempt=(store:StudioStore,id:string):StudioAttempt|null=>store.attempt(id)??store.videoAttempt(id);
export function patchStudioAttempt(store:StudioStore,id:string,patch:Parameters<StudioStore['patchAttempt']>[1]):StudioAttempt{return store.attempt(id)?store.patchAttempt(id,patch):store.patchVideoAttempt(id,patch);}
/** Called only with observed provider termination (or known never-dispatched).
 * Existing native worker owns stopping; this observes its final retained proof. */
export async function settleCancellation(o:{store:StudioStore;queue:GpuQueue;runtime:string;attemptId:string;providerStopped:boolean;details?:Record<string,unknown>;timeoutMs?:number;pollMs?:number}):Promise<void>{
 const {store,queue,attemptId,runtime}=o,initial=readAttempt(store,attemptId);if(!initial?.cancellation||initial.state==='succeeded'||initial.state==='cancelled')return;
 const details={...initial.details,...o.details};
 try{
  if(!o.providerStopped)throw Error('Provider cleanup unconfirmed; cancellation requires reconciliation');
  const deadline=performance.now()+(o.timeoutMs??120000);queue.cancelAttempt(attemptId);
  for(;;){
   const calls=queue.list().filter(c=>c.attemptId===attemptId);
   if(calls.some(c=>c.state==='reconciling'))throw Error('Native cleanup requires reconciliation');
   if(calls.every(c=>['succeeded','failed','cancelled'].includes(c.state)&&queue.heldLease()?.callId!==c.id)){
    for(const call of calls){if(call.owner!==null)await verifyNativeRelease(call,queue,runtime);else if(call.launch!==null&&!(call.release&&typeof call.release==='object'&&!Array.isArray(call.release)&&call.release.neverLaunched===true))throw Error('Native launch cleanup unconfirmed');else if(call.state==='succeeded')throw Error('Native success has no owned release');}
    store.finishCancellation(attemptId,{...details,cancellationProof:{providerStopped:true,nativeCalls:calls.map(c=>({id:c.id,state:c.state,release:c.release})),completedAt:new Date().toISOString()}});return;
   }
   if(performance.now()>=deadline)throw Error('Native cleanup unconfirmed after bounded cancellation wait');await delay(Math.min(o.pollMs??50,Math.max(1,deadline-performance.now())));
  }
 }catch(error){const current=readAttempt(store,attemptId);if(current&&current.state!=='succeeded'&&current.state!=='cancelled')patchStudioAttempt(store,attemptId,{state:'reconciling',stage:'Cancellation cleanup requires reconciliation',error:String(error).slice(0,12000),details});}
}
