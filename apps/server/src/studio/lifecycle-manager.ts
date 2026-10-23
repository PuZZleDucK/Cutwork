import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {StudioStoreError} from './store.ts';
import {prepareArtifactDeletion,verifyManagedMediaInventory,verifyRetainedThumbnail} from './media-inventory.ts';
import {runArtifactPurge} from './purge.ts';
import type {StudioStore} from './store-contract.ts';
import type {ArtifactBlocker,ArtifactDeletePlan,ArtifactRef,ManagedMediaInventory,PurgeRecord,RetainedThumbnail} from '../../../../packages/core/src/contracts/lifecycle.ts';
interface PreparedMedia {inventory:ManagedMediaInventory;manifestPath:string;thumbnail?:RetainedThumbnail}
interface StoredPlan {public:ArtifactDeletePlan;contextDigest:string;media:PreparedMedia}
export interface DeleteConfirmation {planId:string;digest:string;idempotencyKey:string}
interface Options {
 runtime:string;store:StudioStore;now?:()=>number;
 externalBlockers?:(projectId:string,ref:ArtifactRef)=>ArtifactBlocker[];
 prepare?:(options:{runtime:string;store:StudioStore;projectId:string;ref:ArtifactRef;signal?:AbortSignal})=>Promise<PreparedMedia>;
 verify?:(options:{runtime:string;inventory:ManagedMediaInventory;signal?:AbortSignal})=>Promise<void>;
 purge?:(options:{runtime:string;purgeId:string;inventory:ManagedMediaInventory;completedEntryIds?:string[];onProgress:(entryId:string)=>void;signal?:AbortSignal})=>Promise<{completedEntryIds:string[]}>;
}
export interface LifecycleManager {
 prepareDelete(projectId:string,ref:ArtifactRef):Promise<ArtifactDeletePlan>;
 confirmDelete(projectId:string,ref:ArtifactRef,input:DeleteConfirmation):Promise<PurgeRecord>;
 retryPurge(projectId:string,id:string):Promise<PurgeRecord>;
 start():void;hasActiveWork():boolean;idle():Promise<void>;close():Promise<void>;
}
const fail=(code:string,message:string,status:400|404|409=409):never=>{throw new StudioStoreError(status,code,message);};
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const same=(a:ArtifactRef,b:ArtifactRef)=>a.kind===b.kind&&a.id===b.id;
/** Disclosure is durable but not consent. Only exact confirmed plans enter the
 * durable deleting state; restart resumes accepted purges, never generation. */
export function createLifecycleManager(options:Options):LifecycleManager {
 const {runtime,store}=options,now=options.now??Date.now;
 const prepare=options.prepare??prepareArtifactDeletion,verify=options.verify??verifyManagedMediaInventory,purge=options.purge??runArtifactPurge;
 const controller=new AbortController(),locks=new Set<string>(),workers=new Map<string,Promise<void>>(),projectTails=new Map<string,Promise<void>>(),requests=new Set<Promise<unknown>>();
 let stopped=false;
 const external=(projectId:string,ref:ArtifactRef)=>options.externalBlockers?.(projectId,ref)??[];
 const open=()=>{if(stopped)fail('STUDIO_STOPPING','The studio is stopping; retry after restart.');};
 const noExternal=(projectId:string,ref:ArtifactRef)=>{const blockers=external(projectId,ref);if(blockers.length)fail('STUDIO_MEDIA_BUSY',blockers.map(b=>`${b.kind} ${b.id} (${b.state}): ${b.detail}`).join('; '));};
 function locked<T>(projectId:string,fn:()=>Promise<T>):Promise<T>{
  open();if(locks.has(projectId))return Promise.reject(new StudioStoreError(409,'STUDIO_MEDIA_BUSY','Another media operation is active in this project. Retry when it finishes.'));
  locks.add(projectId);const task=(async()=>{try{return await fn();}finally{locks.delete(projectId);}})();
  requests.add(task);void task.then(()=>requests.delete(task),()=>requests.delete(task));return task;
 }
 const path=(projectId:string,planId:string)=>{
  if(!validId(projectId)||!validId(planId))fail('STUDIO_INPUT','Valid project and plan IDs are required.',400);
  return join(runtime,'projects',projectId,'lifecycle-plans',`${planId}.json`);
 };
 function launch(record:PurgeRecord):void {
  if(stopped||workers.has(record.id)||record.state==='succeeded')return;
  const execute=()=>locked(record.projectId,async()=>{
   try {
    noExternal(record.projectId,record.artifact);
    const blockers=store.deletionContext(record.projectId,record.artifact).blockers;
    if(blockers.length)fail('STUDIO_MEDIA_BUSY',blockers.map(b=>`${b.kind} ${b.id} (${b.state}): ${b.detail}`).join('; '));
    store.patchDeletion(record.id,{error:null});
    const thumbnail=record.thumbnailAssetId?store.rawAsset(record.thumbnailAssetId):null;
    if(record.thumbnailAssetId&&!thumbnail)fail('STUDIO_MEDIA_CHANGED','The retained thumbnail registration is missing.');
    if(thumbnail)await verifyRetainedThumbnail({runtime,projectId:record.projectId,thumbnail,signal:controller.signal});
    const result=await purge({runtime,purgeId:record.id,inventory:record.inventory,completedEntryIds:record.completedEntryIds,signal:controller.signal,
     onProgress:entryId=>{const current=store.deletion(record.id)!;store.patchDeletion(record.id,{completedEntryIds:[...new Set([...current.completedEntryIds,entryId])]});}});
    if(thumbnail)await verifyRetainedThumbnail({runtime,projectId:record.projectId,thumbnail,signal:controller.signal});
    store.patchDeletion(record.id,{completedEntryIds:result.completedEntryIds});store.finishDeletion(record.id);
   }catch(error){store.patchDeletion(record.id,{error:(error instanceof Error?error.message:String(error)).slice(0,12000)});}
  });
  const previous=projectTails.get(record.projectId);
  const work=(previous?previous.then(()=>{if(!stopped)return execute();}):execute()).catch(error=>{store.patchDeletion(record.id,{error:(error instanceof Error?error.message:String(error)).slice(0,12000)});}).finally(()=>{workers.delete(record.id);if(projectTails.get(record.projectId)===work)projectTails.delete(record.projectId);});
  workers.set(record.id,work);projectTails.set(record.projectId,work);
 }
 async function load(projectId:string,ref:ArtifactRef,input:DeleteConfirmation):Promise<StoredPlan>{
  let plan:StoredPlan;try{plan=JSON.parse(await readFile(path(projectId,input.planId),'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')fail('DELETE_PLAN_STALE','The deletion disclosure is unavailable; review a new plan.');throw error;}
  if(plan.public.projectId!==projectId||!same(plan.public.ref,ref)||plan.public.digest!==input.digest)fail('DELETE_PLAN_STALE','The confirmation does not match the disclosed artifact and plan.');
  const expected=createHash('sha256').update(JSON.stringify({...plan.public,digest:''})+plan.contextDigest+JSON.stringify(plan.media)).digest('hex');
  if(expected!==plan.public.digest)fail('DELETE_PLAN_STALE','The stored disclosure changed; review a new plan.');
  return plan;
 }
 return {
  async prepareDelete(projectId,ref){
   store.lifecycle(projectId,ref);return locked(projectId,async()=>{
    const context=store.deletionContext(projectId,ref);noExternal(projectId,ref);
    if(['deleting','deleted'].includes(context.lifecycle.state))fail('STUDIO_CONFLICT','This artifact already has an accepted deletion.');
    if(context.blockers.length)fail('STUDIO_MEDIA_BUSY',context.blockers.map(b=>`${b.kind} ${b.id} (${b.state}): ${b.detail}`).join('; '));
    const media=await prepare({runtime,store,projectId,ref,signal:controller.signal});
    if(store.deletionContext(projectId,ref).digest!==context.digest)fail('DELETE_PLAN_STALE','Project media changed while preparing the disclosure; review a new plan.');
    const snapshot=store.project(projectId),artifact=ref.kind==='song'?snapshot.songs.find(s=>s.id===ref.id):snapshot.clips.find(c=>c.id===ref.id);
    const publicPlan:ArtifactDeletePlan={id:randomUUID(),projectId,ref,title:artifact!.title,digest:'',expiresAt:new Date(now()+600000).toISOString(),
     fileCount:media.inventory.entries.filter(entry=>entry.identity!==null).length,bytes:media.inventory.entries.reduce((sum,e)=>sum+(e.bytes??0),0),blockers:[],
     retains:['Generation history, prompts, settings, seeds and text logs',media.thumbnail?'A separate small history thumbnail':'Available analysis/waveform history; no fabricated thumbnail', 'Independent songs, clips and continuation outputs'],
     limitations:['Irreversible: full media, all placements and affected managed preview/export caches are removed.', 'Previously downloaded exports, backups and unknown external or unregistered agent copies cannot be recalled.', 'Independent generated clips may still contain music from a deleted source song. This is not secure disk erasure or audio separation.']};
    publicPlan.digest=createHash('sha256').update(JSON.stringify(publicPlan)+context.digest+JSON.stringify(media)).digest('hex');
    const destination=path(projectId,publicPlan.id);await mkdir(join(runtime,'projects',projectId,'lifecycle-plans'),{recursive:true,mode:0o700});
    await writeFile(`${destination}.tmp`,JSON.stringify({public:publicPlan,contextDigest:context.digest,media}),{mode:0o600,flag:'wx'});await rename(`${destination}.tmp`,destination);
    return publicPlan;
   });
  },
  async confirmDelete(projectId,ref,input){
   store.lifecycle(projectId,ref);const accepted=await locked(projectId,async()=>{
    const previous=store.deletionForKey(projectId,input.idempotencyKey);
    if(previous){if(!same(previous.artifact,ref)||previous.confirmation?.planId!==input.planId||previous.confirmation.digest!==input.digest)fail('STUDIO_CONFLICT','Deletion key was used for another request.');return previous;}
    const plan=await load(projectId,ref,input);
    if(now()>Date.parse(plan.public.expiresAt))fail('DELETE_PLAN_EXPIRED','The deletion disclosure expired; review a new plan.');
    noExternal(projectId,ref);
    if(store.deletionContext(projectId,ref).digest!==plan.contextDigest)fail('DELETE_PLAN_STALE','The artifact or its dependencies changed; review a new plan.');
    try{await verify({runtime,inventory:plan.media.inventory,signal:controller.signal});if(plan.media.thumbnail)await verifyRetainedThumbnail({runtime,projectId,thumbnail:plan.media.thumbnail,signal:controller.signal});}catch{fail('DELETE_PLAN_CHANGED','Managed media changed after disclosure; nothing was accepted for deletion. Review a new plan.');}
    open();noExternal(projectId,ref);
    // Transactional store revalidates the context and all accepted dependencies
    // after asynchronous filesystem checks, then marks media unavailable.
    return store.acceptDeletion(projectId,ref,{contextDigest:plan.contextDigest,idempotencyKey:input.idempotencyKey,confirmation:{planId:input.planId,digest:input.digest},inventory:plan.media.inventory,...(plan.media.thumbnail?{thumbnail:plan.media.thumbnail}:{})});
   });
   if(['pending','purging'].includes(accepted.state))launch(accepted);return accepted;
  },
  async retryPurge(projectId,id){
   open();const record=store.deletion(id);if(!record||record.projectId!==projectId)return fail('STUDIO_NOT_FOUND','Deletion not found in this project.',404);
   if(record.state==='succeeded'||workers.has(id))return record;
   noExternal(projectId,record.artifact);launch(record);return store.deletion(id)!;
  },
  start(){open();for(const record of store.deletions())if(record.state!=='succeeded')launch(record);},
  hasActiveWork(){return locks.size>0||workers.size>0;},
  async idle(){while(workers.size)await Promise.allSettled([...workers.values()]);},
  async close(){stopped=true;controller.abort(new Error('Purge interrupted by shutdown; retry the durable operation after restart.'));await Promise.allSettled([...workers.values(),...requests]);},
 };
}
