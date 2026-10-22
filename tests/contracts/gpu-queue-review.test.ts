/** Focused persistence/validation regressions; real temporary SQLite, no native GPU work. */
import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import type { CallInput, GpuQueue, Json } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const dirs: string[] = [], queues: GpuQueue[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'studio-queue-review-')); dirs.push(directory);
  const path = join(directory, 'queue.sqlite'), q = openGpuQueue(path); queues.push(q);
  return { q, path };
}
const call = (id: string, attemptId = id): CallInput => ({ id, attemptId, projectId: 'project', tool: 'h3', request: { seed: '1' } });
afterEach(() => {
  for (const q of queues.splice(0)) q.close();
  for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test('a cancelled attempt stays frozen after reopen, including an attempt cancelled before submission', () => {
  const { q, path } = setup(); q.cancelAttempt('not-yet-submitted');
  q.submit(call('one', 'shared')); q.submit(call('two', 'shared')); q.cancelAttempt('shared'); q.close();
  const reopened = openGpuQueue(path); queues.push(reopened);
  expect(() => reopened.submit(call('new', 'not-yet-submitted'))).toThrow();
  expect(() => reopened.submit(call('new', 'shared'))).toThrow();
  expect(reopened.list().map(c => [c.state, c.cancelRequested, c.launch])).toEqual([
    ['cancelled', true, null], ['cancelled', true, null],
  ]);
  // Replaying an existing identical ID retrieves its outcome; it cannot create new work.
  expect(reopened.submit(call('one', 'shared')).state).toBe('cancelled');
  expect(reopened.claim('worker')).toBeNull();
});

test('nested canonical JSON deduplicates keys without losing __proto__ or alias values', () => {
  const { q } = setup(), shared = { b: 2, a: 1 };
  const request = JSON.parse('{"__proto__":{"value":1},"nested":{"b":2,"a":1}}') as Record<string, Json>;
  request.alias = [shared, shared];
  const first = q.submit({ ...call('one'), request });
  const alternate = { alias: [{ a: 1, b: 2 }, { b: 2, a: 1 }], nested: { a: 1, b: 2 },
    ['__proto__']: { value: 1 } };
  expect(q.submit({ ...call('one'), request: alternate })).toEqual(first);
  expect(Object.hasOwn(q.get('one')!.request as object, '__proto__')).toBe(true);
});

test('lossy, executable and cyclic JSON is rejected without invoking accessors or persisting a call', () => {
  const { q } = setup(); let accessed = false;
  const accessor = Object.defineProperty({}, 'seed', { enumerable: true, get() { accessed = true; return '1'; } });
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const extra = Object.assign([1], { hidden: 2 });
  for (const request of [{ missing: undefined }, [undefined], new Array(1), extra, new Date(),
    { value: Infinity }, { value: -0 }, { value: Number.MAX_SAFE_INTEGER + 1 }, { value: 1n },
    { toJSON() { return {}; } }, accessor, cycle]) {
    expect(() => q.submit({ ...call('one'), request: request as Json })).toThrow();
  }
  expect(accessed).toBe(false); expect(q.list()).toEqual([]);
});

test('launch and acknowledgement are single assignments, with null reserved for missing evidence', () => {
  const { q } = setup(); q.submit(call('one')); const lease = q.claim('worker')!;
  expect(() => q.prepareLaunch(lease, null)).toThrow();
  q.prepareLaunch(lease, { command: ['fixture'] });
  expect(() => q.prepareLaunch(lease, { command: ['replacement'] })).toThrow();
  expect(() => q.acknowledgeLaunch(lease, null)).toThrow();
  expect(() => q.finish(lease, 'succeeded', {}, { fixture: true })).toThrow();
  q.acknowledgeLaunch(lease, { pid: 1 });
  expect(() => q.acknowledgeLaunch(lease, { pid: 2 })).toThrow();
  expect(q.get('one')?.owner).toEqual({ pid: 1 }); expect(q.heldLease()).toEqual(lease);
});

test('empty or malformed release receipts cannot release the lane or append terminal events', () => {
  const { q } = setup(); q.submit(call('one')); const lease = q.claim('worker')!;
  const before = q.events('one');
  for (const release of [null, {}, [], 'receipt', { absent: undefined }, { count: NaN }]) {
    expect(() => q.finish(lease, 'failed', null, release as Json)).toThrow();
  }
  expect(q.events('one')).toEqual(before); expect(q.heldLease()).toEqual(lease);
});

test('cancellation suppresses successful result but retains cleanup and ordered immutable events', () => {
  const { q, path } = setup(); q.submit(call('one')); const lease = q.claim('worker')!;
  q.prepareLaunch(lease, { fixture: true }); q.acknowledgeLaunch(lease, { fixture: true }); q.cancelAttempt('one');
  const result = q.finish(lease, 'succeeded', { artifact: 'not-for-placement' }, { fixtureRelease: true });
  expect(result).toMatchObject({ state: 'cancelled', result: null, release: { fixtureRelease: true } });
  const before = q.events('one'); expect(new Set(before.map(e => e.sequence)).size).toBe(before.length);
  q.close(); const reopened = openGpuQueue(path); queues.push(reopened);
  expect(reopened.events('one')).toEqual(before); expect(reopened.heldLease()).toBeNull();
  q.close(); // Idempotent teardown of an already-closed handle.
});

test('reconciliation retains original launch and owner while cancellation does not hide uncertainty', () => {
  const { q, path } = setup(); q.submit(call('one')); const lease = q.claim('worker')!;
  q.prepareLaunch(lease, { fixture: true }); q.acknowledgeLaunch(lease, { pid: 1 });
  q.reconcile(lease, 'native observation uncertain'); q.cancelAttempt('one'); q.close();
  const reopened = openGpuQueue(path); queues.push(reopened);
  expect(reopened.get('one')).toMatchObject({ state: 'reconciling', cancelRequested: true,
    launch: { fixture: true }, owner: { pid: 1 }, error: 'native observation uncertain' });
  expect(reopened.heldLease()).toEqual(lease); expect(reopened.claim('new-worker')).toBeNull();
});

test('a maintenance lease survives all connections closing and never bypasses a blocked FIFO head', () => {
  const { q, path } = setup(); const lock = q.acquireMaintenance('h3')!;
  q.submit(call('one')); q.submit({ ...call('two'), tool: 'yue2' }); q.close();
  const reopened = openGpuQueue(path); queues.push(reopened);
  expect(reopened.claim('worker')).toBeNull(); expect(reopened.acquireMaintenance('h3')).toBeNull();
  reopened.releaseMaintenance(lock); expect(reopened.claim('worker')?.callId).toBe('one');
});
