import type { StudioSong } from '../contracts/studio.ts';
import { decimal, type Rational } from './decimal.ts';
export interface FrameInterval { startFrame: number; endFrame: number }
/** Exact intent is separate from its outward-rounded playable frame interval. */
export interface ClipPreset extends FrameInterval {
  beatCount: number; startBeat: string; endBeat: string;
  startSeconds: Rational; endSeconds: Rational;
}
type TimedSong = Pick<StudioSong, 'sampleRate' | 'sampleCount' | 'analysis'>;
const abs = (n: bigint) => n < 0n ? -n : n;
function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error('Zero time denominator');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  let a = abs(numerator), b = denominator; while (b) [a,b] = [b,a % b];
  return {numerator:numerator / a, denominator:denominator / a};
}
const add = (a:Rational,b:Rational) => rational(a.numerator*b.denominator+b.numerator*a.denominator,a.denominator*b.denominator);
const sub = (a:Rational,b:Rational) => rational(a.numerator*b.denominator-b.numerator*a.denominator,a.denominator*b.denominator);
const mul = (a:Rational,b:Rational) => rational(a.numerator*b.numerator,a.denominator*b.denominator);
const div = (a:Rational,b:Rational) => rational(a.numerator*b.denominator,a.denominator*b.numerator);
const compare = (a:Rational,b:Rational) => a.numerator*b.denominator-b.numerator*a.denominator;
const floor = (r:Rational) => r.numerator>=0n ? r.numerator/r.denominator : -((-r.numerator+r.denominator-1n)/r.denominator);
const ceil = (r:Rational) => -floor({numerator:-r.numerator,denominator:r.denominator});
function safe(n:bigint): number { if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Time is outside the supported frame range');return Number(n); }
/** Display only: a repeating decimal is visibly approximate; exact values remain rational. */
export function displayTime(r:Rational, places=8): string {
  const sign=r.numerator<0n?'-':'', n=abs(r.numerator), whole=n/r.denominator;
  let rest=n%r.denominator, digits='';
  while(rest&&digits.length<places){rest*=10n;digits+=String(rest/r.denominator);rest%=r.denominator;}
  return `${rest?'≈ ':''}${sign}${whole}${digits?'.'+digits:''}`;
}
function anchors(song:TimedSong): Rational[] {
  if(!Number.isSafeInteger(song.sampleRate)||song.sampleRate<=0 || !song.analysis.estimatedBpm || !Number.isFinite(song.analysis.estimatedBpm) || song.analysis.estimatedBpm<=0 || !['available','partial'].includes(song.analysis.state)) throw new Error('Beat analysis is unavailable');
  if(song.analysis.sampleIndices.length<2) throw new Error('At least two detected beats are required');
  const samples=song.analysis.sampleIndices.map(v=>{if(!/^\d+$/.test(v)) throw new Error('Invalid beat sample');return BigInt(v);});
  if(samples.some((n,i)=>i>0&&n<=samples[i-1]!))throw new Error('Beat anchors must increase');
  return samples.map(n=>rational(n,BigInt(song.sampleRate)));
}
function beatFor(t:Rational, points:Rational[]):Rational {
  let index=0;while(index<points.length-2&&compare(t,points[index+1]!)>=0n) index++;
  return add(rational(BigInt(index+1)),div(sub(t,points[index]!),sub(points[index+1]!,points[index]!)));
}
function timeFor(beat:Rational,points:Rational[]):Rational {
  const index=Number(floor(beat)<1n?0n:floor(beat)>BigInt(points.length-1)?BigInt(points.length-2):floor(beat)-1n);
  return add(points[index]!,mul(sub(beat,rational(BigInt(index+1))),sub(points[index+1]!,points[index]!)));
}
export function beatAtTime(song:TimedSong,time:Rational):Rational {return beatFor(time,anchors(song));}
export function timeAtBeat(song:TimedSong,beat:Rational):Rational {return timeFor(beat,anchors(song));}
export function unionIntervals(spans:FrameInterval[]):FrameInterval[] {
  const merged:FrameInterval[]=[];
  for(const span of spans){if(!Number.isSafeInteger(span.startFrame)||!Number.isSafeInteger(span.endFrame)||span.startFrame<0||span.endFrame<=span.startFrame)throw new Error('Invalid frame interval');}
  for(const span of [...spans].sort((a,b)=>a.startFrame-b.startFrame)){
    const last=merged.at(-1);if(last&&span.startFrame<=last.endFrame)last.endFrame=Math.max(last.endFrame,span.endFrame);else merged.push({...span});
  }
  return merged;
}
/** Both ordinary free-gap and explicit continuation presets use this same map. */
function adaptiveDuration(song:TimedSong,startFrame:number,points:Rational[]) {
  const start=rational(BigInt(startFrame),24n),startBeat=beatFor(start,points);
  let count=song.analysis.estimatedBpm!>=50?8:4;
  let end=timeFor(add(startBeat,rational(BigInt(count))),points);
  while(count>1&&compare(sub(end,start),rational(15n))>0n){count/=2;end=timeFor(add(startBeat,rational(BigInt(count))),points);}
  return {start,end,startBeat,count};
}
/** Start immediately at the supplied saved-context end. No occupancy search,
 * beat snapping, song-end cap, source-frame selection or generation side effect. */
export function continuationPreset(song:TimedSong,startFrame:number):ClipPreset|null {
  if(!Number.isSafeInteger(startFrame)||startFrame<0)throw new Error('Continuation start must be a nonnegative safe frame boundary');
  // Both exact boundary instants need representable one-based containing labels.
  safe(BigInt(startFrame)+1n);
  let points:Rational[];try{points=anchors(song);}catch{return null;}
  const {start,end,startBeat,count}=adaptiveDuration(song,startFrame,points);
  const endFrame=safe(ceil(mul(end,rational(24n))));safe(BigInt(endFrame)+1n);
  if(endFrame<=startFrame)throw new Error('Continuation has no available frame');
  return {startFrame,endFrame,beatCount:count,startBeat:displayTime(startBeat),endBeat:displayTime(beatFor(end,points)),startSeconds:start,endSeconds:end};
}
/** Includes caller-supplied pending reservations; callers must exclude them from coverage. */
export function nextClipPreset(song:TimedSong,occupied:FrameInterval[]):(FrameInterval&{beatCount:number;startBeat:string;endBeat:string})|null {
  const spans=unionIntervals(occupied);let points:Rational[];try{points=anchors(song);}catch{return null;}
  let startFrame=0,next=Number.MAX_SAFE_INTEGER;
  for(const span of spans){if(span.startFrame>startFrame){next=span.startFrame;break;}startFrame=Math.max(startFrame,span.endFrame);}
  const {end,startBeat,count}=adaptiveDuration(song,startFrame,points);
  const endFrame=Math.min(next,safe(ceil(mul(end,rational(24n)))));
  if(endFrame<=startFrame)throw new Error('Preset has no available frame');
  const actualEnd=endFrame===next?rational(BigInt(endFrame),24n):end;
  return {startFrame,endFrame,beatCount:count,startBeat:displayTime(startBeat),endBeat:displayTime(beatFor(actualEnd,points))};
}
function songDuration(song:TimedSong):Rational {
  if(!/^\d+$/.test(song.sampleCount)||BigInt(song.sampleCount)<=0n||!Number.isSafeInteger(song.sampleRate)||song.sampleRate<=0)throw new Error('A known positive song duration is required');
  return rational(BigInt(song.sampleCount),BigInt(song.sampleRate));
}
export function songCoverage(song:TimedSong,placements:FrameInterval[]):{percent:number;coveredFrames:number;gaps:FrameInterval[]} {
  const duration=songDuration(song),frames=safe(ceil(mul(duration,rational(24n))));
  const spans=unionIntervals(placements).filter(p=>p.startFrame<frames).map(p=>({startFrame:p.startFrame,endFrame:Math.min(frames,p.endFrame)}));
  let covered=rational(0n),cursor=0,coveredFrames=0;const gaps:FrameInterval[]=[];
  for(const p of spans){if(p.startFrame>cursor)gaps.push({startFrame:cursor,endFrame:p.startFrame});cursor=p.endFrame;coveredFrames+=p.endFrame-p.startFrame;
    const start=rational(BigInt(p.startFrame),24n),end=rational(BigInt(p.endFrame),24n);
    covered=add(covered,sub(compare(end,duration)>0n?duration:end,start));
  }
  if(cursor<frames)gaps.push({startFrame:cursor,endFrame:frames});
  const ratio=mul(div(covered,duration),rational(100n));
  return {percent:Number(ratio.numerator*1_000_000n/ratio.denominator)/1_000_000,coveredFrames,gaps};
}
export function videoWarnings(song:TimedSong,startFrame:number,endFrame:number,requestedIntervalSeconds?:{start:string;end:string}):{startPastSong:boolean;endPastSong:boolean;longDuration:boolean} {
  const duration=songDuration(song),s=requestedIntervalSeconds?decimal(requestedIntervalSeconds.start):rational(BigInt(startFrame),24n),e=requestedIntervalSeconds?decimal(requestedIntervalSeconds.end):rational(BigInt(endFrame),24n);
  return {startPastSong:compare(s,duration)>=0n,endPastSong:compare(e,duration)>0n,longDuration:compare(sub(e,s),rational(15n))>0n};
}
