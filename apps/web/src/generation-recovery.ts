import type { MusicDraft, StudioProject } from '../../../packages/core/src/contracts/studio.ts';
import { mergeSavedDraft } from './studio-state.ts';
import { clearMatchingSession,decodeSubmission,readSession,writeSession } from './clip-session.ts';
import { submissionIdentity } from './video-state.ts';
export type RecoveryAction='cancel'|'retry'|'restart'|'restore'|'discard'|'reuse';
/** The server remains authoritative; the UI never offers recovery while stopping. */
export function recoveryActions(state:string,discarded=false):RecoveryAction[]{
 if(discarded)return [];
 if(['queued','preparing','waiting_gpu','running','validating'].includes(state))return ['cancel'];
 if(state==='cancelled')return ['restart','discard','restore'];
 if(state==='failed')return ['retry','restore','discard'];
 return state==='succeeded'?['reuse']:[];
}
const journalKey=(projectId:string,attemptId:string,action:'retry'|'restart')=>`assembly:recovery:${projectId}:${attemptId}:${action}`;
export function prepareRecoverySubmission(projectId:string,attemptId:string,action:'retry'|'restart',key?:()=>string){
 const storage=journalKey(projectId,attemptId,action);
 const raw=readSession(storage),previous=decodeSubmission(raw);
 const identity=submissionIdentity(previous,{projectId,attemptId,action},key);
 // Preserve acknowledgement metadata through a retry/reload while polling fails.
 if(previous?.key!==identity.key||previous.signature!==identity.signature)writeSession(storage,JSON.stringify(identity));
 return identity;
}
export function clearRecoverySubmission(projectId:string,attemptId:string,action:'retry'|'restart',identity:{signature:string;key:string}){
 const storage=journalKey(projectId,attemptId,action),raw=readSession(storage),current=decodeSubmission(raw);
 if(raw!==null&&current?.signature===identity.signature&&current.key===identity.key)clearMatchingSession(storage,raw);
}

/** A successful POST alone must not expose a new recovery key behind a stale card. */
export function markRecoveryAccepted(projectId:string,attemptId:string,action:'retry'|'restart',identity:{signature:string;key:string},acceptedAttemptId:string):void {
 const storage=journalKey(projectId,attemptId,action),current=decodeSubmission(readSession(storage));
 if(current?.signature===identity.signature&&current.key===identity.key)writeSession(storage,JSON.stringify({...identity,acceptedAttemptId}));
}
type RecoveryRecord={id:string;projectId:string;placeholderDiscardedAt?:string;recovery?:{parentAttemptId:string;action:'retry'|'restart'}};
/** Only authoritative matching records retire a confirmed journal. An ambiguous
 * lost POST response deliberately keeps its key rather than guessing ownership. */
export function acknowledgeRecoverySnapshot(snapshot:{project:{id:string};attempts:RecoveryRecord[];videoAttempts:RecoveryRecord[]}):void {
 const attempts=[...snapshot.attempts,...snapshot.videoAttempts];
 for(const child of attempts){
  if(child.projectId!==snapshot.project.id||!child.recovery)continue;
  const {parentAttemptId,action}=child.recovery,parent=attempts.find(a=>a.id===parentAttemptId&&a.projectId===child.projectId);
  if(!parent?.placeholderDiscardedAt)continue;
  const storage=journalKey(child.projectId,parentAttemptId,action),raw=readSession(storage);
  try{const value=JSON.parse(raw??'null');if(raw!==null&&value?.acceptedAttemptId===child.id)clearMatchingSession(storage,raw);}catch{/* Invalid private recovery is not evidence of acceptance. */}
 }
}
/** Cancellation never shares a save/navigation/generation action's lock. */
export function cancellationFlights(){
 const pending=new Set<string>();
 return {has:(id:string)=>pending.has(id),async run(id:string,operation:()=>Promise<void>):Promise<boolean>{
  if(pending.has(id))return false;pending.add(id);
  try{await operation();return true;}finally{pending.delete(id);}
 }};
}
export function restoredProjectState(current:{project:StudioProject|null;draft:MusicDraft},result:StudioProject,beforeDraft:MusicDraft){
 if(current.project?.id!==result.id||current.project.revision>result.revision)return null;
 return {project:result,...mergeSavedDraft(current.draft,beforeDraft,result.draft)};
}
