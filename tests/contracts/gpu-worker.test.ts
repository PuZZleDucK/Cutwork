import { afterEach, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { GpuWorker, type NativeAdapter, type NativeHandle } from '../../apps/server/src/jobs/gpu-worker.ts';
import type { GpuQueue } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const resources: Array<{ queue: GpuQueue; path: string }> = [];
afterEach(() => { for (const r of resources.splice(0)) { r.queue.close(); rmSync(r.path, { recursive: true, force: true }); } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'gpu-worker-')), queue = openGpuQueue(join(path, 'db')); resources.push({ queue, path });
  const handle: NativeHandle = {
    wait: vi.fn(async () => ({ outcome: 'succeeded' as const, result: { artifact: 'fixture' } })),
    stop: vi.fn(async () => {}),
    cleanup: vi.fn(async () => ({ state: 'released' as const, evidence: { fixtureOnly: true } })),
  };
  const adapter: NativeAdapter = {
    prepare: vi.fn(async () => ({ fixtureOnly: true })),
    launch: vi.fn(async (_plan, context) => { context.recordOwner({ pid: 123, fixtureOnly: true }); return handle; }),
  };
  const worker = new GpuWorker(queue, adapter, { workerId: 'worker', cancelPollMs: 5 });
  const submit = (id: string, tool: 'yue2' | 'h3' = 'yue2') => queue.submit({ id, attemptId: id, projectId: 'p', tool, request: { seed: '1' } });
  return { queue, worker, adapter, handle, submit };
}
test('actual persisted worker serializes fixture music-video-music and retains release evidence', async () => {
  const f = fixture(); f.submit('a'); f.submit('b', 'h3'); f.submit('c');
  for (const id of ['a', 'b', 'c']) {
    expect((await f.worker.runNext())?.id).toBe(id);
    expect(f.queue.get(id)).toMatchObject({ state: 'succeeded', release: { fixtureOnly: true } });
  }
  expect(await f.worker.runNext()).toBeNull(); expect(f.adapter.launch).toHaveBeenCalledTimes(3);
});
test('launch observes already-persisted intent, then owner acknowledgement', async () => {
  const f = fixture(); f.submit('a');
  vi.mocked(f.adapter.launch).mockImplementation(async (plan, context) => {
    expect(f.queue.get('a')).toMatchObject({ state: 'launching', launch: plan, owner: null });
    context.recordOwner({ fixtureOnly: true });
    expect(f.queue.get('a')?.state).toBe('running'); return f.handle;
  });
  await f.worker.runNext();
  expect(f.queue.events('a').map(e => e.kind)).toEqual(expect.arrayContaining(['submitted', 'launch-intent', 'launch-acknowledged', 'succeeded']));
});
test('preparation failure settles without launching, preserving next request', async () => {
  const f = fixture(); f.submit('a'); f.submit('b');
  vi.mocked(f.adapter.prepare).mockRejectedValueOnce(new Error('invalid inputs'));
  expect((await f.worker.runNext())?.state).toBe('failed');
  expect(f.adapter.launch).not.toHaveBeenCalled(); expect(f.queue.heldLease()).toBeNull();
  expect((await f.worker.runNext())?.id).toBe('b');
});
test('cancel during preparation skips launch and freezes later helper submissions', async () => {
  const f = fixture(); f.submit('a'); const gate = deferred<null>();
  vi.mocked(f.adapter.prepare).mockImplementation(async () => { await gate.promise; return { fixtureOnly: true }; });
  const running = f.worker.runNext(); await vi.waitFor(() => expect(f.adapter.prepare).toHaveBeenCalled());
  f.queue.cancelAttempt('a'); gate.resolve(null);
  expect((await running)?.state).toBe('cancelled'); expect(f.adapter.launch).not.toHaveBeenCalled();
  expect(() => f.queue.submit({ id: 'retry', attemptId: 'a', projectId: 'p', tool: 'h3', request: {} })).toThrow();
});
test('cancelled queued request never invokes the adapter', async () => {
  const f = fixture(); f.submit('a'); f.queue.cancelAttempt('a');
  expect(await f.worker.runNext()).toBeNull(); expect(f.adapter.prepare).not.toHaveBeenCalled();
});
test('ambiguous launch error holds the lane and is not automatically retried', async () => {
  const f = fixture(); f.submit('a'); f.submit('b');
  vi.mocked(f.adapter.launch).mockRejectedValue(new Error('acknowledgement lost'));
  expect((await f.worker.runNext())?.state).toBe('reconciling');
  expect(f.queue.heldLease()?.callId).toBe('a'); expect(await f.worker.runNext()).toBeNull();
  expect(f.adapter.launch).toHaveBeenCalledTimes(1);
});
test('adapter returning without native identity is never committed as successful', async () => {
  const f = fixture(); f.submit('a');
  vi.mocked(f.adapter.launch).mockResolvedValue(f.handle);
  expect((await f.worker.runNext())?.state).toBe('reconciling');
  expect(f.handle.stop).toHaveBeenCalledTimes(1); expect(f.queue.heldLease()).not.toBeNull();
});
test('active cancel stops once and cannot release/dispatch until cleanup settles', async () => {
  const f = fixture(); f.submit('a'); f.submit('b');
  const pending = deferred<never>(), cleaning = deferred<Awaited<ReturnType<NativeHandle['cleanup']>>>();
  vi.mocked(f.handle.wait).mockReturnValue(pending.promise); vi.mocked(f.handle.cleanup).mockReturnValue(cleaning.promise);
  const running = f.worker.runNext(); await vi.waitFor(() => expect(f.handle.wait).toHaveBeenCalled());
  f.queue.cancelAttempt('a'); await vi.waitFor(() => expect(f.handle.stop).toHaveBeenCalledTimes(1));
  expect(f.queue.get('a')?.state).toBe('cancel_requested'); expect(await f.worker.runNext()).toBeNull();
  cleaning.resolve({ state: 'released', evidence: { stoppedAndReleasedFixture: true } });
  expect((await running)?.state).toBe('cancelled'); expect(f.queue.heldLease()).toBeNull();
});
test.each(['uncertain', 'throws'] as const)('cleanup %s keeps lane, including failed generation', async mode => {
  const f = fixture(); f.submit('a'); f.submit('b');
  vi.mocked(f.handle.wait).mockResolvedValue({ outcome: 'failed', result: { error: 'fixture failure' } });
  if (mode === 'throws') vi.mocked(f.handle.cleanup).mockRejectedValue(new Error('probe failed'));
  else vi.mocked(f.handle.cleanup).mockResolvedValue({ state: 'uncertain', reason: 'GPU still resident', evidence: { fixtureOnly: true } });
  expect((await f.worker.runNext())?.state).toBe('reconciling');
  expect(await f.worker.runNext()).toBeNull(); expect(f.queue.get('b')?.state).toBe('queued');
});
test('native wait failure still performs cleanup; no automatic retry', async () => {
  const f = fixture(); f.submit('a'); vi.mocked(f.handle.wait).mockRejectedValue(new Error('lost output'));
  expect((await f.worker.runNext())?.state).toBe('failed'); expect(f.handle.cleanup).toHaveBeenCalledTimes(1);
  expect(await f.worker.runNext()).toBeNull();
});
test('late cancellation during cleanup wins over successful output', async () => {
  const f = fixture(); f.submit('a');
  vi.mocked(f.handle.cleanup).mockImplementation(async () => {
    f.queue.cancelAttempt('a'); return { state: 'released', evidence: { fixtureOnly: true } };
  });
  const result = await f.worker.runNext(); expect(result?.state).toBe('cancelled'); expect(result?.result).toBeNull();
});
