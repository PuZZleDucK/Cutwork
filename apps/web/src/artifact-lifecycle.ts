import type {ArtifactRef,ArtifactLifecycle,ArtifactDeletePlan} from '../../../packages/core/src/contracts/lifecycle.ts';
import type {ProjectSnapshot,StudioAttempt,StudioRender} from '../../../packages/core/src/contracts/studio.ts';
import {ApiError} from './api.ts';
import {readSession,writeSession,clearMatchingSession} from './clip-session.ts';
export function artifactLifecycle(snapshot:ProjectSnapshot,ref:ArtifactRef):ArtifactLifecycle|undefined {
 return snapshot.artifactLifecycles?.find(row=>row.projectId===snapshot.project.id&&row.kind===ref.kind&&row.id===ref.id);
}
export function artifactState(snapshot:ProjectSnapshot,ref:ArtifactRef):ArtifactLifecycle['state'] {
 const deletion=snapshot.deletions?.find(row=>row.projectId===snapshot.project.id&&row.artifact?.kind===ref.kind&&row.artifact.id===ref.id);
 return deletion?(deletion.state==='succeeded'?'deleted':'deleting'):artifactLifecycle(snapshot,ref)?.state??'active';
}
export const artifactMediaAvailable=(snapshot:ProjectSnapshot,ref:ArtifactRef)=>!['deleting','deleted'].includes(artifactState(snapshot,ref));
export const activeArtifacts=<T extends {id:string}>(snapshot:ProjectSnapshot,kind:ArtifactRef['kind'],rows:readonly T[]):T[]=>rows.filter(row=>artifactState(snapshot,{kind,id:row.id})==='active');
/** Accepted deletion hides old render bytes immediately, not only after unlink. */
export function renderMediaAvailable(snapshot:ProjectSnapshot,render:StudioRender):boolean {
 if(snapshot.deletions?.some(row=>row.projectId===snapshot.project.id&&row.inventory.affectedRenderIds.includes(render.id)))return false;
 return artifactMediaAvailable(snapshot,{kind:'song',id:render.songId??render.snapshot.song.id})&&render.snapshot.clips.every(clip=>artifactMediaAvailable(snapshot,{kind:'clip',id:clip.id}));
}
export function attemptSourceUnavailable(snapshot:ProjectSnapshot|undefined|null,attempt:StudioAttempt):string|null {
 if(!snapshot||!('song' in attempt))return null;
 const song=snapshot.songs.find(song=>song.id===attempt.song.id);
 if(!song||artifactState(snapshot,{kind:'song',id:song.id})!=='active')return 'The original song is unavailable or archived. Restore it from the archive, or explicitly choose a replacement song for a surviving clip. The original inputs remain below.';
 if(attempt.continuation&&(!snapshot.clips.some(clip=>clip.id===attempt.continuation!.clipId)||artifactState(snapshot,{kind:'clip',id:attempt.continuation.clipId})!=='active'))return 'The original starting frame is unavailable or archived. Restore the source clip if possible; no replacement image will be chosen silently. The original inputs remain below.';
 return null;
}
const journalKey=(projectId:string,ref:ArtifactRef)=>`assembly:deletion:${projectId}:${ref.kind}:${ref.id}`;
export interface DeletionSubmission {plan:ArtifactDeletePlan;key:string}
export function readDeletionSubmission(projectId:string,ref:ArtifactRef):DeletionSubmission|null {
 try{
  const value=JSON.parse(readSession(journalKey(projectId,ref))??'null') as DeletionSubmission|null,p=value?.plan;
  if(!p||p.projectId!==projectId||p.ref?.kind!==ref.kind||p.ref.id!==ref.id||typeof p.id!=='string'||typeof p.title!=='string'||!Array.isArray(p.retains)||!p.retains.every(v=>typeof v==='string')||!Array.isArray(p.limitations)||!p.limitations.every(v=>typeof v==='string')||!Array.isArray(p.blockers)||p.blockers.some(v=>!v||typeof v.id!=='string'||typeof v.kind!=='string'||typeof v.detail!=='string'||typeof v.state!=='string')||typeof p.digest!=='string'||!/^[a-f0-9]{64}$/.test(p.digest)||!Number.isFinite(p.fileCount)||!Number.isFinite(p.bytes)||!Number.isFinite(Date.parse(p.expiresAt))||!value||!/^[a-f0-9-]{36}$/.test(value.key))return null;
  return value;
 }catch{return null;}
}
/** Called only on explicit confirmation. An ambiguous request cannot be replaced
 * by a new disclosure/key; the server checks the old key before expiry guards. */
export function beginDeletionSubmission(plan:ArtifactDeletePlan,key:()=>string=()=>crypto.randomUUID()):DeletionSubmission {
 const pending=readDeletionSubmission(plan.projectId,plan.ref);if(pending)return pending;
 const result={plan,key:key()};writeSession(journalKey(plan.projectId,plan.ref),JSON.stringify(result));return result;
}
export function forgetDeletionSubmission(submission:DeletionSubmission):void {
 const key=journalKey(submission.plan.projectId,submission.plan.ref),raw=readSession(key);
 if(raw!==null){const saved=readDeletionSubmission(submission.plan.projectId,submission.plan.ref);if(saved?.key===submission.key&&saved.plan.id===submission.plan.id)clearMatchingSession(key,raw);}
}
export const deletionDefinitelyRejected=(error:unknown)=>error instanceof ApiError&&['DELETE_PLAN_EXPIRED','DELETE_PLAN_STALE','DELETE_PLAN_CHANGED'].includes(error.code);
export function acknowledgeDeletionSnapshot(snapshot:ProjectSnapshot):void {
 for(const row of snapshot.deletions??[])if(row.projectId===snapshot.project.id){const pending=readDeletionSubmission(row.projectId,row.artifact);if(pending)forgetDeletionSubmission(pending);}
}
