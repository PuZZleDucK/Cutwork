import { afterEach, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { startNativeCoordinator } from '../../apps/server/src/http/native-coordinator.ts';
import { submitAndWait } from '../../scripts/native-call.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import type { NativeAdapter } from '../../apps/server/src/jobs/gpu-worker.ts';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const clean of cleanups.splice(0).reverse()) try { await clean(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'Coordinator fixture cleanup failed');
});
async function setup(adapter: NativeAdapter, seed?: (database: string) => void, validateSubmission: (input: { id: string }) => void = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'studio-http-'));
  cleanups.push(() => rm(root, { recursive: true }));
  const candidate = createServer();
  await new Promise<void>(resolve => candidate.listen(0, '127.0.0.1', resolve));
  const port = (candidate.address() as { port: number }).port;
  await new Promise<void>(resolve => candidate.close(() => resolve()));
  const database = join(root, 'queue.sqlite');
  seed?.(database);
  const coordinator = await startNativeCoordinator({ database, adapter, port, host: '127.0.0.1',
    allowedHosts: [`127.0.0.1:${port}`], pollMs: 5,
    validateSubmission, hasAttempt: id => id === 'attempt' });
  cleanups.push(() => coordinator.close());
  return { coordinator, database, origin: `http://127.0.0.1:${port}` };
}
const input = { id: 'call', attemptId: 'attempt', projectId: 'project', tool: 'yue2' as const, request: { seed: '9223372036854775807' } };

test('actual HTTP client → durable queue → serial worker → receipt survives coordinator reopen', async () => {
  let launches = 0;
  const adapter: NativeAdapter = {
    async prepare(call) { return call.request; },
    async launch(_plan, context) { launches++; context.recordOwner({ fixture: 'CPU-only synthetic adapter' });
      return { async wait() { return { outcome: 'succeeded', result: { fixture: true } }; }, async stop() {},
        async cleanup() { return { state: 'released', evidence: { fixture: true } }; } }; },
  };
  const { coordinator, origin, database } = await setup(adapter);
  expect((await submitAndWait(origin, input, { pollMs: 5, timeoutMs: 3000 })).state).toBe('succeeded');
  // A disconnected/returning client may observe the same ID, never a second launch.
  expect((await submitAndWait(origin, input, { pollMs: 5, timeoutMs: 3000 })).state).toBe('succeeded');
  expect(launches).toBe(1);
  expect((await fetch(`${origin}/api/internal/coordinator`).then(r => r.json())).state).toBe('ready');
  await coordinator.close();
  const q = openGpuQueue(database);
  expect(q.get('call')?.state).toBe('succeeded'); expect(q.heldLease()).toBeNull(); q.close();
});

test('closing the coordinator stops its active native call and waits for cleanup, without deleting queued work', async () => {
  let stopped = false;
  const adapter: NativeAdapter = {
    async prepare() { return {}; },
    async launch(_plan, context) { context.recordOwner({ fixture: true });
      return { wait: () => new Promise(() => {}), async stop() { stopped = true; },
        async cleanup() { await delay(20); return { state: 'released', evidence: { fixture: true } }; } }; },
  };
  const { coordinator, origin, database } = await setup(adapter);
  const submit = (body: unknown) => fetch(`${origin}/api/internal/native-calls`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  expect((await submit(input)).status).toBe(202);
  let running = false;
  for (let i = 0; i < 100; i++) {
    if ((await fetch(`${origin}/api/internal/native-calls/call`).then(r => r.json())).state === 'running') { running = true; break; }
    await delay(5);
  }
  expect(running).toBe(true);
  expect((await submit({ ...input, id: 'queued', attemptId: 'later' })).status).toBe(202);
  await coordinator.close(); expect(stopped).toBe(true);
  const q = openGpuQueue(database);
  expect(q.get('call')?.state).toBe('cancelled'); expect(q.get('queued')?.state).toBe('queued'); q.close();
});

test('uncertain native cleanup is visibly held and never dispatches the next call', async () => {
  let launches = 0;
  const adapter: NativeAdapter = {
    async prepare() { return {}; },
    async launch(_plan, context) { launches++; context.recordOwner({ fixture: true });
      return { async wait() { return { outcome: 'failed', result: {} }; }, async stop() {},
        async cleanup() { return { state: 'uncertain', reason: 'synthetic unresolved owner', evidence: {} }; } }; },
  };
  const { origin } = await setup(adapter);
  expect((await submitAndWait(origin, input, { pollMs: 5, timeoutMs: 3000 })).state).toBe('reconciling');
  await fetch(`${origin}/api/internal/native-calls`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, id: 'later', attemptId: 'later' }) });
  await delay(30); expect(launches).toBe(1);
  expect(await fetch(`${origin}/api/internal/coordinator`).then(r => r.json())).toMatchObject({ state: 'reconciling', heldCallId: 'call' });
});

test('restart reports a retained lease as reconciliation, not a ready idle worker', async () => {
  const noLaunch = async (): Promise<never> => { throw new Error('Must not resume unknown native work'); };
  const { coordinator, origin, database } = await setup({ prepare: noLaunch, launch: noLaunch }, database => {
    const q = openGpuQueue(database); q.submit(input); q.claim('earlier-server'); q.close();
  });
  expect(await fetch(`${origin}/api/internal/coordinator`).then(r => r.json())).toMatchObject({ state: 'reconciling', heldCallId: 'call' });
  await coordinator.close();
  const q = openGpuQueue(database); expect(q.get('call')?.state).toBe('leased'); expect(q.get('call')?.cancelRequested).toBe(false); q.close();
});

test('shutdown prevents the next dispatch even while an HTTP request is still draining', async () => {
  let finishFirst!: () => void, releaseValidation!: () => void, entered!: () => void, launches = 0;
  const validating = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { releaseValidation = resolve; });
  const adapter: NativeAdapter = { async prepare() { return {}; }, async launch(_plan, context) {
    const order = ++launches; context.recordOwner({ fixture: true });
    return { async wait() { if (order === 1) await new Promise<void>(resolve => { finishFirst = resolve; });
      return { outcome: 'succeeded', result: {} }; }, async stop() { finishFirst?.(); },
    async cleanup() { return { state: 'released', evidence: { fixture: true } }; } };
  } };
  const { coordinator, origin, database } = await setup(adapter, undefined, async input => {
    if (input.id === 'pending-validation') { entered(); await blocked; }
  });
  const submit = async (id: string) => {
    const response = await fetch(`${origin}/api/internal/native-calls`, { method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify({ ...input, id, attemptId: id }), signal: AbortSignal.timeout(2000) });
    await response.arrayBuffer(); return response;
  };
  let pending: Promise<Response> | undefined, closing: Promise<void> | undefined;
  try {
    expect((await submit('first')).status).toBe(202);
    for (let i = 0; i < 100 && !finishFirst; i++) await delay(5);
    expect(finishFirst).toBeTypeOf('function');
    expect((await submit('second')).status).toBe(202);
    pending = submit('pending-validation'); void pending.catch(() => {});
    await Promise.race([validating, delay(1000).then(() => { throw new Error('Validation fixture never entered'); })]);
    closing = coordinator.close(); finishFirst();
    await delay(50); expect(launches).toBe(1);
  } finally {
    releaseValidation(); finishFirst?.();
    try { if (pending) await pending; } finally { await (closing ?? coordinator.close()); }
  }
  const persisted = openGpuQueue(database);
  try {
    expect(persisted.get('first')?.state).toBe('cancelled');
    expect(persisted.get('second')?.state).toBe('queued');
    expect(persisted.get('pending-validation')?.state).toBe('queued');
  } finally { persisted.close(); }
});

test('shutdown never cancels a lease subsequently claimed by another coordinator identity', async () => {
  const noLaunch = async (): Promise<never> => { throw new Error('No native launch expected'); };
  const { coordinator, database } = await setup({ prepare: noLaunch, launch: noLaunch });
  const other = openGpuQueue(database);
  try {
    other.submit(input); expect(other.claim('other-coordinator')?.workerId).toBe('other-coordinator');
    await coordinator.close(); expect(other.get('call')?.cancelRequested).toBe(false);
  } finally { other.close(); }
});

test('application composition registers routes on the same live queue before listen', async () => {
 const root = await mkdtemp(join(tmpdir(), 'studio-compose-')); cleanups.push(() => rm(root, { recursive: true }));
 const database = join(root, 'queue.sqlite'); let configured = false;
 const noLaunch = async (): Promise<never> => { throw new Error('No native launch expected'); };
 const server = await startNativeCoordinator({ database, adapter: { prepare: noLaunch, launch: noLaunch }, host: '127.0.0.1', port: 0,
  allowedHosts: ['studio.local:9122'], validateSubmission() {}, hasAttempt: () => false,
  async configure(app, queue) { configured = true; app.get('/api/composed', () => ({ calls: queue.list().length })); },
 });
 cleanups.push(() => server.close()); expect(configured).toBe(true);
 const response = await server.app.inject({ url: '/api/composed', headers: { host: 'studio.local:9122' } });
 expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ calls: 0 });
});
test('failed application composition closes its queue and never listens', async () => {
 const root = await mkdtemp(join(tmpdir(), 'studio-compose-failure-')); cleanups.push(() => rm(root, { recursive: true }));
 const database = join(root, 'queue.sqlite');
 const noLaunch = async (): Promise<never> => { throw new Error('No native launch expected'); };
 await expect(startNativeCoordinator({ database, adapter: { prepare: noLaunch, launch: noLaunch }, host: '127.0.0.1', port: 0,
  allowedHosts: ['studio.local:9122'], validateSubmission() {}, hasAttempt: () => false,
  configure() { throw new Error('Synthetic composition failure'); },
 })).rejects.toThrow('Synthetic composition failure');
 const reopened = openGpuQueue(database); expect(reopened.heldLease()).toBeNull(); reopened.close();
});
