/** HTTP continuation uses real persistence and a fake dispatcher, never native work. */
import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { registerStudioApi } from '../../apps/server/src/studio/api.ts';
import type { StudioRuntime } from '../../apps/server/src/studio/runtime-contract.ts';
const cleanup:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
async function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-continuation-api-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const store=openStudioStore(join(dir,'studio.sqlite')),queue=openGpuQueue(join(dir,'queue.sqlite'));cleanup.push(()=>{store.close();queue.close();});
 const p=store.createProject('Continue API'),a=store.submitMusic(p.id,randomUUID(),{musicPrompt:'Synthetic fixture',lyrics:''}),song=store.finishMusic(a.id,{title:'Song',assetId:randomUUID(),assetPath:join(dir,randomUUID()+'.wav'),sha256:'a'.repeat(64),sampleCount:'480000',sampleRate:48000,channels:2,durationSeconds:10,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000'],waveformBucketSamples:1,peaks:[1],error:null,version:'fixture'}},{});
 const video=store.submitVideo(p.id,randomUUID(),{songId:song.id,clipPrompt:'Fixture',style:'',startFrame:0,endFrame:80}),asset=(ext:string)=>({assetId:randomUUID(),path:join(dir,randomUUID()+'.'+ext),sha256:'b'.repeat(64)}),clip=store.finishVideo(video.id,{title:'Clip',video:asset('mp4'),audio:null,frames:Array.from({length:81},(_,index)=>({...asset('png'),index,pixelSha256:'c'.repeat(64),bytes:100})),frameCount:81,width:640,height:480,fps:'24/1'},{});
 const host='continuation.local:9122',app=createNativeApi({queue,allowedHosts:[host],validateSubmission(){},hasAttempt:()=>false});cleanup.push(()=>app.close());const runtime={async submitVideo(...args:Parameters<typeof store.submitVideo>){return store.submitVideo(...args);}} as StudioRuntime;await registerStudioApi(app,{store,runtime,dataRoot:dir,webRoot:null});const request=(method:'PUT'|'POST',url:string,body:unknown)=>app.inject({method,url,headers:{host,'content-type':'application/json'},payload:JSON.stringify(body)});const context=store.project(p.id).editContexts[0]!;return{store,p,song,clip,context,request,url:`/api/projects/${p.id}/edit-contexts/${context.id}/continue`,draftUrl:`/api/projects/${p.id}/songs/${song.id}/clip-draft`,videoUrl:`/api/projects/${p.id}/video`};}

test('HTTP continue saves exact draft and server-owned raw-frame capture, with strict stale guards and no queue dispatch',async()=>{
 const f=await fixture(),before=f.store.project(f.p.id),result=await f.request('POST',f.url,{revision:0,draftRevision:0});expect(result.statusCode).toBe(200);const {draft,presetBeatCount}=result.json();expect(presetBeatCount).toBe(8);expect(draft.continuation.frame).toEqual(f.clip.rawFrames[79]);expect(draft.timingIntent).toEqual({start:{unit:'rational',value:{numerator:'10',denominator:'3'}},end:{unit:'rational',value:{numerator:'22',denominator:'3'}}});expect(f.store.project(f.p.id).videoAttempts).toEqual(before.videoAttempts);expect(f.store.project(f.p.id).arrangements).toEqual(before.arrangements);
 expect((await f.request('POST',f.url,{revision:0,draftRevision:0})).statusCode).toBe(409);expect((await f.request('POST',f.url,{revision:1,draftRevision:1})).statusCode).toBe(409);
 const other=f.store.createProject('Other');expect((await f.request('POST',`/api/projects/${other.id}/edit-contexts/${f.context.id}/continue`,{revision:0,draftRevision:0})).statusCode).toBe(404);
 for(const body of [{revision:0,draftRevision:1,frame:f.clip.rawFrames[80]},{revision:'0',draftRevision:1},{revision:0},{revision:0,draftRevision:-1}])expect((await f.request('POST',f.url,body)).statusCode).toBe(400);
});

test('HTTP accepts minimal reference only, persists draft binding, captures immutable request, and replay remains original after edits',async()=>{
 const f=await fixture(),reference={contextId:f.context.id,contextRevision:0},saved=await f.request('PUT',f.draftUrl,{revision:0,clipPrompt:'Next',timingIntent:null,continuation:reference});expect(saved.statusCode).toBe(200);const draft=saved.json();expect(draft.continuation.frame).toEqual(f.clip.rawFrames[79]);
 const input={songId:f.song.id,clipPrompt:'Next',style:'Blue',startFrame:80,endFrame:176,continuation:reference},body={idempotencyKey:randomUUID(),input},result=await f.request('POST',f.videoUrl,body);expect(result.statusCode).toBe(202);expect(result.json().continuation).toEqual(draft.continuation);f.store.editClipContext(f.p.id,f.context.id,0,1,{sourceEndFrame:75});expect((await f.request('POST',f.videoUrl,body)).json()).toEqual(result.json());expect((await f.request('POST',f.videoUrl,{...body,idempotencyKey:randomUUID()})).statusCode).toBe(409);
 expect((await f.request('PUT',f.draftUrl,{revision:1,clipPrompt:'Text edits retain stale binding',timingIntent:null,continuation:reference})).statusCode).toBe(200);expect((await f.request('PUT',f.draftUrl,{revision:2,clipPrompt:'Cleared',timingIntent:null,continuation:null})).json().continuation).toBeNull();
 for(const continuation of [{...reference,frame:f.clip.rawFrames[79]},{...reference,path:'/arbitrary.png'},{...reference,contextRevision:'0'},null])expect((await f.request('POST',f.videoUrl,{idempotencyKey:randomUUID(),input:{...input,continuation}})).statusCode).toBe(400);
 expect((await f.request('PUT',f.draftUrl,{revision:3,clipPrompt:'No',timingIntent:null,continuation:{...reference,frame:f.clip.rawFrames[79]}})).statusCode).toBe(400);
 const ordinary=await f.request('POST',f.videoUrl,{idempotencyKey:randomUUID(),input:{songId:f.song.id,clipPrompt:'Ordinary',style:'',startFrame:0,endFrame:24}});expect(ordinary.statusCode).toBe(202);expect(ordinary.json()).not.toHaveProperty('continuation');expect(ordinary.json().input).not.toHaveProperty('continuation');
});
