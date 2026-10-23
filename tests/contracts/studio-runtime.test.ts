/** Real SQLite scheduling, injected setup/provider functions. No models or services. */
import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { createStudioRuntime } from '../../apps/server/src/studio/runtime.ts';
import { prepareMusicTask } from '../../apps/server/src/studio/music.ts';
import { providerModels } from '../../apps/server/src/providers/launch.ts';
import type { RenderOptions } from '../../apps/server/src/studio/render-contract.ts';
import type { MusicAttempt, VideoAttempt, Provider, ProviderStatus, ToolId } from '../../packages/core/src/contracts/studio.ts';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
const draft = { musicPrompt: 'Synthetic scheduler fixture', lyrics: '' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(nativeRuntimeLimitSeconds = 3600, source?: string) {
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
 const prepare = vi.fn(async ({ attempt }: Parameters<typeof prepareMusicTask>[0]) => ({ planPath: join(root, attempt.id, 'captured-task.json') }));
 const run = vi.fn(async ({ attempt }: { attempt: MusicAttempt }) => { store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE run ended without media', error: 'FAKE test outcome' }); });
 const prepareVideo = vi.fn(async ({ attempt }: { attempt: VideoAttempt }) => ({ planPath: join(root, attempt.id, 'captured-task.json') }));
 const runVideo = vi.fn(async ({ attempt }: { attempt: VideoAttempt }) => { store.patchVideoAttempt(attempt.id, { state: 'failed', stage: 'FAKE video ended without media', error: 'FAKE outcome' }); });
 const render = vi.fn(async (o:RenderOptions) => { const outputPath=join(root,'projects',o.plan.projectId,'renders',o.renderId,'video.mp4'); await mkdir(join(outputPath,'..'),{recursive:true}); await writeFile(outputPath,'FAKE RENDER'); return {outputPath,sha256:createHash('sha256').update('FAKE RENDER').digest('hex'),bytes:11,frameCount:48,sampleCount:'96000',receiptPath:join(root,'receipt.json'),planHash:'c'.repeat(64)}; });
 const runtime = createStudioRuntime({ store, queue, runtime: root, source: source ?? root, origin: 'http://127.0.0.1:9122', setupAdapter: adapter, prepareMusic: prepare, runMusic: run, prepareVideo, runVideo, runRender: render, pollMs: 10, nativeRuntimeLimitSeconds });
 cleanup.push(() => runtime.close());
 return { root, runtime, store, queue, adapter, prepare, run, prepareVideo, runVideo, render, installed, auth, status };
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
test('startup cannot project the previous provider readiness onto the newly selected provider tool', async () => {
 const f = await fixture(), gate = deferred(); cleanup.push(async () => { gate.resolve(); });
 f.adapter.checkProvider.mockImplementationOnce(async provider => { await gate.promise; return { ...f.status(provider), installed: false, auth: 'unknown', detail: 'Old Codex observation: not installed' }; });
 f.adapter.checkProvider.mockImplementation(async provider => ({ ...f.status(provider), detail: 'Selected Claude observation: signed in' }));
 const starting = f.runtime.start(); await vi.waitFor(() => expect(f.adapter.checkProvider).toHaveBeenCalledTimes(1));
 await f.runtime.selectProvider('claude');
 expect(f.store.tool('agent')).toMatchObject({ installed: true, state: 'ready', detail: 'Selected Claude observation: signed in' });
 gate.resolve(); await starting;
 expect(f.runtime.overview().provider).toMatchObject({ provider: 'claude', auth: 'signed-in', detail: 'Selected Claude observation: signed in' });
 expect(f.store.tool('agent')).toMatchObject({ installed: true, state: 'ready', detail: 'Selected Claude observation: signed in' });
 expect(f.adapter.install).not.toHaveBeenCalled();
});
test('startup cannot reapply an older auth result after a newer check of the same provider', async () => {
 const f = await fixture(), gate = deferred(); cleanup.push(async () => { gate.resolve(); });
 f.adapter.checkProvider.mockImplementationOnce(async provider => { await gate.promise; return { ...f.status(provider), auth: 'sign-in-required', detail: 'Old Codex observation: sign in' }; });
 f.adapter.checkProvider.mockImplementation(async provider => ({ ...f.status(provider), detail: 'Latest Codex observation: signed in' }));
 const starting = f.runtime.start(); await vi.waitFor(() => expect(f.adapter.checkProvider).toHaveBeenCalledTimes(1));
 await f.runtime.checkProvider(); gate.resolve(); await starting;
 expect(f.runtime.overview().provider).toMatchObject({ provider: 'codex', auth: 'signed-in', detail: 'Latest Codex observation: signed in' });
 expect(f.store.tool('agent')).toMatchObject({ installed: true, state: 'ready', detail: 'Latest Codex observation: signed in' });
});
test.each(['claude', 'codex'] as const)('agent setup completion uses the latest %s observation instead of its older final auth result', async provider => {
 const f = await fixture(), gate = deferred(); cleanup.push(async () => { gate.resolve(); }); await f.runtime.start();
 f.adapter.checkProvider.mockClear();
 f.adapter.checkProvider.mockImplementationOnce(async p => f.status(p));
 f.adapter.checkProvider.mockImplementationOnce(async p => { await gate.promise; return { ...f.status(p), installed: false, auth: 'unknown', detail: 'Obsolete final setup observation: missing CLI' }; });
 f.adapter.checkProvider.mockImplementation(async p => ({ ...f.status(p), detail: `Latest ${p} observation: signed in` }));
 f.runtime.setup('agent'); await vi.waitFor(() => expect(f.adapter.checkProvider).toHaveBeenCalledTimes(2));
 if (provider === 'claude') await f.runtime.selectProvider(provider); else await f.runtime.checkProvider();
 expect(f.store.tool('agent').state).toBe('installing');
 gate.resolve(); await settled(f);
 expect(f.store.setupJobs()[0]?.state).toBe('succeeded');
 expect(f.runtime.overview().provider).toMatchObject({ provider, installed: true, auth: 'signed-in', detail: `Latest ${provider} observation: signed in` });
 expect(f.store.tool('agent')).toMatchObject({ installed: true, state: 'ready', active: false, detail: `Latest ${provider} observation: signed in` });
 expect(f.adapter.install).not.toHaveBeenCalled();
});
test('agent setup waits for a newly selected provider check rather than claiming readiness from the old provider', async () => {
 const f = await fixture(), oldGate = deferred(), selectedGate = deferred();
 cleanup.push(async () => { oldGate.resolve(); selectedGate.resolve(); }); await f.runtime.start();
 f.adapter.checkProvider.mockClear();
 f.adapter.checkProvider.mockImplementationOnce(async p => f.status(p));
 f.adapter.checkProvider.mockImplementationOnce(async p => { await oldGate.promise; return { ...f.status(p), detail: 'Old Codex ready' }; });
 f.adapter.checkProvider.mockImplementationOnce(async p => { await selectedGate.promise; return { ...f.status(p), auth: 'sign-in-required', detail: 'Selected Claude needs sign-in' }; });
 f.runtime.setup('agent'); await vi.waitFor(() => expect(f.adapter.checkProvider).toHaveBeenCalledTimes(2));
 const selecting = f.runtime.selectProvider('claude'); oldGate.resolve();
 await new Promise(resolve => setTimeout(resolve, 30));
 expect(f.store.setupJobs()[0]?.state).toBe('running'); expect(f.store.tool('agent')).toMatchObject({ state: 'installing', active: true });
 selectedGate.resolve(); await selecting; await settled(f);
 expect(f.store.setupJobs()[0]?.state).toBe('succeeded');
 expect(f.store.tool('agent')).toMatchObject({ installed: true, state: 'error', active: false, detail: 'Selected Claude needs sign-in' });
 expect(f.runtime.overview().provider).toMatchObject({ provider: 'claude', auth: 'sign-in-required' });
});
test('shutdown during the final agent setup check defers verification without launching another check', async () => {
 const f = await fixture(), gate = deferred(); cleanup.push(async () => { gate.resolve(); }); await f.runtime.start();
 f.adapter.checkProvider.mockClear();
 f.adapter.checkProvider.mockImplementationOnce(async p => f.status(p));
 f.adapter.checkProvider.mockImplementationOnce(async p => { await gate.promise; return f.status(p); });
 f.runtime.setup('agent'); await vi.waitFor(() => expect(f.adapter.checkProvider).toHaveBeenCalledTimes(2));
 const closing = f.runtime.close(); gate.resolve(); await closing;
 expect(f.store.setupJobs()[0]?.state).toBe('queued'); expect(f.store.tool('agent')).toMatchObject({ state: 'queued', active: false });
 expect(f.adapter.checkProvider).toHaveBeenCalledTimes(2); expect(f.adapter.install).not.toHaveBeenCalled(); expect(f.adapter.close).toHaveBeenCalledOnce();
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

function fixtureSong(f:Awaited<ReturnType<typeof fixture>>,projectId:string){
 const a=f.store.submitMusic(projectId,randomUUID(),draft);f.store.patchAttempt(a.id,{state:'running'});
 return f.store.finishMusic(a.id,{title:'Fixture song',assetId:randomUUID(),assetPath:`/fixture/${projectId}/${a.id}.wav`,sha256:'a'.repeat(64),sampleCount:'96000',sampleRate:48000,channels:2,durationSeconds:2,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000','48000','72000'],waveformBucketSamples:512,peaks:[0.1],error:null,version:'fixture'}},{});
}
test('video capture deduplicates, retains captured song/style/provider, and dispatches via separate video adapter',async()=>{
 const f=await fixture();await f.runtime.start();const p=f.store.createProject('Video'),song=fixtureSong(f,p.id),key=randomUUID(),input={songId:song.id,style:'Cyan industrial',clipPrompt:'Dancing robot',startFrame:0,endFrame:48};
 const [a,b]=await Promise.all([f.runtime.submitVideo(p.id,key,input),f.runtime.submitVideo(p.id,key,input)]);await f.runtime.selectProvider('claude');
 await vi.waitFor(()=>expect(f.runVideo).toHaveBeenCalledTimes(1));expect(a.id).toBe(b.id);expect(f.prepareVideo).toHaveBeenCalledTimes(1);expect(f.run).not.toHaveBeenCalled();expect(f.runVideo.mock.calls[0]![0].attempt.input).toEqual(input);expect(f.runVideo.mock.calls[0]![0].attempt.provider).toBe('codex');
});
test('video readiness failure does not dispatch and preserves failed placeholder instead of reinterpreting music',async()=>{
 const f=await fixture();f.installed.delete('h3');await f.runtime.start();const p=f.store.createProject('Video'),song=fixtureSong(f,p.id),a=await f.runtime.submitVideo(p.id,randomUUID(),{songId:song.id,style:'',clipPrompt:'Scene',startFrame:0,endFrame:48});
 await vi.waitFor(()=>expect(f.store.videoAttempt(a.id)?.state).toBe('failed'));expect(f.runVideo).not.toHaveBeenCalled();expect(f.run).not.toHaveBeenCalled();
});
test('music and video share original acceptance order across projects',async()=>{
 const f=await fixture();const p=f.store.createProject('Sequence'),song=fixtureSong(f,p.id);
 const video=await f.runtime.submitVideo(p.id,randomUUID(),{songId:song.id,style:'',clipPrompt:'First',startFrame:0,endFrame:48}),music=await f.runtime.submitMusic(p.id,randomUUID(),draft);await f.runtime.start();
 await vi.waitFor(()=>expect(f.run).toHaveBeenCalledTimes(1));expect(f.runVideo).toHaveBeenCalledTimes(1);expect(f.runVideo.mock.invocationCallOrder[0]).toBeLessThan(f.run.mock.invocationCallOrder[0]!);expect(video.sequence).toBeLessThan(music.sequence);
});
test('an earlier accepted video still capturing cannot be overtaken by later music from another project/provider',async()=>{
 const f=await fixture(),firstProject=f.store.createProject('Capture first'),song=fixtureSong(f,firstProject.id),secondProject=f.store.createProject('Capture second'),gate=deferred();
 cleanup.push(async()=>{gate.resolve();});await f.runtime.start();
 f.prepareVideo.mockImplementationOnce(async({attempt})=>{await gate.promise;return{planPath:`/fixture/${attempt.id}/captured-task.json`};});
 const input={songId:song.id,style:'Original visual direction',clipPrompt:'Original first shot',startFrame:0,endFrame:48};
 const firstPromise=f.runtime.submitVideo(firstProject.id,randomUUID(),input);
 await vi.waitFor(()=>expect(f.prepareVideo).toHaveBeenCalledTimes(1));
 f.store.selectProject(secondProject.id);await f.runtime.selectProvider('claude');
 const second=await f.runtime.submitMusic(secondProject.id,randomUUID(),draft);
 await new Promise(r=>setTimeout(r,40));
 expect(f.runVideo).not.toHaveBeenCalled();expect(f.run).not.toHaveBeenCalled();
 expect(f.store.attempt(second.id)?.state).toBe('queued');
 gate.resolve();const first=await firstPromise;
 await vi.waitFor(()=>expect(f.run).toHaveBeenCalledTimes(1));expect(f.runVideo).toHaveBeenCalledTimes(1);
 expect(first.sequence).toBeLessThan(second.sequence);expect(f.runVideo.mock.invocationCallOrder[0]).toBeLessThan(f.run.mock.invocationCallOrder[0]!);
 expect(f.runVideo.mock.calls[0]![0].attempt).toMatchObject({id:first.id,projectId:firstProject.id,provider:'codex',input});
 expect(f.run.mock.calls[0]![0].attempt).toMatchObject({id:second.id,projectId:secondProject.id,provider:'claude'});
 expect(f.prepareVideo).toHaveBeenCalledTimes(1);expect(f.prepare).toHaveBeenCalledTimes(1);
});
test('failed earlier capture releases FIFO for the next request without dispatching or recapturing the failed one',async()=>{
 const f=await fixture(),p=f.store.createProject('Capture failure'),gate=deferred();
 cleanup.push(async()=>{gate.resolve();});await f.runtime.start();
 f.prepare.mockImplementationOnce(async()=>{await gate.promise;throw new Error('FAKE first capture failed');});
 const key=randomUUID(),firstPromise=f.runtime.submitMusic(p.id,key,draft);
 await vi.waitFor(()=>expect(f.prepare).toHaveBeenCalledTimes(1));
 const second=await f.runtime.submitMusic(p.id,randomUUID(),{...draft,musicPrompt:'Later request'});
 await new Promise(r=>setTimeout(r,40));expect(f.run).not.toHaveBeenCalled();
 gate.resolve();const first=await firstPromise;
 await vi.waitFor(()=>expect(f.run).toHaveBeenCalledTimes(1));expect(f.run.mock.calls[0]![0].attempt.id).toBe(second.id);
 expect(first.state).toBe('failed');expect((await f.runtime.submitMusic(p.id,key,draft)).seeds).toEqual(first.seeds);
 expect(f.prepare).toHaveBeenCalledTimes(2);expect(f.run.mock.calls.some(([o])=>o.attempt.id===first.id)).toBe(false);
});
test('running and queued work retain cross-project provider context, aggregate counts and captured workspaces through database reopen', async () => {
 // Real task capture and SQLite persistence; executors are bounded, explicit
 // fixtures. No provider CLI, native generator or user runtime is contacted.
 const source = process.cwd(), f = await fixture(3600, source), gate = deferred();
 cleanup.push(async () => { gate.resolve(); }); f.prepare.mockImplementation(prepareMusicTask);
 const a = f.store.createProject('Original Codex project'), b = f.store.createProject('Later Claude project');
 f.run.mockImplementationOnce(async ({ attempt }) => {
  f.store.patchAttempt(attempt.id, { state: 'running', stage: 'FAKE owned native work' });
  f.queue.submit({ id: attempt.nativeCallId, attemptId: attempt.id, projectId: attempt.projectId, tool: 'yue2', request: { fixture: true, seeds: attempt.seeds } });
  const lease = f.queue.claim('fixture-worker')!;
  f.queue.prepareLaunch(lease, { fixtureCommand: true }); f.queue.acknowledgeLaunch(lease, { fixtureOwner: true });
  await gate.promise;
  f.queue.finish(lease, 'failed', { fixtureEnded: true }, { fixtureReleased: true });
  f.store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE stopped cleanly before restart' });
 });
 await f.runtime.start();
 const first = await f.runtime.submitMusic(a.id, randomUUID(), { musicPrompt: 'First exact Codex brief', lyrics: 'First words' });
 await vi.waitFor(() => expect(f.store.attempt(first.id)?.state).toBe('running'));
 await f.runtime.selectProvider('claude'); f.store.selectProject(b.id);
 const second = await f.runtime.submitMusic(b.id, randomUUID(), { musicPrompt: 'Second exact Claude brief', lyrics: 'Second words' });
 await f.runtime.selectProvider('codex');
 const third = await f.runtime.submitMusic(a.id, randomUUID(), { musicPrompt: 'Third exact Codex brief', lyrics: 'Third words' });
 const draft = f.store.project(b.id).project;
 f.store.saveDraft(b.id, draft.revision, { musicPrompt: 'Changed after acceptance', lyrics: 'Not submitted', style: 'Visual only' });
 const accepted = [first, second, third], originals = await Promise.all(accepted.map(attempt => readFile(String(attempt.details.planPath), 'utf8')));
 const plans = originals.map(text => JSON.parse(text));
 for (const [index, attempt] of accepted.entries()) {
  const plan = plans[index], workspace = join(f.root, 'projects', attempt.projectId, 'workspace');
  expect(attempt.details.planPath).toBe(join(f.root, 'projects', attempt.projectId, 'inputs', attempt.id, 'captured-task.json'));
  expect(plan.attempt).toMatchObject({ id: attempt.id, nativeCallId: attempt.nativeCallId, projectId: attempt.projectId, input: attempt.input, seeds: attempt.seeds, provider: attempt.provider, model: attempt.model });
  expect(plan.launch.cwd).toBe(workspace); expect(plan.launch.runDirectory).toBe(join(workspace, 'runs', attempt.id));
  expect(plan.launch.stdin).toContain(attempt.input.musicPrompt); expect(plan.launch.stdin).toContain(attempt.input.lyrics);
  expect(plan.launch.argv[plan.launch.argv.indexOf('--model') + 1]).toBe(attempt.model);
  await expect(stat(plan.launch.runDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
 }
 expect(plans[0].launch.cwd).toBe(plans[2].launch.cwd); expect(plans[1].launch.cwd).not.toBe(plans[0].launch.cwd);
 expect(new Set(plans.map(plan => plan.launch.runDirectory)).size).toBe(3);
 const overview = f.runtime.overview();
 expect(overview.selectedProjectId).toBe(b.id); expect(overview.provider.provider).toBe('codex');
 expect(overview.tools.find(t => t.id === 'agent')).toMatchObject({ active: true, queued: 2 });
 expect(overview.tools.find(t => t.id === 'yue2')).toMatchObject({ active: true, queued: 0 });
 expect(overview.projects.map(p => [p.id, p.activeAttempts])).toEqual([[a.id, 2], [b.id, 1]]);
 expect(f.run).toHaveBeenCalledTimes(1); expect(f.prepare).toHaveBeenCalledTimes(3);
 // Stop dispatch before releasing the fixture. The two never-dispatched plans
 // remain queued; the stopped fixture is terminal and cannot be replayed.
 const closing = f.runtime.close(); gate.resolve(); await closing;
 expect(f.store.attempt(second.id)?.state).toBe('queued'); expect(f.store.attempt(third.id)?.state).toBe('queued');
 expect(f.queue.heldLease()).toBeNull(); f.store.close(); f.queue.close();
 const store = openStudioStore(join(f.root, 'studio.sqlite')), queue = openGpuQueue(join(f.root, 'gpu.sqlite'));
 cleanup.push(async () => { store.close(); queue.close(); });
 const capturedAgain = vi.fn(prepareMusicTask), seen: MusicAttempt[] = [];
 const reopened = createStudioRuntime({ store, queue, runtime: f.root, source, origin: 'http://127.0.0.1:9122', setupAdapter: f.adapter, prepareMusic: capturedAgain,
  runMusic: async ({ attempt }) => {
   seen.push(structuredClone(attempt));
   store.patchAttempt(attempt.id, { state: 'failed', stage: 'FAKE recorded dispatch only' });
  }, pollMs: 10 });
 cleanup.push(() => reopened.close()); f.adapter.checkProvider.mockClear();
 expect(reopened.overview().tools.find(t => t.id === 'agent')).toMatchObject({ active: false, queued: 2 });
 await reopened.start(); await vi.waitFor(() => expect(seen).toHaveLength(2));
 expect(seen.map(attempt => attempt.id)).toEqual([second.id, third.id]);
 expect(f.adapter.checkProvider.mock.calls.map(([provider]) => provider)).toEqual(['codex', 'claude', 'codex']);
 for (const [index, attempt] of seen.entries()) {
  const original = accepted[index + 1]!;
  expect(attempt).toMatchObject({ id: original.id, projectId: original.projectId, nativeCallId: original.nativeCallId,
   provider: original.provider, model: original.model, input: original.input, seeds: original.seeds, details: original.details });
 }
 expect(capturedAgain).not.toHaveBeenCalled(); expect(f.prepare).toHaveBeenCalledTimes(3);
 expect(await Promise.all(accepted.map(attempt => readFile(String(attempt.details.planPath), 'utf8')))).toEqual(originals);
 expect(reopened.overview().tools.find(t => t.id === 'agent')).toMatchObject({ active: false, queued: 0 });
 expect(reopened.overview().tools.find(t => t.id === 'yue2')).toMatchObject({ active: false, queued: 0 });
 expect(store.selectedProject()).toBe(b.id); expect(store.project(a.id).attempts.map(attempt => attempt.id)).toEqual([first.id, third.id]);
 expect(store.project(b.id).attempts.map(attempt => attempt.id)).toEqual([second.id]);
});
test('render is revision-bound, idempotent, and completes through the CPU renderer',async()=>{
 const f=await fixture();await f.runtime.start();const p=f.store.createProject('Render'),song=fixtureSong(f,p.id),key=randomUUID(),revision=f.store.arrangement(p.id,song.id).revision;
 const a=await f.runtime.render(p.id,song.id,revision,key),b=await f.runtime.render(p.id,song.id,revision,key);expect(a.id).toBe(b.id);
 await vi.waitFor(()=>expect(f.store.render(a.id)?.state).toBe('succeeded'));expect(f.render).toHaveBeenCalledTimes(1);expect(f.render.mock.calls[0]![0].plan.song.sha256).toBe(song.sha256);expect(f.render.mock.calls[0]![0].plan.revision).toBe(revision);expect(f.store.render(a.id)?.assetId).toBeTruthy();
});

test('CPU preview starts while native video remains active, with one render worker and awaited shutdown',async()=>{
 const f=await fixture();await f.runtime.start();const p=f.store.createProject('Parallel'),song=fixtureSong(f,p.id),videoGate=deferred(),renderGate=deferred();
 f.runVideo.mockImplementationOnce(async({attempt})=>{f.store.patchVideoAttempt(attempt.id,{state:'running'});await videoGate.promise;f.store.patchVideoAttempt(attempt.id,{state:'failed'});});
 cleanup.push(async()=>{videoGate.resolve();renderGate.resolve();});
 const render=f.render.getMockImplementation()!;f.render.mockImplementationOnce(async(o)=>{await renderGate.promise;return render(o);});
 await f.runtime.submitVideo(p.id,randomUUID(),{songId:song.id,clipPrompt:'Long generation',style:'',startFrame:0,endFrame:48});await vi.waitFor(()=>expect(f.runVideo).toHaveBeenCalledTimes(1));
 const r=await f.runtime.render(p.id,song.id,0,randomUUID());await vi.waitFor(()=>expect(f.render).toHaveBeenCalledTimes(1));
 await f.runtime.render(p.id,song.id,0,randomUUID());await new Promise(r=>setTimeout(r,30));expect(f.render).toHaveBeenCalledTimes(1);expect(f.store.render(r.id)?.state).toBe('running');
 let closed=false;const closing=f.runtime.close().then(()=>{closed=true;});await new Promise(r=>setTimeout(r,10));expect(closed).toBe(false);renderGate.resolve();videoGate.resolve();await closing;expect(closed).toBe(true);
});
test('bad cached output is invalidated before a new render key, not returned as fresh success',async()=>{
 const f=await fixture();await f.runtime.start();const p=f.store.createProject('Cache'),song=fixtureSong(f,p.id),key=randomUUID();
 const r=await f.runtime.render(p.id,song.id,0,key);await vi.waitFor(()=>expect(f.store.render(r.id)?.state).toBe('succeeded'));const good=await f.runtime.render(p.id,song.id,0,randomUUID());expect(good.id).toBe(r.id);
 const saved=f.store.render(r.id)!;await writeFile(f.store.asset(saved.assetId!)!.path,'CORRUPTED CACHE');
 await expect(f.runtime.render(p.id,song.id,0,key)).rejects.toMatchObject({code:'STUDIO_RENDER_UNAVAILABLE'});
 const replacement=await f.runtime.render(p.id,song.id,0,randomUUID());expect(replacement.id).not.toBe(r.id);expect(f.store.render(r.id)?.state).toBe('succeeded');
});
test('global warning exposes a reconciling render even when its project is not selected',async()=>{
 const f=await fixture();const p=f.store.createProject('Interrupted render'),song=fixtureSong(f,p.id),r=f.store.enqueueRender(p.id,song.id,0,randomUUID());f.store.patchRender(r.id,{state:'reconciling',error:'Owned CPU cleanup unconfirmed'});f.store.createProject('Elsewhere');
 expect(f.runtime.overview().warnings.join(' ')).toMatch(/Interrupted work requires reconciliation/);
 await f.runtime.start();await new Promise(r=>setTimeout(r,30));expect(f.render).not.toHaveBeenCalled();
});
test('ComfyUI status mirrors the actual H3 native lane without counting pre-agent requests twice',async()=>{
 const f=await fixture();await f.runtime.start();const projectId=randomUUID();
 const one=f.queue.submit({id:randomUUID(),attemptId:randomUUID(),projectId,tool:'h3',request:{}}),two=f.queue.submit({id:randomUUID(),attemptId:randomUUID(),projectId,tool:'h3',request:{}});
 const tools=()=>Object.fromEntries(f.runtime.overview().tools.map(t=>[t.id,t]));
 expect(tools().comfyui).toMatchObject({active:false,queued:2});expect(tools().h3).toMatchObject({active:false,queued:2});expect(tools().yue2).toMatchObject({active:false,queued:0});
 const lease=f.queue.claim('fixture-owned-worker')!;expect(lease.callId).toBe(one.id);
 expect(tools().comfyui).toMatchObject({active:true,queued:1});expect(tools().h3).toMatchObject({active:true,queued:1});expect(tools().agent?.queued).toBe(0);
 f.queue.cancelAttempt(two.attemptId);expect(tools().comfyui?.queued).toBe(0);
 f.queue.prepareLaunch(lease,{fixtureCommand:true});f.queue.acknowledgeLaunch(lease,{fixtureOwner:true});f.queue.finish(lease,'succeeded',{fixture:true},{fixtureReleased:true});expect(tools().comfyui).toMatchObject({active:false,queued:0});
});

function fixtureClipWithAudio(f:Awaited<ReturnType<typeof fixture>>,projectId:string,songId:string){
 const attempt=f.store.submitVideo(projectId,randomUUID(),{songId,clipPrompt:'Synthetic audio binding',style:'',startFrame:0,endFrame:4});
 const asset=(extension:string)=>({assetId:randomUUID(),path:join(f.root,'projects',projectId,'media',`${randomUUID()}.${extension}`),sha256:'b'.repeat(64)});
 const audio={...asset('flac'),sampleRate:32000,channels:2,sampleCount:'6400'};
 const clip=f.store.finishVideo(attempt.id,{title:'Synthetic clip',video:asset('mp4'),audio,frameCount:4,width:640,height:480,fps:'24/1',frames:Array.from({length:4},(_,index)=>({...asset('png'),index,pixelSha256:'c'.repeat(64),bytes:100}))},{});
 return{clip,audio};
}
test('render binds enabled audio from the captured clip and keeps queued choice despite later edits',async()=>{
 const f=await fixture(),p=f.store.createProject('Captured clip audio'),song=fixtureSong(f,p.id),{clip,audio}=fixtureClipWithAudio(f,p.id,song.id);
 const context=f.store.project(p.id).editContexts.find(c=>c.clipId===clip.id)!;
 const enabled=f.store.editClipContext(p.id,context.id,context.revision,1,{audioSource:'clip'});
 const captured=await f.runtime.render(p.id,song.id,enabled.arrangement.revision,randomUUID());
 f.store.editClipContext(p.id,context.id,enabled.context.revision,enabled.arrangement.revision,{audioSource:'song'});
 await f.runtime.start();await vi.waitFor(()=>expect(f.store.render(captured.id)?.state).toBe('succeeded'));
 expect(f.render.mock.calls[0]![0].plan.placements[0]).toMatchObject({clipId:clip.id,audioSource:'clip',audio:{path:audio.path,sha256:audio.sha256},sourceStartFrame:0});
 const current=f.store.arrangement(p.id,song.id);const next=await f.runtime.render(p.id,song.id,current.revision,randomUUID());
 await vi.waitFor(()=>expect(f.store.render(next.id)?.state).toBe('succeeded'));
 expect(f.render.mock.calls[1]![0].plan.placements[0]?.audioSource).toBe('song');expect(f.render.mock.calls[1]![0].plan.placements[0]?.audio).toBeUndefined();
});
test.each(['wrong project','wrong media type','missing'] as const)('render refuses %s registered enabled clip audio rather than passing an unrelated source',async defect=>{
 const f=await fixture(),p=f.store.createProject('Bad audio binding'),song=fixtureSong(f,p.id),{clip}=fixtureClipWithAudio(f,p.id,song.id),context=f.store.project(p.id).editContexts.find(c=>c.clipId===clip.id)!;
 const enabled=f.store.editClipContext(p.id,context.id,context.revision,1,{audioSource:'clip'}),original=f.store.asset.bind(f.store);
 vi.spyOn(f.store,'asset').mockImplementation(id=>{
  const asset=original(id);if(id!==clip.audioAssetId)return asset;
  return defect==='missing'?null:defect==='wrong project'?{...asset!,projectId:randomUUID()}:{...asset!,mediaType:'video/mp4'};
 });
 const render=await f.runtime.render(p.id,song.id,enabled.arrangement.revision,randomUUID());await f.runtime.start();
 await vi.waitFor(()=>expect(f.store.render(render.id)?.state).toBe('failed'));expect(f.render).not.toHaveBeenCalled();expect(f.store.render(render.id)?.error).toMatch(/audio/i);
});

test('render cache validation reserves source use before async reads and releases after result',async()=>{
 const f=await fixture(),p=f.store.createProject('Cache barrier'),song=fixtureSong(f,p.id);
 const old=f.store.enqueueRender(p.id,song.id,0,randomUUID()),path=join(f.root,'projects',p.id,'renders',old.id,'output.mp4');
 await mkdir(join(path,'..'),{recursive:true});await writeFile(path,'cache fixture');
 f.store.finishRender(old.id,{assetId:randomUUID(),path,sha256:createHash('sha256').update('cache fixture').digest('hex'),frameCount:48,planHash:'b'.repeat(64),receiptPath:join(path,'..','receipt.json')},{});
 const pending=f.runtime.render(p.id,song.id,0,randomUUID());
 expect(f.store.deletionContext(p.id,{kind:'song',id:song.id}).blockers.some(b=>b.kind==='reservation')).toBe(true);
 await pending;expect(f.store.artifactUses()).toEqual([]);
});
test('startup retires only stale in-process read-only cache checks, never unknown use reservations',async()=>{
 const f=await fixture(),p=f.store.createProject('Cache restart'),song=fixtureSong(f,p.id),ref={kind:'song' as const,id:song.id};
 f.store.reserveArtifactUse(p.id,ref,`render-cache-check:${randomUUID()}`,'Previous in-process read-only cache check');
 const unknown=f.store.reserveArtifactUse(p.id,ref,'unknown-native-owner','Unresolved native ownership');
 await f.runtime.start();expect(f.store.artifactUses().map(r=>r.id)).toEqual([unknown.id]);
});
