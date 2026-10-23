import {displayTimingValue,parseTimingValue,resolveTiming,timingValueFromSeconds,type ClipTimingIntent,type TimingValue,type TimingSong} from '../../../packages/core/src/time/linked-timing.ts';
export type TrimPoint=TimingValue|{unit:'sourceFrames';value:string};
export interface TrimEdit {start:TrimPoint;end:TrimPoint}
export interface EditGeometry {sourceOriginFrame:number;sourceStartFrame:number;sourceEndFrame:number;trimIntent:ClipTimingIntent|null;placementIntent:TimingValue|null;songId:string}
const safe=(n:number)=>{if(!Number.isSafeInteger(n))throw new Error('Frame is outside the supported range.');return n;};
function point(context:EditGeometry,value:TrimPoint,endpoint:'start'|'end'):TimingValue{
 if(value.unit!=='sourceFrames')return value;
 if(!/^[0-9]+$/.test(value.value)||BigInt(value.value)<1n||BigInt(value.value)>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Source frames are positive whole numbers, starting at one.');
 const boundary=safe(context.sourceOriginFrame+Number(value.value)-(endpoint==='start'?1:0));
 if(boundary<0)throw new Error('Retained footage cannot start before the song timeline.');
 return timingValueFromSeconds({numerator:BigInt(boundary),denominator:24n});
}
export function trimEditFromContext(context:EditGeometry):TrimEdit {
 return context.trimIntent??{start:{unit:'sourceFrames',value:String(context.sourceStartFrame+1)},end:{unit:'sourceFrames',value:String(context.sourceEndFrame)}};
}
export function trimEditDisplay(song:TimingSong,context:EditGeometry,value:TrimPoint,endpoint:'start'|'end'){
 try{
  const input=point(context,value,endpoint),time=parseTimingValue(song,input),display=displayTimingValue(song,input);
  const numerator=time.numerator*24n,frame=endpoint==='start'?numerator/time.denominator:(numerator+time.denominator-1n)/time.denominator;
  const source=Number(frame)-context.sourceOriginFrame+(endpoint==='start'?1:0);
  return {sourceFrames:value.unit==='sourceFrames'?value.value:String(source),seconds:display.seconds,beats:display.beats};
 }catch{return {sourceFrames:value.unit==='sourceFrames'?value.value:'',seconds:value.unit==='seconds'?value.value:'',beats:value.unit==='beats'?value.value:null};}
}
export function resolveTrimEdit(song:TimingSong,context:EditGeometry,draft:TrimEdit,nativeFrames:number){
 try{
  const intent={start:point(context,draft.start,'start'),end:point(context,draft.end,'end')};
  const timing=resolveTiming(song,intent);if(!timing.valid)throw new Error(timing.error);
  const sourceStartFrame=safe(timing.startFrame-context.sourceOriginFrame),sourceEndFrame=safe(timing.endFrame-context.sourceOriginFrame);
  safe(timing.endFrame+1);
  if(sourceStartFrame<0||sourceEndFrame>nativeFrames||sourceEndFrame<=sourceStartFrame)throw new Error(`Retain a range within source frames 1–${nativeFrames}.`);
  return {valid:true as const,intent,sourceStartFrame,sourceEndFrame,startFrame:timing.startFrame,endFrame:timing.endFrame};
 }catch(e){return {valid:false as const,error:e instanceof Error?e.message:'Invalid source trim.'};}
}
export function resolveMoveEdit(song:TimingSong,context:EditGeometry,intent:TimingValue){
 try{
  const seconds=parseTimingValue(song,intent),startFrame=safe(Number(seconds.numerator*24n/seconds.denominator));
  const endFrame=safe(startFrame+context.sourceEndFrame-context.sourceStartFrame),sourceOriginFrame=safe(startFrame-context.sourceStartFrame);
  safe(endFrame+1);
  return {valid:true as const,startFrame,endFrame,sourceOriginFrame,intent};
 }catch(e){return {valid:false as const,error:e instanceof Error?e.message:'Invalid placement.'};}
}
export function moveEditFromContext(context:EditGeometry):TimingValue{return context.placementIntent??timingValueFromSeconds({numerator:BigInt(context.sourceOriginFrame+context.sourceStartFrame),denominator:24n});}
export function clipAudioMisaligned(context:Pick<EditGeometry,'songId'|'sourceOriginFrame'>,clip:{songId:string},attempt:{input:{startFrame:number}}|undefined):boolean{
 return context.songId!==clip.songId||!attempt||context.sourceOriginFrame!==attempt.input.startFrame;
}
