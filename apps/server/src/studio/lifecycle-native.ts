import type {GpuQueue} from '../jobs/gpu-queue-contract.ts';
import type {ArtifactBlocker} from '../../../../packages/core/src/contracts/lifecycle.ts';
/** Retained native ownership is never inferred released from a terminal parent. */
export function nativeMediaBlockers(queue:GpuQueue,projectId:string):ArtifactBlocker[]{
 const held=queue.heldLease(),calls=queue.list();
 const blockers:ArtifactBlocker[]=calls.filter(call=>call.projectId===projectId&&(['queued','leased','launching','running','cancel_requested','reconciling'].includes(call.state)||call.id===held?.callId))
  .map(call=>({kind:'reservation',id:call.id,state:call.state,detail:'Native work may still use this project’s managed media; finish/cancel and reconcile it first.'}));
 if(held&&!calls.some(call=>call.id===held.callId))blockers.push({kind:'reservation',id:held.callId,state:'held',detail:'Native ownership cannot be attributed; reconcile it before deleting media.'});
 return blockers;
}
