import type {ClipEditContext,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import type {TimingValue} from '../../../packages/core/src/time/linked-timing.ts';
import {moveEditFromContext,resolveMoveEdit,resolveTrimEdit,trimEditFromContext,type TrimEdit,type TrimPoint} from './clip-edit-state.ts';
import type {ClipEditPatch,ClipEditResult} from './clip-edit-persistence.ts';
import {ApiError} from './api.ts';
export interface ClipEditSaveState {
 base:ClipEditContext;trim:TrimEdit;move:TimingValue;dirty:'trim'|'move'|null;
 saving:boolean;error:string|null;conflict:boolean;
}
interface Options {
 context:ClipEditContext;song:StudioSong;nativeFrames:number;arrangementRevision:number;
 write:(base:ClipEditContext,arrangementRevision:number,patch:ClipEditPatch)=>Promise<ClipEditResult>;
 onError:(message:string)=>void;
}
/** One controller per saved edit context. No global busy lock and no keypress
 * writes: valid drafts debounce, blur flushes, and acknowledgements never erase
 * input typed while a request was in flight. */
export function createClipEditAutosave(options:Options){
 const initial=(base:ClipEditContext):ClipEditSaveState=>({base,trim:trimEditFromContext(base),move:moveEditFromContext(base),dirty:null,saving:false,error:null,conflict:false});
 let state=initial(options.context),remote=options.context,arrangementRevision=options.arrangementRevision,version=0;
 let timer:ReturnType<typeof setTimeout>|null=null,flight:Promise<void>|null=null;
 const listeners=new Set<()=>void>();
 const put=(next:ClipEditSaveState)=>{state=next;for(const notify of listeners)notify();};
 const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const patch=():ClipEditPatch|null=>{
  if(state.dirty==='trim'){
   const value=resolveTrimEdit(options.song,state.base,state.trim,options.nativeFrames);
   return value.valid?{sourceStartFrame:value.sourceStartFrame,sourceEndFrame:value.sourceEndFrame,trimIntent:value.intent}:null;
  }
  if(state.dirty==='move'){
   const value=resolveMoveEdit(options.song,state.base,state.move);
   return value.valid?{startFrame:value.startFrame,placementIntent:value.intent}:null;
  }
  return null;
 };
 const schedule=()=>{clear();if(state.dirty&&!state.error&&!state.conflict)timer=setTimeout(()=>{timer=null;void flush();},350);};
 const acknowledge=(result:ClipEditResult,submittedVersion:number,kind:ClipEditSaveState['dirty'])=>{
  const base=result.context;
  arrangementRevision=Math.max(arrangementRevision,result.arrangement.revision);
  if(remote.revision<base.revision)remote=base;
  const newer=version!==submittedVersion;
  put({...state,base,dirty:newer?state.dirty:null,
   // Keep the edited spelling/unit, even after a successful save, so the
   // caret and an exact decimal are not replaced by a normalized expression.
   trim:kind==='trim'||(newer&&state.dirty==='trim')?state.trim:trimEditFromContext(base),
   move:kind==='move'||(newer&&state.dirty==='move')?state.move:moveEditFromContext(base),
   error:null,conflict:remote.revision>base.revision});
  if(!newer&&remote.revision>base.revision)put(initial(remote));
 };
 const run=(operation:()=>Promise<ClipEditResult>,kind:ClipEditSaveState['dirty']):Promise<void>=>{
  const submittedVersion=version;
  put({...state,saving:true,error:null});
  // Defer only the Promise continuation, not request dispatch (blur is immediate).
  let finish!:()=>void;const work=new Promise<void>(resolve=>{finish=resolve;});flight=work;
  void (async()=>{
   try{acknowledge(await operation(),submittedVersion,kind);}
   catch(error){const message=error instanceof Error?error.message:'Clip edits could not be saved.';
    put({...state,error:message,conflict:state.conflict||(error instanceof ApiError&&error.status===409)});options.onError(message);
   }
   finally{flight=null;put({...state,saving:false});schedule();finish();}
  })();
  return work;
 };
 function flush():Promise<void>{
  clear();if(flight)return flight;
  if(state.conflict||state.error)return Promise.resolve();
  const edit=patch();if(!edit)return Promise.resolve();
  const base=state.base,revision=arrangementRevision;
  return run(()=>options.write(base,revision,edit),state.dirty);
 }
 return {
  getSnapshot:()=>state,
  subscribe:(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify);};},
  trim:(endpoint:'start'|'end',value:TrimPoint)=>{
   if(state.conflict||state.dirty==='move')return;
   version++;put({...state,trim:{...state.trim,[endpoint]:value},dirty:'trim',error:null});schedule();
  },
  move:(value:TimingValue)=>{
   if(state.conflict||state.dirty==='trim')return;
   version++;put({...state,move:value,dirty:'move',error:null});schedule();
  },
  flush,
  retry:()=>{put({...state,error:null});return flush();},
  reset:()=>{if(flight)return;clear();version++;put(initial(remote));},
  receive:(next:ClipEditContext,revision:number)=>{
   if(next.id!==state.base.id||next.projectId!==state.base.projectId||next.songId!==state.base.songId)return;
   arrangementRevision=Math.max(arrangementRevision,revision);
   if(next.revision<remote.revision)return;remote=next;
   if(flight||next.revision<=state.base.revision)return;
   if(state.dirty){clear();put({...state,conflict:true});}else put(initial(next));
  },
  action:(operation:(base:ClipEditContext,revision:number)=>Promise<ClipEditResult>)=>{
   if(flight||state.dirty||state.conflict)return Promise.resolve();
   return run(()=>operation(state.base,arrangementRevision),null);
  },
  // Unmounting flushes valid edits against the captured project/context. Invalid
  // text is never a request; the page-unload warning protects unfinished input.
  detach:()=>{clear();void flush();},
 };
}
