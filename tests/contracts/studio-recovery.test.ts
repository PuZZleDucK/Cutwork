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
  for(const changed of [{...request,seed:'18446744073709551615'===a.seeds.h3?'1':'18446744073709551615'},{...request,song:{...request.song,path:'/other/song.wav'}},{...request,song:{...request.song,sha256:'b'.repeat(64)}},{...request,plan:{...request.plan,nativeFrames:48}},{...request,plan:{...request.plan,conditioning:{...request.plan.conditioning,silenceSamples:0}}},{...request,prompt:''}])expect(()=>validateStudioNativeCall(store,{...call,request:changed})).toThrow();
  store.patchVideoAttempt(a.id,{state:'failed'});expect(()=>validateStudioNativeCall(store,call)).toThrow();
 }finally{store.close();await rm(root,{recursive:true,force:true});}
});
