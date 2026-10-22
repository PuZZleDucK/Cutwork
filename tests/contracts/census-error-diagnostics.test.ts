/** Approved synthetic filesystem errors through the actual reader and collector.
 * No real procfs, HTTP, CLI, provider or GPU I/O. */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ProcessCensusError, readLinuxProcessCensus,
  type CensusIo } from '../../apps/server/src/jobs/linux-process-census.ts';
import { collectRegisteredWorkEvidence, type EvidenceConfig, type EvidenceIo,
  type RegisteredWorkEvidence } from '../../apps/server/src/jobs/registered-work-evidence.ts';

const boot = '11111111-1111-4111-8111-111111111111';
const gpuUuid = 'GPU-33333333-3333-4333-8333-333333333333';
const bootPath = '/proc/sys/kernel/random/boot_id';
const statPath = '/proc/200/stat';
const owner = { kind: 'process' as const, pid: 100, group: 100, start: '100', boot };
const config = (): EvidenceConfig => ({
  windowId: 'diagnostic-window', timeoutMs: 100, drainTimeoutMs: 20, maxRememberedIdentities: 50,
  registration: { attemptId: 'diagnostic-attempt', revision: 1, bootId: boot,
    processes: [{ registrationId: 'service', identity: { bootId: boot, pid: 100, startTicks: '100' },
      group: 100, session: 100 }],
    comfyServices: [{ registrationId: 'service', transport: { port: 8198, owner,
      requestTimeoutMs: 100, maxResponseBytes: 4096 } }], unresolvedLaunchIds: [] },
  memory: { attemptId: 'diagnostic-attempt', bootId: boot, complete: true, entries: [] },
  census: { expectedBootId: boot, timeoutMs: 100, maxDirectoryEntries: 10, maxFileBytes: 4096 },
  gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpuUuid],
    timeoutMs: 100, cleanupTimeoutMs: 10, maxOutputBytes: 4096 },
});
function stat(pid: number) {
  // Kernel fields 3..52: state, parent/group/session, fields 7..21,
  // exact starttime (22), then 23..52. Synthetic values only.
  return Buffer.from(`${pid} (diagnostic fixture) ${[
    'S', '1', String(pid), String(pid), ...Array<string>(15).fill('0'),
    String(pid), ...Array<string>(30).fill('0'),
  ].join(' ')}\n`);
}
type Stage = 'stat' | 'boot-before' | 'directory' | 'boot-after' | 'stat-sync';
const pathFor = (stage: Stage) => stage === 'directory' ? '/proc' :
  stage.startsWith('boot-') ? bootPath : statPath;
function nativeError(code = 'ENOENT', path = statPath, syscall = 'open', errno = -2) {
  return Object.assign(new Error(`${code}: synthetic ${syscall} failure at ${path}`),
    { code, errno, syscall, path });
}
function diagnostic(cause: ReturnType<typeof nativeError>) {
  // Expected data only. This is not used to transform the actual report.
  return { name: 'Error', message: cause.message, code: cause.code,
    errno: cause.errno, syscall: cause.syscall, path: cause.path };
}
const completeReads = [bootPath, '/proc', '/proc/100/stat', statPath, '/proc/300/stat', bootPath];
function readsThrough(stage: Stage) {
  if (stage === 'boot-before') return [bootPath];
  if (stage === 'directory') return [bootPath, '/proc'];
  if (stage === 'boot-after') return completeReads;
  return completeReads.slice(0, 4);
}
function filesystem(cause: unknown, stage: Stage, failing: boolean) {
  const calls: string[] = [];
  let bootReads = 0;
  const io: CensusIo = {
    readdir: (path, signal) => {
      expect(signal.aborted).toBe(false); calls.push(path); expect(path).toBe('/proc');
      return failing && stage === 'directory' ? Promise.reject(cause) : Promise.resolve(['100', '200', '300']);
    },
    readFile: (path, signal) => {
      expect(signal.aborted).toBe(false); calls.push(path);
      if (path === bootPath) {
        bootReads++;
        if (failing && ((stage === 'boot-before' && bootReads === 1) ||
            (stage === 'boot-after' && bootReads === 2))) return Promise.reject(cause);
        return Promise.resolve(Buffer.from(boot + '\n'));
      }
      if (failing && path === statPath && stage === 'stat-sync') throw cause;
      if (failing && path === statPath && stage === 'stat') return Promise.reject(cause);
      const match = /^\/proc\/(100|200|300)\/stat$/.exec(path);
      if (!match) throw new Error(`Unexpected fixture read: ${path}`);
      return Promise.resolve(stat(Number(match[1])));
    },
  };
  return { io, calls };
}
function fixture(cause: unknown, phase: 'before' | 'after' = 'before', stage: Stage = 'stat') {
  const scans = [filesystem(cause, stage, phase === 'before'), filesystem(cause, stage, phase === 'after')];
  const calls: string[] = [];
  let scan = 0;
  const io = {
    census: vi.fn<EvidenceIo['census']>((c, signal) => {
      calls.push(scan === 0 ? 'proc-before' : 'proc-after');
      const fs = scans[scan++];
      if (!fs) throw new Error('Unexpected extra census/retry');
      return readLinuxProcessCensus(c, signal, fs.io);
    }),
    queue: vi.fn<EvidenceIo['queue']>(async c => {
      calls.push('queue'); return { kind: 'comfy-whole-queue', service: c.owner, running: [], queued: [] };
    }),
    gpu: vi.fn<EvidenceIo['gpu']>(async () => {
      calls.push('gpu'); return { kind: 'nvidia-compute-process-snapshot',
        startedAtMs: performance.now(), finishedAtMs: performance.now(), gpuUuids: [gpuUuid],
        processes: [{ gpuUuid, pid: 100 }], queries: [] };
    }),
  };
  return { io, scans, calls };
}
const controllers: AbortController[] = [];
function caller() { const c = new AbortController(); controllers.push(c); return c; }
const collect = (f: ReturnType<typeof fixture>) => collectRegisteredWorkEvidence(config(), caller().signal, f.io);
const json = (report: RegisteredWorkEvidence): RegisteredWorkEvidence => JSON.parse(JSON.stringify(report));
beforeEach(() => vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] }));
afterEach(() => {
  for (const c of controllers.splice(0)) c.abort();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});
function strictFailure(report: RegisteredWorkEvidence, f: ReturnType<typeof fixture>,
  phase: 'before' | 'after' = 'before', stage: Stage = 'stat') {
  const failed = report.processes[phase], other = phase === 'before' ? 'after' : 'before';
  expect(failed).toMatchObject({ state: 'failed', settlement: 'settled',
    error: { code: 'PROC_CENSUS_IO', message: `Could not read ${pathFor(stage)}` } });
  expect(failed).not.toHaveProperty('value');
  expect(report).toMatchObject({ collection: 'incomplete', stopReason: null });
  expect(report.processes[other].state).toBe('ok');
  expect(report.identities[0]![phase]).toEqual({ state: 'unavailable' });
  expect(report.identities[0]![other].state).toBe('present');
  expect(report.gpuCorrelations[0]!.correlation).toBe('one-sided');
  expect(report.gpu.state).toBe('ok');
  expect(report.queues[0]!.before.state).toBe('ok');
  expect(report.queues[0]!.after.state).toBe('ok');
  expect(f.calls).toEqual(['proc-before', 'queue', 'gpu', 'queue', 'proc-after']);
  expect(f.scans[phase === 'before' ? 0 : 1]!.calls).toEqual(readsThrough(stage));
  expect(f.scans[phase === 'before' ? 1 : 0]!.calls).toEqual(completeReads);
  for (const key of ['resourcesReleased', 'gpuClear', 'ownerKnown', 'safeToDispatch']) expect(report).not.toHaveProperty(key);
  expect(vi.getTimerCount()).toBe(0);
}

test('reader already retains the exact native cause without skipping or rereading the failed PID', async () => {
  const cause = nativeError(), fs = filesystem(cause, 'stat', true);
  const error: unknown = await readLinuxProcessCensus(config().census, caller().signal, fs.io)
    .then(() => { throw new Error('Census unexpectedly succeeded'); }, error => error);
  expect(error).toBeInstanceOf(ProcessCensusError);
  expect((error as ProcessCensusError).cause).toBe(cause);
  expect(fs.calls).toEqual(readsThrough('stat'));
});

for (const phase of ['before', 'after'] as const) {
  test.each([['ENOENT', -2], ['EACCES', -13], ['EIO', -5]] as const)(
    `${phase}: %s survives real census wrapping and report JSON, without weakening failure`, async (code, errno) => {
      const cause = nativeError(code, statPath, 'open', errno), f = fixture(cause, phase);
      const report = json(await collect(f)); strictFailure(report, f, phase);
      expect(report.processes[phase]).toHaveProperty('error.cause', diagnostic(cause));
    });
}

test.each(['boot-before', 'directory', 'boot-after', 'stat-sync'] as const)(
  '%s preserves the actual failing operation and path', async stage => {
    const cause = nativeError('EACCES', pathFor(stage), stage === 'directory' ? 'scandir' : 'open', -13);
    const f = fixture(cause, 'before', stage), report = json(await collect(f));
    strictFailure(report, f, 'before', stage);
    expect(report.processes.before).toHaveProperty('error.cause', diagnostic(cause));
  });

test('plain Error keeps name/message without inferring errno from ENOENT-like wording', async () => {
  const cause = new Error('ENOENT: no such file (message only)'), f = fixture(cause);
  const report = json(await collect(f)); strictFailure(report, f);
  expect(report.processes.before).toHaveProperty('error.cause', { name: 'Error', message: cause.message });
});

test.each([undefined, 'ENOENT'])('unsupported cause %s does not manufacture native diagnostics', async cause => {
  const f = fixture(cause), report = json(await collect(f)); strictFailure(report, f);
  expect(report.processes.before).not.toHaveProperty('error.cause');
});

test.each([NaN, Infinity, -Infinity, 1.5])('malformed scalar fields and invalid errno %s are omitted rather than coerced', async errno => {
  const cause = Object.assign(new Error('wrongly typed native fields'), {
    code: 404, errno, syscall: ['open'], path: Buffer.from(statPath),
  });
  const f = fixture(cause), report = json(await collect(f)); strictFailure(report, f);
  expect(report.processes.before).toHaveProperty('error.cause', { name: 'Error', message: cause.message });
});

test.each([{ code: 'ENOENT' }, { errno: 0 }])('partial plain-object cause %j preserves only fields actually present', async cause => {
  const f = fixture(cause), report = json(await collect(f)); strictFailure(report, f);
  expect(report.processes.before).toHaveProperty('error.cause', cause);
});

test.each([{}, { code: 404, errno: 'not-a-number', extra: 'unsupported' }])(
  'object cause %j with no supported fields does not emit an empty diagnostic', async cause => {
    const f = fixture(cause), report = json(await collect(f)); strictFailure(report, f);
    expect(report.processes.before).not.toHaveProperty('error.cause');
  });

test('later mutation of the original cause cannot rewrite retained diagnostics', async () => {
  const cause = nativeError(), expected = diagnostic(cause), f = fixture(cause);
  const report = await collect(f); strictFailure(report, f);
  Object.assign(cause, { name: 'Changed', message: 'changed', code: 'EACCES', errno: -13,
    syscall: 'changed', path: '/changed' });
  expect(json(report).processes.before).toHaveProperty('error.cause', expected);
});

test('arbitrary fields, stack, cyclic nested cause and custom toJSON never enter diagnostic data', async () => {
  const cause = nativeError(), expected = diagnostic(cause);
  const toJSON = vi.fn(() => { throw new Error('Must not execute cause.toJSON'); });
  Object.assign(cause, { cause, extra: { token: 'synthetic-not-for-report' }, toJSON,
    stack: 'synthetic-stack-not-for-report' });
  const f = fixture(cause), report = json(await collect(f)); strictFailure(report, f);
  expect(toJSON).not.toHaveBeenCalled();
  expect(report.processes.before).toHaveProperty('error.cause', expected);
  expect(JSON.stringify(report)).not.toContain('not-for-report');
});

test.each(['abort', 'deadline'] as const)('%s stays primary while adapterError retains native cause', async mode => {
  const cause = nativeError(), f = fixture(cause), control = caller();
  // Deliberate adapter seam: the existing wrapper type reports a captured I/O
  // failure during the collector's bounded drain, not a new filesystem call.
  f.io.census.mockImplementation((_c, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new ProcessCensusError(
      'PROC_CENSUS_IO', `Could not read ${statPath}`, cause)), { once: true });
  }));
  const pending = collectRegisteredWorkEvidence(config(), control.signal, f.io);
  await vi.advanceTimersByTimeAsync(0);
  if (mode === 'abort') control.abort(); else await vi.advanceTimersByTimeAsync(100);
  const report = json(await pending), code = mode === 'abort' ? 'EVIDENCE_ABORTED' : 'EVIDENCE_TIMEOUT';
  expect(report).toMatchObject({ collection: 'incomplete', stopReason: { code } });
  expect(report.processes.before).toMatchObject({ state: 'failed', settlement: 'settled', error: { code },
    adapterError: { code: 'PROC_CENSUS_IO', message: `Could not read ${statPath}` } });
  expect(f.io.census).toHaveBeenCalledTimes(1);
  expect(f.io.queue).not.toHaveBeenCalled(); expect(f.io.gpu).not.toHaveBeenCalled();
  expect(report.processes.after.state).toBe('not-started');
  expect(report.finishedAtMs).toBeLessThanOrEqual(config().timeoutMs + config().drainTimeoutMs);
  expect(report.processes.before).not.toHaveProperty('error.cause');
  expect(report.processes.before).toHaveProperty('adapterError.cause', diagnostic(cause));
  expect(vi.getTimerCount()).toBe(0);
});

test('schema failure without a native cause stays terminal and is not relabelled as filesystem I/O', async () => {
  const f = fixture(undefined), fs = filesystem(undefined, 'stat', false);
  const read = fs.io.readFile;
  fs.io.readFile = (path, signal) => path === statPath ? Promise.resolve(Buffer.from('malformed stat')) : read(path, signal);
  f.io.census.mockImplementation((c, signal) => readLinuxProcessCensus(c, signal, fs.io));
  const report = json(await collect(f));
  expect(report).toMatchObject({ collection: 'incomplete', stopReason: { code: 'PROC_CENSUS_SCHEMA' } });
  expect(report.processes.before).toMatchObject({ state: 'failed', error: { code: 'PROC_CENSUS_SCHEMA' } });
  expect(report.processes.before).not.toHaveProperty('error.cause');
  expect(f.io.census).toHaveBeenCalledTimes(1);
  expect(f.io.queue).not.toHaveBeenCalled(); expect(f.io.gpu).not.toHaveBeenCalled();
  expect(report.processes.after.state).toBe('not-started');
  expect(vi.getTimerCount()).toBe(0);
});
