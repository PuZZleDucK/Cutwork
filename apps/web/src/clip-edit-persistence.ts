import type {ClipEditContext,ProjectSnapshot,SongArrangement} from '../../../packages/core/src/contracts/studio.ts';
import {ApiError,request} from './api.ts';
export interface ClipEditResult {context:ClipEditContext;arrangement:SongArrangement}
export interface ClipEditPatch {
 sourceStartFrame?:number;sourceEndFrame?:number;trimIntent?:ClipEditContext['trimIntent'];
 startFrame?:number;placementIntent?:ClipEditContext['placementIntent'];audioSource?:'song'|'clip';
}

/** Another card may have updated the arrangement, but never borrow a newer
 * revision of this context to overwrite another editor or replay a lost ACK. */
export async function persistClipEdit(context:ClipEditContext,arrangementRevision:number,edit:ClipEditPatch,send:typeof request=request):Promise<ClipEditResult>{
 const path=`/api/projects/${context.projectId}/edit-contexts/${context.id}`;
 const put=(revision:number)=>send<ClipEditResult>(path,{revision:context.revision,arrangementRevision:revision,edit},'PUT');
 try{return await put(arrangementRevision);}catch(error){
  if(!(error instanceof ApiError)||error.status!==409)throw error;
  const fresh=await send<ProjectSnapshot>(`/api/projects/${context.projectId}`);
  const current=fresh.editContexts.find(c=>c.id===context.id),arrangement=fresh.arrangements.find(a=>a.songId===context.songId);
  if(fresh.project.id!==context.projectId||!current||current.revision!==context.revision||current.songId!==context.songId||current.clipId!==context.clipId||!arrangement||arrangement.revision===arrangementRevision)throw error;
  return put(arrangement.revision);
 }
}
/** Acknowledgements update live playback immediately, never a different project
 * or a context/arrangement already observed at a newer revision. */
export function acknowledgeClipEdit(snapshot:ProjectSnapshot|null,result:ClipEditResult):ProjectSnapshot|null {
 if(!snapshot||snapshot.project.id!==result.context.projectId)return snapshot;
 return {...snapshot,
  editContexts:snapshot.editContexts.map(c=>c.id===result.context.id&&c.revision<=result.context.revision?result.context:c),
  arrangements:snapshot.arrangements.map(a=>a.songId===result.arrangement.songId&&a.revision<=result.arrangement.revision?result.arrangement:a)};
}
