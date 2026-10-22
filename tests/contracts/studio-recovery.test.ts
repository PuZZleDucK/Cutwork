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
  const p = store.createProject('Recovery fixture'), input = { musicPrompt: 'Fixture', lyrics: '', style: '' };
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
  const p = store.createProject('Validate'), a = store.submitMusic(p.id, randomUUID(), { musicPrompt:'Fixture',lyrics:'',style:'' });
  const call = { id:a.nativeCallId,attemptId:a.id,projectId:p.id,tool:'yue2' as const,request:{schemaVersion:1,attemptId:a.nativeCallId,seeds:a.seeds} };
  expect(() => validateStudioNativeCall(store,call)).toThrow(); store.patchAttempt(a.id,{state:'running'});
  expect(() => validateStudioNativeCall(store,call)).not.toThrow();
  expect(() => validateStudioNativeCall(store,{...call,request:{...call.request,seeds:{...a.seeds,nar:'1'}}})).toThrow();
  store.patchAttempt(a.id,{state:'failed'}); expect(() => validateStudioNativeCall(store,call)).toThrow();
 } finally { store.close(); await rm(root,{recursive:true}); }
});
