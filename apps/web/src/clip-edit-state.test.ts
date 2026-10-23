import {expect,it} from 'vitest';
import {resolveTrimEdit,trimEditDisplay,resolveMoveEdit,trimEditFromContext,clipAudioMisaligned} from './clip-edit-state.ts';
const song={sampleRate:48000,sampleCount:'4800000',analysis:{state:'available' as const,estimatedBpm:60,sampleIndices:['0','48000','96000'],waveformBucketSamples:4800,peaks:[],error:null,version:'fixture'}};
const context={sourceOriginFrame:0,sourceStartFrame:0,sourceEndFrame:80,trimIntent:null,placementIntent:null,songId:'song'};
it('source1–80 trimmed6–75 preserves times and70frames with inclusive source labels',()=>{
 const trim={start:{unit:'sourceFrames' as const,value:'6'},end:{unit:'sourceFrames' as const,value:'75'}};
 expect(resolveTrimEdit(song,context,trim,80)).toMatchObject({valid:true,sourceStartFrame:5,sourceEndFrame:75,startFrame:5,endFrame:75});
 expect(trimEditDisplay(song,context,trim.end,'end')).toMatchObject({sourceFrames:'75',seconds:'3.125'});
});
it('retains off-grid entered precision and rounds trim endpoints outward only once',()=>{
 const c={...context,sourceEndFrame:500};const d={start:{unit:'seconds' as const,value:'12.3456789'},end:{unit:'seconds' as const,value:'12.5'}};
 expect(resolveTrimEdit(song,c,d,500)).toMatchObject({valid:true,sourceStartFrame:296,sourceEndFrame:300,intent:d});
 expect(trimEditDisplay(song,c,d.start,'start')).toMatchObject({sourceFrames:'297',seconds:'12.3456789'});
});
it('moves a retained window without growing it or prohibiting a negative source origin',()=>{
 const c={...context,sourceStartFrame:5,sourceEndFrame:75};
 expect(resolveMoveEdit(song,c,{unit:'seconds',value:'12.3456789'})).toMatchObject({valid:true,startFrame:296,endFrame:366,sourceOriginFrame:291});
 expect(resolveMoveEdit(song,c,{unit:'frames',value:'1'})).toMatchObject({valid:true,startFrame:0,endFrame:70,sourceOriginFrame:-5});
});
it('incomplete/inverted/out-of-source trims remain invalid, one-frame retention is valid',()=>{
 const d=(start:string,end:string)=>({start:{unit:'sourceFrames' as const,value:start},end:{unit:'sourceFrames' as const,value:end}});
 for(const pair of [['','3'],['0','3'],['5','4'],['1','81'],['1.5','3']])expect(resolveTrimEdit(song,context,d(pair[0]!,pair[1]!),80).valid).toBe(false);
 expect(resolveTrimEdit(song,context,d('7','7'),80)).toMatchObject({valid:true,sourceStartFrame:6,sourceEndFrame:7});
 expect(resolveTrimEdit(song,{...context,sourceOriginFrame:-5},d('1','5'),80).valid).toBe(false);
});
it('keeps exact saved intent until an explicit move clears it; no beat map still allows seconds',()=>{
 const intent={start:{unit:'seconds' as const,value:'0.123456789'},end:{unit:'seconds' as const,value:'2.5'}};
 expect(trimEditFromContext({...context,trimIntent:intent})).toEqual(intent);
 const missing={...song,analysis:{...song.analysis,state:'failed' as const,sampleIndices:[],estimatedBpm:null}};
 expect(trimEditDisplay(missing,context,{unit:'seconds',value:'1'},'start').beats).toBeNull();
 expect(resolveMoveEdit(missing,context,{unit:'seconds',value:'1'}).valid).toBe(true);
});
it('trim does not warn for alignment; moving or selecting another song does',()=>{
 const clip={songId:'song'};const attempt={input:{startFrame:0}};
 const trimmed={...context,sourceStartFrame:5};
 expect(clipAudioMisaligned(trimmed,clip,attempt)).toBe(false);
 expect(clipAudioMisaligned({...context,sourceOriginFrame:-5},clip,attempt)).toBe(true);
 expect(clipAudioMisaligned({...context,songId:'other'},clip,attempt)).toBe(true);
});
