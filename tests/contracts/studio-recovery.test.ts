/** Real SQLite restart ordering; no processes or generators. */
import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { reconcileStudioStartup, validateStudioNativeCall } from '../../apps/server/src/studio/recovery.ts';

test('startup freezes queued native work before worker starts, preserving unknown held ownership', async () => {
 const root = await mkdtemp(join(tmpdir(), 'studio-recovery-')); const store = openStudioStore(join(root, 's.db')), queue = openGpuQueue(join(root, 'q.db'));
 try {
  const p = store.createProject('Recovery fixture'), input = { musicPrompt: 'Fixture', lyrics: '' };
  const a = store.submitMusic(p.id, randomUUID(), input), b = store.submitMusic(p.id, randomUUID(), input);
  for (const v of [a,b]) { store.patchAttempt(v.id, { state: 'running' }); queue.submit({ id:v.nativeCallId, attemptId:v.id, projectId:p.id, tool:'yue2', request:{} }); }
  const lease = queue.claim('old-server')!; reconcileStudioStartup(store, queue);
  expect(queue.heldLease()).toEqual(lease); expect(queue.get(a.nativeCallId)?.cancelRequested).toBe(false);
  expect(queue.get(b.nativeCallId)?.state).toBe('cancelled'); expect(store.attempt(a.id)?.state).toBe('reconciling'); expect(store.attempt(b.id)?.state).toBe('reconciling');
 } finally { store.close(); queue.close(); await rm(root,{recursive:true}); }
});
test('native submissions require the captured active parent and exact assigned seeds', async () => {
 const root = await mkdtemp(join(tmpdir(), 'studio-recovery-')); const store = openStudioStore(join(root, 's.db'));
 try {
  const p = store.createProject('Validate'), a = store.submitMusic(p.id, randomUUID(), { musicPrompt:'Fixture',lyrics:'' });
  const call = { id:a.nativeCallId,attemptId:a.id,projectId:p.id,tool:'yue2' as const,request:{schemaVersion:1,attemptId:a.nativeCallId,seeds:a.seeds} };
  expect(() => validateStudioNativeCall(store,call)).toThrow(); store.patchAttempt(a.id,{state:'running'});
  expect(() => validateStudioNativeCall(store,call)).not.toThrow();
  expect(() => validateStudioNativeCall(store,{...call,request:{...call.request,seeds:{...a.seeds,nar:'1'}}})).toThrow();
  store.patchAttempt(a.id,{state:'failed'}); expect(() => validateStudioNativeCall(store,call)).toThrow();
 } finally { store.close(); await rm(root,{recursive:true}); }
});

test('H3 admission binds active video parent, original song, exact seed and complete native conditioning plan',async()=>{
 const root=await mkdtemp(join(tmpdir(),'video-recovery-')),store=openStudioStore(join(root,'s.db'));
 try{
  const p=store.createProject('Video'),m=store.submitMusic(p.id,randomUUID(),{musicPrompt:'Fixture',lyrics:''});store.patchAttempt(m.id,{state:'running'});
  const song=store.finishMusic(m.id,{title:'Song',assetId:randomUUID(),assetPath:join(root,'original.wav'),sha256:'a'.repeat(64),sampleCount:'96000',sampleRate:48000,channels:2,durationSeconds:2,truncated:false,analysis:{state:'failed',estimatedBpm:null,sampleIndices:[],waveformBucketSamples:0,peaks:[],error:'Fixture',version:null}},{});
  const a=store.submitVideo(p.id,randomUUID(),{songId:song.id,clipPrompt:'Scene',style:'Consistent',startFrame:0,endFrame:48});
  const request={schemaVersion:1,attemptId:a.nativeCallId,projectId:p.id,song:{path:join(root,'original.wav'),sha256:song.sha256},plan:{fps:'24/1',requestedFrames:48,nativeFrames:56,placement:{startFrame:0,endFrame:48},conditioning:{startSample:0,availableSamples:96000,silenceSamples:16000,totalSamples:112000},durationWarning:false},seed:a.seeds.h3,prompt:'Translated visual prompt'};
  const call={id:a.nativeCallId,attemptId:a.id,projectId:p.id,tool:'h3' as const,request};
  expect(()=>validateStudioNativeCall(store,call)).toThrow();store.patchVideoAttempt(a.id,{state:'running'});expect(()=>validateStudioNativeCall(store,call)).not.toThrow();
  for(const changed of [{...request,seed:'18446744073709551615'===a.seeds.h3?'1':'18446744073709551615'},{...request,song:{...request.song,path:'/other/song.wav'}},{...request,song:{...request.song,sha256:'b'.repeat(64)}},{...request,plan:{...request.plan,nativeFrames:48}},{...request,plan:{...request.plan,conditioning:{...request.plan.conditioning,silenceSamples:0}}},{...request,prompt:''},{...request,firstFrame:{path:'/tmp/image.png',sha256:'b'.repeat(64),pixelSha256:'c'.repeat(64)}}])expect(()=>validateStudioNativeCall(store,{...call,request:changed})).toThrow();
  store.patchVideoAttempt(a.id,{state:'failed'});expect(()=>validateStudioNativeCall(store,call)).toThrow();
 }finally{store.close();await rm(root,{recursive:true,force:true});}
});

test('continuation native admission binds server-owned snapshot and both captured image hashes, not current context',()=>{
 const runtime='/tmp/native-continuation-fixture',projectId=randomUUID(),id=randomUUID(),nativeCallId=randomUUID(),songId=randomUUID();
 const frame={assetId:randomUUID(),index:4,sha256:'b'.repeat(64),pixelSha256:'c'.repeat(64),bytes:123};
 const attempt={id,nativeCallId,projectId,state:'running',input:{songId,startFrame:24,endFrame:72},song:{id:songId,assetId:randomUUID(),sha256:'a'.repeat(64),sampleCount:'96000',sampleRate:48000,channels:2},seeds:{h3:'123'},continuation:{contextId:randomUUID(),contextRevision:1,clipId:randomUUID(),songId,sourceOriginFrame:19,sourceStartFrame:2,sourceEndFrame:5,endFrame:24,frame}};
 const song={projectId,path:join(runtime,'projects',projectId,'song.wav'),sha256:attempt.song.sha256};
 const store={videoAttempt:()=>attempt,asset:()=>song,project:()=>{throw Error('Mutable context cannot be consulted');}} as unknown as Parameters<typeof validateStudioNativeCall>[0];
 const firstFrame={path:join(runtime,'projects',projectId,'inputs',id,'continuation.png'),sha256:frame.sha256,pixelSha256:frame.pixelSha256};
 const request={schemaVersion:1,attemptId:nativeCallId,projectId,song:{path:song.path,sha256:song.sha256},seed:'123',prompt:'Continue',firstFrame,plan:{fps:'24/1',requestedFrames:48,nativeFrames:56,placement:{startFrame:24,endFrame:72},durationWarning:false,conditioning:{startSample:48000,availableSamples:48000,silenceSamples:64000,totalSamples:112000}}};
 const call={id:nativeCallId,attemptId:id,projectId,tool:'h3' as const,request};
 expect(()=>validateStudioNativeCall(store,call,runtime)).not.toThrow();expect(()=>validateStudioNativeCall(store,call)).toThrow();
 for(const changed of [undefined,{...firstFrame,path:'/tmp/arbitrary.png'},{...firstFrame,sha256:'0'.repeat(64)},{...firstFrame,pixelSha256:'0'.repeat(64)}])
  expect(()=>validateStudioNativeCall(store,{...call,request:{...request,firstFrame:changed} as never},runtime)).toThrow();
});
