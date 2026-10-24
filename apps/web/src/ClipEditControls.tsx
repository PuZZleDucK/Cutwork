import type {ReactNode} from 'react';
import type {ClipEditContext,SongArrangement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import {displayTimingValue,timingValueFromSeconds} from '../../../packages/core/src/time/linked-timing.ts';
import {clipAudioMisaligned,resolveMoveEdit,resolveTrimEdit,trimEditDisplay} from './clip-edit-state.ts';
import {request} from './api.ts';
import type {useStudio} from './useStudio.ts';
import type {ClipEditResult} from './clip-edit-persistence.ts';
import {useClipEditAutosave} from './useClipEditAutosave.ts';
type Studio=ReturnType<typeof useStudio>;
const fields=['frames','beats','seconds'] as const;
const cleanDisplay=(value:string|null|undefined)=>value?.replace(/^≈ /,'')??'';
interface ClipEditParts {placement:ReactNode;actions:ReactNode;controls:ReactNode;actionsDisabled:boolean}
export function ClipEditControls(props:{studio:Studio;song:StudioSong;arrangement:SongArrangement;clip:StudioClip;context:ClipEditContext;onContinue:(context:ClipEditContext)=>Promise<void>;reuseAction?:(disabled:boolean)=>ReactNode;children?:(parts:ClipEditParts)=>ReactNode}){
 const {studio,song,clip,context,onContinue,reuseAction,children}=props;
 const {state,editor}=useClipEditAutosave(props),{base,trim,move,dirty,saving,error,conflict}=state;
 const trimmed=resolveTrimEdit(song,base,trim,clip.nativeFrames),moved=resolveMoveEdit(song,base,move);
 const start=base.sourceOriginFrame+base.sourceStartFrame,end=base.sourceOriginFrame+base.sourceEndFrame;
 let moveDisplay:ReturnType<typeof displayTimingValue>|undefined;try{moveDisplay=displayTimingValue(song,move);}catch{/* Invalid text remains editable. */}
 const hasBeats=displayTimingValue(song,{unit:'seconds',value:'0'}).beats!==null;
 let endDisplay:ReturnType<typeof displayTimingValue>|undefined;try{endDisplay=displayTimingValue(song,timingValueFromSeconds({numerator:BigInt(moved.valid?moved.endFrame:end),denominator:24n}));}catch{/* Oversized boundaries must not crash the editor. */}
 const original=studio.snapshot!.videoAttempts.find(a=>a.id===clip.attemptId),misaligned=clipAudioMisaligned(base,clip,original);
 const disabled=studio.busy||conflict,actionsDisabled=disabled||!!dirty||saving;
 const mutatePlacement=()=>editor.action(async(current,revision)=>{
  const result=await request<ClipEditResult>(`/api/projects/${song.projectId}/edit-contexts/${context.id}/placement`,{revision:current.revision,arrangementRevision:revision,placed:!current.placementId});
  studio.acceptClipEdit(result);return result;
 });
 const placement=<div className="clip-placement-bar"><span className="clip-placement-state">{base.placementId?'IN SEQUENCE':'UNPLACED'}</span><span className="clip-frame-count" title={`Source frames ${base.sourceStartFrame+1}–${base.sourceEndFrame}; timeline frame boundaries ${start}–${end}.`}>{base.sourceEndFrame-base.sourceStartFrame} frames</span>{!base.placementId&&<button type="button" className="button secondary small placement-action" disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void mutatePlacement();}}>Place in sequence</button>}</div>;
 const actions=<div className="clip-primary-actions" role="group" aria-label={`Actions for ${clip.title} on ${song.title}`}>
  <button type="button" className="button secondary small continue-clip" title="Prepare the next generation from this edit’s last retained frame." disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void onContinue(base);}}>Continue from</button>
  {reuseAction?.(actionsDisabled)}
  {base.placementId&&<button type="button" className="button secondary small placement-action" title="Remove this placement from the sequence; keep the clip and its saved edits in the library." disabled={actionsDisabled} onClick={()=>{if(!actionsDisabled)void mutatePlacement();}}>Remove</button>}
 </div>;
 const contents=<>
  <div className="edit-context-body" aria-label={`Timing and audio for ${clip.title}`}>
   <fieldset disabled={actionsDisabled} className="clip-soundtrack"><legend>Audio</legend><label className="audio-choice" title={clip.audioAssetId?'Use the clip’s complete soundtrack instead of the song, only while this clip is on top. Hidden clips contribute no audio.':'This clip has no registered audio.'}><input type="checkbox" checked={base.audioSource==='clip'} disabled={!clip.audioAssetId} onChange={e=>{const audioSource=e.target.checked?'clip':'song';void editor.action((current,revision)=>studio.saveClipEdit(current,revision,{audioSource}));}} /><span>Use clip audio</span></label>
    {misaligned&&base.audioSource==='clip'&&<p className="warning" role="status" title="This edit moved or uses another song. Embedded music may not match; clip audio is still allowed.">⚠ Audio may be out of sync.</p>}
   </fieldset>
   <fieldset disabled={disabled||dirty==='move'} className="source-trim"><legend title="Trim source footage without moving retained frames. Valid edits save automatically after a short typing pause or when you leave the field.">Trim</legend>
    <div className="trim-grid">{(['start','end'] as const).map(endpoint=>{const value=trim[endpoint],shown=trimEditDisplay(song,base,value,endpoint);return <div key={endpoint}><h4>{endpoint==='start'?'In':'Out'}</h4>{(['sourceFrames','beats','seconds'] as const).map(unit=>{
     const v=shown[unit],help=unit==='sourceFrames'?`Inclusive ${endpoint==='start'?'first':'last'} retained source frame, starting at 1.`:`${endpoint==='start'?'Start':'Exclusive end'} position on the song in ${unit}. Exact values are retained; footage snaps outward to the 24 fps grid.`;
     return <label key={unit} title={help}><span>{unit==='sourceFrames'?'Frame':unit==='beats'?'Beat':'Seconds'}{v?.startsWith('≈ ')&&<abbr title="Approximate display only; exact intent is retained."> ≈</abbr>}</span><input title={help} aria-label={`Trim ${endpoint} ${unit} ${context.id}`} inputMode={unit==='sourceFrames'?'numeric':'decimal'} maxLength={1000} value={cleanDisplay(v)} disabled={unit==='beats'&&!hasBeats} placeholder={unit==='beats'?'No beat map':'—'} onChange={e=>editor.trim(endpoint,{unit,value:e.target.value})} onBlur={()=>void editor.flush()} onKeyDown={e=>{if(e.key==='Enter')void editor.flush();}} /></label>;
    })}</div>;})}</div>
    {!trimmed.valid&&<div className="edit-readout error-copy" role="status">{trimmed.error}</div>}
   </fieldset>
   <fieldset disabled={disabled||dirty==='trim'} className="move-clip"><legend title={`Move retained footage without changing its trim or length. Valid edits save automatically. End: ${endDisplay?.seconds??'outside display range'} seconds${endDisplay?.beats!=null?` / beat ${endDisplay.beats}`:''}.`}>Position</legend>
    <div className="move-grid">{fields.map(unit=>{const shown=move.unit===unit?move.value:moveDisplay?.[unit],help=unit==='frames'?'Timeline start frame, starting at 1. Moving keeps the source trim and duration.':`Timeline start in ${unit}. Moving keeps the source trim and duration.`;return <label key={unit} title={help}><span>{unit==='frames'?'Frame':unit==='beats'?'Beat':'Seconds'}{typeof shown==='string'&&shown.startsWith('≈ ')&&<abbr title="Approximate display only; exact intent retained."> ≈</abbr>}</span><input title={help} aria-label={`Move start ${unit} ${context.id}`} inputMode={unit==='frames'?'numeric':'decimal'} maxLength={1000} value={typeof shown==='string'?cleanDisplay(shown):''} disabled={unit==='beats'&&!hasBeats} onChange={e=>editor.move({unit,value:e.target.value})} onBlur={()=>void editor.flush()} onKeyDown={e=>{if(e.key==='Enter')void editor.flush();}} /></label>;})}</div>
    {!moved.valid&&<div className="edit-readout error-copy" role="status">{moved.error}</div>}
   </fieldset>
  </div>

  {(saving||dirty)&&<span className="sr-only" role="status">{saving?'Saving clip edits…':'Clip edits not yet saved'}</span>}
  {(error||conflict||(dirty==='trim'&&!trimmed.valid)||(dirty==='move'&&!moved.valid))&&<div className="clip-save-status" role={error||conflict?'alert':'status'}>{conflict?'Changed elsewhere. Load the latest edit before continuing.':error?`Edits not saved: ${error}`:saving?'Saving…':(dirty==='trim'?!trimmed.valid:!moved.valid)?'Check the timing below.':'Saving shortly…'}
   {error&&!conflict&&dirty&&<button type="button" className="button secondary small" disabled={saving||studio.busy} onClick={()=>void editor.retry()}>Retry save</button>}
   {(dirty||conflict)&&<button type="button" className="button secondary small" disabled={saving||studio.busy} onClick={()=>editor.reset()}>{conflict?'Load latest edit':'Discard changes'}</button>}
  </div>}
 </>;
 const controls=<div className="clip-edit" data-context-id={context.id} data-placement-id={base.placementId??undefined}>{contents}</div>;
 return children?children({placement,actions,controls,actionsDisabled}):<div className="clip-edit" data-context-id={context.id} data-placement-id={base.placementId??undefined}>{placement}{actions}{contents}</div>;
}
