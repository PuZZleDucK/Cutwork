import { describe, expect, it } from 'vitest';
import type { StudioSong } from '../../packages/core/src/contracts/studio.ts';
import { beatAtTime, nextClipPreset, songCoverage, timeAtBeat, unionIntervals, videoWarnings } from '../../packages/core/src/time/studio-timing.ts';
import { displayTimingValue, resolveTiming } from '../../packages/core/src/time/linked-timing.ts';

type Song=Pick<StudioSong,'analysis'|'sampleRate'|'sampleCount'>;
const song=(bpm:number,anchors:string[],count='4800000'):Song=>({sampleRate:48000,sampleCount:count,analysis:{state:'available',estimatedBpm:bpm,sampleIndices:anchors,waveformBucketSamples:0,peaks:[],error:null,version:'slice5-synthetic-review'}});
const constant=(samplesPerBeat:number)=>song(2880000/samplesPerBeat,['0',String(samplesPerBeat),String(samplesPerBeat*2)]);
const rational=(numerator:bigint,denominator=1n)=>({numerator,denominator});

// These are pure synthetic song maps, not new beat-detector or native-media evidence.
describe('slice5 shared adaptive preset threshold regression boundaries',()=>{
 it.each([
  [57599,8,231],[57600,8,231],[57601,4,116],
  [179999,4,360],[180000,4,360],[180001,2,181],
  [359999,2,360],[360000,2,360],[360001,1,181],
  [719999,1,360],[720000,1,360],[720001,1,361],
 ])('uses the exact mapped duration at %s samples per beat', (samples,beats,endFrame)=>{
  expect(nextClipPreset(constant(samples),[])).toMatchObject({startFrame:0,endFrame,beatCount:beats});
 });
 it('four BPM is exactly fifteen seconds; only the slower one-beat request warns',()=>{
  expect(videoWarnings(constant(720000),0,360).longDuration).toBe(false);
  expect(videoWarnings(constant(720001),0,361).longDuration).toBe(true);
 });
 it('an over-fifteen-second realised envelope does not invent an overlong requested interval',()=>{
  expect(videoWarnings(constant(720000),0,361,{start:'0.0000001',end:'15.0000001'}).longDuration).toBe(false);
 });
 it('uses genuinely irregular anchors and the precise current offset when reducing beat count',()=>{
  const irregular=song(120,['0','48000','96000','240000','432000','624000']);
  expect(nextClipPreset(irregular,[])).toMatchObject({startFrame:0,endFrame:216,beatCount:4});
  expect(nextClipPreset(irregular,[{startFrame:0,endFrame:72}])).toMatchObject({startFrame:72,endFrame:248,beatCount:2});
  expect(beatAtTime(irregular,rational(3n))).toEqual(rational(10n,3n));
  expect(timeAtBeat(irregular,rational(16n,3n))).toEqual(rational(31n,3n));
 });
 it('a fifteen-second mapped preset is not halved solely because its estimated tempo disagrees',()=>{
  const mapped=song(50,['0','90000','180000']);
  expect(nextClipPreset(mapped,[])).toMatchObject({beatCount:8,startFrame:0,endFrame:360});
 });
 it('fills a one-frame off-beat residual gap without jumping to the next beat',()=>{
  expect(nextClipPreset(constant(57600),[{startFrame:0,endFrame:1},{startFrame:2,endFrame:100}])).toMatchObject({startFrame:1,endFrame:2});
 });
 it('slow-tempo gap filling applies the shared duration limit instead of filling all sixteen seconds',()=>{
  expect(nextClipPreset(constant(96000),[{startFrame:384,endFrame:500}])).toMatchObject({startFrame:0,endFrame:192,beatCount:4});
 });
 it('extends beyond the song using the last irregular beat interval, not the estimated BPM',()=>{
  const short=song(120,['0','48000','192000'],'200000');
  expect(nextClipPreset(short,[{startFrame:0,endFrame:120}])).toMatchObject({startFrame:120,endFrame:408,beatCount:4});
 });
});

describe('slice5 coverage and linked context regression boundaries',()=>{
 it('clips coverage to the exact partial final frame and ignores wholly post-song placements',()=>{
  const short=song(120,['0','1000'],'2500');
  expect(songCoverage(short,[{startFrame:1,endFrame:2}])).toEqual({percent:20,coveredFrames:1,gaps:[{startFrame:0,endFrame:1}]});
  expect(songCoverage(short,[{startFrame:2,endFrame:90}])).toEqual({percent:0,coveredFrames:0,gaps:[{startFrame:0,endFrame:2}]});
  expect(songCoverage(short,[{startFrame:0,endFrame:1},{startFrame:1,endFrame:90}]).percent).toBe(100);
 });
 it('queued reservations occupy suggestions but do not enter placement-only coverage',()=>{
  const s=constant(24000),placements=[{startFrame:12,endFrame:24}],reservations=[{startFrame:0,endFrame:12}];
  expect(nextClipPreset(s,[...placements,...reservations])).toMatchObject({startFrame:24,endFrame:120});
  expect(songCoverage(s,placements)).toEqual({percent:0.5,coveredFrames:12,gaps:[{startFrame:0,endFrame:12},{startFrame:24,endFrame:2400}]});
 });
 it('union and coverage leave the caller intervals immutable even with overlap and touching spans',()=>{
  const spans=Object.freeze([Object.freeze({startFrame:20,endFrame:30}),Object.freeze({startFrame:0,endFrame:10}),Object.freeze({startFrame:10,endFrame:25})]);
  const before=JSON.stringify(spans);
  expect(unionIntervals(spans as unknown as {startFrame:number;endFrame:number}[])).toEqual([{startFrame:0,endFrame:30}]);
  expect(songCoverage(constant(24000),spans as unknown as {startFrame:number;endFrame:number}[]).coveredFrames).toBe(30);
  expect(JSON.stringify(spans)).toBe(before);
 });
 it('frame and seconds editing remains exact while failed analysis disables only beats',()=>{
  const s=constant(24000);s.analysis={...s.analysis,state:'failed',estimatedBpm:null,sampleIndices:[]};
  expect(nextClipPreset(s,[])).toBeNull();
  expect(displayTimingValue(s,{unit:'seconds',value:'12.3456789'})).toEqual({seconds:'12.3456789',frames:'297',beats:null});
  expect(resolveTiming(s,{start:{unit:'frames',value:'297'},end:{unit:'frames',value:'298'}})).toMatchObject({valid:true,startFrame:296,endFrame:297});
  expect(songCoverage(s,[]).percent).toBe(0);
 });
 it('leading-offset negative beats and irregular-map inverse conversions do not drift',()=>{
  const s=song(120,['96000','120000','216000']);
  expect(displayTimingValue(s,{unit:'seconds',value:'0'}).beats).toBe('-3');
  for(const value of [rational(0n),rational(1n,3n),rational(2n),rational(7n,2n),rational(20n)]){
   let time=value;for(let i=0;i<50;i++)time=timeAtBeat(s,beatAtTime(s,time));
   expect(time).toEqual(value);
  }
 });
});
