import { useRef, useState } from 'react';
import type { SongArrangement, StudioSong, VideoAttempt, VideoReservation, ContinuationCapture } from '../../../packages/core/src/contracts/studio.ts';
import { displayTimingDuration, displayTimingValue, resolveTiming, timingFromFrames, type ClipTimingIntent, type TimingUnit, type LinkedTimingDisplay } from '../../../packages/core/src/time/linked-timing.ts';
import { request } from './api.ts';
import { useStudio } from './useStudio.ts';
import { acceptedClipDraft } from './clip-draft-state.ts';
import { continuationRef } from './continuation-state.ts';
import { useSavedClipDraft } from './useSavedClipDraft.ts';
import { clipSessionKey, readSession, writeSession, decodeSubmission, clearMatchingSession } from './clip-session.ts';
import { clipSuggestion, submissionIdentity, videoInput } from './video-state.ts';
type Studio=ReturnType<typeof useStudio>;

export function useClipDraft(studio:Studio,song:StudioSong,arrangement:SongArrangement) {
 const saved=studio.snapshot!.clipDrafts.find(d=>d.songId===song.id)??{projectId:song.projectId,songId:song.id,revision:0,clipPrompt:'',timingIntent:null};
 const persistence=useSavedClipDraft(saved);
 const manual=persistence.value.timingIntent;
 const setManual=(value:ClipTimingIntent|null)=>persistence.edit(current=>({...current,timingIntent:value}));
 const [accepted,setAccepted]=useState<VideoReservation[]>([]);
 const [error,setError]=useState<string|null>(null);
 const [target,setTarget]=useState<'start'|'end'>('end');
 const unobserved=accepted.filter(r=>!studio.snapshot!.videoAttempts.some(a=>a.id===r.attemptId));
 const suggestion=clipSuggestion(song,arrangement.placements,[...studio.snapshot!.reservations,...unobserved]);
 const intent=manual??timingFromFrames(suggestion?.startFrame??0,suggestion?.endFrame??24);
 const timing=resolveTiming(song,intent);
 return {intent,timing,suggestion,manual,persistence,setManual,setAccepted,error,setError,target,setTarget,
  clearAccepted:(prompt:string,submitted:ClipTimingIntent,continuation:ContinuationCapture|null|undefined)=>{persistence.edit(current=>acceptedClipDraft(current,{clipPrompt:prompt,timingIntent:submitted,...(continuation!==undefined?{continuation}:{})}));void persistence.save().catch(()=>{});},
  change:(next:ClipTimingIntent)=>{setManual(next);setError(null);}};
}
export type ClipDraft=ReturnType<typeof useClipDraft>;
export function ClipForm({studio,song,draft}:{studio:Studio;song:StudioSong;draft:ClipDraft}) {
 const submissionKey=clipSessionKey(song.projectId,song.id,'submission');
 const prompt=draft.persistence.value.clipPrompt;
 const setPrompt=(value:string)=>draft.persistence.edit(current=>({...current,clipPrompt:value}));
 const submission=useRef<{signature:string;key:string}|null>(decodeSubmission(readSession(submissionKey)));
 const {timing,intent}=draft;
 const continuation=draft.persistence.value.continuation;
 const context=continuation?studio.snapshot!.editContexts.find(c=>c.id===continuation.contextId):undefined;
 const continuationStale=!!continuation&&(!context||context.revision!==continuation.contextRevision);
 const sourceClip=continuation?studio.snapshot!.clips.find(c=>c.id===continuation.clipId):undefined;
 const duration=displayTimingDuration(song,timing);
 const songEnd={numerator:BigInt(song.sampleCount),denominator:BigInt(song.sampleRate)};
 const pastEnd=(n:bigint,d:bigint)=>n*songEnd.denominator-songEnd.numerator*d;
 const warnings=timing.valid?{
  startPastSong:pastEnd(timing.startSeconds.numerator,timing.startSeconds.denominator)>=0n,
  endPastSong:pastEnd(timing.endSeconds.numerator,timing.endSeconds.denominator)>0n,
  longDuration:timing.durationSeconds.numerator>15n*timing.durationSeconds.denominator}:null;
 const ready=studio.overview!.provider.auth==='signed-in'&&['agent','comfyui','h3'].every(id=>studio.overview!.tools.some(t=>t.id===id&&t.installed&&t.state==='ready'));
 const generate=async()=>{
  if(!timing.valid){draft.setError(timing.error);return;}
  let submitted;try{submitted={...videoInput(song.id,prompt,studio.draft.style,String(timing.startFrame),String(timing.endFrame)),timingIntent:intent,...(continuation?{continuation:continuationRef(continuation)!}:{})};}catch(e){draft.setError((e as Error).message);return;}
  // Freeze exactly what was sent even if acceptance is ambiguous and polling advances the preset.
  draft.setManual(intent);draft.setError(null);
  submission.current=submissionIdentity(submission.current,{projectId:song.projectId,input:submitted});const idempotencyKey=submission.current.key;
  const persistedIdentity=JSON.stringify(submission.current);writeSession(submissionKey,persistedIdentity);
  const ok=await studio.perform(async()=>{
   await draft.persistence.save();
   const result=await request<VideoAttempt>(`/api/projects/${song.projectId}/video`,{idempotencyKey,input:submitted});
   draft.setAccepted(old=>[...old,{attemptId:result.id,songId:result.input.songId,startFrame:result.input.startFrame,endFrame:result.input.endFrame}]);
  },'Clip queued at its captured time. You can describe the next shot.');
  if(ok){submission.current=null;clearMatchingSession(submissionKey,persistedIdentity);draft.clearAccepted(submitted.clipPrompt,intent,continuation);}
 };
 return <section className="video-compose" aria-label="Clip generation"><div className="section-code">03 / DIRECT</div><div className="video-section-heading"><h2>Generate clip</h2><span className="micro">H3 / NATIVE 24 FPS</span></div>

  <form onSubmit={e=>{e.preventDefault();void generate();}}><fieldset disabled={studio.busy||draft.persistence.resolving}>
   <label htmlFor="visual-style">Project visual style <span className="optional">VIDEO ONLY · OPTIONAL</span></label><textarea id="visual-style" rows={2} value={studio.draft.style} onChange={e=>studio.edit({...studio.draft,style:e.target.value})} placeholder="Consistent characters, palette, setting and camera language across all your clips…" />
   <label htmlFor="clip-prompt">Clip description</label><textarea id="clip-prompt" rows={4} value={prompt} maxLength={16000} onChange={e=>setPrompt(e.target.value)} placeholder="Describe one shot and what changes during it. The agent translates your idea and beat timing into H3’s native prompt." required />
   {continuation&&<div className="continuation-input"><img src={`/api/assets/${encodeURIComponent(continuation.frame.assetId)}`} alt={`Starting image: source frame ${continuation.frame.index+1} from ${sourceClip?.title??'saved clip'}`} /><div><span className="eyebrow">STARTING IMAGE</span><strong>{sourceClip?.title??'Saved clip'}</strong>{!draft.suggestion&&<p className="warning">Beat analysis is unavailable. The starting image and exact start are prepared; enter the end time manually.</p>}{continuationStale&&<p className="warning" role="status">The predecessor changed since preparation. A new generation requires Continue From End again, or remove this starting image. Retrying an already accepted request still recovers that original request.</p>}<button type="button" className="button secondary small" onClick={()=>draft.persistence.edit(current=>({...current,continuation:null}))}>Remove starting image</button></div></div>}
   <div className="clip-draft-status" role="status">{draft.persistence.saving?'Saving clip draft…':draft.persistence.conflict?'Clip draft conflict':draft.persistence.error?'Clip draft not saved':draft.persistence.dirty?'Clip draft unsaved':'Clip draft saved'}</div>
   {(draft.persistence.conflict||draft.persistence.error)&&<div className="clip-draft-recovery"><p>{draft.persistence.conflict?'This song’s clip draft changed elsewhere. Your edits are retained; choose which draft to keep.':draft.persistence.error}</p>{draft.persistence.conflict?<><button type="button" className="button secondary small" onClick={()=>void draft.persistence.resolve(false)}>Load saved clip draft</button><button type="button" className="button secondary small" onClick={()=>void draft.persistence.resolve(true)}>Keep my clip draft</button></>:<button type="button" className="button secondary small" onClick={()=>void draft.persistence.save().catch(()=>{})}>Retry saving clip draft</button>}</div>}
   <div className="clip-timing-heading"><span className="eyebrow">TIMING / EDIT ANY UNIT</span><button type="button" className="button secondary small" disabled={!draft.suggestion} onClick={()=>{draft.setManual(null);draft.setError(null);}}>Next free beat window</button></div>
   <div className="linked-timing-grid">{(['start','duration','end'] as const).map(endpoint=>{
    if(endpoint==='duration')return <div className="timing-endpoint timing-duration" key={endpoint} aria-label="Generation duration"><h3>Duration</h3>{(['frames','beats','seconds'] as TimingUnit[]).map(unit=><div className="timing-value-row" key={unit}><span>{unit==='frames'?'Frames':unit==='beats'?'Beats':'Seconds'}</span><output aria-label={`Clip duration ${unit}`} title={unit==='frames'?'Generated frames after outward rounding to the 24 fps grid.':'Exact requested duration; repeating decimals are marked approximately.'}>{duration?.[unit]??'—'}</output></div>)}</div>;
    let display:LinkedTimingDisplay|undefined;try{display=displayTimingValue(song,intent[endpoint]);}catch{/* Keep incomplete typed text without inventing derived values. */}
    const warning=endpoint==='start'?warnings?.startPastSong:warnings?.endPastSong;
    return <div className="timing-endpoint" key={endpoint}><h3>{endpoint==='start'?'Start':'End'} <span className="micro">{endpoint==='end'?'EXCLUSIVE':''}</span> {warning&&<span className="warning" role="img" aria-label={`${endpoint} is beyond the music; conditioning here is silence.`} title="Outside the music. The video can continue with silence afterward.">⚠</span>}</h3>{(['frames','beats','seconds'] as TimingUnit[]).map(unit=>{
     const raw=intent[endpoint];const shown=raw.unit===unit?raw.value:display?.[unit];const approximate=typeof shown==='string'&&shown.startsWith('≈ ');
     return <label key={unit}><span title={unit==='frames'?'Frames start at 1 (frame 1 = 0 seconds). End is exclusive. Fractional times round outward to the 24 fps grid.':undefined}>{unit==='frames'?'Frame':unit==='beats'?'Beat':'Seconds'}{approximate&&<abbr title="Repeating decimal shown approximately. Exact value is retained until you edit this field."> ≈</abbr>}</span><input aria-label={`Clip ${endpoint} ${unit}`} inputMode={unit==='frames'?'numeric':'decimal'} maxLength={1000} value={typeof shown==='string'?shown.replace(/^≈ /,''):''} placeholder={unit==='beats'?'No beat map':'—'} disabled={unit==='beats'&&display?.beats===null} onChange={e=>draft.change({...intent,[endpoint]:{unit,value:e.target.value}})} /></label>;
    })}</div>;
   })}</div>

   {!draft.suggestion&&<p className="inline-advisory">Beat suggestions unavailable. Seconds and frame entry remain available.</p>}
   <div className="timing-feedback"><p className="error-copy" role="alert">{draft.error||(!timing.valid?timing.error:'')}</p>{warnings?.longDuration&&<span className="duration-advisory warning" tabIndex={0} role="img" aria-label="Longer than 15 seconds. Consider shorter generations; this is only an advisory." title="Consider several shorter generations; this remains your choice.">⚠ Long generation · over 15 seconds</span>}</div>
  </fieldset><div className="compose-footer"><button className="button primary" disabled={studio.busy||!ready||!timing.valid||!prompt.trim()||studio.conflict||draft.persistence.conflict||draft.persistence.resolving||!!studio.connection}>Generate clip →</button></div>{!ready&&<p className="inline-advisory">Set up and sign in to your agent, ComfyUI and H3 before generating clips.</p>}</form>
 </section>;
}
