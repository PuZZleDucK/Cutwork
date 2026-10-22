/** Approved synthetic observation windows. No procfs, HTTP, CLI or GPU I/O. */
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import type { ProcessCensus, ProcessRecord } from '../../apps/server/src/jobs/linux-process-census.ts';
import type { ComputeSnapshot } from '../../apps/server/src/jobs/nvidia-query.ts';
import type { WholeQueueSnapshot } from '../../apps/server/src/jobs/comfy-queue.ts';
import * as module from '../../apps/server/src/jobs/registered-work-evidence.ts';
import { type EvidenceConfig, type EvidenceIo,
  type Identity, type Observation, type RegisteredWorkEvidence } from '../../apps/server/src/jobs/registered-work-evidence.ts';

const boot = '11111111-1111-4111-8111-111111111111';
const otherBoot = '22222222-2222-4222-8222-222222222222';
const gpuUuid = 'GPU-33333333-3333-4333-8333-333333333333';
const jobA = '44444444-4444-4444-8444-444444444444';
const jobB = '55555555-5555-4555-8555-555555555555';
const identity = (pid: number, startTicks = String(pid)): Identity => ({ bootId: boot, pid, startTicks });
const proc = (pid: number, overrides: Partial<ProcessRecord> = {}): ProcessRecord => ({
  pid, parentPid: 1, group: pid, session: pid, startTicks: String(pid), state: 'S', ...overrides,
});
const owner = (pid: number) => ({ kind: 'process' as const, pid, group: pid, start: String(pid), boot });
function config(): EvidenceConfig {
  return {
    windowId: 'window-1', timeoutMs: 100, drainTimeoutMs: 20, maxRememberedIdentities: 100,
    registration: { attemptId: 'attempt-1', revision: 1, bootId: boot,
      processes: [100, 200].map(pid => ({ registrationId: `process-${pid}`, identity: identity(pid), group: pid, session: pid })),
      comfyServices: [{ registrationId: 'process-200', transport: {
        port: 8198, owner: owner(200), requestTimeoutMs: 1000, maxResponseBytes: 65536,
      } }], unresolvedLaunchIds: [] },
    memory: { attemptId: 'attempt-1', bootId: boot, complete: true, entries: [] },
    census: { expectedBootId: boot, timeoutMs: 1000, maxDirectoryEntries: 4096, maxFileBytes: 65536 },
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpuUuid], timeoutMs: 1000,
      cleanupTimeoutMs: 10, maxOutputBytes: 65536 },
  };
}
const stamp = () => performance.now();
function census(rows = [proc(100), proc(200)]): ProcessCensus {
  return { kind: 'linux-process-census', scope: 'visible-procfs', bootId: boot,
    startedAtMs: stamp(), finishedAtMs: stamp(), processes: rows };
}
function gpu(pids: number[] = []): ComputeSnapshot {
  return { kind: 'nvidia-compute-process-snapshot', startedAtMs: stamp(), finishedAtMs: stamp(),
    gpuUuids: [gpuUuid], processes: pids.map(pid => ({ gpuUuid, pid })), queries: [] };
}
const fault = (code: string) => Object.assign(new Error(`synthetic ${code}`), { code });
function scripted(before = [proc(100), proc(200)], after = before, pids: number[] = []) {
  const calls: string[] = [];
  let scans = 0;
  const io = {
    census: vi.fn<EvidenceIo['census']>(async () => {
      calls.push(++scans === 1 ? 'proc-before' : 'proc-after'); return census(scans === 1 ? before : after);
    }),
    queue: vi.fn<EvidenceIo['queue']>(async input => {
      calls.push(`queue-${input.owner.pid}`);
      return { kind: 'comfy-whole-queue', service: structuredClone(input.owner), running: [], queued: [] };
    }),
    gpu: vi.fn<EvidenceIo['gpu']>(async () => { calls.push('gpu'); return gpu(pids); }),
  };
  return { io, calls };
}
function value<T>(observation: Observation<T>): T {
  expect(observation.state).toBe('ok');
  if (observation.state !== 'ok') throw new Error('Expected valid evidence');
  return observation.value;
}
function tracked(result: RegisteredWorkEvidence, id: Identity) {
  const match = result.identities.find(({ identity: entry }) => entry.bootId === id.bootId && entry.pid === id.pid && entry.startTicks === id.startTicks);
  expect(match, `missing identity ${JSON.stringify(id)}`).toBeDefined();
  return match!;
}
function remembered(result: RegisteredWorkEvidence, id: Identity) {
  const match = result.memory.entries.find(({ identity: entry }) => entry.bootId === id.bootId && entry.pid === id.pid && entry.startTicks === id.startTicks);
  expect(match, `forgot identity ${JSON.stringify(id)}`).toBeDefined();
  return match!;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const callers: AbortController[] = [];
function caller() { const result = new AbortController(); callers.push(result); return result; }
const signal = () => caller().signal;
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }); });
afterEach(() => {
  for (const item of callers.splice(0)) item.abort();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});
const collect = (input = config(), fixture = scripted(), current = signal()) =>
  module.collectRegisteredWorkEvidence(input, current, fixture.io);

describe('One observation window, not an authorization decision', () => {
  test('calls proc → each queue → GPU → each queue → proc exactly once, with captured registration', async () => {
    const input = config(), f = scripted();
    const result = await collect(input, f);
    expect(f.calls).toEqual(['proc-before', 'queue-200', 'gpu', 'queue-200', 'proc-after']);
    expect(result).toMatchObject({ kind: 'registered-work-evidence', windowId: 'window-1',
      registration: input.registration, collection: 'complete', stopReason: null });
    expect(result.startedAtMs).toBeLessThanOrEqual(result.observationFinishedAtMs);
    expect(result.observationFinishedAtMs).toBeLessThanOrEqual(result.finishedAtMs);
    for (const observation of [result.processes.before, result.processes.after, result.gpu,
      result.queues[0]!.before, result.queues[0]!.after]) {
      expect(observation).toMatchObject({ state: 'ok', startedAtMs: expect.any(Number), finishedAtMs: expect.any(Number) });
    }
    expect(vi.getTimerCount()).toBe(0);
  });
  test('even a wholly quiet window returns limitations and no release/ownership/dispatch flag', async () => {
    const result = await collect(config(), scripted([], [], []));
    expect(result.collection).toBe('complete'); // Means collection, NOT coverage or release.
    expect(tracked(result, identity(100)).before).toEqual({ state: 'not-observed' });
    expect(result.limitations).toEqual(expect.arrayContaining(['non-atomic-window', 'visible-procfs-only',
      'compute-contexts-only', 'pid-attribution-unverified', 'unregistered-work-uncovered', 'lease-not-checked']));
    const forbidden = new Set(['ownerKnown', 'gpuClear', 'resourcesReleased', 'releaseGpu', 'maySubmit', 'safeToDispatch']);
    function inspect(input: unknown) {
      if (!input || typeof input !== 'object') return;
      for (const [key, child] of Object.entries(input)) { expect(forbidden.has(key)).toBe(false); inspect(child); }
    }
    inspect(result);
  });
  test('observes all registered services without filtering a busy second service or its unrelated job', async () => {
    const input = config(), f = scripted();
    input.registration.processes.push({ registrationId: 'process-300', identity: identity(300), group: 300, session: 300 });
    input.registration.comfyServices.push({ registrationId: 'process-300', transport: {
      ...input.registration.comfyServices[0]!.transport, port: 8298, owner: owner(300),
    } });
    f.io.queue.mockImplementation(async c => {
      f.calls.push(`queue-${c.owner.pid}`);
      return { kind: 'comfy-whole-queue', service: c.owner, running: c.owner.pid === 300 ? [jobB] : [], queued: [] };
    });
    const result = await collect(input, f);
    expect(f.calls).toEqual(['proc-before', 'queue-200', 'queue-300', 'gpu', 'queue-200', 'queue-300', 'proc-after']);
    expect(value(result.queues[1]!.before).running).toEqual([jobB]);
    expect(value(result.queues[1]!.after).running).toEqual([jobB]);
  });
  test('retains queue transitions between brackets instead of merging them into a false empty queue', async () => {
    const f = scripted(); let n = 0;
    f.io.queue.mockImplementation(async c => ({ kind: 'comfy-whole-queue', service: c.owner,
      running: ++n === 1 ? [] : [jobA], queued: n === 1 ? [jobA, jobB] : [jobB] }));
    const result = await collect(config(), f);
    expect(result.queues[0]!.changed).toBe(true);
    expect(value(result.queues[0]!.before).queued).toEqual([jobA, jobB]);
    expect(value(result.queues[0]!.after).running).toEqual([jobA]);
  });
  test('empty queues do not hide a living registered process or its matching GPU PID', async () => {
    const result = await collect(config(), scripted(undefined, undefined, [200]));
    expect(result.queues[0]!.changed).toBe(false);
    expect(value(result.queues[0]!.after).running).toEqual([]);
    expect(tracked(result, identity(200)).after.state).toBe('present');
    expect(result.gpuCorrelations[0]).toMatchObject({ pid: 200, correlation: 'same-identity', remembered: [identity(200)] });
  });
  test('a failed queue read stays failed even when the service is absent and the later read is empty', async () => {
    const f = scripted([], []);
    f.io.queue.mockRejectedValueOnce(fault('COMFY_TRANSPORT'));
    const result = await collect(config(), f);
    expect(result.collection).toBe('incomplete');
    expect(result.queues[0]!.before).toMatchObject({ state: 'failed', error: { code: 'COMFY_TRANSPORT' }, settlement: 'settled' });
    expect(result.queues[0]!.changed).toBeNull();
    expect(value(result.queues[0]!.after).running).toEqual([]);
    expect(tracked(result, identity(200)).before.state).toBe('not-observed');
    expect(f.io.queue).toHaveBeenCalledTimes(2); // Two planned brackets, no retry.
  });
  test('rejects a queue snapshot from a replacement service rather than crediting its empty data', async () => {
    const f = scripted();
    f.io.queue.mockResolvedValueOnce({ kind: 'comfy-whole-queue', service: { ...owner(200), start: '999' }, running: [], queued: [] });
    const result = await collect(config(), f);
    expect(result.queues[0]!.before).toMatchObject({ state: 'failed', error: { code: 'EVIDENCE_IDENTITY' } });
    expect(result.collection).toBe('incomplete');
  });
  test('retains unresolved launch intents even when every reader succeeds', async () => {
    const input = config(); input.registration.unresolvedLaunchIds = ['launch-without-ack'];
    const result = await collect(input);
    expect(result.registration.unresolvedLaunchIds).toEqual(['launch-without-ack']);
    expect(result.collection).toBe('complete'); // Reader completion must not resolve launch ambiguity.
  });
});

describe('Exact identities, retained discovery hints, and non-atomic ancestry', () => {
  test('changed start ticks at the same PID is reuse, never presence of the registered identity', async () => {
    const rows = [proc(100, { startTicks: '9007199254740993' }), proc(200)];
    const result = await collect(config(), scripted(rows));
    expect(tracked(result, identity(100)).before).toEqual({ state: 'pid-reused', record: rows[0] });
    expect(result.memory.entries.some(entry => entry.identity.startTicks === '9007199254740993')).toBe(true);
    expect(remembered(result, identity(100)).discoveredBy.kind).toBe('registration');
  });
  test('unchanged boot/PID/start remains present when parent, process group and session change', async () => {
    const rows = [proc(100, { parentPid: 777, group: 888, session: 999 }), proc(200)];
    const result = await collect(config(), scripted(undefined, rows));
    expect(tracked(result, identity(100)).after).toEqual({ state: 'present', record: rows[0] });
    expect(result.memory.entries.filter(entry => entry.identity.pid === 100)).toHaveLength(1);
  });
  test.each(['Z', 'T'])('a %s process is retained as observed, not silently treated as released', async state => {
    const result = await collect(config(), scripted([proc(100, { state }), proc(200)]));
    expect(tracked(result, identity(100)).after).toMatchObject({ state: 'present', record: { state } });
  });
  test('finds multiple descendant generations regardless of row order and records parent identity provenance', async () => {
    const rows = [proc(102, { parentPid: 101 }), proc(101, { parentPid: 100 }), proc(200), proc(100)];
    const result = await collect(config(), scripted(rows));
    expect(remembered(result, identity(101)).discoveredBy).toEqual({ kind: 'parent-link', windowId: 'window-1',
      phase: 'before', parent: identity(100), strength: 'observed-parent' });
    expect(remembered(result, identity(102)).discoveredBy).toMatchObject({ kind: 'parent-link', parent: identity(101) });
    expect(result.memory.entries).toHaveLength(4);
  });
  test('remembers a detached/reparented child after its leader disappears in a later window and registry revision', async () => {
    const first = await collect(config(), scripted([proc(100), proc(101, { parentPid: 100 }), proc(200)]));
    const input = config(); input.memory = JSON.parse(JSON.stringify(first.memory));
    input.windowId = 'window-2'; input.registration.revision = 2;
    input.registration.processes = input.registration.processes.filter(row => row.identity.pid !== 100);
    const second = await collect(input, scripted([proc(101, { parentPid: 1, group: 700, session: 700 }), proc(200)]));
    expect(tracked(second, identity(100)).after.state).toBe('not-observed');
    expect(tracked(second, identity(101)).after.state).toBe('present');
    expect(remembered(second, identity(101)).discoveredBy).toEqual(remembered(first, identity(101)).discoveredBy);
  });
  test('adds a descendant first seen in the closing census, retaining its phase', async () => {
    const result = await collect(config(), scripted(undefined, [proc(100), proc(200), proc(101, { parentPid: 100 })]));
    expect(remembered(result, identity(101)).discoveredBy).toMatchObject({ kind: 'parent-link', phase: 'after' });
    expect(tracked(result, identity(101)).before.state).toBe('not-observed');
    expect(tracked(result, identity(101)).after.state).toBe('present');
  });
  test.each([['group', 'numeric-group'], ['session', 'numeric-session']] as const)(
    'leaderless numeric %s matches remain candidates with weak provenance, not ownership', async (field, kind) => {
      const result = await collect(config(), scripted([proc(101, { [field]: 100 }), proc(200)]));
      expect(remembered(result, identity(101)).discoveredBy).toEqual({ kind, windowId: 'window-1', phase: 'before',
        registration: identity(100), value: 100 });
      expect(tracked(result, identity(100)).after.state).toBe('not-observed');
    });
  test('a missing parent record allows only a PID-based hint, never an observed-parent identity claim', async () => {
    const result = await collect(config(), scripted([proc(101, { parentPid: 100 }), proc(200)]));
    expect(remembered(result, identity(101)).discoveredBy).toMatchObject({ kind: 'parent-link', parent: identity(100), strength: 'numeric-parent-only' });
  });
  test('a reused parent PID cannot establish an observed link to the old registered parent identity', async () => {
    const rows = [proc(101, { parentPid: 100 }), proc(100, { startTicks: '999', group: 700, session: 700 }), proc(200)];
    const result = await collect(config(), scripted(rows));
    expect(tracked(result, identity(100)).before.state).toBe('pid-reused');
    expect(remembered(result, identity(101)).discoveredBy).toEqual({ kind: 'parent-link', windowId: 'window-1',
      phase: 'before', parent: identity(100), strength: 'numeric-parent-only' });
  });
  test('settles stronger parent-chain provenance before freezing first discovery despite reverse rows and weak group hints', async () => {
    const rows = [proc(102, { parentPid: 101, group: 100 }), proc(101, { parentPid: 100, group: 100 }), proc(200), proc(100)];
    const result = await collect(config(), scripted(rows));
    expect(remembered(result, identity(101)).discoveredBy).toEqual({ kind: 'parent-link', windowId: 'window-1',
      phase: 'before', parent: identity(100), strength: 'observed-parent' });
    expect(remembered(result, identity(102)).discoveredBy).toEqual({ kind: 'parent-link', windowId: 'window-1',
      phase: 'before', parent: identity(101), strength: 'observed-parent' });
  });
  test('a reachable cyclic relationship terminates without duplicates or replacing registered provenance', async () => {
    const rows = [proc(102, { parentPid: 101 }), proc(101, { parentPid: 100 }), proc(100, { parentPid: 102 }), proc(200)];
    const result = await collect(config(), scripted(rows));
    expect(result.collection).toBe('complete'); expect(result.memory.entries).toHaveLength(4);
    expect(result.memory.entries.map(row => row.identity.pid).sort((a, b) => a - b)).toEqual([100, 101, 102, 200]);
    expect(remembered(result, identity(100)).discoveredBy.kind).toBe('registration');
    expect(remembered(result, identity(102)).discoveredBy).toMatchObject({ kind: 'parent-link', parent: identity(101) });
  });
  test('preserves discoveries from the first census when later readers fail', async () => {
    const f = scripted([proc(100), proc(101, { parentPid: 100 }), proc(200)]);
    f.io.gpu.mockRejectedValue(fault('GPU_PROBE_EXIT'));
    f.io.census.mockResolvedValueOnce(census([proc(100), proc(101, { parentPid: 100 }), proc(200)]))
      .mockRejectedValueOnce(fault('PROC_CENSUS_IO'));
    const result = await collect(config(), f);
    expect(result.collection).toBe('incomplete');
    expect(remembered(result, identity(101)).discoveredBy.kind).toBe('parent-link');
    expect(tracked(result, identity(101)).after.state).toBe('unavailable');
    expect(result.gpu).toMatchObject({ state: 'failed', error: { code: 'GPU_PROBE_EXIT' } });
  });
  test('rejects a changed boot without mixing its records into memory or continuing collection', async () => {
    const f = scripted(); f.io.census.mockResolvedValueOnce({ ...census(), bootId: otherBoot });
    const result = await collect(config(), f);
    expect(result.stopReason?.code).toBe('EVIDENCE_BOOT');
    expect(result.processes.before.state).toBe('failed');
    expect(result.gpu.state).toBe('not-started');
    expect(f.io.queue).not.toHaveBeenCalled();
    expect(result.memory.entries.every(row => row.identity.bootId === boot)).toBe(true);
  });
  test('the real census schema-error code also stops collection without guessing whether its prose means boot change', async () => {
    const f = scripted(); f.io.census.mockRejectedValueOnce(fault('PROC_CENSUS_SCHEMA'));
    const result = await collect(config(), f);
    expect(result.stopReason?.code).toBe('PROC_CENSUS_SCHEMA');
    expect(result.processes.before).toMatchObject({ state: 'failed', error: { code: 'PROC_CENSUS_SCHEMA' } });
    expect(f.io.queue).not.toHaveBeenCalled(); expect(f.io.gpu).not.toHaveBeenCalled();
  });
  test('memory overflow preserves old entries and the successful raw census, but marks the ledger unusable', async () => {
    const input = config(); input.maxRememberedIdentities = 2;
    const rows = [proc(100), proc(200), proc(101, { parentPid: 100 })];
    const f = scripted(rows), result = await collect(input, f);
    expect(result.stopReason?.code).toBe('EVIDENCE_LIMIT');
    expect(result.collection).toBe('incomplete');
    expect(result.memory.complete).toBe(false);
    expect(result.memory.entries.map(entry => entry.identity)).toEqual([identity(100), identity(200)]);
    expect(value(result.processes.before).processes).toEqual(rows);
    expect(f.io.gpu).not.toHaveBeenCalled();
  });
});

describe('GPU rows are PIDs, not verified identities or allocation ownership', () => {
  test('retains unrelated and invisible GPU rows instead of filtering them out', async () => {
    const result = await collect(config(), scripted([proc(100), proc(200), proc(900)], undefined, [900, 999]));
    expect(value(result.gpu).processes).toEqual([{ gpuUuid, pid: 900 }, { gpuUuid, pid: 999 }]);
    expect(result.gpuCorrelations).toEqual([
      { gpuUuid, pid: 900, before: identity(900), after: identity(900), remembered: [], correlation: 'same-identity' },
      { gpuUuid, pid: 999, before: null, after: null, remembered: [], correlation: 'unseen' },
    ]);
    expect(result.limitations).toContain('pid-attribution-unverified');
  });
  test('flags reuse across the two censuses even if the later process is not registered', async () => {
    const result = await collect(config(), scripted([proc(100), proc(200)], [proc(100, { startTicks: '777' }), proc(200)], [100]));
    expect(result.gpuCorrelations[0]).toMatchObject({ before: identity(100), after: identity(100, '777'), correlation: 'pid-reused' });
    expect(result.gpuCorrelations[0]!.remembered).toContainEqual(identity(100));
  });
  test('retains both historical and current identities sharing a GPU PID; does not transfer ownership', async () => {
    const input = config();
    input.memory.entries = [{ identity: identity(100, '90'), discoveredBy: { kind: 'registration', registrationId: 'old-worker', revision: 1 } }];
    const result = await collect(input, scripted(undefined, undefined, [100]));
    expect(result.gpuCorrelations[0]).toMatchObject({ correlation: 'same-identity' });
    expect(result.gpuCorrelations[0]!.remembered).toEqual(expect.arrayContaining([identity(100, '90'), identity(100)]));
    expect(tracked(result, identity(100, '90')).after.state).toBe('pid-reused');
  });
  test('a remembered child absent from both censuses but still listed by NVIDIA is not forgotten', async () => {
    const first = await collect(config(), scripted([proc(100), proc(101, { parentPid: 100 }), proc(200)]));
    const input = config(); input.memory = first.memory; input.windowId = 'window-2';
    const result = await collect(input, scripted([], [], [101]));
    expect(result.gpuCorrelations[0]).toEqual({ gpuUuid, pid: 101, before: null, after: null,
      remembered: [identity(101)], correlation: 'unseen' });
  });
  test('one successful census cannot substitute for the failed closing census', async () => {
    const f = scripted(undefined, undefined, [100]);
    f.io.census.mockResolvedValueOnce(census()).mockRejectedValueOnce(fault('PROC_CENSUS_IO'));
    const result = await collect(config(), f);
    expect(result.gpuCorrelations[0]).toMatchObject({ before: identity(100), after: null, correlation: 'one-sided' });
    expect(tracked(result, identity(100)).after.state).toBe('unavailable');
  });
});

describe('Capture, validation, deadline and query-child cleanup uncertainty', () => {
  test('captures nested input, memory and callback references before the first await', async () => {
    const input = config(), f = scripted(), gate = deferred<ProcessCensus>();
    const expected = structuredClone(input.registration);
    const originalQueue = f.io.queue;
    f.io.census.mockReturnValueOnce(gate.promise);
    const pending = collect(input, f); await vi.advanceTimersByTimeAsync(0);
    input.registration.attemptId = 'other'; input.registration.processes[0]!.identity.startTicks = '999';
    input.registration.comfyServices[0]!.transport.port = 8188;
    input.gpu.expectedGpuUuids.length = 0; input.memory.attemptId = 'other';
    f.io.queue = vi.fn(async () => { throw new Error('mutated callback must not run'); });
    gate.resolve(census()); const result = await pending;
    expect(result.registration).toEqual(expected);
    expect(originalQueue).toHaveBeenCalledTimes(2);
    expect(originalQueue.mock.calls[0]![0].port).toBe(8198);
    expect(f.io.gpu.mock.calls[0]![0].expectedGpuUuids).toEqual([gpuUuid]);
  });
  test('captures completed reader data before another callback can mutate it', async () => {
    const f = scripted(), first = census(), last = deferred<ProcessCensus>();
    f.io.census.mockResolvedValueOnce(first).mockReturnValueOnce(last.promise);
    const pending = collect(config(), f); await vi.advanceTimersByTimeAsync(0);
    first.processes[0]!.startTicks = '999'; first.processes.length = 0;
    last.resolve(census()); const result = await pending;
    expect(value(result.processes.before).processes[0]!.startTicks).toBe('100');
    expect(tracked(result, identity(100)).before.state).toBe('present');
  });
  const invalid: Array<[string, (input: EvidenceConfig) => void]> = [
    ['mixed registry boot', c => { c.registration.processes[0]!.identity.bootId = otherBoot; }],
    ['mixed census boot', c => { c.census.expectedBootId = otherBoot; }],
    ['another attempt memory', c => { c.memory.attemptId = 'other'; }],
    ['incomplete memory', c => { c.memory.complete = false; }],
    ['noncanonical start ticks', c => { c.registration.processes[0]!.identity.startTicks = '0100'; }],
    ['duplicate registration ID', c => { c.registration.processes[1]!.registrationId = 'process-100'; }],
    ['unregistered service', c => { c.registration.comfyServices[0]!.registrationId = 'not-registered'; }],
    ['service identity mismatch', c => { c.registration.comfyServices[0]!.transport.owner.start = '999'; }],
    ['nonpositive window budget', c => { c.timeoutMs = 0; }],
    ['nonfinite drain budget', c => { c.drainTimeoutMs = Infinity; }],
  ];
  test.each(invalid)('rejects %s before any native callback', async (_name, change) => {
    const input = config(), f = scripted(); change(input);
    await expect(collect(input, f)).rejects.toMatchObject({ code: 'EVIDENCE_CONFIG' });
    expect(f.io.census).not.toHaveBeenCalled(); expect(f.io.queue).not.toHaveBeenCalled(); expect(f.io.gpu).not.toHaveBeenCalled();
  });
  test('pre-abort performs no native I/O and leaves every phase explicitly unstarted', async () => {
    const abort = caller(), f = scripted(); abort.abort();
    const result = await collect(config(), f, abort.signal);
    expect(result.stopReason?.code).toBe('EVIDENCE_ABORTED');
    expect(result.processes.before.state).toBe('not-started'); expect(result.gpu.state).toBe('not-started');
    expect(f.calls).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });
  test('shares the original deadline across phases and gives each reader only its remaining budget', async () => {
    const f = scripted();
    f.io.census.mockImplementationOnce(async () => {
      const start = stamp(); await new Promise(resolve => setTimeout(resolve, 40));
      return { ...census(), startedAtMs: start };
    });
    f.io.queue.mockImplementationOnce(async c => {
      await new Promise(resolve => setTimeout(resolve, 40));
      return { kind: 'comfy-whole-queue', service: c.owner, running: [], queued: [] };
    });
    f.io.gpu.mockImplementation((_c, current) => new Promise((_resolve, reject) => {
      current.addEventListener('abort', () => reject(fault('GPU_PROBE_ABORTED')), { once: true });
    }));
    const pending = collect(config(), f); await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(f.io.census.mock.calls[0]![0].timeoutMs).toBe(100);
    expect(f.io.queue.mock.calls[0]![0].requestTimeoutMs).toBe(60);
    expect(f.io.gpu.mock.calls[0]![0].timeoutMs).toBe(20);
    expect(result.stopReason?.code).toBe('EVIDENCE_TIMEOUT');
    expect(result.queues[0]!.after.state).toBe('not-started');
    expect(result.finishedAtMs).toBe(100); expect(vi.getTimerCount()).toBe(0);
  });
  test('caller abort signals the active reader, preserves earlier discovery and starts no further phase', async () => {
    const abort = caller(), f = scripted([proc(100), proc(101, { parentPid: 100 }), proc(200)]);
    f.io.queue.mockImplementation((_c, current) => new Promise((_resolve, reject) => {
      current.addEventListener('abort', () => reject(fault('COMFY_ABORTED')), { once: true });
    }));
    const pending = collect(config(), f, abort.signal); await vi.advanceTimersByTimeAsync(0);
    abort.abort(); const result = await pending;
    expect(result.stopReason?.code).toBe('EVIDENCE_ABORTED');
    expect(f.io.queue.mock.calls[0]![1].aborted).toBe(true);
    expect(remembered(result, identity(101)).discoveredBy.kind).toBe('parent-link');
    expect(f.io.gpu).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  test('closing-census completion exactly at the original deadline cannot produce a successful window', async () => {
    const rows = [proc(100), proc(101, { parentPid: 100 }), proc(200)], f = scripted(rows);
    f.io.census.mockImplementationOnce(async () => census(rows)).mockImplementationOnce(async () => {
      const result = census(rows);
      // No timer fires: force the completion/finalization check itself to catch equality.
      vi.spyOn(performance, 'now').mockReturnValue(100); return result;
    });
    const result = await collect(config(), f);
    expect(result.collection).toBe('incomplete'); expect(result.stopReason?.code).toBe('EVIDENCE_TIMEOUT');
    expect(result.processes.after).toMatchObject({ state: 'failed', error: { code: 'EVIDENCE_TIMEOUT' } });
    expect(remembered(result, identity(101)).discoveredBy).toMatchObject({ kind: 'parent-link', phase: 'before' });
    expect(vi.getTimerCount()).toBe(0);
  });
  test('the final data-sized collection classification must also fit the original deadline', async () => {
    const original = Array.prototype.every;
    let charged = false;
    vi.spyOn(Array.prototype, 'every').mockImplementation(function(this: unknown[], callback, thisArg) {
      // Inject synchronous assessment cost AFTER the closing census. No timer
      // fires; the return-boundary check itself must catch expiration.
      if (!charged && this.length === 5 && this[0] && typeof this[0] === 'object' && 'state' in this[0]) {
        charged = true; vi.spyOn(performance, 'now').mockReturnValue(100);
      }
      return original.call(this, callback, thisArg);
    });
    const result = await collect();
    expect(charged).toBe(true);
    expect(result.collection).toBe('incomplete');
    expect(result.stopReason?.code).toBe('EVIDENCE_TIMEOUT');
    expect(result.finishedAtMs).toBe(100);
  });
  test('deadline abort allows bounded query-child cleanup but never accepts a late success', async () => {
    const f = scripted();
    f.io.gpu.mockImplementation((_c, current) => new Promise(resolve => {
      current.addEventListener('abort', () => setTimeout(() => resolve(gpu([999])), 10), { once: true });
    }));
    const pending = collect(config(), f); await vi.advanceTimersByTimeAsync(110);
    const result = await pending;
    expect(result.gpu).toMatchObject({ state: 'failed', error: { code: 'EVIDENCE_TIMEOUT' }, settlement: 'settled' });
    expect(result.gpuCorrelations).toEqual([]);
    expect(result.observationFinishedAtMs).toBe(100); expect(result.finishedAtMs).toBe(110);
    expect(result.processes.after.state).toBe('not-started'); expect(vi.getTimerCount()).toBe(0);
  });
  test('keeps native query PID and cleanup failure reported during the drain grace', async () => {
    const f = scripted();
    f.io.gpu.mockImplementation((_c, current) => new Promise((_resolve, reject) => {
      current.addEventListener('abort', () => setTimeout(() => reject(Object.assign(fault('GPU_PROBE_CLEANUP'),
        { cleanupConfirmed: false, queryPid: 4321 })), 10), { once: true });
    }));
    const pending = collect(config(), f); await vi.advanceTimersByTimeAsync(110);
    const result = await pending;
    expect(result.gpu).toMatchObject({ state: 'failed', error: { code: 'EVIDENCE_TIMEOUT' }, settlement: 'settled',
      adapterError: { code: 'GPU_PROBE_CLEANUP', cleanupConfirmed: false, queryPid: 4321 } });
    expect(result.collection).toBe('incomplete');
  });
  test('bounds an uncooperative callback and ignores late completion without mutating the returned ledger', async () => {
    const f = scripted(), gate = deferred<ComputeSnapshot>(); f.io.gpu.mockReturnValueOnce(gate.promise);
    const pending = collect(config(), f); await vi.advanceTimersByTimeAsync(120);
    const result = await pending, saved = structuredClone(result);
    expect(result.gpu).toMatchObject({ state: 'failed', settlement: 'pending', error: { code: 'EVIDENCE_TIMEOUT' } });
    expect(result.finishedAtMs).toBe(120);
    expect(f.io.gpu.mock.calls[0]![1].aborted).toBe(true);
    gate.resolve(gpu([999])); await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual(saved); expect(f.io.census).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  test.each(['before-start', 'backwards', 'future'] as const)('rejects %s reader timestamps instead of accepting another clock context', async kind => {
    const f = scripted();
    f.io.census.mockResolvedValueOnce({ ...census(), startedAtMs: kind === 'before-start' ? -1 : 0,
      finishedAtMs: kind === 'backwards' ? -1 : kind === 'future' ? 9999 : 0 });
    const result = await collect(config(), f);
    expect(result.stopReason?.code).toBe('EVIDENCE_CLOCK');
    expect(result.processes.before.state).toBe('failed'); expect(f.io.gpu).not.toHaveBeenCalled();
  });
  test('a backwards collector clock stops the window even if the reader snapshot has valid timestamps', async () => {
    const f = scripted();
    f.io.census.mockImplementationOnce(async () => {
      const result = census(); vi.spyOn(performance, 'now').mockReturnValue(-1); return result;
    });
    const result = await collect(config(), f);
    expect(result.stopReason?.code).toBe('EVIDENCE_CLOCK');
    expect(result.collection).toBe('incomplete'); expect(f.io.queue).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
