/** Proposed native CPU proof: real pinned Comfy queue/HTTP/executor, synthetic
 * cooperative node. No H3/YuE2 inference, GPU-release or product latency claim. */
import { beforeAll, beforeEach, afterEach, expect, test } from 'vitest';
import { mkdir, readFile, writeFile, access, lstat, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { observeProcess } from '../../apps/server/src/providers/run.ts';
import { cancelComfyJob } from '../../apps/server/src/jobs/native-control.ts';
import { createComfyNativeBinding } from '../../apps/server/src/jobs/comfy-native.ts';
import { loadCpuFixture, loadTransport, type CpuFixture, type CpuFixtureModule,
  type OwnedTransport, type TransportModule } from '../support/comfy-cpu-contract.ts';

const REVISION = 'f5c611e3849ff7219dfb7d7b251092ab8a9b51dc';
interface Job { promptId: string; token: string }
interface NodeEvent { token: string; pid: number; kind: 'started' | 'released' | 'finished' | 'interrupted' | 'expired'; monotonicNs: string }
interface JobBody { id: string; status: string; execution_status?: {
  status_str: string; completed: boolean; messages: Array<[string, { prompt_id?: string }]>;
} }
interface Queue { queue_running: unknown[][]; queue_pending: unknown[][] }
let factory: CpuFixtureModule, module: TransportModule, runtime: string;
interface Lifecycle {
  abort: AbortController;
  launch: Promise<CpuFixture>;
  scenario?: ReturnType<typeof scenario>;
}
let active: Lifecycle | undefined; // Only hooks/test entry access this; async helpers capture their own scenario.
beforeAll(async () => {
  const loaded = await loadCpuFixture();
  factory = loaded.module; runtime = loaded.runtime;
  module = await loadTransport();
});
beforeEach(async () => {
  const abort = new AbortController();
  const lifecycle: Lifecycle = { abort, launch: factory.createCpuFixture({ runtime, signal: abort.signal }) };
  active = lifecycle; // Register cleanup before awaiting startup.
  const session = await lifecycle.launch;
  session.signal.throwIfAborted();
  lifecycle.scenario = scenario(session, module.createOwnedComfyTransport(session.config), session.signal);
  await lifecycle.scenario.initialize();
});
afterEach(async () => {
  const closing = active; active = undefined;
  if (!closing) return;
  closing.abort.abort(new Error('CPU scenario ended; stop any late continuation before cleanup'));
  // A failed/aborted startup must self-clean before rejecting. Otherwise close
  // the captured fixture, never whichever service a later test might create.
  const session = await closing.launch;
  const cleanup = await session.close();
  let remaining;
  try { remaining = await observeProcess(session.config.owner.pid); }
  catch (error) {
    if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
  if (remaining) {
    const { pid, start, boot } = session.config.owner;
    // Changing process groups is NOT exit. Only a gone/reused PID/start/boot
    // identity can pass; unreadable metadata was rejected above.
    expect({ pid: remaining.pid, start: remaining.start, boot: remaining.boot }).not.toEqual({ pid, start, boot });
  }
  expect(cleanup.identityResolved).toBe(true);
  expect(cleanup.ownedServiceExited).toBe(true);
});
function current() {
  if (!active?.scenario) throw new Error('No ready CPU scenario');
  return active.scenario;
}
function scenario(session: CpuFixture, http: OwnedTransport, abort: AbortSignal) {
  let sequence = 0;
  const check = () => abort.throwIfAborted();
  const signal = () => { check(); return abort; };
  const owned = () => { check(); return session; };
  async function initialize() {
    check();
    expect(session.sourceRevision).toBe(REVISION);
    expect(dirname(session.directory)).toBe(join(runtime, 'setup-jobs'));
    expect(basename(session.directory)).toMatch(/^comfyui-cancellation\.[0-9a-f-]{36}$/);
    const base = join(session.directory, 'comfy-base');
    for (const path of [session.directory, base, join(base, 'user'), join(base, 'custom_nodes')]) {
      const info = await lstat(path); check();
      expect(info.isDirectory()).toBe(true); expect(info.isSymbolicLink()).toBe(false);
    }
    expect(await readdir(join(base, 'custom_nodes'))).toEqual(['studio_cpu_proof']);
    expect(await readdir(join(base, 'models'))).toEqual([]);
    const source = join(runtime, 'tools/comfyui/source');
    expect(session.command.slice(0, 3)).toEqual([join(runtime, 'tools/comfyui/venv/bin/python'), '-s', join(source, 'main.py')]);
    const option = (flag: string) => {
      expect(session.command.filter(value => value === flag)).toHaveLength(1);
      return session.command[session.command.indexOf(flag) + 1];
    };
    expect(session.command).toContain('--cpu');
    expect(option('--listen')).toBe('127.0.0.1');
    expect(option('--port')).toBe(String(session.config.port));
    expect(session.config.port).toBeGreaterThanOrEqual(1024);
    expect(session.config.port).toBeLessThanOrEqual(65535);
    expect(session.config.port).not.toBe(8188);
    expect(option('--base-directory')).toBe(base);
    expect(option('--user-directory')).toBe(join(base, 'user'));
    const manifest = JSON.parse(await readFile(new URL('../fixtures/comfy-cpu-source-hashes.json', import.meta.url), 'utf8')) as {
      revision: string; archiveSha256: string; files: Record<string, string>;
    };
    const recipe = JSON.parse(await readFile(new URL('../../integrations/comfyui/recipe.json', import.meta.url), 'utf8'));
    expect(manifest.revision).toBe(recipe.source.revision);
    expect(manifest.archiveSha256).toBe(recipe.source.sha256);
    const actualHashes: Record<string, string> = {};
    for (const [relative, hash] of Object.entries(manifest.files)) {
      check();
      actualHashes[relative] = createHash('sha256').update(await readFile(join(source, relative))).digest('hex');
      expect(actualHashes[relative]).toBe(hash);
    }
    // Compare reviewed source to its staged runtime copy rather than accepting
    // an echoed digest.
    const fixtureHash = createHash('sha256').update(await readFile(new URL('../fixtures/comfy-cpu-gate.py', import.meta.url))).digest('hex');
    const stagedHash = createHash('sha256').update(await readFile(join(base, 'custom_nodes/studio_cpu_proof/__init__.py'))).digest('hex');
    expect(stagedHash).toBe(fixtureHash);
    for (const directory of ['observations', 'intents']) { check(); await mkdir(join(session.directory, directory), { recursive: true }); }
    check();
    await writeFile(join(session.directory, 'source-observation.json'), JSON.stringify({ actualHashes, fixtureHash, stagedHash }, null, 2), { flag: 'wx', mode: 0o600, signal: abort });
    expect(await observeProcess(session.config.owner.pid)).toEqual(session.config.owner);
    await ready();
  }

  async function request(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
    // No URL supplied by a browser and no fetch fallback. This is the same owned
    // socket/deadline primitive exercised by production cancellation.
    const response = await http.request({ method, path, ...(body ? { body } : {}) }, signal(),
      (status, value) => ({ status, body: value }));
    await writeFile(join(owned().directory, 'observations', `${String(++sequence).padStart(4, '0')}.json`),
      JSON.stringify({ method, path, response }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return response;
  }
  async function ready() {
    const response = await request('GET', '/system_stats');
    expect(response.status).toBe(200);
    const stats = response.body as { system: { argv: string[]; comfyui_version: string }; devices: Array<{ type: string }> };
    expect(stats.system.comfyui_version).toBe('0.42.0');
    expect(stats.system.argv).toEqual(owned().command.slice(2)); // python -s main.py ...
    expect(stats.devices[0]?.type).toBe('cpu');
    expect(await observeProcess(owned().config.owner.pid)).toEqual(owned().config.owner);
  }
  async function submit(): Promise<Job> {
    const job = { promptId: randomUUID(), token: randomUUID() };
    const body = { prompt_id: job.promptId, prompt: { '1': {
      class_type: 'StudioCpuCancellationGate', inputs: { token: job.token },
    } } };
    // The pin accepts canonical client UUIDs. Persist intent before exactly one
    // POST; ambiguity fails this attempt instead of causing duplicate work.
    await writeFile(join(owned().directory, 'intents', `${job.promptId}.json`),
      JSON.stringify({ job, body }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const response = await request('POST', '/prompt', body);
    expect(response.status).toBe(200);
    expect((response.body as { prompt_id: string }).prompt_id).toBe(job.promptId);
    expect((response.body as { node_errors: unknown }).node_errors).toEqual({});
    return job;
  }
  async function events(job: Job): Promise<NodeEvent[]> {
    let text: string;
    try { text = await readFile(join(owned().directory, 'events', `${job.token}.jsonl`), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error; // unreadable is NOT absent
    }
    const entries = text.trim() ? text.trim().split('\n').map(line => JSON.parse(line) as NodeEvent) : [];
    let last = 0n;
    for (const entry of entries) {
      expect(entry.token).toBe(job.token);
      expect(entry.pid).toBe(owned().config.owner.pid);
      expect(['started', 'released', 'finished', 'interrupted', 'expired']).toContain(entry.kind);
      expect(BigInt(entry.monotonicNs)).toBeGreaterThanOrEqual(last);
      last = BigInt(entry.monotonicNs);
    }
    return entries;
  }
  async function kinds(job: Job) { return (await events(job)).map(event => event.kind); }
  async function gateAbsent(job: Job) {
    try { await access(join(owned().directory, 'gates', job.token)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    throw new Error('Cancelled target gate must never be opened');
  }
  async function release(job: Job) {
    await writeFile(join(owned().directory, 'gates', job.token), '', { flag: 'wx', mode: 0o600 });
  }
  async function jobResponse(job: Job) { return request('GET', `/api/jobs/${job.promptId}`); }
  async function status(job: Job) {
    const response = await jobResponse(job);
    if (response.status === 404) { expect(response.body).toEqual({ error: 'Job not found' }); return 'absent'; }
    expect(response.status).toBe(200);
    expect((response.body as JobBody).id).toBe(job.promptId);
    return (response.body as JobBody).status;
  }
  async function until(condition: () => Promise<boolean>, label: string) {
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) { check(); if (await condition()) return; await wait(25, undefined, { signal: abort }); }
    throw new Error(`CPU diagnostic wait expired: ${label}`);
  }
  async function started(job: Job) {
    await until(async () => (await kinds(job)).includes('started'), 'node entered execution');
    expect(await status(job)).toBe('in_progress');
    expect(await kinds(job)).toEqual(['started']);
  }
  async function success(job: Job) {
    await until(async () => await status(job) === 'completed', 'unrelated job completion');
    expect(await kinds(job)).toEqual(['started', 'released', 'finished']);
    const response = await jobResponse(job);
    expect(response.body).toMatchObject({ id: job.promptId, status: 'completed',
      execution_status: { status_str: 'success', completed: true } });
  }
  async function queueIds() {
    const response = await request('GET', '/queue');
    expect(response.status).toBe(200);
    const queue = response.body as Queue;
    expect(Array.isArray(queue.queue_running)).toBe(true);
    expect(Array.isArray(queue.queue_pending)).toBe(true);
    return { running: queue.queue_running.map(row => row[1]), pending: queue.queue_pending.map(row => row[1]) };
  }
  async function cancel(job: Job) {
    const config = { ...owned().config, promptId: job.promptId };
    const binding = createComfyNativeBinding(config);
    const result = await cancelComfyJob({ promptId: job.promptId, owner: config.owner,
      observe: requestSignal => binding.observe(AbortSignal.any([abort, requestSignal])),
      post: (path, body, requestSignal) => binding.post(path, body, AbortSignal.any([abort, requestSignal])),
      timeoutMs: 5000, now: () => performance.now(), wait: ms => wait(ms, undefined, { signal: abort }) });
    check();
    await writeFile(join(owned().directory, `${job.promptId}.cancel.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    expect(result.state).toBe('native-stopped');
    expect(result.cancelAcknowledged).toBe(true);
    expect(result.alreadyTerminal).toBe(false);
    expect(result.stoppedAtMs).not.toBeNull();
    expect(result.stoppedAtMs!).toBeGreaterThanOrEqual(result.requestedAtMs);
    expect(Object.hasOwn(result, 'resourcesReleased')).toBe(false);
    // These timestamps measure this cooperative fixture only, not a product SLA.
  }

  return { initialize, submit, started, status, queueIds, gateAbsent, cancel, kinds, release, success, ready, jobResponse };
}

test('queued targeted cancellation leaves the blocker and survivor intact, and the target never starts', async () => {
  const { submit, started, status, queueIds, gateAbsent, cancel, kinds, release, success, ready } = current();
  const blocker = await submit(); await started(blocker);
  const target = await submit(), survivor = await submit();
  expect(await status(target)).toBe('pending'); expect(await status(survivor)).toBe('pending');
  expect(await queueIds()).toEqual({ running: [blocker.promptId], pending: [target.promptId, survivor.promptId] });
  await gateAbsent(target);
  await cancel(target);
  expect(await status(target)).toBe('absent');
  expect(await kinds(target)).toEqual([]);
  expect(await status(blocker)).toBe('in_progress');
  expect(await kinds(blocker)).toEqual(['started']);
  expect(await status(survivor)).toBe('pending');
  expect(await queueIds()).toEqual({ running: [blocker.promptId], pending: [survivor.promptId] });
  await release(blocker); await success(blocker);
  await started(survivor); await release(survivor); await success(survivor);
  expect(await queueIds()).toEqual({ running: [], pending: [] });
  expect(await status(target)).toBe('absent');
  expect(await kinds(target)).toEqual([]); // Check after draining, not just immediately after dequeue.
  await gateAbsent(target);
  await ready(); // Service stayed alive; teardown did not provide cancellation evidence.
});

test('running cancellation records native interruption, not expiry or gate release, and the next job succeeds', async () => {
  const { submit, started, status, queueIds, gateAbsent, cancel, kinds, release, success, ready, jobResponse } = current();
  const target = await submit(); await started(target);
  const survivor = await submit(); expect(await status(survivor)).toBe('pending');
  expect(await queueIds()).toEqual({ running: [target.promptId], pending: [survivor.promptId] });
  await gateAbsent(target);
  await cancel(target);
  const response = await jobResponse(target);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ id: target.promptId, status: 'cancelled',
    execution_status: { status_str: 'error', completed: false } });
  const messages = (response.body as JobBody).execution_status!.messages;
  expect(messages).toEqual(expect.arrayContaining([
    ['execution_interrupted', expect.objectContaining({ prompt_id: target.promptId })],
  ]));
  expect(messages.some(([kind]) => kind === 'execution_error' || kind === 'execution_success')).toBe(false);
  expect(await kinds(target)).toEqual(['started', 'interrupted']);
  await gateAbsent(target);
  await started(survivor);
  expect(await queueIds()).toEqual({ running: [survivor.promptId], pending: [] });
  await release(survivor); await success(survivor);
  expect(await queueIds()).toEqual({ running: [], pending: [] });
  expect(await status(target)).toBe('cancelled');
  expect(await kinds(target)).toEqual(['started', 'interrupted']);
  await gateAbsent(target);
  await ready();
});
