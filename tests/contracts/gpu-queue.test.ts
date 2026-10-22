import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import type { CallInput, GpuQueue } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const dirs: string[] = [], opened: GpuQueue[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'studio-lane-')); dirs.push(dir);
  const path = join(dir, 'studio.sqlite');
  const queue = openGpuQueue(path); opened.push(queue);
  return { queue, path };
}
const call = (id: string, changes: Partial<CallInput> = {}): CallInput => ({
  id, attemptId: `attempt-${id}`, projectId: 'project-a', tool: 'yue2',
  request: { seed: '1844674407370955', prompt: 'music' }, ...changes,
});
afterEach(() => {
  for (const q of opened.splice(0)) q.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('Persisted native GPU lane; no OS release certification', () => {
  test('uses WAL and an embedded SQLite containing the accepted WAL fix', () => {
    const { path } = setup(), db = new Database(path);
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      const row = db.prepare('select sqlite_version() as version').get() as { version: string };
      const [major, minor, patch] = row.version.split('.').map(Number);
      expect(major! * 1000000 + minor! * 1000 + patch!).toBeGreaterThanOrEqual(3051003);
    } finally { db.close(); }
  });
  test('FIFO spans projects/tools, and release is required before another claim', () => {
    const { queue: q } = setup();
    const a = q.submit(call('a')), b = q.submit(call('b', { tool: 'h3', projectId: 'project-b' }));
    expect(b.sequence).toBeGreaterThan(a.sequence);
    const lease = q.claim('worker')!;
    expect(lease.callId).toBe('a'); expect(q.claim('another')).toBeNull();
    q.prepareLaunch(lease, { command: 'fixture' }); q.acknowledgeLaunch(lease, { pid: 100, fixture: true });
    q.finish(lease, 'succeeded', { output: 'fixture' }, { fixtureOnly: true });
    expect(q.claim('another')?.callId).toBe('b');
  });
  test('idempotent same input, conflict on changed input, independent returned snapshots', () => {
    const { queue: q } = setup(), original = call('a');
    const first = q.submit(original);
    expect(q.submit({ ...original, request: { prompt: 'music', seed: '1844674407370955' } })).toEqual(first);
    expect(() => q.submit(call('a', { projectId: 'different' }))).toThrow();
    expect(() => q.submit(call('a', { request: { seed: '2' } }))).toThrow();
    (first.request as Record<string, unknown>).seed = 'altered';
    expect(q.get('a')?.request).toEqual(original.request);
    expect(q.events('a').filter(e => e.kind === 'submitted')).toHaveLength(1);
  });
  test('rejects invalid identifiers, tools and lossy JSON before persistence', () => {
    const { queue: q } = setup();
    for (const value of [call(''), call('a\0b'), call('a', { tool: 'invalid' as never }),
      call('a', { request: { number: NaN } }), call('a', { request: undefined as never })]) {
      expect(() => q.submit(value)).toThrow();
    }
    expect(q.list()).toEqual([]);
  });
  test('serializes competing processes rather than relying on a JS mutex', async () => {
    const { queue: q, path } = setup(); q.submit(call('a')); q.submit(call('b'));
    const url = new URL('../../apps/server/src/jobs/gpu-queue.ts', import.meta.url).href;
    const code = `import {openGpuQueue} from ${JSON.stringify(url)}; const q=openGpuQueue(process.argv[1]);
      console.log(JSON.stringify(q.claim(process.argv[2]))); q.close();`;
    const results = await Promise.all(['one', 'two'].map(worker =>
      promisify(execFile)(process.execPath, ['--input-type=module', '-e', code, path, worker], { timeout: 10000 })));
    const claims = results.map(r => JSON.parse(r.stdout));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean).callId).toBe('a');
  });
  test('queued cancellation launches nothing and freezes the whole attempt', () => {
    const { queue: q } = setup(); q.submit(call('a')); q.submit(call('b'));
    q.cancelAttempt('attempt-a'); q.cancelAttempt('attempt-a');
    expect(q.get('a')?.state).toBe('cancelled'); expect(q.get('a')?.launch).toBeNull();
    expect(() => q.submit(call('c', { attemptId: 'attempt-a' }))).toThrow();
    expect(q.claim('worker')?.callId).toBe('b');
  });
  test('cancellation before launch denies launch and retains the lease until worker settlement', () => {
    const { queue: q } = setup(); q.submit(call('a')); q.submit(call('b'));
    const lease = q.claim('w')!; q.cancelAttempt('attempt-a');
    expect(() => q.prepareLaunch(lease, { command: 'never' })).toThrow();
    expect(q.claim('w')).toBeNull();
    q.finish(lease, 'cancelled', null, { neverLaunched: true });
    expect(q.claim('w')?.callId).toBe('b');
  });
  test('persists intent first, and records acknowledgement even if cancel won the launch race', () => {
    const { queue: q } = setup(); q.submit(call('a')); const lease = q.claim('w')!;
    expect(() => q.acknowledgeLaunch(lease, { pid: 1 })).toThrow();
    q.prepareLaunch(lease, { command: 'fixture' }); q.cancelAttempt('attempt-a');
    q.acknowledgeLaunch(lease, { pid: 123, identity: 'fixture' });
    expect(q.get('a')?.state).toBe('cancel_requested');
    expect(q.get('a')?.owner).toEqual({ pid: 123, identity: 'fixture' });
    expect(() => q.prepareLaunch(lease, { command: 'again' })).toThrow();
  });
  test('cancel accepted first suppresses successful output, success committed first stays success', () => {
    const { queue: q } = setup(); q.submit(call('a')); const a = q.claim('w')!;
    q.prepareLaunch(a, { fixture: true }); q.acknowledgeLaunch(a, { fixture: true });
    q.cancelAttempt('attempt-a');
    expect(q.finish(a, 'succeeded', { artifact: 'unplaced' }, { fixtureOnly: true }).state).toBe('cancelled');
    q.submit(call('b')); const b = q.claim('w')!;
    q.prepareLaunch(b, { fixture: true }); q.acknowledgeLaunch(b, { fixture: true });
    q.finish(b, 'succeeded', { artifact: 'success' }, { fixtureOnly: true });
    q.cancelAttempt('attempt-b'); expect(q.get('b')?.state).toBe('succeeded');
  });
  test('restart preserves uncertain work; reconciliation neither frees nor retries it', () => {
    const { queue: q, path } = setup(); q.submit(call('a')); q.submit(call('b'));
    const lease = q.claim('old')!; q.prepareLaunch(lease, { command: 'fixture' }); q.close();
    const resumed = openGpuQueue(path); opened.push(resumed);
    expect(resumed.heldLease()).toEqual(lease); expect(resumed.claim('new')).toBeNull();
    resumed.reconcile(lease, 'server restarted before native acknowledgement');
    expect(resumed.get('a')?.state).toBe('reconciling');
    expect(resumed.claim('new')).toBeNull();
    expect(resumed.events('a').map(e => e.kind)).toContain('reconciling');
  });
  test('stale token/call/worker cannot mutate or release another holder', () => {
    const { queue: q } = setup(); q.submit(call('a')); const lease = q.claim('w')!;
    for (const bad of [{ ...lease, token: 'stale' }, { ...lease, callId: 'other' }, { ...lease, workerId: 'other' }]) {
      expect(() => q.prepareLaunch(bad, { fixture: true })).toThrow();
      expect(() => q.reconcile(bad, 'fake')).toThrow();
      expect(() => q.finish(bad, 'failed', null, { fixtureOnly: true })).toThrow();
    }
    q.finish(lease, 'failed', null, { neverLaunched: true });
    q.submit(call('b')); const next = q.claim('w')!;
    expect(next.token).not.toBe(lease.token);
    expect(() => q.finish(lease, 'failed', null, { fixtureOnly: true })).toThrow();
    expect(q.heldLease()).toEqual(next);
  });
  test('requires a nonempty release receipt and acknowledged launch for success', () => {
    const { queue: q } = setup(); q.submit(call('a')); const lease = q.claim('w')!;
    expect(() => q.finish(lease, 'succeeded', {}, { fixtureOnly: true })).toThrow();
    expect(() => q.finish(lease, 'failed', {}, null)).toThrow();
    expect(q.heldLease()).toEqual(lease);
  });
  test('maintenance is durable, excludes active same-tool work and preserves FIFO', () => {
    const { queue: q, path } = setup();
    const lock = q.acquireMaintenance('yue2')!; expect(lock).toBeTruthy();
    expect(q.acquireMaintenance('yue2')).toBeNull();
    q.submit(call('a')); q.submit(call('b', { tool: 'h3' }));
    expect(q.claim('w')).toBeNull();
    const other = openGpuQueue(path); opened.push(other); expect(other.claim('w')).toBeNull();
    expect(() => q.releaseMaintenance({ ...lock, token: 'wrong' })).toThrow();
    q.releaseMaintenance(lock); expect(q.claim('w')?.callId).toBe('a');
    expect(q.acquireMaintenance('yue2')).toBeNull();
    expect(q.acquireMaintenance('h3')).toBeTruthy();
  });
});
