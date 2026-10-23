import { useMemo, type MouseEvent } from 'react';
import type { SongArrangement, StudioSong } from '../../../packages/core/src/contracts/studio.ts';
import { beatAtTime, displayTime, songCoverage, timeAtBeat } from '../../../packages/core/src/time/studio-timing.ts';
import { layoutIntervalLanes, selectBeatBoundary, timingValueFromSeconds } from '../../../packages/core/src/time/linked-timing.ts';
import type { Rational } from '../../../packages/core/src/time/decimal.ts';
import { waveformEnvelope } from './studio-state.ts';
import { useStudio } from './useStudio.ts';
import type { ClipDraft } from './ClipComposer.tsx';
import { timelinePercent } from './feedback-state.ts';
type Studio=ReturnType<typeof useStudio>;
const seconds=(frame:number)=>displayTime({numerator:BigInt(frame),denominator:24n});
export function VideoTimeline({studio,song,arrangement,draft}:{studio:Studio;song:StudioSong;arrangement:SongArrangement;draft:ClipDraft}) {
 const coverage=songCoverage(song,arrangement.placements),pending=studio.snapshot!.reservations.filter(r=>r.songId===song.id);
 const timing=draft.timing;
 const total=Math.max(1,Math.ceil(song.durationSeconds*24),...arrangement.placements.map(p=>p.endFrame),...pending.map(p=>p.endFrame),timing.valid?timing.endFrame:0);
 const peaks=useMemo(()=>waveformEnvelope(song.analysis.peaks,320),[song.analysis.peaks]);
 const lanes=layoutIntervalLanes([
  ...arrangement.placements.map((p,i)=>({...p,label:`${String(i+1).padStart(2,'0')} / ${studio.snapshot!.clips.find(c=>c.id===p.clipId)?.title??'Clip'}`,reserved:false})),
  ...pending.map(p=>({...p,id:`reservation:${p.attemptId}`,label:'Generating',reserved:true}))]);
 const markers=useMemo(()=>{
  const result:{id:string;label:string;time:Rational}[]=[{id:'zero',label:'Start · 0 seconds',time:{numerator:0n,denominator:1n}}];
  try{
   beatAtTime(song,{numerator:0n,denominator:1n});
   for(const [i,sample] of song.analysis.sampleIndices.slice(0,2000).entries()){
    if(BigInt(sample)<=BigInt(song.sampleCount))result.push({id:`beat:${i}`,label:`Beat ${i+1}`,time:{numerator:BigInt(sample),denominator:BigInt(song.sampleRate)}});
   }
   const endBeat=beatAtTime(song,{numerator:BigInt(song.sampleCount),denominator:BigInt(song.sampleRate)});
   let next=endBeat.numerator/endBeat.denominator+1n;
   while(result.length<2001){const time=timeAtBeat(song,{numerator:next,denominator:1n});if(time.numerator*24n>BigInt(total)*time.denominator)break;result.push({id:`extra:${next}`,label:`Beat ${next} · after music`,time});next++;}
  }catch{/* Only exact song boundaries remain selectable without a beat map. */}
  result.push({id:'song-end',label:'Song end',time:{numerator:BigInt(song.sampleCount),denominator:BigInt(song.sampleRate)}});
  return result;
 },[song.analysis,song.sampleCount,song.sampleRate,total]);
 const choose=(time:Rational)=>{
  const result=selectBeatBoundary(song,draft.intent,time,draft.target);
  if(!result.valid){draft.setError(result.error);return;}
  draft.change({...draft.intent,[draft.target]:timingValueFromSeconds(result.boundarySeconds)});
 };
 const choosePointer=(e:MouseEvent<HTMLDivElement>)=>{
  if(studio.busy)return;
  const rect=e.currentTarget.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  choose({numerator:BigInt(Math.round(ratio*1_000_000))*BigInt(total),denominator:24_000_000n});
 };
 const left=(time:Rational)=>timelinePercent(time,total);
 return <section className="video-timeline" aria-label="Video timeline"><div className="video-section-heading"><div><span className="section-code">04 / ASSEMBLE</span><h2>The sequence.</h2></div><div className="coverage-readout"><strong>{coverage.percent.toFixed(1)}<small>%</small></strong><span>MUSIC COVERED</span></div></div>
  <div className="sequence-tools"><fieldset disabled={studio.busy}><legend>Click beats to set</legend>{(['end','start'] as const).map(target=><label key={target}><input type="radio" name={`beat-target-${song.id}`} value={target} checked={draft.target===target} onChange={()=>draft.setTarget(target)} />{target==='end'?'End time':'Start time'}</label>)}</fieldset><span className="micro">SELECT A BEAT OR CLICK THE WAVEFORM · {lanes.laneCount} {lanes.laneCount===1?'LANE':'LANES'}</span></div>
  {draft.error&&<p role="alert" className="error-copy">{draft.error}</p>}
  <div className="sequence-scroll" tabIndex={0} aria-label="Scrollable sequence"><div className="sequence-canvas" style={{minWidth:`${Math.min(12000,Math.max(720,markers.length*17))}px`}}>
   <div className="timeline-ruler"><span>0 s</span><span>{seconds(total)} s · {total} frames</span></div>
   <div className="timeline-audio interactive-waveform" onClick={choosePointer} title={`Click to set ${draft.target} to the nearest beat; use the beat buttons for keyboard selection.`}>
    <svg viewBox="0 0 960 60" preserveAspectRatio="none" role="img" aria-label="Song waveform and estimated beat positions">{song.analysis.sampleIndices.slice(0,2000).map((sample,i)=><line key={i} x1={Number(sample)/song.sampleRate*24/total*960} x2={Number(sample)/song.sampleRate*24/total*960} y1="0" y2="60" className="beat-line" />)}{peaks.map((p,i)=><rect key={i} x={i/peaks.length*song.durationSeconds*24/total*960} y={30-Math.max(1,p*25)} width={Math.max(.5,960/peaks.length*song.durationSeconds*24/total-1)} height={Math.max(2,p*50)} className="wave-bar" />)}</svg>
    {timing.valid&&<div className="draft-wave-highlight" style={{left:`${left(timing.startSeconds)}%`,width:`${left(timing.endSeconds)-left(timing.startSeconds)}%`}} />}
   </div>
   <div className="beat-pickers" aria-label="Selectable beat markers">{markers.map((m,i)=><button key={m.id} type="button" disabled={studio.busy} className={`beat-picker ${m.id==='zero'||m.id==='song-end'?'boundary-picker':''}`} style={{left:`${left(m.time)}%`}} aria-label={`Set ${draft.target} to ${m.label}`} title={`${m.label} · ${displayTime(m.time)} s`} onClick={()=>choose(m.time)}><i />{m.id==='zero'?'0':m.id==='song-end'?'END':i%4===1?m.label.replace('Beat ','').replace(' · after music','+'):''}</button>)}</div>
   <div className="draft-range-track" aria-label="Proposed generation range">{timing.valid?<div className="timeline-draft" data-start-frame={timing.startFrame} data-end-frame={timing.endFrame} style={{left:`${timing.startFrame/total*100}%`,width:`${(timing.endFrame-timing.startFrame)/total*100}%`}} title={`Next generation: ${timing.display.start.seconds}–${timing.display.end.seconds} seconds; not included until generated`}><span>NEXT SHOT · {timing.endFrame-timing.startFrame}f</span></div>:<span className="micro warning">Fix timing to see the proposed shot</span>}</div>
   <div className="coverage-track" aria-label="Uncovered music regions">{coverage.gaps.map(g=><span key={g.startFrame} className="uncovered-span" style={{left:`${g.startFrame/total*100}%`,width:`${(g.endFrame-g.startFrame)/total*100}%`}} title={`Black frames: ${g.startFrame}–${g.endFrame}`} />)}</div>
   <div className="timeline-tracks" data-lane-count={lanes.laneCount}>{Array.from({length:lanes.laneCount},(_,lane)=><div className="timeline-lane" key={lane} aria-label={`Sequence lane ${lane+1}`}>{lanes.items.filter(p=>p.lane===lane).map(p=><div key={p.id} className={`timeline-span ${p.reserved?'reserved':''}`} data-interval-id={p.id} style={{left:`${p.startFrame/total*100}%`,width:`${(p.endFrame-p.startFrame)/total*100}%`}} title={`${p.label}: ${p.startFrame}–${p.endFrame}; ${p.reserved?'reserved, not coverage':'newest overlapping placement is visible'}`}><span>{p.label}</span></div>)}</div>)}</div>
  </div></div>
  <div className="timeline-legend"><span><i className="legend-draft" /> Next generation (not yet submitted)</span><span><i className="legend-solid" /> Included clip</span><span><i className="legend-hazard" /> Uncovered / black frames</span><span>Pending work reserves time, not coverage. Later placements win overlaps.</span></div>
 </section>;
}
