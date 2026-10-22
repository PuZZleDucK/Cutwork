/** Approved integration assertions: actual collector, synthetic readers/exit receipts.
 * No native I/O, process control or release authorization. */
import { beforeAll, beforeEach, afterEach, expect, test, vi } from 'vitest';
import { collectRegisteredWorkEvidence, type EvidenceConfig, type EvidenceIo,
  type Identity, type ProcessMemory } from '../../apps/server/src/jobs/registered-work-evidence.ts';
import type { ProcessRecord } from '../../apps/server/src/jobs/linux-process-census.ts';
import { loadAssessment, type AssessmentInput, type AssessmentModule,
  type NativeExitReceipt, type WorkAssessment, type Unresolved } from '../support/registered-work-assessment-contract.ts';

let module: AssessmentModule;
beforeAll(async () => { module = await loadAssessment(); });
beforeEach(() => vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] }));
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const boot = '11111111-1111-4111-8111-111111111111';
const gpuUuid = 'GPU-33333333-3333-4333-8333-333333333333';
const job = '44444444-4444-4444-8444-444444444444';
const identity = (pid: number, startTicks = String(pid)): Identity => ({ bootId: boot, pid, startTicks });
const proc = (pid: number, changes: Partial<ProcessRecord> = {}): ProcessRecord => ({
  pid, parentPid: 1, group: pid, session: pid, startTicks: String(pid), state: 'S', ...changes,
});
const owner = { kind: 'process' as const, pid: 100, group: 100, start: '100', boot };
function config(): EvidenceConfig {
  return { windowId: 'window-1', timeoutMs: 100, drainTimeoutMs: 20, maxRememberedIdentities: 100,
    registration: { attemptId: 'attempt-1', revision: 1, bootId: boot,
      processes: [{ registrationId: 'service', identity: identity(100), group: 100, session: 100 }],
      comfyServices: [{ registrationId: 'service', transport: { owner, port: 8198,
        requestTimeoutMs: 100, maxResponseBytes: 4096 } }], unresolvedLaunchIds: [] },
    memory: { attemptId: 'attempt-1', bootId: boot, complete: true, entries: [] },
    census: { expectedBootId: boot, timeoutMs: 100, maxDirectoryEntries: 1000, maxFileBytes: 4096 },
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpuUuid],
      timeoutMs: 100, cleanupTimeoutMs: 10, maxOutputBytes: 4096 } };
}
const exit = (): NativeExitReceipt => ({ receiptId: 'exit-1', attemptId: 'attempt-1',
  registrationId: 'service', beforeWindowId: 'window-1', owner: { ...owner },
  observedAtMs: 0, exitCode: 0, signalCode: null });
function memoryWithChild(): ProcessMemory {
  const m = config().memory;
  m.entries.push({ identity: identity(101), discoveredBy: { kind: 'parent-link',
    parent: identity(100), strength: 'observed-parent', windowId: 'earlier-window', phase: 'before' } });
  return m;
}
type Setup = { before?: ProcessRecord[]; after?: ProcessRecord[]; gpuPids?: number[];
  queues?: 'failed' | 'empty' | 'busy'; memory?: ProcessMemory;
  configure?: (c: EvidenceConfig) => void; io?: (io: EvidenceIo) => void };
async function capture(setup: Setup = {}): Promise<AssessmentInput> {
  const c = config(); if (setup.memory) c.memory = structuredClone(setup.memory);
  setup.configure?.(c);
  const priorMemory = structuredClone(c.memory), expectedRegistration = structuredClone(c.registration);
  let phase = 0;
  const before = setup.before ?? [proc(999)], after = setup.after ?? before;
  const io: EvidenceIo = {
    census: async () => ({ kind: 'linux-process-census', scope: 'visible-procfs', bootId: boot,
      startedAtMs: performance.now(), finishedAtMs: performance.now(), processes: phase++ === 0 ? before : after }),
    queue: async t => {
      if ((setup.queues ?? 'failed') === 'failed') throw Object.assign(new Error('Synthetic captured service unavailable'),
        { code: 'COMFY_IDENTITY' });
      return { kind: 'comfy-whole-queue', service: t.owner, running: setup.queues === 'busy' ? [job] : [], queued: [] };
    },
    gpu: async () => ({ kind: 'nvidia-compute-process-snapshot', gpuUuids: [gpuUuid],
      startedAtMs: performance.now(), finishedAtMs: performance.now(),
      processes: (setup.gpuPids ?? [999]).map(pid => ({ gpuUuid, pid })), queries: [] }),
  };
  setup.io?.(io);
  const evidence = await collectRegisteredWorkEvidence(c, new AbortController().signal, io);
  return { expectedRegistration, priorMemory, evidence, exits: [exit()] };
}
function assess(input: AssessmentInput): WorkAssessment {
  const before = JSON.stringify(input), result = module.assessRegisteredWork(input);
  expect(JSON.stringify(input)).toBe(before); // No rewriting a failed queue or ledger.
  expect(result).toMatchObject({ kind: 'registered-work-assessment', scope: 'captured-registration-only',
    windowId: input.evidence.windowId, attemptId: input.expectedRegistration.attemptId,
    registrationRevision: input.expectedRegistration.revision,
    startedAtMs: input.evidence.startedAtMs, finishedAtMs: input.evidence.finishedAtMs });
  expect(result.limitations).toEqual(expect.arrayContaining([...input.evidence.limitations, 'not-dispatch-authorization']));
  for (const key of ['ownerKnown', 'nativeQueueEmpty', 'gpuClear', 'resourcesReleased', 'maySubmit', 'dispatchNext']) {
    expect(result).not.toHaveProperty(key);
  }
  expect(vi.getTimerCount()).toBe(0);
  return result;
}
function unresolved(result: WorkAssessment, code: Unresolved['code']) {
  expect(result.unresolved).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  expect(result.state).not.toBe('no-matching-activity-observed');
}

test('confirmed exit plus absent identity resolves unavailable service without inventing an empty queue', async () => {
  const input = await capture();
  expect(input.evidence.collection).toBe('incomplete');
  const result = assess(input);
  expect(result.state).toBe('no-matching-activity-observed');
  expect(result.findings).toEqual([]); expect(result.unresolved).toEqual([]);
  expect(result.retiredServices).toEqual([{ registrationId: 'service', identity: identity(100),
    receiptId: 'exit-1', queue: 'unavailable-after-confirmed-exit' }]);
  expect(result.processes).toHaveLength(1);
  expect(result.processes[0]).toMatchObject({ identity: identity(100),
    discoveredBy: { kind: 'registration', registrationId: 'service', revision: 1 },
    before: { state: 'not-observed' }, after: { state: 'not-observed' } });
  expect(result.gpuRows).toEqual(input.evidence.gpuCorrelations);
  expect(result.gpuRows[0]).toMatchObject({ pid: 999, correlation: 'same-identity', remembered: [] });
  expect(result.limitations).toContain('pid-attribution-unverified');
  for (const phase of ['before', 'after'] as const) expect(input.evidence.queues[0]![phase].state).toBe('failed');
});

test('absence in both censuses without an independent exit receipt remains indeterminate', async () => {
  const input = await capture(); input.exits = [];
  const result = assess(input);
  expect(result.state).toBe('indeterminate'); unresolved(result, 'service-exit-unverified');
  expect(result.retiredServices).toEqual([]);
});

test('an idle live service with empty queues is observed, not retired or released', async () => {
  const input = await capture({ before: [proc(100), proc(999)], queues: 'empty' }); input.exits = [];
  const result = assess(input);
  expect(result.state).toBe('activity-observed');
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({
    kind: 'registered-process-observed', identity: identity(100), phase: 'before' })]));
  expect(result.retiredServices).toEqual([]);
});

test('queue work is reported with phase/service references even when other evidence also shows activity', async () => {
  const input = await capture({ before: [proc(100), proc(999)], queues: 'busy' }); input.exits = [];
  const result = assess(input);
  expect(result.state).toBe('activity-observed');
  expect(result.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'queue-work-observed', registrationId: 'service', phase: 'before' }),
    expect.objectContaining({ kind: 'queue-work-observed', registrationId: 'service', phase: 'after' }),
  ]));
});

test.each(['busy', 'unverified-exit'] as const)('a second service with %s evidence is not hidden by the first retired service', async mode => {
  const input = await capture({ before: mode === 'busy' ? [proc(200), proc(999)] : [proc(999)],
    configure: c => {
      c.registration.processes.push({ registrationId: 'second-service', identity: identity(200), group: 200, session: 200 });
      c.registration.comfyServices.push({ registrationId: 'second-service', transport: {
        ...c.registration.comfyServices[0]!.transport, port: 8298,
        owner: { kind: 'process', pid: 200, group: 200, start: '200', boot } } });
    }, io: io => {
      const read = io.queue;
      io.queue = (t, s) => t.owner.pid === 200 && mode === 'busy'
        ? Promise.resolve({ kind: 'comfy-whole-queue', service: t.owner, running: [job], queued: [] }) : read(t, s);
    } });
  const result = assess(input);
  expect(result.retiredServices.map(s => s.registrationId)).toEqual(['service']);
  if (mode === 'busy') {
    expect(result.state).toBe('activity-observed');
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'queue-work-observed', registrationId: 'second-service' })]));
  } else {
    expect(result.state).toBe('indeterminate');
    expect(result.unresolved).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'service-exit-unverified', registrationId: 'second-service' })]));
  }
});

test.each(['Z', 'T'] as const)('registered process state %s cannot be mistaken for absent', async state => {
  const input = await capture({ before: [proc(100, { state }), proc(999)], queues: 'empty' }); input.exits = [];
  const result = assess(input);
  expect(result.state).toBe('activity-observed');
  expect(result.processes[0]!.before).toMatchObject({ state: 'present', record: { state } });
});

test('exact identity survives reparenting and changed group/session metadata', async () => {
  const input = await capture({ before: [proc(100, { parentPid: 7, group: 70, session: 70 }), proc(999)], queues: 'empty' });
  input.exits = []; const result = assess(input);
  expect(result.state).toBe('activity-observed');
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ identity: identity(100) })]));
});

test('a remembered child surviving its exited leader remains visible without ownership promotion', async () => {
  const input = await capture({ memory: memoryWithChild(), before: [proc(101), proc(999)] });
  const result = assess(input);
  expect(result.state).toBe('activity-observed'); unresolved(result, 'candidate-association');
  expect(result.processes.find(row => row.identity.pid === 101)).toMatchObject({
    discoveredBy: input.priorMemory.entries[0]!.discoveredBy, before: { state: 'present' }, after: { state: 'present' } });
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({
    kind: 'associated-process-observed', identity: identity(101) })]));
});

test('a numeric group hint stays unresolved rather than becoming proved ownership', async () => {
  const input = await capture({ before: [proc(101, { group: 100 }), proc(999)] });
  const result = assess(input); unresolved(result, 'candidate-association');
  expect(result.processes.find(row => row.identity.pid === 101)?.discoveredBy.kind).toBe('numeric-group');
});

test.each(['before', 'after'] as const)('%s census failure stays uncertain despite a valid exit receipt', async phase => {
  let n = 0;
  const input = await capture({ io: io => {
    const read = io.census; io.census = (c, s) => ++n === (phase === 'before' ? 1 : 2)
      ? Promise.reject(Object.assign(new Error('Synthetic scan failure'), { code: 'PROC_CENSUS_IO' })) : read(c, s);
  } });
  const result = assess(input); unresolved(result, 'census-unavailable');
  expect(result.state).toBe('indeterminate'); expect(result.retiredServices).toEqual([]);
});

test('observed activity and failed GPU evidence are both retained rather than one hiding the other', async () => {
  const input = await capture({ before: [proc(100), proc(999)], queues: 'empty', io: io => {
    io.gpu = async () => { throw Object.assign(new Error('Synthetic query failure'), { code: 'GPU_PROBE_EXIT' }); };
  } }); input.exits = [];
  const result = assess(input);
  expect(result.state).toBe('activity-observed'); unresolved(result, 'gpu-unavailable');
  expect(result.findings.some(f => f.kind === 'registered-process-observed')).toBe(true);
});

test('unresolved GPU query cleanup retains uncertainty independently of service exit', async () => {
  const input = await capture({ io: io => { io.gpu = async () => { throw Object.assign(
    new Error('Synthetic cleanup failure'), { code: 'GPU_PROBE_CLEANUP', cleanupConfirmed: false, queryPid: 777 }); }; } });
  const result = assess(input); unresolved(result, 'query-cleanup-unresolved');
  expect(result.state).toBe('indeterminate');
});

test('a pending reader at the original deadline cannot supply a quiet assessment', async () => {
  const pending = capture({ io: io => { io.gpu = () => new Promise(() => {}); } });
  await vi.advanceTimersByTimeAsync(120);
  const input = await pending;
  expect(input.evidence.gpu).toMatchObject({ state: 'failed', settlement: 'pending' });
  const result = assess(input); unresolved(result, 'reader-pending'); unresolved(result, 'collection-stopped');
});

test('unresolved launch intent survives an otherwise quiet observation', async () => {
  const input = await capture({ configure: c => { c.registration.unresolvedLaunchIds = ['launch-not-acknowledged']; } });
  const result = assess(input); unresolved(result, 'unresolved-launch'); expect(result.state).toBe('indeterminate');
});

test('incomplete memory produced by capacity overflow cannot be treated as a complete identity set', async () => {
  const input = await capture({ before: [proc(100), proc(101, { parentPid: 100 })], queues: 'empty',
    configure: c => { c.maxRememberedIdentities = 1; } }); input.exits = [];
  expect(input.evidence.memory.complete).toBe(false);
  unresolved(assess(input), 'memory-incomplete');
});

test.each(['identity', 'provenance'] as const)('loss of prior %s history cannot silently clear a remembered child', async field => {
  const input = await capture({ memory: memoryWithChild() });
  if (field === 'identity') {
    input.evidence.memory.entries = input.evidence.memory.entries.filter(e => e.identity.pid !== 101);
    input.evidence.identities = input.evidence.identities.filter(e => e.identity.pid !== 101);
  } else input.evidence.memory.entries.find(e => e.identity.pid === 101)!.discoveredBy = {
    kind: 'registration', registrationId: 'invented', revision: 1 };
  unresolved(assess(input), 'history-lost');
});

test.each(['attempt', 'revision', 'transport'] as const)('mismatched expected registration %s cannot assess another capture', async field => {
  const input = await capture();
  if (field === 'attempt') input.expectedRegistration.attemptId = 'other-attempt';
  if (field === 'revision') input.expectedRegistration.revision++;
  if (field === 'transport') input.expectedRegistration.comfyServices[0]!.transport.port++;
  const result = assess(input); unresolved(result, 'report-binding-mismatch'); expect(result.state).toBe('indeterminate');
});

test('binding mismatch takes precedence over a foreign live and busy report', async () => {
  const input = await capture({ before: [proc(100), proc(999)], queues: 'busy' });
  input.exits = []; input.expectedRegistration.attemptId = 'other-attempt';
  const result = assess(input);
  unresolved(result, 'report-binding-mismatch'); expect(result.state).toBe('indeterminate');
  expect(result.findings).toEqual([]); expect(result.retiredServices).toEqual([]);
});

test('remembered PID with a lingering GPU row remains a match even when its process is absent', async () => {
  const input = await capture({ memory: memoryWithChild(), gpuPids: [101, 999] });
  const result = assess(input); expect(result.state).toBe('activity-observed');
  expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'gpu-pid-match', gpuRowIndex: 0 })]));
  unresolved(result, 'historical-gpu-pid'); expect(result.gpuRows).toEqual(input.evidence.gpuCorrelations);
});

test('stable replacement PID cannot explain away an allocation matching a historical identity', async () => {
  const input = await capture({ memory: memoryWithChild(), before: [proc(101, { startTicks: '900' }), proc(999)], gpuPids: [101, 999] });
  expect(input.evidence.gpuCorrelations[0]!.correlation).toBe('same-identity');
  const result = assess(input); unresolved(result, 'historical-gpu-pid');
  expect(result.state).toBe('activity-observed');
  expect(result.gpuRows[0]!.remembered).toContainEqual(identity(101));
});

test('PID reuse without a GPU row remains ambiguous, not absence of the remembered identity', async () => {
  const input = await capture({ memory: memoryWithChild(), before: [proc(101, { startTicks: '900' }), proc(999)] });
  unresolved(assess(input), 'process-pid-reused');
});

test.each(['one-sided', 'unseen'] as const)('%s unassociated GPU PID stays uncertain, not unrelated', async mode => {
  const input = await capture({ before: mode === 'one-sided' ? [proc(777), proc(999)] : [proc(999)],
    after: [proc(999)], gpuPids: [777, 999] });
  const result = assess(input); unresolved(result, 'gpu-correlation-uncertain');
  expect(result.gpuRows).toEqual(input.evidence.gpuCorrelations);
  expect(result.state).toBe('indeterminate');
});

test.each(['owner', 'attempt', 'window', 'future', 'no-outcome', 'conflicting-outcomes'] as const)(
  'exit receipt with %s mismatch cannot retire a failed queue', async mode => {
    const input = await capture(), receipt = input.exits[0]!;
    if (mode === 'owner') receipt.owner.start = '900';
    if (mode === 'attempt') receipt.attemptId = 'other-attempt';
    if (mode === 'window') receipt.beforeWindowId = 'different-window';
    if (mode === 'future') receipt.observedAtMs = input.evidence.finishedAtMs + 1;
    if (mode === 'no-outcome') receipt.exitCode = null;
    if (mode === 'conflicting-outcomes') receipt.signalCode = 'SIGTERM';
    const result = assess(input); unresolved(result, 'service-exit-unverified');
    expect(result.retiredServices).toEqual([]);
  });

test('an exit observed inside a nonzero observation window is not preceding exit evidence', async () => {
  const input = await capture({ io: io => {
    const read = io.gpu;
    io.gpu = (c, s) => { vi.advanceTimersByTime(10); return read(c, s); };
  } });
  const { startedAtMs, finishedAtMs } = input.evidence;
  expect(finishedAtMs).toBeGreaterThan(startedAtMs);
  const receipt = input.exits[0]!;
  receipt.observedAtMs = (startedAtMs + finishedAtMs) / 2;
  expect(receipt.observedAtMs).toBeGreaterThan(startedAtMs);
  expect(receipt.observedAtMs).toBeLessThan(finishedAtMs);
  const result = assess(input); unresolved(result, 'service-exit-unverified');
  expect(result.retiredServices).toEqual([]);
});

test.each(['nonzero-exit', 'signal-exit'] as const)('%s is actual exit evidence, not necessarily successful generation', async kind => {
  const input = await capture(), receipt = input.exits[0]!;
  if (kind === 'nonzero-exit') receipt.exitCode = 1;
  else { receipt.exitCode = null; receipt.signalCode = 'SIGTERM'; }
  expect(assess(input).state).toBe('no-matching-activity-observed');
});

test('an exit receipt contradicting a still-present exact service cannot retire it', async () => {
  const input = await capture({ before: [proc(100), proc(999)], queues: 'empty' });
  const result = assess(input); unresolved(result, 'exit-evidence-conflict');
  expect(result.state).toBe('activity-observed'); expect(result.retiredServices).toEqual([]);
});

test('successful service queue observations contradict retirement despite census absence', async () => {
  const input = await capture({ queues: 'empty' });
  const result = assess(input); unresolved(result, 'exit-evidence-conflict');
  expect(result.state).toBe('indeterminate'); expect(result.retiredServices).toEqual([]);
});

test('removing derived presence for a remembered identity cannot be treated as absence', async () => {
  const input = await capture(); input.evidence.identities = [];
  unresolved(assess(input), 'report-inconsistent');
});

test('a missing queue observation cannot silently drop a registered service', async () => {
  const input = await capture(); input.evidence.queues = [];
  unresolved(assess(input), 'report-inconsistent');
});

test('a pending failed queue cannot be retired even with matching process exit evidence', async () => {
  const input = await capture(), q = input.evidence.queues[0]!.before;
  if (q.state !== 'failed') throw new Error('Expected failed queue fixture');
  q.settlement = 'pending';
  const result = assess(input); unresolved(result, 'reader-pending');
  expect(result.retiredServices).toEqual([]);
});

test('dropping derived GPU correlation cannot hide a raw row matching historical memory', async () => {
  const input = await capture({ memory: memoryWithChild(), gpuPids: [101, 999] });
  input.evidence.gpuCorrelations = input.evidence.gpuCorrelations.filter(row => row.pid !== 101);
  unresolved(assess(input), 'report-inconsistent');
});

test('assessment summaries are detached from later mutation of the input report', async () => {
  const input = await capture(), result = assess(input), retained = JSON.stringify(result);
  input.evidence.gpuCorrelations[0]!.remembered.push(identity(999));
  input.evidence.memory.entries[0]!.identity.startTicks = 'changed';
  input.evidence.limitations.push('later-change');
  expect(JSON.stringify(result)).toBe(retained);
});

// Implementation-review regressions; the 45 approved assertions above are unchanged.
test('successful queues for an absent service remain contradictory without an exit receipt', async () => {
  const input = await capture({ queues: 'empty' }); input.exits = [];
  const result = assess(input); unresolved(result, 'report-inconsistent');
  expect(result.state).toBe('indeterminate'); expect(result.retiredServices).toEqual([]);
});

test.each(['retired-first', 'inconsistent-first'] as const)('service inconsistency prevents retirement in %s order', async order => {
  const input = await capture({ configure: c => {
    c.registration.processes.push({ registrationId: 'second-service', identity: identity(200), group: 200, session: 200 });
    c.registration.comfyServices.push({ registrationId: 'second-service', transport: {
      ...c.registration.comfyServices[0]!.transport, port: 8298,
      owner: { kind: 'process', pid: 200, group: 200, start: '200', boot } } });
    if (order === 'inconsistent-first') c.registration.comfyServices.reverse();
  } });
  input.evidence.queues.find(q => q.registrationId === 'second-service')!.before = { state: 'ok', startedAtMs: 0, finishedAtMs: 0,
    value: { kind: 'comfy-whole-queue', service: { ...owner }, running: [], queued: [] } };
  const result = assess(input); unresolved(result, 'report-inconsistent');
  expect(result.retiredServices).toEqual([]);
});

test('a service can answer queues then exit before the closing census without invalidating another retirement', async () => {
  const input = await capture({ before: [proc(200), proc(999)], after: [proc(999)], configure: c => {
    c.registration.processes.push({ registrationId: 'second-service', identity: identity(200), group: 200, session: 200 });
    c.registration.comfyServices.push({ registrationId: 'second-service', transport: {
      ...c.registration.comfyServices[0]!.transport, port: 8298,
      owner: { kind: 'process', pid: 200, group: 200, start: '200', boot } } });
  }, io: io => {
    const read = io.queue;
    io.queue = (t, s) => t.owner.pid === 200
      ? Promise.resolve({ kind: 'comfy-whole-queue', service: t.owner, running: [], queued: [] }) : read(t, s);
  } });
  const result = assess(input);
  expect(result.state).toBe('activity-observed');
  expect(result.unresolved.some(u => u.code === 'report-inconsistent')).toBe(false);
  expect(result.retiredServices.map(s => s.registrationId)).toEqual(['service']);
  expect(result.processes.find(p => p.identity.pid === 200)).toMatchObject({
    before: { state: 'present' }, after: { state: 'not-observed' } });
});
