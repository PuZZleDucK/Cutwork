import { useRef } from 'react';
import type { SongArrangement, StudioSong, ClipEditContext, ClipDraft as SavedClipDraft, ProjectSnapshot,VideoAttempt } from '../../../packages/core/src/contracts/studio.ts';
import { request } from './api.ts';
import { clipSessionKey,readSession,writeSession } from './clip-session.ts';
import { restoreVideoParameters } from './restore-video.ts';
import { clipDraftValues,preparedClipRecovery } from './clip-draft-state.ts';
import { draftWriter } from './clip-draft-ownership.ts';
import { useStudio } from './useStudio.ts';
import { attemptIsActive } from './studio-state.ts';
import { mustReplaceRenderKey, clipSuggestion, renderForRevision, submissionIdentity } from './video-state.ts';
import { ClipForm, useClipDraft } from './ClipComposer.tsx';
import { VideoTimeline } from './VideoTimeline.tsx';
import { LivePreview } from './LivePreview.tsx';
import { PreviewVideo } from './PreviewVideo.tsx';
import { ClipEditControls } from './ClipEditControls.tsx';
import { orderedClipLibrary } from './clip-library-order.ts';
import { CreativeHistory } from './CreativeHistory.tsx';
import {activeArtifacts,artifactState,renderMediaAvailable} from './artifact-lifecycle.ts';
import {ArtifactControls,ArchivedMedia,RetargetClipContext} from './ArtifactControls.tsx';
import { GenerationActions } from './GenerationActions.tsx';
import './video.css';
import {WorkspacePane,openWorkspaceInput,type WorkspacePanel} from './WorkspaceNavigation.tsx';
type Studio = ReturnType<typeof useStudio>;
const asset = (id:string) => `/api/assets/${encodeURIComponent(id)}`;
export function ClipLibrary({studio,song,arrangement,onContinue,onRestore}:{studio:Studio;song:StudioSong|null;arrangement:SongArrangement|null;onContinue?:(context:ClipEditContext)=>Promise<void>;onRestore?:(attempt:VideoAttempt)=>Promise<unknown>}){
 const snapshot=studio.snapshot!,clips=activeArtifacts(snapshot,'clip',snapshot.clips),attempts=snapshot.videoAttempts;
 const entries=orderedClipLibrary(clips,attempts,arrangement?.placements??[]);
 return <section className="clip-library" id="clip-library" tabIndex={-1} aria-label="Generated clip library"><div className="video-section-heading"><h2>Library</h2><span className="micro">{clips.length} CLIPS</span></div>
  {!entries.length&&<p className="empty-video">No active clips yet. Describe a shot; its successful result will join the sequence automatically. Archived clips remain available below.</p>}
  <div className="clip-shelf">{entries.map(entry=>{
   if(entry.kind==='attempt'){const a=entry.attempt;return <article className={`clip-card clip-pending ${attemptIsActive(a.state)?'working':''}`} key={entry.id} data-start-frame={entry.startFrame}><span className="eyebrow">H3 / {a.state.replaceAll('_',' ').toUpperCase()}</span><h3>{a.input.clipPrompt}</h3><p className="small-copy">{a.stage}</p><span className="micro">{a.input.startFrame} → {a.input.endFrame} / {a.input.songId===song?.id?'THIS SONG':'OTHER SONG'}</span>{a.error&&<details><summary className="warning">Failure details</summary><pre>{a.error}</pre></details>}<GenerationActions studio={studio} attempt={a} onRestore={onRestore?()=>onRestore(a):undefined}/></article>;}
   const clip=entry.clip,allContexts=snapshot.editContexts.filter(c=>c.clipId===clip.id),contexts=allContexts.filter(c=>c.songId===song?.id).sort((a,b)=>(a.sourceOriginFrame+a.sourceStartFrame)-(b.sourceOriginFrame+b.sourceStartFrame));
   const missingContext=allContexts.some(c=>!snapshot.songs.some(s=>s.id===c.songId)||['deleting','deleted'].includes(artifactState(snapshot,{kind:'song',id:c.songId})));
   return <article className={`clip-card ${arrangement?.placements.some(p=>p.clipId===clip.id)?'in-sequence':'unplaced'}`} id={`clip-library-${clip.id}`} tabIndex={-1} key={entry.id} data-start-frame={entry.startFrame??undefined}>
    <PreviewVideo controls preload="none" src={asset(clip.assetId)} poster={clip.rawFrames[0]?asset(clip.rawFrames[0].assetId):undefined} aria-label={`Preview clip ${clip.title}`} />
    <div className="clip-card-body"><h3 title={clip.title}>{clip.title}</h3><ArtifactControls studio={studio} refValue={{kind:'clip',id:clip.id}} title={clip.title}/>
     {(()=>{const original=attempts.find(a=>a.id===clip.attemptId);return original&&onRestore?<GenerationActions studio={studio} attempt={original} onRestore={()=>onRestore(original)}/>:null;})()}

     {song&&arrangement&&onContinue&&contexts.map(context=><ClipEditControls key={context.id} studio={studio} song={song} arrangement={arrangement} clip={clip} context={context} onContinue={onContinue} />)}
     {!contexts.length&&<div className="other-song-continuations">{allContexts.map(context=>{
      const referenced=snapshot.songs.find(s=>s.id===context.songId),state=artifactState(snapshot,{kind:'song',id:context.songId});
      return <div key={context.id}><p className="small-copy muted">Saved edit on {referenced?.title??'missing song'} · source {context.sourceStartFrame+1}–{context.sourceEndFrame} · end {context.sourceOriginFrame+context.sourceEndFrame} frames{context.placementId?'':' · unplaced'}</p>
       {!referenced||['deleting','deleted'].includes(state)?<RetargetClipContext studio={studio} context={context}/>:state==='archived'?<p className="warning">Restore this song from the archive before continuing its saved edit.</p>:onContinue?<button className="button secondary small" disabled={studio.busy} onClick={()=>void onContinue(context)}>Continue From End on {referenced.title} ↑</button>:<button className="button secondary small" disabled={studio.busy} onClick={()=>void studio.selectSong(referenced.id)}>Select {referenced.title} to edit or continue</button>}
      </div>;
     })}</div>}
     {song&&arrangement&&!contexts.length&&!missingContext&&<button className="button secondary small" disabled={studio.busy} onClick={()=>void studio.perform(async()=>{const next=clipSuggestion(song,arrangement.placements,snapshot.reservations);const startFrame=next?.startFrame??Math.max(0,...arrangement.placements.map(p=>p.endFrame));await request(`/api/projects/${song.projectId}/songs/${song.id}/placements`,{revision:arrangement.revision,clipId:clip.id,startFrame});},'Clip placed in the selected song sequence.')}>Place in sequence</button>}

    </div>
   </article>;
  })}</div>
 </section>;
}
export function PreviewExport({studio,song,arrangement,active}:{studio:Studio;song:StudioSong;arrangement:SongArrangement;active:boolean}){
 const {current}=renderForRevision(studio.snapshot!.renders.filter(render=>renderMediaAvailable(studio.snapshot!,render)),song.id,arrangement.revision);
 const identity=useRef<{signature:string;key:string}|null>(null);
 const render=async()=>{
  identity.current=submissionIdentity(identity.current,{projectId:song.projectId,songId:song.id,revision:arrangement.revision});
  const key=identity.current.key;
  const ok=await studio.perform(async()=>{try{await request(`/api/projects/${song.projectId}/songs/${song.id}/renders`,{revision:arrangement.revision,idempotencyKey:key});}catch(error){if(mustReplaceRenderKey(error))identity.current=null;throw error;}},'Export queued. You can keep previewing and editing while the file is prepared.');
  if(ok)identity.current=null;return ok;
 };
 return <section className="video-preview" aria-label="Preview and export"><div className="video-section-heading"><h2>Preview / Export</h2></div>
  <div className="screen-and-controls"><LivePreview song={song} arrangement={arrangement} clips={activeArtifacts(studio.snapshot!,'clip',studio.snapshot!.clips)} active={active}/>
  <div className="render-controls"><button className="button primary" title="Render this arrangement as a high-quality downloadable file. Black fills uncovered intervals; video may continue past the song." disabled={studio.busy||['queued','running'].includes(current?.state??'')} onClick={()=>void render()}>{current?.state==='failed'?'Retry export':current?.state==='succeeded'?'Export again':'Export MP4'}</button>
  {current&&<div className="render-status" role="status"><strong>{current.state==='succeeded'?'EXPORT READY':current.state==='failed'?'EXPORT FAILED':'EXPORT '+current.state.toUpperCase()}</strong>{current.state!=='succeeded'&&<p>{current.stage}</p>}{current.error&&<details><summary className="warning">Export details</summary><pre>{current.error}</pre></details>}</div>}
  {current?.state==='succeeded'&&current.assetId&&<a className="button secondary" href={`/api/projects/${song.projectId}/renders/${current.id}/download`} download>Download MP4 ↓</a>}</div></div>
 </section>;
}
export function VideoStudio({studio,panel='video',onRequestPanel}:{studio:Studio;panel?:WorkspacePanel;onRequestPanel?:(panel:WorkspacePanel)=>void}) {
 const snapshot=studio.snapshot!,song=activeArtifacts(snapshot,'song',snapshot.songs).find(s=>s.id===snapshot.project.selectedSongId);
 if(!song)return <><WorkspacePane name="video" active={panel}><section className="empty-video"><h2>Select a soundtrack to edit video</h2><button className="button secondary" onClick={()=>openWorkspaceInput('music',onRequestPanel,'music-prompt')}>Open music</button></section><ClipLibrary studio={studio} song={null} arrangement={null}/></WorkspacePane><WorkspacePane name="archive" active={panel}><ArchivedMedia studio={studio}/></WorkspacePane><WorkspacePane name="history" active={panel}><CreativeHistory studio={studio} onRestoreMusic={()=>openWorkspaceInput('music',onRequestPanel,'music-prompt')}/></WorkspacePane></>;
 const savedArrangement=snapshot.arrangements.find(a=>a.songId===song.id)??{songId:song.id,projectId:song.projectId,revision:0,placements:[]};
 const arrangement={...savedArrangement,placements:savedArrangement.placements.filter(placement=>artifactState(snapshot,{kind:'clip',id:placement.clipId})==='active')};
 return <VideoWorkspace key={song.id} studio={studio} song={song} arrangement={arrangement} panel={panel} onRequestPanel={onRequestPanel}/>;
}
function VideoWorkspace({studio,song,arrangement,panel,onRequestPanel}:{studio:Studio;song:StudioSong;arrangement:SongArrangement;panel:WorkspacePanel;onRequestPanel:((panel:WorkspacePanel)=>void)|undefined}) {
 const draft=useClipDraft(studio,song,arrangement);
 const continueFrom=async(context:ClipEditContext)=>{
  const ok=await studio.perform(async()=>{
   await draft.persistence.save();
   const fresh=await request<ProjectSnapshot>(`/api/projects/${song.projectId}`);
   const target=fresh.clipDrafts.find(d=>d.songId===context.songId);if(!target)throw new Error('The referenced song draft is unavailable.');
   const targetKey=clipSessionKey(song.projectId,context.songId,'draft'),observedRecovery=readSession(targetKey),recoveryWriter=draftWriter(targetKey);
   const prepared=await request<{draft:SavedClipDraft;presetBeatCount:number|null}>(`/api/projects/${song.projectId}/edit-contexts/${context.id}/continue`,{revision:context.revision,draftRevision:target.revision});
   if(context.songId!==song.id){
    const acknowledged=preparedClipRecovery(target,prepared.draft,observedRecovery,readSession(targetKey));
    if(acknowledged!==null&&recoveryWriter.claimIfUnchanged())writeSession(targetKey,acknowledged);
   }
  },'');
  if(!ok)return;
  if(context.songId!==song.id&&!await studio.selectSong(context.songId))return;
  openWorkspaceInput('video',onRequestPanel,'clip-prompt');
 };

 const restoreParameters=async(attempt:VideoAttempt)=>{
  if((studio.dirty||draft.persistence.dirty)&&!window.confirm('Replace the editable generation inputs with this attempt’s original description, style and timing? Cancel keeps your current draft.'))return;
  const observedTarget=studio.snapshot?.clipDrafts.find(d=>d.songId===attempt.input.songId);
  const key=clipSessionKey(attempt.projectId,attempt.input.songId,'draft'),observed=readSession(key),writer=draftWriter(key);
  const ok=await studio.performImmediate(async()=>{
   if(studio.conflict||draft.persistence.conflict)throw new Error('Resolve the existing draft conflict before restoring generation parameters.');
   await restoreVideoParameters({attempt,projectId:song.projectId,selectedSongId:song.id,observedTarget,
    saveProject:studio.saveProjectForRestore,saveClip:draft.persistence.save,post:request,
    accept:(result,target,beforeProjectDraft)=>{
     // Update tab recovery before selecting a different song and mounting it.
     if(result.draft){
      if(target.songId===song.id)draft.persistence.acceptRestored(result.draft,clipDraftValues(target));
      else{
       const acknowledged=preparedClipRecovery(target,result.draft,observed,readSession(key));
       if(acknowledged!==null&&writer.claimIfUnchanged())writeSession(key,acknowledged);
      }
     }
     studio.acceptRestoredProject(result.project,beforeProjectDraft,result.draft);
    }});
  },'Video parameters restored to their original song. No generation started; review the style, description, image and timing, then Generate a new variation.');
  if(ok){openWorkspaceInput('video',onRequestPanel,'clip-prompt');}
 };

 const selectClip=(clipId:string,placementId:string)=>{
  const row=document.getElementById(`clip-library-${clipId}`);const context=[...(row?.querySelectorAll<HTMLElement>('[data-placement-id]')??[])].find(element=>element.dataset.placementId===placementId);const input=context?.querySelector<HTMLInputElement>('input:not(:disabled)');if(input){input.focus({preventScroll:true});input.scrollIntoView({block:'nearest',behavior:'auto'});return;}
  row?.focus({preventScroll:true});row?.scrollIntoView({block:'nearest',behavior:'auto'});
 };
 return <><WorkspacePane name="video" active={panel}><div className="video-workspace"><ClipForm studio={studio} song={song} draft={draft}/><PreviewExport studio={studio} song={song} arrangement={arrangement} active={panel==='video'}/><VideoTimeline studio={studio} song={song} arrangement={arrangement} draft={draft} onSelectClip={selectClip} onSwapPriority={(firstPlacementId,secondPlacementId)=>void studio.perform(async()=>{await request(`/api/projects/${song.projectId}/songs/${song.id}/dominance`,{revision:arrangement.revision,firstPlacementId,secondPlacementId});},'Clip order updated.')}/><ClipLibrary studio={studio} song={song} arrangement={arrangement} onContinue={continueFrom} onRestore={restoreParameters}/></div></WorkspacePane><WorkspacePane name="archive" active={panel}><ArchivedMedia studio={studio}/><button className="button secondary" onClick={()=>openWorkspaceInput('video',onRequestPanel,'clip-library')}>Open clip library to place restored clips →</button></WorkspacePane><WorkspacePane name="history" active={panel}><CreativeHistory studio={studio} onRestoreVideo={restoreParameters} onRestoreMusic={()=>openWorkspaceInput('music',onRequestPanel,'music-prompt')}/></WorkspacePane></>;
}
