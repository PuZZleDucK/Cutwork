import type { ClipDraft } from '../../../packages/core/src/contracts/studio.ts';
import type { ClipTimingIntent, TimingValue } from '../../../packages/core/src/time/linked-timing.ts';
import { continuationEqual,decodeContinuation } from './continuation-state.ts';
import { decodeClipDraftTiming } from './clip-session.ts';
export type ClipDraftValues=Pick<ClipDraft,'clipPrompt'|'timingIntent'|'continuation'>;
export interface ClipDraftState {base:ClipDraft;value:ClipDraftValues;conflict:boolean}
export const clipDraftValues=(draft:ClipDraft):ClipDraftValues=>({clipPrompt:draft.clipPrompt,timingIntent:draft.timingIntent,...(draft.continuation!==undefined?{continuation:draft.continuation}:{})});
const timingValueEqual=(a:TimingValue,b:TimingValue):boolean=>a.unit===b.unit&&(a.unit==='rational'&&b.unit==='rational'?a.value.numerator===b.value.numerator&&a.value.denominator===b.value.denominator:a.value===b.value);
/** Exact editable text matters; JSON property insertion order does not. */
export const clipTimingEqual=(a:ClipTimingIntent|null,b:ClipTimingIntent|null):boolean=>a===null||b===null?a===b:timingValueEqual(a.start,b.start)&&timingValueEqual(a.end,b.end);
export const clipDraftEqual=(a:ClipDraftValues,b:ClipDraftValues)=>a.clipPrompt===b.clipPrompt&&clipTimingEqual(a.timingIntent,b.timingIntent)&&continuationEqual(a.continuation,b.continuation);
const sameContext=(a:ClipDraft,b:ClipDraft)=>a.projectId===b.projectId&&a.songId===b.songId;
export function receiveClipDraft(state:ClipDraftState,saved:ClipDraft):ClipDraftState {
 if(!sameContext(state.base,saved)||saved.revision<=state.base.revision)return state;
 const clean=clipDraftEqual(state.value,clipDraftValues(state.base))||clipDraftEqual(state.value,clipDraftValues(saved));
 return {base:saved,value:clean?clipDraftValues(saved):state.value,conflict:!clean};
}
export function acknowledgeClipDraft(state:ClipDraftState,submitted:ClipDraftValues,saved:ClipDraft):ClipDraftState {
 if(!sameContext(state.base,saved)||state.base.revision>saved.revision)return state;
 return {base:saved,value:clipDraftEqual(state.value,submitted)?clipDraftValues(saved):state.value,conflict:false};
}
export function restoreClipDraft(saved:ClipDraft,raw:string|null):ClipDraftState {
 const clean={base:saved,value:clipDraftValues(saved),conflict:false};
 try{
  const data=JSON.parse(raw??'null');
  if(!data||!Number.isSafeInteger(data.revision)||data.revision<0||typeof data.value?.clipPrompt!=='string'||data.value.clipPrompt.length>16000||typeof data.conflict!=='boolean')return clean;
  const timingIntent=data.value.timingIntent===null?null:decodeClipDraftTiming(JSON.stringify(data.value.timingIntent));
  if(data.value.timingIntent!==null&&!timingIntent)return clean;
  const continuation=data.value.continuation==null?data.value.continuation:decodeContinuation(data.value.continuation);
  if(data.value.continuation!=null&&(!continuation||continuation.songId!==saved.songId))return clean;
  const value={clipPrompt:data.value.clipPrompt,timingIntent,...(continuation!==undefined?{continuation}:{})};
  if(clipDraftEqual(value,clean.value))return clean;
  return {base:saved,value,conflict:data.conflict||data.revision!==saved.revision};
 }catch{return clean;}
}
/** Acceptance clears only the exact submitted image binding, never newer local intent. */
export function acceptedClipDraft(current:ClipDraftValues,submitted:ClipDraftValues):ClipDraftValues{
 if(!continuationEqual(current.continuation,submitted.continuation))return current;
 if(current.continuation&&!clipDraftEqual(current,submitted))return current;
 const promptMatches=current.clipPrompt===submitted.clipPrompt,timingMatches=clipTimingEqual(current.timingIntent,submitted.timingIntent);
 return {...current,clipPrompt:promptMatches?'':current.clipPrompt,timingIntent:timingMatches?null:current.timingIntent,
  ...(current.continuation!==undefined&&promptMatches&&timingMatches&&continuationEqual(current.continuation,submitted.continuation)?{continuation:null}:{})};
}

/** A preparation acknowledgement may advance clean target recovery, never unsaved or concurrent edits. */
export function preparedClipRecovery(previous:ClipDraft,prepared:ClipDraft,observedRaw:string|null,currentRaw:string|null):string|null{
 if(!sameContext(previous,prepared)||prepared.revision<=previous.revision||observedRaw!==currentRaw)return null;
 const recovered=restoreClipDraft(previous,currentRaw);
 if(recovered.conflict||!clipDraftEqual(recovered.value,clipDraftValues(previous)))return null;
 return JSON.stringify({revision:prepared.revision,value:clipDraftValues(prepared),conflict:false});
}
