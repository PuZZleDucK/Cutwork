import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ClipEditContext,SongArrangement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import type {useStudio} from './useStudio.ts';
import {createClipEditAutosave} from './clip-edit-autosave.ts';
export function useClipEditAutosave(props:{studio:ReturnType<typeof useStudio>;song:StudioSong;arrangement:SongArrangement;clip:StudioClip;context:ClipEditContext}){
 const latest=useRef(props);latest.current=props;
 const [editor]=useState(()=>createClipEditAutosave({context:props.context,song:props.song,nativeFrames:props.clip.nativeFrames,arrangementRevision:props.arrangement.revision,
  write:(base,revision,patch)=>latest.current.studio.saveClipEdit(base,revision,patch),
  onError:message=>latest.current.studio.reportClipEditError(`Clip edits not saved: ${message}`)}));
 const state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot);
 useEffect(()=>{editor.receive(props.context,props.arrangement.revision);},[editor,props.context,props.arrangement.revision]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{const s=editor.getSnapshot();if(s.dirty||s.saving){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);
  return()=>{window.removeEventListener('beforeunload',warn);editor.detach();};
 },[editor]);
 return {state,editor};
}
