import { describe, expect, it } from 'vitest';
import { beatAtTime, nextClipPreset, songCoverage, timeAtBeat, videoWarnings } from '../../packages/core/src/time/studio-timing.ts';
import type { StudioSong } from '../../packages/core/src/contracts/studio.ts';
const song = (bpm=120, anchors=['0','24000','48000'], count='480000'): Pick<StudioSong,'analysis'|'sampleRate'|'sampleCount'> => ({sampleRate:48000,sampleCount:count,analysis:{state:'available',estimatedBpm:bpm,sampleIndices:anchors,waveformBucketSamples:0,peaks:[],error:null,version:'fixture'}});
const steady = (bpm:number) => song(bpm, [0,1,2].map(n=>String(n*48000*60/bpm)));
describe('exact beat maps and free clip presets',()=>{
 it.each([[120,8,96],[50,8,231],[48,4,120],[16,4,360],[15,2,192],[8,2,360],[6,1,240],[3,1,480]])('chooses %s bpm preset', (bpm,beats,end)=>{expect(nextClipPreset(steady(bpm),[])).toMatchObject({startFrame:0,endFrame:end,beatCount:beats});});
 it('keeps lead-in and extrapolates without inventing a beat at zero',()=>{const s=song(120,['12000','36000','60000']);expect(beatAtTime(s,{numerator:0n,denominator:1n})).toEqual({numerator:1n,denominator:2n});expect(nextClipPreset(s,[])).toMatchObject({startFrame:0,endFrame:96,startBeat:'0.5',endBeat:'8.5'});});
 it('interpolates irregular anchors and extrapolates nearest intervals',()=>{const s=song(120,['24000','48000','120000']);expect(timeAtBeat(s,{numerator:5n,denominator:2n})).toEqual({numerator:7n,denominator:4n});expect(timeAtBeat(s,{numerator:4n,denominator:1n})).toEqual({numerator:4n,denominator:1n});expect(beatAtTime(s,{numerator:7n,denominator:4n})).toEqual({numerator:5n,denominator:2n});});
 it('halves using actual irregular durations rather than BPM alone',()=>{expect(nextClipPreset(song(120,['0','480000','960000']),[])).toMatchObject({beatCount:1,endFrame:240});});
 it('includes queued reservations and starts at earliest residual frame',()=>{expect(nextClipPreset(steady(120),[{startFrame:0,endFrame:10},{startFrame:20,endFrame:50}])).toMatchObject({startFrame:10,endFrame:20});});
 it('merges overlapping and touching occupied spans',()=>{expect(nextClipPreset(steady(120),[{startFrame:10,endFrame:20},{startFrame:0,endFrame:12},{startFrame:20,endFrame:25}])).toMatchObject({startFrame:25,endFrame:121});});
 it('does not clamp at song end or round beyond next occupied frame',()=>{expect(nextClipPreset(song(120,['0','24000'],'1000'),[{startFrame:0,endFrame:600}])).toMatchObject({startFrame:600,endFrame:696});expect(nextClipPreset(steady(50),[{startFrame:230,endFrame:250}])).toMatchObject({endFrame:230});});
 it.each([song(0),song(120,[]),song(120,['0']),song(120,['0','0']),song(120,['24000','0'])])('does not invent a missing beat map',s=>{expect(nextClipPreset(s,[])).toBeNull();});
 it('rejects unsafe or invalid occupancy rather than corrupting presets',()=>{expect(()=>nextClipPreset(steady(120),[{startFrame:3,endFrame:2}])).toThrow();});
});
describe('coverage and warning boundaries',()=>{
 it('unions only supplied placements and clips at the exact song sample end',()=>{const s=song(120,['0','24000'],'2500');expect(songCoverage(s,[{startFrame:0,endFrame:1}]).percent).toBe(80);expect(songCoverage(s,[{startFrame:0,endFrame:2},{startFrame:1,endFrame:20}]).percent).toBe(100);});
 it('reports empty gaps and no double counting',()=>{expect(songCoverage(steady(120),[{startFrame:12,endFrame:36},{startFrame:24,endFrame:48},{startFrame:90,endFrame:1000}])).toEqual({percent:77.5,coveredFrames:186,gaps:[{startFrame:0,endFrame:12},{startFrame:48,endFrame:90}]});});
 it('known song with no placements is zero and whole extent gap',()=>expect(songCoverage(steady(120),[])).toEqual({percent:0,coveredFrames:0,gaps:[{startFrame:0,endFrame:240}]}));
 it('warns independently at exactly song end, and only above fifteen seconds',()=>{expect(videoWarnings(steady(120),240,600)).toEqual({startPastSong:true,endPastSong:true,longDuration:false});expect(videoWarnings(steady(120),0,361)).toEqual({startPastSong:false,endPastSong:true,longDuration:true});});
 it('uses exact requested duration not rounded envelope for long warning',()=>{expect(videoWarnings(steady(120),0,361,{start:'0.001',end:'15.001'}).longDuration).toBe(false);});
});
