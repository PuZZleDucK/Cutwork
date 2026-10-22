/** Real SQLite scheduling, injected setup/provider functions. No models or services. */
import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { createStudioRuntime } from '../../apps/server/src/studio/runtime.ts';
import { providerModels } from '../../apps/server/src/providers/launch.ts';
import type { MusicAttempt, Provider, ProviderStatus, ToolId } from '../../packages/core/src/contracts/studio.ts';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
const draft = { musicPrompt: 'Synthetic scheduler fixture', lyrics: '', style: '' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(nativeRuntimeLimitSeconds = 3600) {
 const root = await mkdtemp(join(tmpdir(), 'studio-runtime-'));
 cleanup.push(() => rm(root, { recursive: true, force: true }));
 const store = openStudioStore(join(root, 'studio.sqlite')), queue = openGpuQueue(join(root, 'gpu.sqlite'));
 cleanup.push(async () => { store.close(); queue.close(); });
 const installed = new Set<ToolId>(['agent', 'yue2', 'comfyui', 'h3', 'analysis']);
 const auth = new Map<Provider, boolean>([['codex', true], ['claude', true]]);
 const status = (p: Provider): ProviderStatus => ({ provider: p, model: providerModels[p], installed: installed.has('agent'), auth: auth.get(p) ? 'signed-in' : 'sign-in-required', detail: 'FAKE auth', signInCommand: 'FAKE login' });
 const adapter = {
  close: vi.fn(async () => {}),
  checkProvider: vi.fn(async (p: Provider) => status(p)),
  probe: vi.fn(async (id: ToolId, _p: Provider) => ({ installed: installed.has(id), ready: installed.has(id), detail: 'FAKE readiness' })),
  install: vi.fn(async (id: ToolId, _p: Provider, log: (s: string) => void) => { log('FAKE install output\n'); installed.add(id); return { installed: true, ready: true, detail: 'FAKE complete' }; }),
 };
 const prepare = vi.fn(async ({ attempt }: { attempt: MusicAttempt }) => ({ planPath: join(root, attempt.id, 'captured-task.json') }));
 const run = vi.fn(async ({ attempt }: { attempt: MusicAttempt }) => { store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE run ended without media', error: 'FAKE test outcome' }); });
 const runtime = createStudioRuntime({ store, queue, runtime: root, source: root, origin: 'http://127.0.0.1:9122', setupAdapter: adapter, prepareMusic: prepare, runMusic: run, pollMs: 10, nativeRuntimeLimitSeconds });
 cleanup.push(() => runtime.close());
 return { runtime, store, queue, adapter, prepare, run, installed, auth, status };
}
const settled = (f: Awaited<ReturnType<typeof fixture>>) => vi.waitFor(() => expect(f.store.setupJobs().filter(j => ['queued', 'running'].includes(j.state))).toHaveLength(0));

test('startup checks each tool without installation; frequent overview is read-only and cached', async () => {
 const f = await fixture(); await f.runtime.start(); const calls = f.adapter.probe.mock.calls.length;
 for (let i = 0; i < 20; i++) f.runtime.overview();
 expect(calls).toBe(4); expect(f.adapter.probe).toHaveBeenCalledTimes(calls); expect(f.adapter.install).not.toHaveBeenCalled();
 expect(f.runtime.overview().tools.every(t => t.state === 'ready')).toBe(true);
});
test('Install all orders and deduplicates shared dependencies; a ready tool is verified not reinstalled', async () => {
 const f = await fixture(); f.installed.clear(); await f.runtime.start(); f.adapter.probe.mockClear();
 const a = f.runtime.setup('all'), b = f.runtime.setup('all'); expect(a.map(j => j.id)).toEqual(b.map(j => j.id));
 await settled(f); expect(f.adapter.install.mock.calls.map(c => c[0])).toEqual(['agent', 'yue2', 'comfyui', 'h3', 'analysis']);
 f.adapter.install.mockClear(); f.runtime.setup('yue2'); await settled(f);
 expect(f.adapter.install).not.toHaveBeenCalled(); expect(f.adapter.probe.mock.calls.some(c => c[0] === 'yue2')).toBe(true);
});
test('individual H3 setup includes the missing agent and Comfy prerequisites', async () => {
 const f = await fixture(); f.installed.clear(); await f.runtime.start();
 expect(f.runtime.setup('h3').map(j => j.tool)).toEqual(['agent', 'comfyui', 'h3']); await settled(f);
 expect(f.adapter.install.mock.calls.map(c => c[0])).toEqual(['agent', 'comfyui', 'h3']);
});
test('failed prerequisite prevents dependent install and retains actionable failure/log', async () => {
 const f = await fixture(); f.installed.clear(); await f.runtime.start();
 f.adapter.install.mockRejectedValueOnce(new Error('FAKE download failed')); f.runtime.setup('all'); await settled(f);
 expect(f.adapter.install).toHaveBeenCalledTimes(1); expect(f.store.tool('agent').state).toBe('error');
 expect(f.store.tool('h3').detail).toMatch(/prerequisite/i); expect(f.store.setupJobs().every(j => j.state === 'failed')).toBe(true);
});
test('installed but unsigned provider is not reported as a failed installation', async () => {
 const f = await fixture(); f.auth.set('codex', false); await f.runtime.start(); f.runtime.setup('agent'); await settled(f);
 expect(f.store.setupJobs()[0]!.state).toBe('succeeded'); expect(f.store.tool('agent').state).toBe('error');
 expect(f.runtime.overview().provider.auth).toBe('sign-in-required');
});
test('concurrent idempotent submissions capture once and dispatch once with immutable provider', async () => {
 const f = await fixture(); await f.runtime.start(); const p = f.store.createProject('First'), key = randomUUID(), gate = deferred();
 f.prepare.mockImplementationOnce(async ({ attempt }) => { await gate.promise; return { planPath: `/fixture/${attempt.id}` }; });
 const a = f.runtime.submitMusic(p.id, key, draft), b = f.runtime.submitMusic(p.id, key, draft);
 await f.runtime.selectProvider('claude'); expect(f.run).not.toHaveBeenCalled(); gate.resolve();
 const [one, two] = await Promise.all([a, b]); expect(one.id).toBe(two.id); expect(one.provider).toBe('codex');
 await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1)); expect(f.prepare).toHaveBeenCalledTimes(1);
 expect(f.run.mock.calls[0]![0].attempt.provider).toBe('codex');
});
test('capture failure is durable and idempotent replay never generates replacement seeds', async () => {
 const f = await fixture(); await f.runtime.start(); const p = f.store.createProject('Failure'), key = randomUUID();
 f.prepare.mockRejectedValueOnce(new Error('FAKE disk full'));
 const a = await f.runtime.submitMusic(p.id, key, draft), b = await f.runtime.submitMusic(p.id, key, draft);
 expect(a.state).toBe('failed'); expect(b.seeds).toEqual(a.seeds); expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.run).not.toHaveBeenCalled();
});
test('project switching and overview polling never cancel or duplicate an in-flight attempt', async () => {
 const f = await fixture(); await f.runtime.start(); const p = f.store.createProject('A'), other = f.store.createProject('B'), gate = deferred();
 f.run.mockImplementationOnce(async ({ attempt }) => { await gate.promise; f.store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE done' }); });
 const a = await f.runtime.submitMusic(p.id, randomUUID(), draft); await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1));
 f.store.selectProject(other.id); for (let i = 0; i < 10; i++) f.runtime.overview();
 expect(f.store.attempt(a.id)?.projectId).toBe(p.id); expect(f.runtime.overview().tools.find(t => t.id === 'agent')?.active).toBe(true);
 expect(f.run).toHaveBeenCalledTimes(1); gate.resolve();
});
test('setup cannot mutate managed generator while a music task runs', async () => {
 const f = await fixture(); await f.runtime.start(); const p = f.store.createProject('A'), gate = deferred();
 f.run.mockImplementationOnce(async ({ attempt }) => { await gate.promise; f.store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE done' }); });
 await f.runtime.submitMusic(p.id, randomUUID(), draft); await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1));
 f.adapter.probe.mockClear(); f.runtime.setup('yue2'); await new Promise(r => setTimeout(r, 30));
 expect(f.adapter.probe).not.toHaveBeenCalled(); expect(f.store.tool('yue2').state).toBe('queued');
 gate.resolve(); await settled(f); expect(f.adapter.probe).toHaveBeenCalledTimes(1);
});
test('startup marks interrupted work reconciling rather than blindly replaying or clearing the lease', async () => {
 const f = await fixture(); const p = f.store.createProject('Interrupted'), a = f.store.submitMusic(p.id, randomUUID(), draft);
 f.store.patchAttempt(a.id, { state: 'running' }); const j = f.store.enqueueSetup('h3'); f.store.patchSetup(j.id, 'running');
 await f.runtime.start(); expect(f.store.attempt(a.id)?.state).toBe('reconciling'); expect(f.store.setupJobs()[0]?.state).toBe('reconciling');
 expect(f.run).not.toHaveBeenCalled(); expect(f.adapter.probe.mock.calls.some(c => c[0] === 'h3')).toBe(false);
 expect(f.runtime.overview().warnings.join(' ')).toMatch(/reconcil/i);
});
test('startup keeps a captured never-dispatched request queued for dispatch, but does not reconstruct missing capture', async () => {
 const f = await fixture(); const p = f.store.createProject('Resume'), a = f.store.submitMusic(p.id, randomUUID(), draft), b = f.store.submitMusic(p.id, randomUUID(), draft);
 f.store.patchAttempt(a.id, { details: { planPath: '/fixture/captured.json' } }); await f.runtime.start();
 await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1)); expect(f.run.mock.calls[0]![0].attempt.id).toBe(a.id);
 expect(f.store.attempt(b.id)?.state).toBe('failed'); expect(f.prepare).not.toHaveBeenCalled();
});
test('held native lease prevents setup and new music dispatch without cancelling existing work', async () => {
 const f = await fixture(); const call = { id: randomUUID(), attemptId: randomUUID(), projectId: randomUUID(), tool: 'yue2' as const, request: {} };
 f.queue.submit(call); const lease = f.queue.claim('other-worker')!;
 await f.runtime.start(); const p = f.store.createProject('Held'); f.runtime.setup('yue2'); await f.runtime.submitMusic(p.id, randomUUID(), draft);
 await new Promise(r => setTimeout(r, 30)); expect(f.run).not.toHaveBeenCalled(); expect(f.adapter.install).not.toHaveBeenCalled();
 expect(f.queue.heldLease()).toEqual(lease); expect(f.queue.get(call.id)?.cancelRequested).toBe(false);
});
test('startup never releases a retained maintenance lease and exposes it as reconciliation', async () => {
 const f = await fixture(); const held = f.queue.acquireMaintenance('yue2')!; await f.runtime.start();
 expect(f.store.tool('yue2').state).toBe('reconciling'); expect(f.adapter.probe.mock.calls.some(c => c[0] === 'yue2')).toBe(false);
 expect(f.queue.acquireMaintenance('yue2')).toBeNull(); f.queue.releaseMaintenance(held);
});
test('close waits for in-flight work, leaves subsequent jobs queued and does not launch again', async () => {
 const f = await fixture(); await f.runtime.start(); const gate = deferred(), p = f.store.createProject('Closing');
 f.run.mockImplementationOnce(async ({ attempt }) => { await gate.promise; f.store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE done' }); });
 await f.runtime.submitMusic(p.id, randomUUID(), draft); await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1));
 const next = await f.runtime.submitMusic(p.id, randomUUID(), draft); let closed = false; const closing = f.runtime.close().then(() => { closed = true; });
 await new Promise(r => setTimeout(r, 20)); expect(closed).toBe(false); gate.resolve(); await closing;
 expect(f.run).toHaveBeenCalledTimes(1); expect(f.store.attempt(next.id)?.state).toBe('queued');
});
test('stale provider auth result cannot overwrite newly selected provider status', async () => {
 const f = await fixture(); await f.runtime.start(); const gate = deferred();
 f.adapter.checkProvider.mockImplementationOnce(async p => { await gate.promise; return f.status(p); });
 const prior = f.runtime.checkProvider(); await f.runtime.selectProvider('claude'); gate.resolve(); await prior;
 expect(f.runtime.overview().provider.provider).toBe('claude'); expect(f.runtime.overview().provider.model).toBe('claude-opus-5-5');
});

test('startup uncertain probe retains maintenance instead of certifying cleanup', async () => {
 const f = await fixture();
 f.adapter.probe.mockImplementation(async id => ({ installed: true, ready: id !== 'comfyui', detail: id === 'comfyui' ? 'Owned setup process cleanup unconfirmed' : 'FAKE ready' }));
 await f.runtime.start(); expect(f.store.tool('comfyui').state).toBe('reconciling');
 expect(f.queue.acquireMaintenance('h3')).toBeNull(); expect(f.adapter.install).not.toHaveBeenCalled();
});
test('queued setup uncertain probe never escalates to installation and retains maintenance', async () => {
 const f = await fixture(); await f.runtime.start();
 f.adapter.probe.mockResolvedValueOnce({ installed: true, ready: false, detail: 'Owned setup process cleanup could not be confirmed' });
 f.runtime.setup('yue2'); await settled(f);
 expect(f.adapter.install).not.toHaveBeenCalled(); expect(f.store.tool('yue2').state).toBe('reconciling');
 expect(f.store.setupJobs()[0]?.state).toBe('reconciling'); expect(f.queue.acquireMaintenance('yue2')).toBeNull();
});
test('shutdown during auth readiness never launches the not-yet-dispatched provider and retains queued input', async () => {
 const f = await fixture(); await f.runtime.start(); const gate = deferred(), p = f.store.createProject('Closing before dispatch');
 f.adapter.checkProvider.mockImplementationOnce(async provider => { await gate.promise; return f.status(provider); });
 const attempt = await f.runtime.submitMusic(p.id, randomUUID(), draft);
 await vi.waitFor(() => expect(f.store.attempt(attempt.id)?.state).toBe('preparing'));
 const closing = f.runtime.close(); gate.resolve(); await closing; expect(f.adapter.close).toHaveBeenCalledOnce();
 expect(f.run).not.toHaveBeenCalled(); expect(f.store.attempt(attempt.id)?.state).toBe('queued');
});
test('shutdown during setup readiness never launches a later installer and leaves setup queued', async () => {
 const f = await fixture(); await f.runtime.start(); const gate = deferred();
 f.adapter.probe.mockImplementationOnce(async () => { await gate.promise; return { installed: false, ready: false, detail: 'FAKE missing' }; });
 f.runtime.setup('yue2'); await vi.waitFor(() => expect(f.store.setupJobs()[0]?.state).toBe('running'));
 const closing = f.runtime.close(); gate.resolve(); await closing;
 expect(f.adapter.install).not.toHaveBeenCalled(); expect(f.store.setupJobs()[0]?.state).toBe('queued');
 expect(f.store.tool('yue2').state).toBe('queued');
 const lease = f.queue.acquireMaintenance('yue2'); expect(lease).not.toBeNull(); if (lease) f.queue.releaseMaintenance(lease);
});
test('reconciling creative work blocks setup mutations as well as new music', async () => {
 const f = await fixture(), p = f.store.createProject('Unknown provider'), attempt = f.store.submitMusic(p.id, randomUUID(), draft);
 f.store.patchAttempt(attempt.id, { state: 'running' }); await f.runtime.start(); f.adapter.probe.mockClear();
 f.runtime.setup('yue2'); await new Promise(r => setTimeout(r, 30));
 expect(f.adapter.probe).not.toHaveBeenCalled(); expect(f.adapter.install).not.toHaveBeenCalled(); expect(f.store.setupJobs()[0]?.state).toBe('queued');
});
test('older checks of the same provider cannot overwrite a newer auth observation', async () => {
 const f = await fixture(); await f.runtime.start(); const gate = deferred();
 f.adapter.checkProvider.mockImplementationOnce(async provider => { await gate.promise; return { ...f.status(provider), auth: 'sign-in-required' }; });
 const earlier = f.runtime.checkProvider(); await f.runtime.checkProvider(); gate.resolve(); await earlier;
 expect(f.runtime.overview().provider.auth).toBe('signed-in'); expect(f.store.tool('agent').state).toBe('ready');
});
test('overview makes the bounded native timeout visible to the operator', async () => {
 const f = await fixture(); expect(f.runtime.overview().warnings.join(' ')).toMatch(/3600.*second/i);
});

test('runtime close forwards an already-owned abort signal to in-flight music work', async () => {
 const f = await fixture(); await f.runtime.start(); const p = f.store.createProject('Signal'), started = deferred();
 let signal: AbortSignal | undefined;
 f.run.mockImplementationOnce(async options => {
  signal = (options as { signal?: AbortSignal }).signal; started.resolve();
  if (signal && !signal.aborted) await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true }));
  f.store.patchAttempt(options.attempt.id, { state: 'failed', stage: 'FAKE interrupted run' });
 });
 await f.runtime.submitMusic(p.id, randomUUID(), draft); await started.promise; await f.runtime.close();
 expect(signal).toBeInstanceOf(AbortSignal); expect(signal?.aborted).toBe(true);
});
test('close waits for an accepted external provider check before databases may close', async () => {
 const f = await fixture(); await f.runtime.start(); const gate = deferred();
 f.adapter.checkProvider.mockImplementationOnce(async provider => { await gate.promise; return f.status(provider); });
 const check = f.runtime.checkProvider(); let closed = false; const close = f.runtime.close().then(() => { closed = true; });
 await new Promise(r => setTimeout(r, 10)); const beforeRelease = closed; gate.resolve(); await Promise.all([check, close]);
 expect(beforeRelease).toBe(false); expect(closed).toBe(true);
});
test('configured native timeout is shown instead of the default', async () => {
 const f = await fixture(1800); expect(f.runtime.overview().warnings.join(' ')).toMatch(/1800.*second/i);
});
test('server runtime imports under the actual Node strip-only execution path', async () => {
 const url = new URL('../../apps/server/src/studio/runtime.ts', import.meta.url).href;
 const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); process.stdout.write('runtime-imported')`], { timeout: 10_000 });
 expect(result.stdout).toBe('runtime-imported');
});

test('startup converts persisted pending analysis to interrupted failure without touching the successful song or rerunning tools',async()=>{
 const f=await fixture();const p=f.store.createProject('Interrupted analysis'),other=f.store.createProject('Completed analysis');
 const pending={state:'pending' as const,estimatedBpm:null,sampleIndices:[],waveformBucketSamples:0,peaks:[],error:null,version:null};
 const complete={state:'available' as const,estimatedBpm:120,sampleIndices:['0','24000'],waveformBucketSamples:48000,peaks:[1.2,0.4],error:null,version:'fixture-analysis'};
 const create=(projectId:string,analysis:typeof pending|typeof complete)=>{
  const attempt=f.store.submitMusic(projectId,randomUUID(),draft);return f.store.finishMusic(attempt.id,{title:'Retained source',assetId:randomUUID(),assetPath:`/fixture/managed/${randomUUID()}.wav`,sha256:'a'.repeat(64),sampleCount:'96000',sampleRate:48000,channels:2,durationSeconds:2,truncated:false,analysis},{});
 };
 const interrupted=create(p.id,pending),finished=create(other.id,complete),asset=f.store.asset(interrupted.assetId);
 f.store.patchTool('analysis',{active:true});await f.runtime.start();
 const restored=f.store.project(p.id).songs[0]!;expect(restored.analysis.state).toBe('failed');expect(restored.analysis.error).toMatch(/interrupted.*restart/i);
 expect({...restored,analysis:pending}).toEqual(interrupted);expect(f.store.asset(interrupted.assetId)).toEqual(asset);expect(f.store.attempt(interrupted.attemptId)?.state).toBe('succeeded');expect(f.store.project(p.id).project.selectedSongId).toBe(interrupted.id);
 expect(f.store.project(other.id).songs[0]).toEqual(finished);expect(f.runtime.overview().tools.find(t=>t.id==='analysis')?.active).toBe(false);expect(f.run).not.toHaveBeenCalled();expect(f.adapter.install).not.toHaveBeenCalled();
 // Repeated start/polling is not another startup and cannot interrupt new analysis.
 const newlyPending=create(p.id,pending);await f.runtime.start();expect(f.store.project(p.id).songs.find(s=>s.id===newlyPending.id)?.analysis.state).toBe('pending');
});
