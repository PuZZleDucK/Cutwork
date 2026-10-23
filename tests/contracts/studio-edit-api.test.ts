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
async function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-edit-api-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const store=openStudioStore(join(dir,'studio.sqlite')),queue=openGpuQueue(join(dir,'queue.sqlite'));cleanup.push(()=>{store.close();queue.close();});
 const p=store.createProject('Edit API'),a=store.submitMusic(p.id,randomUUID(),{musicPrompt:'Synthetic fixture',lyrics:''}),song=store.finishMusic(a.id,{title:'Song',assetId:randomUUID(),assetPath:join(dir,randomUUID()+'.wav'),sha256:'a'.repeat(64),sampleCount:'480000',sampleRate:48000,channels:2,durationSeconds:10,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000'],waveformBucketSamples:1,peaks:[1],error:null,version:'fixture'}},{});
 const video=store.submitVideo(p.id,randomUUID(),{songId:song.id,clipPrompt:'Fixture',style:'',startFrame:0,endFrame:80}),asset=(ext:string)=>({assetId:randomUUID(),path:join(dir,randomUUID()+'.'+ext),sha256:'b'.repeat(64)}),clip=store.finishVideo(video.id,{title:'Clip',video:asset('mp4'),audio:{...asset('flac'),sampleCount:'160000',sampleRate:48000,channels:2},frames:Array.from({length:80},(_,index)=>({...asset('png'),index,pixelSha256:'c'.repeat(64),bytes:100})),frameCount:80,width:640,height:480,fps:'24/1'},{});
 const host='edits.local:9122',app=createNativeApi({queue,allowedHosts:[host],validateSubmission(){},hasAttempt:()=>false});cleanup.push(()=>app.close());await registerStudioApi(app,{store,runtime:{} as StudioRuntime,dataRoot:dir,webRoot:null});const request=(method:'PUT'|'POST',url:string,body:unknown)=>app.inject({method,url,headers:{host,'content-type':'application/json'},payload:JSON.stringify(body)});const context=store.project(p.id).editContexts[0]!;return{store,p,song,clip,context,request,url:`/api/projects/${p.id}/edit-contexts/${context.id}`};}
test('HTTP exact trim/move/audio/unplace/re-place actions retain context and materialize authoritative arrangement',async()=>{
 const f=await fixture(),intent={start:{unit:'seconds',value:'0.20833333333333333334'},end:{unit:'rational',value:{numerator:'25',denominator:'8'}}};
 const trimmed=await f.request('PUT',f.url,{revision:0,arrangementRevision:1,edit:{sourceStartFrame:5,sourceEndFrame:75,trimIntent:intent}});expect(trimmed.statusCode).toBe(200);expect(trimmed.json().context.trimIntent).toEqual(intent);expect(trimmed.json().arrangement.placements[0]).toMatchObject({startFrame:5,endFrame:75});
 const moved=await f.request('PUT',f.url,{revision:1,arrangementRevision:2,edit:{startFrame:0,placementIntent:{unit:'beats',value:'1.0000000000000000001'}}});expect(moved.statusCode).toBe(200);expect(moved.json().context).toMatchObject({sourceOriginFrame:-5,trimIntent:null});
 expect((await f.request('PUT',f.url,{revision:2,arrangementRevision:3,edit:{audioSource:'clip'}})).statusCode).toBe(200);
 const removed=await f.request('POST',`${f.url}/placement`,{revision:3,arrangementRevision:4,placed:false});expect(removed.statusCode).toBe(200);expect(removed.json().arrangement.placements).toEqual([]);
 const replaced=await f.request('POST',`${f.url}/placement`,{revision:4,arrangementRevision:5,placed:true});expect(replaced.statusCode).toBe(200);expect(replaced.json().arrangement.placements[0]).toMatchObject({id:f.context.id,startFrame:0,endFrame:70,audioSource:'clip'});
});
test('HTTP rejects wrong projects, conflicting revisions, forged intent and nested extra fields without mutation',async()=>{
 const f=await fixture(),before=f.store.project(f.p.id),edit={sourceStartFrame:5,sourceEndFrame:75};
 for(const body of [{revision:0,arrangementRevision:1,edit:{...edit,extra:true}},{revision:0,arrangementRevision:1,edit:{startFrame:1,placementIntent:{unit:'seconds',value:'0',extra:true}}},{revision:0,arrangementRevision:1,edit:{...edit,trimIntent:{start:{unit:'seconds',value:'0'},end:{unit:'seconds',value:'3'}}}},{revision:0,arrangementRevision:1,edit:{sourceStartFrame:5,startFrame:0}},{revision:0,arrangementRevision:1,edit:{audioSource:'mix'}},{revision:0,arrangementRevision:1,edit:{startFrame:0,placementIntent:{unit:'rational',value:{numerator:'0',denominator:'1',extra:true}}}}])expect((await f.request('PUT',f.url,body)).statusCode).toBe(400);
 expect((await f.request('PUT',f.url,{revision:1,arrangementRevision:1,edit})).statusCode).toBe(409);expect((await f.request('PUT',f.url,{revision:0,arrangementRevision:0,edit})).statusCode).toBe(409);
 const other=f.store.createProject('Other');expect((await f.request('PUT',`/api/projects/${other.id}/edit-contexts/${f.context.id}`,{revision:0,arrangementRevision:1,edit})).statusCode).toBe(404);expect(f.store.project(f.p.id)).toEqual(before);
});
test('HTTP explicit dominance swap is revision checked and preserves all other placement fields',async()=>{
 const f=await fixture(),added=f.store.addPlacement(f.p.id,f.song.id,1,{clipId:f.clip.id,startFrame:10}),[one,two]=added.placements,url=`/api/projects/${f.p.id}/songs/${f.song.id}/dominance`,body={revision:2,firstPlacementId:one!.id,secondPlacementId:two!.id};
 const response=await f.request('POST',url,body);expect(response.statusCode).toBe(200);expect(response.json().placements).toEqual([{...one,priority:two!.priority},{...two,priority:one!.priority}]);expect((await f.request('POST',url,body)).statusCode).toBe(409);
});
