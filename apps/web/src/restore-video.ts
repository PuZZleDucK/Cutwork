import type {ClipDraft,MusicDraft,ProjectSnapshot,StudioAttempt,StudioProject,VideoAttempt} from '../../../packages/core/src/contracts/studio.ts';
export interface VideoRestoreResult {project:StudioProject;draft:ClipDraft|null;attempt:StudioAttempt}
export interface VideoRestoreOptions {
 attempt:VideoAttempt;projectId:string;selectedSongId:string;observedTarget:ClipDraft|undefined;
 saveProject:()=>Promise<StudioProject>;saveClip:()=>Promise<ClipDraft>;
 post:(url:string,body:{projectRevision:number;clipDraftRevision:number})=>Promise<VideoRestoreResult>;
 accept:(result:VideoRestoreResult,target:ClipDraft,before:MusicDraft)=>void;
}
/** Never replace a revision with an unseen GET result to make a mutation succeed. */
export async function restoreVideoParameters(options:VideoRestoreOptions):Promise<{result:VideoRestoreResult;target:ClipDraft}>{
 const {attempt,observedTarget}=options;
 if(attempt.projectId!==options.projectId)throw new Error('Select the original project before restoring these parameters.');
 if(!observedTarget||observedTarget.songId!==attempt.input.songId||observedTarget.projectId!==attempt.projectId)throw new Error('The original song is unavailable; parameters cannot be restored to another song.');
 // Capture both click-time bases before either save yields to polling.
 const projectSave=options.saveProject(),clipSave=options.saveClip();
 const [project,savedClip]=await Promise.all([projectSave,clipSave]);
 if(project.id!==attempt.projectId)throw new Error('The original project changed during restoration.');
 const target=options.selectedSongId===observedTarget.songId?savedClip:observedTarget;
 if(target.songId!==observedTarget.songId||target.projectId!==attempt.projectId)throw new Error('The original song draft changed during restoration.');
 const result=await options.post(`/api/projects/${attempt.projectId}/attempts/${attempt.id}/restore-parameters`,{projectRevision:project.revision,clipDraftRevision:target.revision});
 options.accept(result,target,project.draft);
 return {result,target};
}

/** Accepted project selection and its returned clip draft must arrive together. */
export function restoredSnapshot(snapshot:ProjectSnapshot|null,project:StudioProject,draft?:ClipDraft|null):ProjectSnapshot|null{
 if(!snapshot||snapshot.project.id!==project.id||snapshot.project.revision>project.revision)return snapshot;
 let clipDrafts=snapshot.clipDrafts;
 if(draft&&draft.projectId===project.id){
  const old=clipDrafts.find(d=>d.songId===draft.songId);
  if(!old)clipDrafts=[...clipDrafts,draft];
  else if(old.revision<=draft.revision)clipDrafts=clipDrafts.map(d=>d.songId===draft.songId?draft:d);
 }
 return {...snapshot,project,clipDrafts};
}
