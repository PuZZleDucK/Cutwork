import {useEffect,useState} from 'react';
import type {ClipEditContext,SongArrangement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import {displayTimingValue,timingValueFromSeconds,type TimingValue} from '../../../packages/core/src/time/linked-timing.ts';
import {clipAudioMisaligned,moveEditFromContext,resolveMoveEdit,resolveTrimEdit,trimEditDisplay,trimEditFromContext,type TrimEdit} from './clip-edit-state.ts';
import {request} from './api.ts';
import type {useStudio} from './useStudio.ts';
type Studio=ReturnType<typeof useStudio>;
type EditResult={context:ClipEditContext;arrangement:SongArrangement};
const fields=['frames','beats','seconds'] as const;
const cleanDisplay=(value:string|null|undefined)=>value?.replace(/^≈ /,'')??'';

export function ClipEditControls({studio,song,arrangement,clip,context,onContinue}:{studio:Studio;song:StudioSong;arrangement:SongArrangement;clip:StudioClip;context:ClipEditContext;onContinue:(context:ClipEditContext)=>Promise<void>}){
 const [base,setBase]=useState(context),[trim,setTrim]=useState<TrimEdit>(()=>trimEditFromContext(context)),[move,setMove]=useState<TimingValue>(()=>moveEditFromContext(context));
 const [dirty,setDirty]=useState<'trim'|'move'|null>(null);
 const reset=(next:ClipEditContext)=>{setBase(next);setTrim(trimEditFromContext(next));setMove(moveEditFromContext(next));setDirty(null);};
 useEffect(()=>{if(!dirty&&context.revision>base.revision)reset(context);},[context.revision,dirty]);
 const stale=context.revision>base.revision,trimmed=resolveTrimEdit(song,base,trim,clip.nativeFrames),moved=resolveMoveEdit(song,base,move);
 const start=base.sourceOriginFrame+base.sourceStartFrame,end=base.sourceOriginFrame+base.sourceEndFrame;
 let moveDisplay:ReturnType<typeof displayTimingValue>|undefined;try{moveDisplay=displayTimingValue(song,move);}catch{/* Invalid text remains editable. */}
 const hasBeats=displayTimingValue(song,{unit:'seconds',value:'0'}).beats!==null;
 let endDisplay:ReturnType<typeof displayTimingValue>|undefined;try{endDisplay=displayTimingValue(song,timingValueFromSeconds({numerator:BigInt(moved.valid?moved.endFrame:end),denominator:24n}));}catch{/* A legacy oversized boundary must not crash the editor. */}
 const original=studio.snapshot!.videoAttempts.find(a=>a.id===clip.attemptId),misaligned=clipAudioMisaligned(base,clip,original);
 const placement=arrangement.placements.find(p=>p.id===context.placementId);
 const overlaps=placement?arrangement.placements.filter(p=>p.id!==placement.id&&p.startFrame<placement.endFrame&&p.endFrame>placement.startFrame).sort((a,b)=>b.priority-a.priority):[];
 const path=`/api/projects/${song.projectId}/edit-contexts/${context.id}`;
 const edit=async(patch:Record<string,unknown>,notice:string)=>studio.perform(async()=>{const result=await request<EditResult>(path,{revision:base.revision,arrangementRevision:arrangement.revision,edit:patch},'PUT');reset(result.context);},notice);
 const mutatePlacement=()=>studio.perform(async()=>{const result=await request<EditResult>(path+'/placement',{revision:base.revision,arrangementRevision:arrangement.revision,placed:!base.placementId});reset(result.context);},base.placementId?'Removed from the sequence. Its saved trim, timing and audio choice are retained.':'Placed this saved edit in the sequence.');
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const disabled=studio.busy||stale,actionsDisabled=disabled||!!dirty;
 return <div className="clip-edit" data-context-id={context.id} data-placement-id={context.placementId??undefined}>
  <div className="clip-edit-overview"><span className="clip-placement-state">{base.placementId?'IN SEQUENCE':'UNPLACED'}</span><strong>Source {base.sourceStartFrame+1}–{base.sourceEndFrame}</strong><span>{start} → {end} · {base.audioSource==='clip'?'CLIP AUDIO':'SONG AUDIO'}</span></div>
  <div className="clip-edit-actions" role="group" aria-label={`Actions for ${clip.title} on ${song.title}`}>
   <button type="button" className="button secondary small continue-clip" disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void onContinue(base);}}>Continue From End ↑</button>
   <button type="button" className="button secondary small placement-action" disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void mutatePlacement();}}>{base.placementId?'Remove from sequence':'Place in sequence'}</button>
  </div>
  {stale&&<p className="warning" role="alert">This edit changed elsewhere. Your unsaved values are retained; load the latest edit before applying.</p>}
  {dirty&&<p className="small-copy muted" role="status">Apply or discard timing edits before continuing or changing placement.</p>}
  {(dirty||stale)&&<button type="button" className="text-button" disabled={studio.busy} onClick={()=>reset(context)}>{stale?'Load latest edit':'Discard timing edits'}</button>}
  <details className="clip-edit-details"><summary>Timing &amp; audio</summary>
  <div className="edit-context-body"><p className="small-copy muted">Apply saves timing changes. Leaving this song or project discards unapplied timing edits.</p><p className="micro">{song.title} / EDIT {context.id.slice(0,8)} · REV {base.revision}</p>
  <fieldset disabled={disabled||dirty==='move'} className="source-trim"><legend>Trim retained footage</legend><p className="small-copy muted">Source frame numbers are inclusive. Beats and seconds are positions on this song; the end time is exclusive. Trimming leaves retained frames where they are.</p>
   <div className="trim-grid">{(['start','end'] as const).map(endpoint=>{const value=trim[endpoint],shown=trimEditDisplay(song,base,value,endpoint);return <div key={endpoint}><h4>{endpoint==='start'?'First retained':'Last retained'}</h4>{(['sourceFrames','beats','seconds'] as const).map(unit=>{
    const v=shown[unit];return <label key={unit}><span>{unit==='sourceFrames'?'Source frame · inclusive':unit==='beats'?`Song beat${endpoint==='end'?' · exclusive end':''}`:`Song seconds${endpoint==='end'?' · exclusive end':''}`}{v?.startsWith('≈ ')&&<abbr title="Approximate display only; exact intent is retained."> ≈</abbr>}</span><input aria-label={`Trim ${endpoint} ${unit} ${context.id}`} inputMode={unit==='sourceFrames'?'numeric':'decimal'} maxLength={1000} value={cleanDisplay(v)} disabled={unit==='beats'&&!hasBeats} placeholder={unit==='beats'?'No beat map':'—'} onChange={e=>{setDirty('trim');setTrim(old=>({...old,[endpoint]:{unit,value:e.target.value}}));}} /></label>;
   })}</div>;})}</div>
   <div className="edit-readout" role="status">{trimmed.valid?`${trimmed.sourceEndFrame-trimmed.sourceStartFrame} retained frames · realised timeline [${trimmed.startFrame}, ${trimmed.endFrame})`:trimmed.error}</div>
   <button type="button" className="button secondary small" disabled={dirty!=='trim'||!trimmed.valid} onClick={()=>trimmed.valid&&void edit({sourceStartFrame:trimmed.sourceStartFrame,sourceEndFrame:trimmed.sourceEndFrame,trimIntent:trimmed.intent},'Trim saved. Retained frames keep their song positions.')}>Apply trim</button>
  </fieldset>
  <fieldset disabled={disabled||dirty==='trim'} className="move-clip"><legend>Move on song</legend><p className="small-copy muted">Move the retained footage without changing its source frames or length. Frame labels name a containing timeline frame, starting at one.</p>
   <div className="move-grid">{fields.map(unit=>{const shown=move.unit===unit?move.value:moveDisplay?.[unit];return <label key={unit}><span>Start {unit}{typeof shown==='string'&&shown.startsWith('≈ ')&&<abbr title="Approximate display only; exact intent retained."> ≈</abbr>}</span><input aria-label={`Move start ${unit} ${context.id}`} inputMode={unit==='frames'?'numeric':'decimal'} maxLength={1000} value={typeof shown==='string'?cleanDisplay(shown):''} disabled={unit==='beats'&&!hasBeats} onChange={e=>{setDirty('move');setMove({unit,value:e.target.value});}} /></label>;})}</div>
   <div className="edit-readout" role="status">{moved.valid?`Realised [${moved.startFrame}, ${moved.endFrame}) · ${base.sourceEndFrame-base.sourceStartFrame} frames · end ${endDisplay?.seconds??'outside display range'} s${endDisplay?.beats!=null?` / beat ${endDisplay.beats}`:''}`:moved.error}</div>
   <button type="button" className="button secondary small" disabled={dirty!=='move'||!moved.valid} onClick={()=>moved.valid&&void edit({startFrame:moved.startFrame,placementIntent:move},'Clip moved. Its source trim and length are unchanged.')}>Apply move</button>
  </fieldset>
  <fieldset disabled={disabled||!!dirty} className="clip-soundtrack"><legend>Sequence soundtrack</legend><label className="audio-choice"><input type="checkbox" checked={base.audioSource==='clip'} disabled={!clip.audioAssetId} onChange={e=>void edit({audioSource:e.target.checked?'clip':'song'},'Soundtrack source saved. Only the dominant clip can replace the song.')} /><span>Use this clip’s audio instead of the song</span></label>
   {!clip.audioAssetId&&<p className="small-copy muted">This clip has no registered audio.</p>}
   {misaligned&&<p className="warning" role="status">⚠ Different audio alignment: this edit moved or uses another song. Embedded music may not match; clip audio is still allowed.</p>}
   <p className="small-copy muted">Only while this clip is visible. Hidden clips never contribute audio. No mixing or fades.</p>
  </fieldset>
  {placement&&<fieldset disabled={disabled||!!dirty} className="overlap-controls"><legend>Visual priority</legend>{overlaps.length?overlaps.map(other=><button key={other.id} type="button" className="button secondary small" onClick={()=>void studio.perform(async()=>{await request(`/api/projects/${song.projectId}/songs/${song.id}/dominance`,{revision:arrangement.revision,firstPlacementId:placement.id,secondPlacementId:other.id});},'Visual priority swapped. Timing, coverage and each audio choice are unchanged.')} >{placement.priority>other.priority?'Send behind':'Bring ahead of'} {studio.snapshot!.clips.find(c=>c.id===other.clipId)?.title??'overlapping clip'} · {other.id.slice(0,6)}</button>):<p className="small-copy muted">No overlapping clips.</p>}</fieldset>}
  </div>
 </details></div>;
}
