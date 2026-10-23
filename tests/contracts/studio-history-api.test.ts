/** Strict HTTP shapes plus actual durable store; no provider/model invocations. */
import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { registerStudioApi } from '../../apps/server/src/studio/api.ts';
import type { StudioRuntime } from '../../apps/server/src/studio/runtime-contract.ts';
import type { ProviderStatus, VideoInput } from '../../packages/core/src/contracts/studio.ts';
const cleanup: (() => Promise<void>)[] = [], host = 'history.local:9122';
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'history-api-')); cleanup.push(() => rm(dir, { recursive:true, force:true }));
  const store = openStudioStore(join(dir, 'studio.sqlite')), queue = openGpuQueue(join(dir, 'gpu.sqlite')); cleanup.push(async () => {store.close();queue.close();});
  const status = (): ProviderStatus => ({provider:'codex',model:'gpt-6.1-sol',installed:true,auth:'signed-in',detail:'FAKE',signInCommand:'FAKE'});
  const runtime: StudioRuntime = {overview:()=>({projects:store.listProjects(),selectedProjectId:store.selectedProject(),provider:status(),tools:store.tools(),warnings:[]}),selectProvider:async()=>status(),checkProvider:async()=>status(),setup:()=>[],submitMusic:async(id,key,input)=>store.submitMusic(id,key,input),submitVideo:vi.fn(async(id,key,input)=>store.submitVideo(id,key,input)),render:async(id,songId,revision,key)=>store.enqueueRender(id,songId,revision,key)};
  const app=createNativeApi({queue,allowedHosts:[host],validateSubmission(){},hasAttempt:()=>false});cleanup.push(()=>app.close());await registerStudioApi(app,{store,runtime,dataRoot:dir,webRoot:null});
  const request=(method:'POST'|'GET'|'PUT',url:string,body?:unknown)=>app.inject({method,url,headers:{host,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{payload:JSON.stringify(body)})});
  const project=store.createProject('Timing history'),attempt=store.submitMusic(project.id,randomUUID(),{musicPrompt:'Fixture',lyrics:''});
  const song=store.finishMusic(attempt.id,{title:'Song',assetId:randomUUID(),assetPath:join(dir,project.id,'song.wav'),sha256:'a'.repeat(64),sampleCount:'480000',sampleRate:48000,channels:2,durationSeconds:10,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000','48000'],waveformBucketSamples:480,peaks:[1.25],error:null,version:'fixture'}},{});
  const input:VideoInput={songId:song.id,clipPrompt:'Exact timing',style:'Visual',startFrame:4,endFrame:8,timingIntent:{start:{unit:'beats',value:'1.3333333333333333334'},end:{unit:'rational',value:{numerator:'1',denominator:'3'}}}};
  return {store,runtime,request,project,song,input,url:`/api/projects/${project.id}/video`};
}
test('HTTP typed beat + rational end metadata is preserved exactly with server-derived immutable resolution',async()=>{
  const f=await fixture(),key=randomUUID(),response=await f.request('POST',f.url,{idempotencyKey:key,input:f.input});expect(response.statusCode).toBe(202);
  const attempt=response.json();expect(attempt.input).toEqual(f.input);expect(attempt.timingResolution.endSeconds).toEqual({numerator:'1',denominator:'3'});
  expect(attempt.timingResolution.startSeconds).toEqual({numerator:'1666666666666666667',denominator:'10000000000000000000'});
  f.store.setAnalysis(f.song.id,{...f.song.analysis,sampleIndices:['0','48000','96000'],estimatedBpm:60});
  expect((await f.request('POST',f.url,{idempotencyKey:key,input:f.input})).json()).toEqual(attempt);
  expect((await f.request('POST',f.url,{idempotencyKey:randomUUID(),input:f.input})).statusCode).toBe(400);
});
test('HTTP rejects forged realisations, conflicting exact metadata and extra nested timing fields',async()=>{
  const f=await fixture();
  const bad:unknown[]=[{...f.input,startFrame:5},{...f.input,timingIntent:{...f.input.timingIntent,start:{unit:'frames',value:'0'}}},{...f.input,timingIntent:{...f.input.timingIntent,end:{unit:'rational',value:{numerator:'1',denominator:'0'}}}},{...f.input,timingIntent:{...f.input.timingIntent,end:{unit:'rational',value:{numerator:'1',denominator:'3',extra:true}}}},{...f.input,timingIntent:{...f.input.timingIntent,extra:true}},{...f.input,timingIntent:{...f.input.timingIntent,start:{unit:'beats',value:'1.3',extra:true}}},{...f.input,timingIntent:{...f.input.timingIntent,start:{unit:'bogus',value:'1'}}},{...f.input,startFrame:0,endFrame:1,timingIntent:{start:{unit:'seconds',value:'0.001'},end:{unit:'seconds',value:'0.03'}},requestedIntervalSeconds:{start:'0',end:'0.03'}}];
  for(const input of bad)expect((await f.request('POST',f.url,{idempotencyKey:randomUUID(),input})).statusCode,JSON.stringify(input)).toBe(400);
  expect(f.store.videoAttempts()).toEqual([]);
});
test('project HTTP snapshots include actual committed edit events, excluding conflicts and no-op saves',async()=>{
  const f=await fixture(),path=`/api/projects/${f.project.id}`,current=f.store.project(f.project.id).project;
  const changed={...current.draft,style:'  Exact saved style  '};
  expect((await f.request('PUT',`${path}/draft`,{revision:current.revision,draft:changed})).statusCode).toBe(200);
  const read=(await f.request('GET',path)).json(),events=read.events;
  expect(events.filter((e:{kind:string})=>e.kind==='style.changed')).toEqual([expect.objectContaining({data:{before:'',after:changed.style,revision:current.revision+1}})]);
  await f.request('PUT',`${path}/draft`,{revision:current.revision+1,draft:changed});
  expect((await f.request('PUT',`${path}/draft`,{revision:current.revision,draft:{...changed,style:'Conflict'}})).statusCode).toBe(409);
  expect((await f.request('GET',path)).json().events).toEqual(events);
});
