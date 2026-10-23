import { useEffect, useRef, useState } from 'react';
import type { ClipDraft } from '../../../packages/core/src/contracts/studio.ts';
import { continuationRef } from './continuation-state.ts';
import { draftWriter, draftResolutionGuard } from './clip-draft-ownership.ts';
import { ApiError, request } from './api.ts';
import { clipSessionKey, decodeClipTiming, readSession, writeSession } from './clip-session.ts';
import { acknowledgeClipDraft, clipDraftEqual, clipDraftValues, receiveClipDraft, restoreClipDraft, type ClipDraftState, type ClipDraftValues } from './clip-draft-state.ts';

/** One mounted song context owns each save; responses never follow navigation elsewhere. */
export function useSavedClipDraft(server:ClipDraft) {
 const key=clipSessionKey(server.projectId,server.songId,'draft');
 const [state,setState]=useState<ClipDraftState>(()=>{
  const raw=readSession(key);if(raw)return restoreClipDraft(server,raw);
  const prompt=readSession(clipSessionKey(server.projectId,server.songId,'prompt'));
  const timing=decodeClipTiming(readSession(clipSessionKey(server.projectId,server.songId,'timing')));
  // One-time recovery of pre-schema4 tab drafts, not a backfill of historical edits.
  return {base:server,value:server.revision===0?{clipPrompt:prompt??server.clipPrompt,timingIntent:timing??server.timingIntent}:clipDraftValues(server),conflict:false};
 });
 const [writer]=useState(()=>draftWriter(key));
 const [resolution]=useState(draftResolutionGuard);
 const current=useRef(state),mounted=useRef(true),flight=useRef<Promise<void>|null>(null),resolutionFlight=useRef(false);
 const [saving,setSaving]=useState(false),[resolving,setResolving]=useState(false),[error,setError]=useState<string|null>(null);
 const put=(next:ClipDraftState)=>{
  current.current=next;
  if(writer.isCurrent()){
  writeSession(key,JSON.stringify({revision:next.base.revision,value:next.value,conflict:next.conflict}));
  // Retire legacy recovery only once the combined recovery record exists.
  writeSession(clipSessionKey(server.projectId,server.songId,'prompt'),null);
  writeSession(clipSessionKey(server.projectId,server.songId,'timing'),null);
  }
  if(mounted.current)setState(next);
 };
 const save=async():Promise<void>=>{
  if(flight.current)return flight.current;
  const work=async()=>{
   if(mounted.current)setSaving(true);
   try{
    while(!clipDraftEqual(current.current.value,clipDraftValues(current.current.base))){
     const s=current.current;if(s.conflict)throw new Error('Choose which clip draft to keep before continuing.');
     const submitted=structuredClone(s.value);
     const saved=await request<ClipDraft>(`/api/projects/${server.projectId}/songs/${server.songId}/clip-draft`,{revision:s.base.revision,...submitted,...(submitted.continuation!==undefined?{continuation:continuationRef(submitted.continuation)}:{})},'PUT');
     put(acknowledgeClipDraft(current.current,submitted,saved));
    }
    if(mounted.current)setError(null);
   }catch(e){
    if(e instanceof ApiError&&e.status===409)put({...current.current,conflict:true});
    if(mounted.current)setError(e instanceof Error?e.message:'Clip draft was not saved.');throw e;
   }finally{if(mounted.current)setSaving(false);}
  };
  const promise=work();flight.current=promise;try{await promise;}finally{flight.current=null;}
 };
 const saveRef=useRef(save);saveRef.current=save;
 useEffect(()=>{writer.claim();mounted.current=true;return()=>{mounted.current=false;void saveRef.current().catch(()=>{});};},[]);
 useEffect(()=>{
  if(flight.current)return;
  const next=receiveClipDraft(current.current,server);if(next!==current.current)put(next);
 },[server.revision,saving]);
 const dirty=!clipDraftEqual(state.value,clipDraftValues(state.base));
 useEffect(()=>{if(!dirty||state.conflict)return;const timer=setTimeout(()=>void saveRef.current().catch(()=>{}),500);return()=>clearTimeout(timer);},[state.value,dirty,state.conflict]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{const s=current.current;if(!clipDraftEqual(s.value,clipDraftValues(s.base))){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 const edit=(change:(value:ClipDraftValues)=>ClipDraftValues)=>{resolution.edited();put({...current.current,value:change(current.current.value)});setError(null);};
 const resolve=async(keep:boolean)=>{
  if(resolutionFlight.current)return;
  resolutionFlight.current=true;setResolving(true);const token=resolution.begin();
  try{
   if(flight.current)await flight.current.catch(()=>{});
   const fresh=await request<{clipDrafts:ClipDraft[]}>(`/api/projects/${server.projectId}`);
   const saved=fresh.clipDrafts.find(d=>d.songId===server.songId);if(!saved)throw new Error('The song draft is unavailable.');
   if(!mounted.current||!writer.isCurrent())return;
   if(!resolution.isCurrent(token)||saved.revision<current.current.base.revision)throw new Error('Your draft changed during recovery. Your edits are retained; please choose again.');
   put({base:saved,value:keep?current.current.value:clipDraftValues(saved),conflict:false});
   if(keep)await saveRef.current();else setError(null);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not resolve the clip draft.');}
  finally{resolutionFlight.current=false;if(mounted.current)setResolving(false);}
 };
 return {value:state.value,baseRevision:state.base.revision,edit,save,resolve,dirty,saving,resolving,error,conflict:state.conflict};
}
