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
 const path=`/api/projects/${song.projectId}/edit-contexts/${context.id}`;
 const edit=async(patch:Record<string,unknown>,notice:string)=>studio.perform(async()=>{const result=await request<EditResult>(path,{revision:base.revision,arrangementRevision:arrangement.revision,edit:patch},'PUT');reset(result.context);},notice);
 const mutatePlacement=()=>studio.perform(async()=>{const result=await request<EditResult>(path+'/placement',{revision:base.revision,arrangementRevision:arrangement.revision,placed:!base.placementId});reset(result.context);},base.placementId?'Removed from the sequence. Its saved trim, timing and audio choice are retained.':'Placed this saved edit in the sequence.');
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const disabled=studio.busy||stale,actionsDisabled=disabled||!!dirty;
 return <div className="clip-edit" data-context-id={context.id} data-placement-id={context.placementId??undefined}>
  <div className="clip-edit-overview"><span className="clip-placement-state">{base.placementId?'IN SEQUENCE':'UNPLACED'}</span><span title={`Source frames ${base.sourceStartFrame+1}–${base.sourceEndFrame}; timeline frame boundaries ${start}–${end}.`}>{base.sourceEndFrame-base.sourceStartFrame} frames</span></div>
  <div className="clip-edit-actions" role="group" aria-label={`Actions for ${clip.title} on ${song.title}`}>
   <button type="button" className="button secondary small continue-clip" disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void onContinue(base);}}>Continue From End ↑</button>
   <button type="button" className="button secondary small placement-action" disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void mutatePlacement();}}>{base.placementId?'Remove from sequence':'Place in sequence'}</button>
  </div>
  {stale&&<p className="warning" role="alert">Changed elsewhere. Load the latest edit before applying.</p>}
  {dirty&&<p className="small-copy muted" role="status">Apply or discard timing edits first.</p>}
  {(dirty||stale)&&<button type="button" className="button secondary small" disabled={studio.busy} onClick={()=>reset(context)}>{stale?'Load latest edit':'Discard timing edits'}</button>}
  <div className="edit-context-body" aria-label={`Timing and audio for ${clip.title}`}>
  <fieldset disabled={disabled||dirty==='move'} className="source-trim"><legend title="Trim source footage without moving retained frames. Apply saves changes; switching songs or projects discards unapplied edits.">Trim</legend>
   <div className="trim-grid">{(['start','end'] as const).map(endpoint=>{const value=trim[endpoint],shown=trimEditDisplay(song,base,value,endpoint);return <div key={endpoint}><h4>{endpoint==='start'?'In':'Out'}</h4>{(['sourceFrames','beats','seconds'] as const).map(unit=>{
    const v=shown[unit],help=unit==='sourceFrames'?`Inclusive ${endpoint==='start'?'first':'last'} retained source frame, starting at 1.`:`${endpoint==='start'?'Start':'Exclusive end'} position on the song in ${unit}. Exact values are retained; footage snaps outward to the 24 fps grid.`;
    return <label key={unit} title={help}><span>{unit==='sourceFrames'?'Frame':unit==='beats'?'Beat':'Seconds'}{v?.startsWith('≈ ')&&<abbr title="Approximate display only; exact intent is retained."> ≈</abbr>}</span><input title={help} aria-label={`Trim ${endpoint} ${unit} ${context.id}`} inputMode={unit==='sourceFrames'?'numeric':'decimal'} maxLength={1000} value={cleanDisplay(v)} disabled={unit==='beats'&&!hasBeats} placeholder={unit==='beats'?'No beat map':'—'} onChange={e=>{setDirty('trim');setTrim(old=>({...old,[endpoint]:{unit,value:e.target.value}}));}} /></label>;
   })}</div>;})}</div>
   {!trimmed.valid&&<div className="edit-readout error-copy" role="status">{trimmed.error}</div>}
   <button type="button" className="button secondary small" title="Save the displayed source trim. Retained frames keep their song positions." disabled={dirty!=='trim'||!trimmed.valid} onClick={()=>trimmed.valid&&void edit({sourceStartFrame:trimmed.sourceStartFrame,sourceEndFrame:trimmed.sourceEndFrame,trimIntent:trimmed.intent},'Trim saved.')}>Apply trim</button>
  </fieldset>
  <fieldset disabled={disabled||dirty==='trim'} className="move-clip"><legend title={`Move retained footage without changing its trim or length. End: ${endDisplay?.seconds??'outside display range'} seconds${endDisplay?.beats!=null?` / beat ${endDisplay.beats}`:''}.`}>Position</legend>
   <div className="move-grid">{fields.map(unit=>{const shown=move.unit===unit?move.value:moveDisplay?.[unit],help=unit==='frames'?'Timeline start frame, starting at 1. Moving keeps the source trim and duration.':`Timeline start in ${unit}. Moving keeps the source trim and duration.`;return <label key={unit} title={help}><span>{unit==='frames'?'Frame':unit==='beats'?'Beat':'Seconds'}{typeof shown==='string'&&shown.startsWith('≈ ')&&<abbr title="Approximate display only; exact intent retained."> ≈</abbr>}</span><input title={help} aria-label={`Move start ${unit} ${context.id}`} inputMode={unit==='frames'?'numeric':'decimal'} maxLength={1000} value={typeof shown==='string'?cleanDisplay(shown):''} disabled={unit==='beats'&&!hasBeats} onChange={e=>{setDirty('move');setMove({unit,value:e.target.value});}} /></label>;})}</div>
   {!moved.valid&&<div className="edit-readout error-copy" role="status">{moved.error}</div>}
   <button type="button" className="button secondary small" title="Save this position without changing the source trim or duration." disabled={dirty!=='move'||!moved.valid} onClick={()=>moved.valid&&void edit({startFrame:moved.startFrame,placementIntent:move},'Clip moved.')}>Apply move</button>
  </fieldset>
  <fieldset disabled={disabled||!!dirty} className="clip-soundtrack"><legend>Audio</legend><label className="audio-choice" title={clip.audioAssetId?'Use the clip’s complete soundtrack instead of the song, only while this clip is on top. Hidden clips contribute no audio.':'This clip has no registered audio.'}><input type="checkbox" checked={base.audioSource==='clip'} disabled={!clip.audioAssetId} onChange={e=>void edit({audioSource:e.target.checked?'clip':'song'},'Soundtrack source saved.')} /><span>Use clip audio</span></label>
   {misaligned&&base.audioSource==='clip'&&<p className="warning" role="status" title="This edit moved or uses another song. Embedded music may not match; clip audio is still allowed.">⚠ Audio may be out of sync.</p>}
  </fieldset>
  </div>
 </div>;
}
