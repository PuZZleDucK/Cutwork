import type { StudioAttempt } from '../../../packages/core/src/contracts/studio.ts';
import type { useStudio } from './useStudio.ts';
import {attemptSourceUnavailable} from './artifact-lifecycle.ts';
import { request } from './api.ts';
import { recoveryActions,prepareRecoverySubmission,markRecoveryAccepted,type RecoveryAction } from './generation-recovery.ts';
type Studio=ReturnType<typeof useStudio>;
const labels:Record<RecoveryAction,string>={cancel:'Cancel generation',retry:'Retry same inputs',restart:'Restart',restore:'Restore parameters',discard:'Discard placeholder',reuse:'Reuse parameters'};
export function GenerationActions({attempt,studio,onRestore,compact=false,disabled=false,reuseLabel=labels.reuse}:{attempt:StudioAttempt;studio:Studio;onRestore?:(()=>Promise<unknown>)|undefined;compact?:boolean;disabled?:boolean;reuseLabel?:string}){
 const unavailable=attemptSourceUnavailable(studio.snapshot,attempt);
 const actions=recoveryActions(attempt.state,!!attempt.placeholderDiscardedAt).filter(action=>(!unavailable||!['retry','restart','restore','reuse'].includes(action))&& (!!onRestore||!['restore','reuse'].includes(action)));
 const act=async(action:RecoveryAction)=>{
  if(action==='restore'||action==='reuse'){await onRestore?.();return;}
  if(action==='cancel'){
   await studio.performCancellation(attempt.id,async()=>{await request(`/api/attempts/${attempt.id}/cancel`,undefined,'POST');},'Cancellation requested. Recovery choices appear only after the agent and registered generation work are confirmed stopped.');return;
  }
  if(action==='discard'){
   await studio.performImmediate(async()=>{await request(`/api/projects/${attempt.projectId}/attempts/${attempt.id}/discard`,{});},'Placeholder discarded. Its inputs, seeds and outcome remain in history.');return;
  }
  await studio.performImmediate(async()=>{
   const identity=prepareRecoverySubmission(attempt.projectId,attempt.id,action);
   const accepted=await request<StudioAttempt>(`/api/projects/${attempt.projectId}/attempts/${attempt.id}/${action}`,{idempotencyKey:identity.key});
   markRecoveryAccepted(attempt.projectId,attempt.id,action,identity,accepted.id);
  },'Recovery accepted with the original seeds and captured inputs. Existing results and failure records are retained.');
 };
 return <div className="generation-recovery" aria-label={`Generation recovery ${attempt.id}`}>
  {unavailable&&<p className="small-copy warning">{unavailable}</p>}
  {attempt.state==='cancel_requested'&&<p className="small-copy warning" role="status">Stopping the agent and registered tool work… Restart, Discard and Restore remain unavailable until cleanup is confirmed.</p>}
  {attempt.state==='reconciling'&&<p className="small-copy warning">Work ownership or cleanup needs review. No automatic retry or force-clear is offered.</p>}
  {!!actions.length&&<div className="row-actions">{actions.map(action=><button key={action} type="button" className="button secondary small" disabled={disabled||(action==='cancel'?studio.cancelling.has(attempt.id):studio.busy)} onClick={()=>void act(action)}>{action==='reuse'?reuseLabel:labels[action]}</button>)}</div>}
  {!compact&&actions.some(a=>['retry','restart','restore','reuse'].includes(a))&&<p className="small-copy muted">Retry / Restart keep recorded seeds and resolved inputs. Restore / Reuse starts nothing; the next Generate makes a new variation.</p>}
 </div>;
}
