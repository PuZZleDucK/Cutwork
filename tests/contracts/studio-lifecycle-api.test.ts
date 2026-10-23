/** Real HTTP schemas/membership; no destructive filesystem or provider calls. */
import {afterEach,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeApi} from '../../apps/server/src/http/native-api.ts';
import {openGpuQueue} from '../../apps/server/src/jobs/gpu-queue.ts';
import {openStudioStore} from '../../apps/server/src/studio/store.ts';
import {registerStudioApi} from '../../apps/server/src/studio/api.ts';
import type {StudioRuntime} from '../../apps/server/src/studio/runtime-contract.ts';
import type {LifecycleManager} from '../../apps/server/src/studio/lifecycle-manager.ts';
const cleanup:(()=>unknown|Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function fixture(){
 const root=mkdtempSync(join(tmpdir(),'studio-lifecycle-api-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}));
 const store=openStudioStore(join(root,'studio.sqlite')),queue=openGpuQueue(join(root,'queue.sqlite'));cleanup.push(()=>{store.close();queue.close();});
 const project=store.createProject('Disposable lifecycle'),attempt=store.submitMusic(project.id,randomUUID(),{musicPrompt:'Fixture',lyrics:''});
 const song=store.finishMusic(attempt.id,{title:'Named disposable song',assetId:randomUUID(),assetPath:join(root,'song.wav'),sha256:'a'.repeat(64),sampleCount:'48000',sampleRate:48000,channels:2,durationSeconds:1,truncated:false,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0'],waveformBucketSamples:48000,peaks:[.5],error:null,version:'fixture'}},{});
 const ref={kind:'song' as const,id:song.id};
 const prepareDelete=vi.fn(async()=>({id:randomUUID(),projectId:project.id,ref,title:song.title,digest:'b'.repeat(64),expiresAt:'2030-01-01T00:00:00.000Z',fileCount:1,bytes:10,retains:['History'],limitations:['External exports remain'],blockers:[]}));
 const confirmDelete=vi.fn(async()=>({id:randomUUID(),projectId:project.id,artifact:ref,state:'pending'}));
 const retryPurge=vi.fn(async()=>({state:'pending'}));
 const lifecycle={prepareDelete,confirmDelete,retryPurge} as unknown as LifecycleManager;
 const app=createNativeApi({queue,allowedHosts:['studio.local:9122'],validateSubmission(){},hasAttempt:()=>false});cleanup.push(()=>app.close());
 await registerStudioApi(app,{store,runtime:{} as StudioRuntime,dataRoot:root,webRoot:null,lifecycle});
 const request=(suffix:string,body:unknown,pid=project.id,kind='song',id=song.id)=>app.inject({method:'POST',url:`/api/projects/${pid}/artifacts/${kind}/${id}/${suffix}`,headers:{host:'studio.local:9122','content-type':'application/json'},payload:JSON.stringify(body)});
 return {store,project,song,ref,request,prepareDelete,confirmDelete,retryPurge};
}
test('delete-plan is read-only disclosure and does not implicitly confirm deletion',async()=>{
 const f=await fixture(),before=f.store.project(f.project.id);const response=await f.request('delete-plan',{});
 expect(response.statusCode).toBe(201);expect(response.json()).toMatchObject({title:f.song.title,ref:f.ref});
 expect(f.prepareDelete).toHaveBeenCalledWith(f.project.id,f.ref);expect(f.confirmDelete).not.toHaveBeenCalled();expect(f.store.project(f.project.id)).toEqual(before);
});
test('confirmation uses explicit plan/digest/key and rejects client paths or force flags',async()=>{
 const f=await fixture(),body={planId:randomUUID(),digest:'b'.repeat(64),idempotencyKey:randomUUID()};
 expect((await f.request('delete',body)).statusCode).toBe(202);expect(f.confirmDelete).toHaveBeenCalledWith(f.project.id,f.ref,body);
 for(const bad of [{},{...body,path:'/tmp/no'},{...body,force:true},{...body,digest:'bad'},{...body,idempotencyKey:'bad'}])expect((await f.request('delete',bad)).statusCode).toBe(400);
 expect(f.confirmDelete).toHaveBeenCalledOnce();
});
test('artifact membership and kind are checked before async deletion work',async()=>{
 const f=await fixture(),other=f.store.createProject('Other');
 expect((await f.request('delete-plan',{},other.id)).statusCode).toBe(404);
 expect((await f.request('delete-plan',{},f.project.id,'render')).statusCode).toBe(400);
 expect((await f.request('delete-plan',{},f.project.id,'clip')).statusCode).toBe(404);expect(f.prepareDelete).not.toHaveBeenCalled();
});
test('archive/restore routes are revision-bound and restore never selects the song',async()=>{
 const f=await fixture();expect((await f.request('archive',{revision:99})).statusCode).toBe(409);
 const archived=await f.request('archive',{revision:0});expect(archived.statusCode).toBe(200);expect(archived.json().state).toBe('archived');expect(f.store.project(f.project.id).project.selectedSongId).toBeNull();
 const restored=await f.request('restore',{revision:archived.json().revision});expect(restored.statusCode).toBe(200);expect(restored.json().state).toBe('active');expect(f.store.project(f.project.id).project.selectedSongId).toBeNull();
 expect((await f.request('restore',{revision:'1'})).statusCode).toBe(400);
});
