import type { ClipPlacement, StudioRender, StudioSong, VideoAttempt, VideoInput, VideoReservation } from '../../../packages/core/src/contracts/studio.ts';
import { nextClipPreset } from '../../../packages/core/src/time/studio-timing.ts';
import { createRequestId } from './studio-state.ts';
export function clipSuggestion(song:StudioSong,placements:ClipPlacement[],reservations:VideoReservation[]) {
  return nextClipPreset(song,[...placements,...reservations.filter(r=>r.songId===song.id)]);
}
export function videoInput(songId:string,clipPrompt:string,style:string,start:string,end:string):VideoInput {
  if(!/^\d+$/.test(start)||!/^\d+$/.test(end)) throw new Error('Use whole, nonnegative frame boundaries.');
  const startFrame=Number(start),endFrame=Number(end);
  if(!Number.isSafeInteger(startFrame)||!Number.isSafeInteger(endFrame)||endFrame<=startFrame)throw new Error('End must be after start within the supported frame range.');
  if(!clipPrompt.trim())throw new Error('Describe the clip you want to make.');
  return {songId,clipPrompt,style,startFrame,endFrame};
}
export function renderForRevision(renders:StudioRender[],songId:string,revision:number):{current:StudioRender|undefined;playable:StudioRender|undefined} {
  const ordered=renders.filter(r=>r.songId===songId).slice().reverse();
  return {current:ordered.find(r=>r.revision===revision),playable:ordered.find(r=>r.state==='succeeded'&&r.assetId)};
}
export function videoHistory(attempts:VideoAttempt[]) {return [...attempts].sort((a,b)=>b.sequence-a.sequence);}
export function submissionIdentity(previous:{signature:string;key:string}|null,input:unknown,key=createRequestId):{signature:string;key:string} {
  const signature=JSON.stringify(input);return previous?.signature===signature?previous:{signature,key:key()};
}

/** A late read cannot overwrite newer accepted mutation/read results. */
export function latestReadGuard() {
 let sequence=0;
 return {begin:()=>++sequence,isCurrent:(candidate:number)=>candidate===sequence};
}
/** An automatic attempt is one-shot for a revision, even when HTTP acceptance is uncertain. */
export function automaticRenderAllowed(enabled:boolean,currentPresent:boolean,busy:boolean,connection:string|null,key:string,attempted:string|null):boolean {
 return enabled&&!currentPresent&&!busy&&!connection&&key!==attempted;
}
/** Server-confirmed unusable historical output requires a new key; network ambiguity does not. */
export function mustReplaceRenderKey(error:unknown):boolean {
 return !!error&&typeof error==='object'&&'code' in error&&error.code==='STUDIO_RENDER_UNAVAILABLE';
}
