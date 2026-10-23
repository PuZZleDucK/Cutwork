import { describe, expect, it } from 'vitest';
import type { StudioSong } from '../../packages/core/src/contracts/studio.ts';
import { continuationPreset, nextClipPreset, videoWarnings } from '../../packages/core/src/time/studio-timing.ts';
import { resolveTiming, timingValueFromSeconds } from '../../packages/core/src/time/linked-timing.ts';

type Song=Pick<StudioSong,'analysis'|'sampleRate'|'sampleCount'>;
const r=(numerator:bigint,denominator=1n)=>({numerator,denominator});
const song=(bpm=120,anchors=['0','24000','48000'],sampleCount='4800000'):Song=>({sampleRate:48000,sampleCount,analysis:{state:'available',estimatedBpm:bpm,sampleIndices:anchors,waveformBucketSamples:0,peaks:[],error:null,version:'synthetic-continuation-contract'}});
const constant=(interval:number)=>song(2880000/interval,['0',String(interval),String(interval*2)]);

describe('explicit adjacent-frame continuation presets',()=>{
 it('starts at frame99 without beat snapping or an added blank frame',()=>{
  expect(continuationPreset(song(),99)).toEqual({startFrame:99,endFrame:195,beatCount:8,startBeat:'9.25',endBeat:'17.25',startSeconds:r(33n,8n),endSeconds:r(65n,8n)});
 });
 it.each([[168,5,75,243,339],[-5,5,75,70,166]])('uses the caller-derived saved trim end at origin%s', (origin,first,end,startFrame,endFrame)=>{
  // Geometry/frame-asset validation belongs to the context store, not this duration helper.
  const context={sourceOriginFrame:origin,sourceStartFrame:first,sourceEndFrame:end};
  expect(continuationPreset(song(),context.sourceOriginFrame+context.sourceEndFrame)).toMatchObject({startFrame,endFrame});
 });
 it('does not add native-surplus frames to the explicit retained-window start',()=>{
  // Requested48/native56: the saved context retains48. The helper receives only its end.
  const savedEnd=48;
  expect(continuationPreset(song(),savedEnd)).toMatchObject({startFrame:48,endFrame:144});
 });
 it('is independent of ordinary free-gap searching and occupancy clipping',()=>{
  expect(nextClipPreset(song(),[{startFrame:0,endFrame:99},{startFrame:100,endFrame:200}])).toMatchObject({startFrame:99,endFrame:100});
  expect(continuationPreset(song(),99)).toMatchObject({startFrame:99,endFrame:195});
  expect(nextClipPreset(song(),[])).toMatchObject({startFrame:0});
 });
 it('retains exact requested50BPM end rather than replacing it with the rounded frame boundary',()=>{
  const preset=continuationPreset(constant(57600),99)!;
  expect(preset).toMatchObject({startFrame:99,endFrame:330,beatCount:8,startSeconds:r(33n,8n),endSeconds:r(549n,40n)});
  const intent=JSON.parse(JSON.stringify({start:timingValueFromSeconds(preset.startSeconds),end:timingValueFromSeconds(preset.endSeconds)}));
  expect(resolveTiming(constant(57600),intent)).toMatchObject({valid:true,startFrame:99,endFrame:330,endSeconds:r(549n,40n),realisedEndSeconds:r(55n,4n)});
 });
 it('preserves a repeating exact end through JSON-safe draft serialization',()=>{
  const s=song(120,['0','48000','144000']);
  const preset=continuationPreset(s,1)!;
  expect(preset).toMatchObject({startFrame:1,endFrame:170,beatCount:4,startSeconds:r(1n,24n),endSeconds:r(85n,12n)});
  const intent=JSON.parse(JSON.stringify({start:timingValueFromSeconds(preset.startSeconds),end:timingValueFromSeconds(preset.endSeconds)}));
  for(let i=0;i<20;i++)expect(resolveTiming(s,intent)).toMatchObject({valid:true,startFrame:1,endFrame:170,endSeconds:r(85n,12n)});
 });
 it('uses the same adaptive calculation at a genuinely irregular off-beat start',()=>{
  const s=song(120,['0','48000','96000','240000','432000','624000']);
  expect(continuationPreset(s,72)).toMatchObject({startFrame:72,endFrame:248,beatCount:2,startSeconds:r(3n),endSeconds:r(31n,3n)});
  expect(continuationPreset(s,0)).toMatchObject({startFrame:0,endFrame:216,beatCount:4});
 });
 it('preserves a leading-offset map including signed beat display before beat one',()=>{
  expect(continuationPreset(song(120,['96000','120000','144000']),1)).toMatchObject({startFrame:1,endFrame:97,startSeconds:r(1n,24n),endSeconds:r(97n,24n),startBeat:'≈ -2.91666666'});
 });
 it('does not impose a minimum duration on a valid short preset',()=>{
  expect(continuationPreset(constant(1),1)).toMatchObject({startFrame:1,endFrame:2,beatCount:8,startSeconds:r(1n,24n),endSeconds:r(251n,6000n)});
 });
});

describe('shared adaptive and post-song boundaries',()=>{
 it.each([[57599,8,330],[57600,8,330],[57601,4,215],[180000,4,459],[180001,2,280],[360000,2,459],[360001,1,280],[720000,1,459],[720001,1,460]])('keeps threshold behavior at%s samples per beat', (interval,beatCount,endFrame)=>{
  expect(continuationPreset(constant(interval),99)).toMatchObject({startFrame:99,endFrame,beatCount});
 });
 it('at15BPM selects two beats/eight seconds and at3BPM keeps one overlong beat',()=>{
  expect(continuationPreset(constant(192000),99)).toMatchObject({startFrame:99,endFrame:291,beatCount:2});
  const slow=constant(960000),preset=continuationPreset(slow,99)!;
  expect(preset).toMatchObject({startFrame:99,endFrame:579,beatCount:1});
  expect(videoWarnings(slow,preset.startFrame,preset.endFrame).longDuration).toBe(true);
 });
 it('continues repeatedly through and beyond the song without changing exact start boundaries',()=>{
  const short=song(120,['0','24000','48000'],'500000');
  expect(continuationPreset(short,243)).toMatchObject({startFrame:243,endFrame:339});
  expect(videoWarnings(short,243,339)).toEqual({startPastSong:false,endPastSong:true,longDuration:false});
  expect(continuationPreset(short,339)).toMatchObject({startFrame:339,endFrame:435});
  expect(videoWarnings(short,339,435)).toEqual({startPastSong:true,endPastSong:true,longDuration:false});
 });
 it('uses the final observed irregular interval for wholly post-song extrapolation',()=>{
  expect(continuationPreset(song(120,['0','48000','192000'],'200000'),120)).toMatchObject({startFrame:120,endFrame:408,beatCount:4,startSeconds:r(5n),endSeconds:r(17n)});
 });
 it('leaves ordinary preset result keys and free-boundary display unchanged',()=>{
  expect(nextClipPreset(constant(57600),[{startFrame:230,endFrame:250}])).toEqual({startFrame:0,endFrame:230,beatCount:8,startBeat:'1',endBeat:'≈ 8.98611111'});
 });
});

describe('unavailable analysis and invalid explicit starts',()=>{
 it.each([null,0,-1,Number.NaN,Number.POSITIVE_INFINITY])('returnsnull for unavailable BPM%s without inventing tempo',bpm=>{
  const s=song();s.analysis.estimatedBpm=bpm;
  expect(continuationPreset(s,99)).toBeNull();
 });
 it.each([[],['0'],['0','0'],['24000','0'],['0','bad']].map(anchors=>({anchors})))('returnsnull for unusable anchors$anchors',({anchors})=>{
  expect(continuationPreset(song(120,anchors),99)).toBeNull();
 });
 it.each(['pending','failed'] as const)('returnsnull while analysis is%s',state=>{
  const s=song();s.analysis.state=state;expect(continuationPreset(s,99)).toBeNull();
 });
 it('accepts an available partial analysis and does not mutate its captured map',()=>{
  const s=song();s.analysis.state='partial';Object.freeze(s.analysis.sampleIndices);Object.freeze(s.analysis);Object.freeze(s);
  expect(continuationPreset(s,99)).toMatchObject({startFrame:99,endFrame:195});
  expect(s.analysis.sampleIndices).toEqual(['0','24000','48000']);
 });
 it.each([-1,0.5,Number.NaN,Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1])('rejects invalid explicit start%s',start=>{
  expect(()=>continuationPreset(song(),start)).toThrow(/frame/i);
 });
 it('rejects a derived interval outside the supported exact frame range',()=>{
  expect(()=>continuationPreset(song(),Number.MAX_SAFE_INTEGER-50)).toThrow(/frame/i);
 });
});
