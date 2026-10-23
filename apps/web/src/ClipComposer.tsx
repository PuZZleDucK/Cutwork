import { useEffect, useRef, useState } from 'react';
import type { SongArrangement, StudioSong, VideoAttempt, VideoReservation } from '../../../packages/core/src/contracts/studio.ts';
import { displayTimingDuration, displayTimingValue, resolveTiming, timingFromFrames, type ClipTimingIntent, type TimingUnit, type LinkedTimingDisplay } from '../../../packages/core/src/time/linked-timing.ts';
import { request } from './api.ts';
import { useStudio } from './useStudio.ts';
import { acceptedClipPrompt } from './feedback-state.ts';
import { clipSessionKey, readSession, writeSession, decodeClipTiming, decodeSubmission, clearMatchingSession } from './clip-session.ts';
import { clipSuggestion, submissionIdentity, videoInput } from './video-state.ts';
type Studio=ReturnType<typeof useStudio>;

export function useClipDraft(studio:Studio,song:StudioSong,arrangement:SongArrangement) {
 const timingKey=clipSessionKey(song.projectId,song.id,'timing');
 const [manual,updateManual]=useState<ClipTimingIntent|null>(()=>decodeClipTiming(readSession(timingKey)));
 const setManual=(value:ClipTimingIntent|null)=>{writeSession(timingKey,value?JSON.stringify(value):null);updateManual(value);};
 const [accepted,setAccepted]=useState<VideoReservation[]>([]);
 const [error,setError]=useState<string|null>(null);
 const [target,setTarget]=useState<'start'|'end'>('end');
 const unobserved=accepted.filter(r=>!studio.snapshot!.videoAttempts.some(a=>a.id===r.attemptId));
 const suggestion=clipSuggestion(song,arrangement.placements,[...studio.snapshot!.reservations,...unobserved]);
 const intent=manual??timingFromFrames(suggestion?.startFrame??0,suggestion?.endFrame??24);
 const timing=resolveTiming(song,intent);
 return {intent,timing,suggestion,manual,timingKey,setManual,setAccepted,error,setError,target,setTarget,
  clearAcceptedTiming:(submitted:ClipTimingIntent)=>{clearMatchingSession(timingKey,JSON.stringify(submitted));updateManual(current=>JSON.stringify(current)===JSON.stringify(submitted)?null:current);},
  change:(next:ClipTimingIntent)=>{setManual(next);setError(null);}};
}
export type ClipDraft=ReturnType<typeof useClipDraft>;
export function ClipForm({studio,song,draft}:{studio:Studio;song:StudioSong;draft:ClipDraft}) {
 const key=clipSessionKey(song.projectId,song.id,'prompt');
 const submissionKey=clipSessionKey(song.projectId,song.id,'submission');
 const [prompt,setPrompt]=useState(()=>readSession(key)??'');
 const submission=useRef<{signature:string;key:string}|null>(decodeSubmission(readSession(submissionKey)));
 useEffect(()=>{try{sessionStorage.setItem(key,prompt);}catch{/* Open-page draft remains usable. */}},[key,prompt]);
 const {timing,intent}=draft;
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
  let submitted;try{submitted={...videoInput(song.id,prompt,studio.draft.style,String(timing.startFrame),String(timing.endFrame)),timingIntent:intent};}catch(e){draft.setError((e as Error).message);return;}
  // Freeze exactly what was sent even if acceptance is ambiguous and polling advances the preset.
  draft.setManual(intent);draft.setError(null);
  submission.current=submissionIdentity(submission.current,{projectId:song.projectId,input:submitted});const idempotencyKey=submission.current.key;
  const persistedIdentity=JSON.stringify(submission.current);writeSession(submissionKey,persistedIdentity);
  const ok=await studio.perform(async()=>{
   const result=await request<VideoAttempt>(`/api/projects/${song.projectId}/video`,{idempotencyKey,input:submitted});
   draft.setAccepted(old=>[...old,{attemptId:result.id,songId:result.input.songId,startFrame:result.input.startFrame,endFrame:result.input.endFrame}]);
  },'Clip queued at its captured time. You can describe the next shot.');
  if(ok){submission.current=null;clearMatchingSession(submissionKey,persistedIdentity);clearMatchingSession(key,submitted.clipPrompt);setPrompt(current=>acceptedClipPrompt(current,submitted.clipPrompt,true));draft.clearAcceptedTiming(intent);}
 };
 return <section className="video-compose" aria-label="Clip generation"><div className="section-code">03 / DIRECT</div><div className="video-section-heading"><h2>Give the sound a scene.</h2><span className="micro">H3 / NATIVE 24 FPS</span></div>
  <p className="small-copy muted">Your agent combines the visual direction, this shot and the matching song audio. Each request keeps its own time and seeds.</p>
  <form onSubmit={e=>{e.preventDefault();void generate();}}><fieldset disabled={studio.busy}>
   <label htmlFor="visual-style">Project visual style <span className="optional">VIDEO ONLY · OPTIONAL</span></label><textarea id="visual-style" rows={2} value={studio.draft.style} onChange={e=>studio.edit({...studio.draft,style:e.target.value})} placeholder="Consistent characters, palette, setting and camera language across all your clips…" />
   <label htmlFor="clip-prompt">Clip description</label><textarea id="clip-prompt" rows={4} value={prompt} maxLength={16000} onChange={e=>setPrompt(e.target.value)} placeholder="Describe one shot and what changes during it. The agent translates your idea and beat timing into H3’s native prompt." required />
   <div className="clip-timing-heading"><span className="eyebrow">TIMING / EDIT ANY UNIT</span><button type="button" className="text-button" disabled={!draft.suggestion} onClick={()=>{draft.setManual(null);draft.setError(null);}}>Next free beat window</button></div>
   <div className="linked-timing-grid">{(['start','duration','end'] as const).map(endpoint=>{
    if(endpoint==='duration')return <div className="timing-endpoint timing-duration" key={endpoint} aria-label="Generation duration"><h3>Duration</h3>{(['frames','beats','seconds'] as TimingUnit[]).map(unit=><div className="timing-value-row" key={unit}><span>{unit==='frames'?'Frames':unit==='beats'?'Beats':'Seconds'}</span><output aria-label={`Clip duration ${unit}`} title={unit==='frames'?'Generated frames after outward rounding to the 24 fps grid.':'Exact requested duration; repeating decimals are marked approximately.'}>{duration?.[unit]??'—'}</output></div>)}</div>;
    let display:LinkedTimingDisplay|undefined;try{display=displayTimingValue(song,intent[endpoint]);}catch{/* Keep incomplete typed text without inventing derived values. */}
    const warning=endpoint==='start'?warnings?.startPastSong:warnings?.endPastSong;
    return <div className="timing-endpoint" key={endpoint}><h3>{endpoint==='start'?'Start':'End'} <span className="micro">{endpoint==='end'?'EXCLUSIVE':''}</span> {warning&&<span className="warning" role="img" aria-label={`${endpoint} is beyond the music; conditioning here is silence.`} title="Outside the music. The video can continue with silence afterward.">⚠</span>}</h3>{(['frames','beats','seconds'] as TimingUnit[]).map(unit=>{
     const raw=intent[endpoint];const shown=raw.unit===unit?raw.value:display?.[unit];const approximate=typeof shown==='string'&&shown.startsWith('≈ ');
     return <label key={unit}><span title={unit==='frames'?'One-based containing frame label':undefined}>{unit==='frames'?'Frame':unit==='beats'?'Beat':'Seconds'}{approximate&&<abbr title="Repeating decimal shown approximately. Exact value is retained until you edit this field."> ≈</abbr>}</span><input aria-label={`Clip ${endpoint} ${unit}`} inputMode={unit==='frames'?'numeric':'decimal'} maxLength={1000} value={typeof shown==='string'?shown.replace(/^≈ /,''):''} placeholder={unit==='beats'?'No beat map':'—'} disabled={unit==='beats'&&display?.beats===null} onChange={e=>draft.change({...intent,[endpoint]:{unit,value:e.target.value}})} /></label>;
    })}</div>;
   })}</div>
   <p className="micro timing-convention">Frames are one-based containing labels: frame 1 starts at 0 s; frame 25 at 1 s. An exact end boundary names the first excluded frame. Fractional times are retained, with the generated range rounded outward to the 24 fps grid.</p>
   <div className="timing-readout"><span>Generated boundaries: {timing.valid?`${timing.startFrame} → ${timing.endFrame}`:'— → —'} (zero-based)</span><span>Duration: generated frames / requested beats and seconds.</span></div>
   {!draft.suggestion&&<p className="inline-advisory">Beat suggestions unavailable. Seconds and frame entry remain available.</p>}
   <div className="timing-feedback"><p className="error-copy" role="alert">{draft.error||(!timing.valid?timing.error:'')}</p>{warnings?.longDuration&&<span className="duration-advisory warning" tabIndex={0} role="img" aria-label="Longer than 15 seconds. Consider shorter generations; this is only an advisory." title="Consider several shorter generations; this remains your choice.">⚠ Long generation · over 15 seconds</span>}</div>
  </fieldset><div className="compose-footer"><span className="micro">{draft.suggestion&&!draft.manual?`UP TO ${draft.suggestion.beatCount} BEATS / EARLIEST FREE RANGE`:'CUSTOM RANGE'}</span><button className="button primary" disabled={studio.busy||!ready||!timing.valid||!prompt.trim()||studio.conflict||!!studio.connection}>Generate clip →</button></div>{!ready&&<p className="inline-advisory">Set up and sign in to your agent, ComfyUI and H3 before generating clips.</p>}</form>
 </section>;
}
