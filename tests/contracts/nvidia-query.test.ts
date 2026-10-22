/** Contract tests: real local query-child fixtures + three explicitly scripted cases.
 * No NVIDIA executable, native generator, provider or GPU work is launched. */
import { afterEach, expect, test, vi } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import * as module from '../../apps/server/src/jobs/nvidia-query.ts';
import type { NvidiaQueryConfig, NvidiaQueryIo } from '../../apps/server/src/jobs/nvidia-query.ts';
import { observeProcess } from '../../apps/server/src/providers/run.ts';

const A = 'GPU-11111111-1111-1111-1111-111111111111';
const B = 'GPU-22222222-2222-2222-2222-222222222222';
const inventory = ['--query-gpu=uuid', '--format=csv,noheader,nounits'];
const processes = ['--query-compute-apps=gpu_uuid,pid', '--format=csv,noheader,nounits'];
const config = (): NvidiaQueryConfig => ({ executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [A],
  timeoutMs: 2000, cleanupTimeoutMs: 500, maxOutputBytes: 4096 });
const signal = () => new AbortController().signal;
const cleanups: Array<() => Promise<void>> = [];
const retirements: Array<() => void> = [];
async function created(condition: () => boolean) {
  const deadline = performance.now() + 1000;
  while (!condition()) {
    if (performance.now() >= deadline) throw new Error('Fixture launch was not observed');
    await wait(1);
  }
}
async function boundedClose(closed: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([closed, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Query fixture did not close')), 1500);
    })]);
  } finally { clearTimeout(timer); }
}
afterEach(async () => {
  for (const retire of retirements.splice(0)) retire(); // Before any cleanup await.
  vi.useRealTimers();
  vi.restoreAllMocks();
  const errors: unknown[] = [];
  while (cleanups.length) { try { await cleanups.pop()!(); } catch (error) { errors.push(error); } }
  if (errors.length) throw new AggregateError(errors, 'Owned query fixture cleanup failed');
});
interface ChildPlan {
  stdout?: string; stderr?: string; stdoutHex?: string; delayMs?: number;
  exitCode?: number; signal?: string; overflow?: number; hang?: boolean;
  trickle?: boolean; ignoreTerm?: boolean;
}
function harness(plan: ChildPlan[] = [{ stdout: A + '\n' }, { stdout: `${A}, 321\n` }, { stdout: A + '\n' }]) {
  const calls: Array<{ file: string; argv: string[]; options: unknown }> = [];
  const children: ChildProcessWithoutNullStreams[] = [];
  const closed: Array<Promise<void>> = [];
  const abort = new AbortController();
  const ready: boolean[] = [];
  let retired = false, lateLaunchAttempts = 0;
  retirements.push(() => { retired = true; abort.abort(new Error('Test ended; stop late continuation')); });
  let active = 0, maximumActive = 0;
  let onClose: ((index: number) => void) | undefined;
  const io: NvidiaQueryIo = { spawn(file, argv, options) {
    if (retired) { lateLaunchAttempts++; throw new Error('Refusing late fixture launch after teardown'); }
    const index = calls.length;
    calls.push({ file, argv: [...argv], options: { ...options } });
    if (!plan[index]) throw new Error('Unexpected extra query; fixture never falls back to NVIDIA');
    const child = spawn(process.execPath, [new URL('../fixtures/nvidia-query-child.mjs', import.meta.url).pathname,
      JSON.stringify(plan[index])], { shell: false, detached: false, stdio: 'pipe' });
    children.push(child);
    ready[index] = false;
    child.stdout.once('data', () => { ready[index] = true; });
    active++; maximumActive = Math.max(maximumActive, active);
    closed.push(new Promise<void>(resolve => child.once('close', () => { active--; onClose?.(index); resolve(); })));
    // Capture ownership independently, immediately; short-lived exit can race
    // this read, which is only needed for emergency teardown of a live child.
    const identity = child.pid ? observeProcess(child.pid).then(value => ({ value }), error => ({ error })) : Promise.resolve({ error: new Error('No PID') });
    cleanups.push(async () => {
      if (child.exitCode === null && child.signalCode === null && child.pid) {
        const result = await identity;
        if (!('value' in result)) throw result.error;
        let actual;
        try { actual = await observeProcess(child.pid); }
        catch (error) { if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
        if (actual) {
          expect(actual).toEqual(result.value);
          child.kill('SIGKILL'); // Exactly this fixture, never a process group.
        }
      }
      await boundedClose(closed[index]!);
      expect(child.exitCode === null && child.signalCode === null).toBe(false);
    });
    return child;
  } };
  return { io, calls, children, abort, ready, lateLaunchAttempts: () => lateLaunchAttempts, maximumActive: () => maximumActive,
    onClose: (fn: (index: number) => void) => { onClose = fn; },
    async stopped() {
      for (const child of children) {
        // Assert before emergency teardown; the backstop may not provide a pass.
        expect(child.exitCode === null && child.signalCode === null).toBe(false);
        expect(child.exitCode).not.toBe(97); // Watchdog expiry is never cleanup success.
        if (child.pid) {
          try { await observeProcess(child.pid); throw new Error('Owned fixture still has a process identity'); }
          catch (error) { expect(['ENOENT', 'ESRCH']).toContain((error as NodeJS.ErrnoException).code); }
        }
      }
    },
  };
}

test('captures every compute row across GPUs, including unrelated PIDs, with literal sequential read-only commands', async () => {
  const f = harness([{ stdout: `${B}\r\n${A}\r\n` },
    { stdout: `${B}, 900\r\n${A}, 321\r\n${B}, 321\r\n` }, { stdout: `${A}\n${B}\n` }]);
  const result = await module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io);
  expect(result).toMatchObject({ kind: 'nvidia-compute-process-snapshot', gpuUuids: [A, B],
    processes: [{ gpuUuid: A, pid: 321 }, { gpuUuid: B, pid: 321 }, { gpuUuid: B, pid: 900 }] });
  expect(Number.isFinite(result.startedAtMs)).toBe(true);
  expect(Number.isFinite(result.finishedAtMs)).toBe(true);
  expect(result.finishedAtMs).toBeGreaterThanOrEqual(result.startedAtMs);
  expect(Object.hasOwn(result, 'resourcesReleased')).toBe(false);
  expect(Object.hasOwn(result, 'ownerKnown')).toBe(false);
  expect(f.calls).toEqual([inventory, processes, inventory].map(argv => ({ file: '/usr/bin/nvidia-smi', argv,
    options: { shell: false, detached: false, stdio: 'pipe' } })));
  expect(result.queries).toHaveLength(3);
  result.queries.forEach((query, index) => {
    expect(query).toMatchObject({ executable: '/usr/bin/nvidia-smi',
      argv: [inventory, processes, inventory][index], pid: f.children[index]!.pid,
      stderr: '', exitCode: 0, signal: null });
    expect(query.stdout).not.toBe('');
    expect(query.startedAtMs).toBeGreaterThanOrEqual(result.startedAtMs);
    expect(query.finishedAtMs).toBeGreaterThanOrEqual(query.startedAtMs);
    expect(query.finishedAtMs).toBeLessThanOrEqual(result.finishedAtMs);
    if (index > 0) expect(query.startedAtMs).toBeGreaterThanOrEqual(result.queries[index - 1]!.finishedAtMs);
  });
  expect(f.maximumActive()).toBe(1);
  await f.stopped();
});

test('empty compute output is valid only with both verified nonempty inventories and successful exits', async () => {
  const f = harness([{ stdout: A + '\n' }, { stdout: ' \r\n' }, { stdout: A + '\n' }]);
  expect(await module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).toMatchObject({ gpuUuids: [A], processes: [] });
  expect(f.calls).toHaveLength(3); await f.stopped();
});

test.each([
  ['empty inventory', ''], ['duplicate GPU', `${A}\n${A}\n`], ['missing expected GPU', B + '\n'],
  ['invalid UUID', 'GPU-unknown\n'], ['unsupported MIG identifier', 'MIG-GPU-111/1/1\n'],
] as const)('%s fails before querying compute processes', async (_label, stdout) => {
  const f = harness([{ stdout }]);
  await expect(module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).rejects.toBeInstanceOf(Error);
  expect(f.calls).toHaveLength(1); await f.stopped();
});

test.each([
  ['unknown GPU', `${B}, 321\n`], ['duplicate row', `${A}, 321\n${A}, 321\n`],
  ['unavailable PID', `${A}, N/A\n`], ['zero PID', `${A}, 0\n`], ['negative PID', `${A}, -1\n`],
  ['fractional PID', `${A}, 1.5\n`], ['exponent PID', `${A}, 1e3\n`],
  ['unsafe integer PID', `${A}, 9007199254740993\n`], ['missing column', A + '\n'],
  ['extra column', `${A}, 321, ignored\n`], ['trailing diagnostic', `${A}, 321\nFailed to query device\n`],
] as const)('%s cannot be filtered into a valid/empty compute snapshot', async (_label, stdout) => {
  const f = harness([{ stdout: A + '\n' }, { stdout }]);
  await expect(module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).rejects.toBeInstanceOf(Error);
  expect(f.calls).toHaveLength(2); await f.stopped();
});

test('a changed final inventory invalidates the whole observation rather than its inconsistent rows', async () => {
  const f = harness([{ stdout: A + '\n' }, { stdout: '' }, { stdout: `${A}\n${B}\n` }]);
  await expect(module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).rejects.toBeInstanceOf(Error);
  expect(f.calls).toHaveLength(3); await f.stopped();
});

test.each([
  ['nonzero exit with plausible CSV', { stdout: A + '\n', exitCode: 9 }],
  ['signal exit with plausible CSV', { stdout: A + '\n', signal: 'SIGTERM' }],
  ['stderr diagnostic on exit zero', { stdout: A + '\n', stderr: 'GPU is lost\n' }],
  ['invalid UTF-8', { stdoutHex: Buffer.from(A + '\n').toString('hex') + 'ff' }],
  ['output overflow', { stdout: A + '\n', overflow: 8192 }],
] satisfies Array<[string, ChildPlan]>)('%s produces an error and no later query', async (_label, plan) => {
  const f = harness([plan]);
  await expect(module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).rejects.toBeInstanceOf(Error);
  expect(f.calls).toHaveLength(1); await f.stopped();
});

test('pre-aborted and invalid configuration requests launch nothing', async () => {
  const f = harness(), abort = new AbortController(); abort.abort();
  await expect(module.readNvidiaComputeSnapshot(config(), abort.signal, f.io)).rejects.toBeInstanceOf(Error);
  for (const override of [{ expectedGpuUuids: [] }, { expectedGpuUuids: [A, A] }, { executable: 'nvidia-smi' },
    { timeoutMs: 0 }, { cleanupTimeoutMs: 0 }, { maxOutputBytes: 0 }, { timeoutMs: Infinity }]) {
    await expect(module.readNvidiaComputeSnapshot({ ...config(), ...override }, signal(), f.io)).rejects.toBeInstanceOf(Error);
  }
  expect(f.calls).toEqual([]);
});

test('spawn error is an observation failure, never an empty result or retry', async () => {
  const launch = vi.fn(() => { throw new Error('ENOENT fixture launch'); });
  await expect(module.readNvidiaComputeSnapshot(config(), signal(), { spawn: launch })).rejects.toThrow();
  expect(launch).toHaveBeenCalledOnce();
});

test('actual asynchronous ENOENT error/close without a PID is bounded failure, not an empty observation', async () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false, spawnError: NodeJS.ErrnoException | undefined;
  const abort = new AbortController(); retirements.push(() => abort.abort());
  const launch = vi.fn(() => {
    child = spawn(`/nonexistent-studio-query-${randomUUID()}/nvidia-smi`, [], { shell: false, detached: false, stdio: 'pipe' });
    child.once('error', error => { spawnError = error; });
    child.once('close', () => { closed = true; });
    return child;
  });
  await expect(module.readNvidiaComputeSnapshot(config(), abort.signal, { spawn: launch }))
    .rejects.toMatchObject({ code: 'GPU_PROBE_SPAWN', cleanupConfirmed: true });
  expect(launch).toHaveBeenCalledOnce(); expect(child?.pid).toBeUndefined();
  expect(spawnError?.code).toBe('ENOENT'); expect(closed).toBe(true);
});

test('configuration mutation after entry cannot change executable, expected GPUs, limits or launch callback', async () => {
  const f = harness(), input = config();
  f.onClose(index => { if (index === 0) {
    input.executable = '/different'; input.expectedGpuUuids[0] = B;
    input.maxOutputBytes = 1; input.timeoutMs = 0; input.cleanupTimeoutMs = 0;
    f.io.spawn = () => { throw new Error('Changed launch callback must not be used'); };
  } });
  expect(await module.readNvidiaComputeSnapshot(input, f.abort.signal, f.io)).toMatchObject({ gpuUuids: [A] });
  expect(f.calls.map(call => call.file)).toEqual(Array(3).fill('/usr/bin/nvidia-smi'));
  await f.stopped();
});

test('abort between query phases starts no later query', async () => {
  const f = harness(); f.onClose(index => { if (index === 0) f.abort.abort(new Error('Stop between phases')); });
  await expect(module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'GPU_PROBE_ABORTED' });
  expect(f.calls).toHaveLength(1); await f.stopped();
  expect(f.ready[0]).toBe(true); // Mode entered, not a timeout during Node startup.
});

test('all phases share the original deadline, including time consumed by earlier queries', async () => {
  const f = harness(); let elapsed = 0;
  const realNow = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => realNow() + elapsed);
  // Explicit monotonic-cost injection, not a machine-speed/latency benchmark.
  f.onClose(() => { elapsed += 300; });
  await expect(module.readNvidiaComputeSnapshot({ ...config(), timeoutMs: 500 }, f.abort.signal, f.io))
    .rejects.toMatchObject({ code: 'GPU_PROBE_TIMEOUT' });
  expect(f.calls).toHaveLength(2); await f.stopped();
});

test.each(['hang', 'trickle', 'ignore-term'] as const)('%s is bounded and its query child exits before failure returns', async kind => {
  const f = harness([{ stdout: A + '\n', hang: true, trickle: kind === 'trickle', ignoreTerm: kind === 'ignore-term' }]);
  const started = performance.now();
  await expect(module.readNvidiaComputeSnapshot({ ...config(), timeoutMs: 1000 }, f.abort.signal, f.io))
    .rejects.toMatchObject({ code: 'GPU_PROBE_TIMEOUT', cleanupConfirmed: true });
  expect(performance.now() - started).toBeLessThan(2500); // Broad fixture backstop, not a product SLA.
  expect(f.calls).toHaveLength(1); await f.stopped();
  expect(f.ready[0]).toBe(true); // Proves hang/trickle/ignoreTerm mode was entered.
  if (kind === 'ignore-term') expect(f.children[0]!.signalCode).toBe('SIGKILL');
});

test('aborting an active query reaps that child without querying or stopping another process', async () => {
  const f = harness([{ stdout: A + '\n', hang: true }]);
  const run = module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io);
  const observed = expect(run).rejects.toMatchObject({ code: 'GPU_PROBE_ABORTED', cleanupConfirmed: true });
  await created(() => f.ready[0] === true);
  f.abort.abort(new Error('Active-query cancellation'));
  await observed; expect(f.calls).toHaveLength(1); await f.stopped();
});

/** Scripted ChildProcess events explicitly isolate pipe lifecycle and unresolved
 * cleanup; no fake PID is used and no OS process/signal is involved here. */
function scriptedChild() {
  const events = new EventEmitter();
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  const child = Object.assign(events, { stdin, stdout, stderr, pid: undefined,
    exitCode: null as number | null, signalCode: null as string | null, kill: vi.fn(() => true) });
  cleanups.push(async () => { stdin.destroy(); stdout.destroy(); stderr.destroy(); child.emit('close', 0, null); });
  return child;
}
test('exit alone is insufficient: inherited-pipe-style delayed garbage invalidates an apparently valid prefix', async () => {
  const child = scriptedChild(); const launch = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const run = module.readNvidiaComputeSnapshot(config(), signal(), { spawn: launch });
  let settled = false;
  void run.then(() => { settled = true; }, () => { settled = true; });
  const observed = expect(run).rejects.toMatchObject({ code: 'GPU_PROBE_SCHEMA' });
  await created(() => launch.mock.calls.length === 1);
  child.stdout.write(A + '\n'); child.exitCode = 0; child.emit('exit', 0, null);
  await wait(20);
  expect(settled).toBe(false); // Exit or missing PID must not resolve/reject early.
  child.stdout.end('late garbage\n'); child.stderr.end(); child.emit('close', 0, null);
  await observed; expect(launch).toHaveBeenCalledOnce();
});

test('a stalled second query gets only the original remaining time, not a fresh phase timeout', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const first = scriptedChild(), second = scriptedChild();
  second.kill.mockImplementation(() => {
    second.signalCode = 'SIGTERM'; second.stdout.end(); second.stderr.end();
    second.emit('exit', null, 'SIGTERM'); second.emit('close', null, 'SIGTERM'); return true;
  });
  const launch = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
  const run = module.readNvidiaComputeSnapshot({ ...config(), timeoutMs: 100 }, signal(), { spawn: launch });
  let settled = false;
  void run.then(() => { settled = true; }, () => { settled = true; });
  const observed = expect(run).rejects.toMatchObject({ code: 'GPU_PROBE_TIMEOUT', cleanupConfirmed: true });
  await vi.advanceTimersByTimeAsync(80);
  expect(launch).toHaveBeenCalledOnce();
  first.stdout.end(A + '\n'); first.stderr.end(); first.exitCode = 0;
  first.emit('exit', 0, null); first.emit('close', 0, null);
  await vi.advanceTimersByTimeAsync(0);
  expect(launch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(19); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(settled).toBe(true);
  await observed; expect(launch).toHaveBeenCalledTimes(2);
});
test('unconfirmed query-child cleanup stays explicit failure within its separate budget', async () => {
  const child = scriptedChild(); const launch = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const started = performance.now();
  await expect(module.readNvidiaComputeSnapshot({ ...config(), timeoutMs: 30, cleanupTimeoutMs: 60 }, signal(), { spawn: launch }))
    .rejects.toMatchObject({ code: 'GPU_PROBE_CLEANUP', cleanupConfirmed: false });
  expect(performance.now() - started).toBeLessThan(500);
  expect(launch).toHaveBeenCalledOnce();
});

test('final inventory comparison still consumes the original observation deadline', async () => {
  const f = harness(); let extraTime = 0, comparisons = 0;
  const realNow = performance.now.bind(performance), stringify = JSON.stringify;
  vi.spyOn(performance, 'now').mockImplementation(() => realNow() + extraTime);
  // Inject synchronous cost during the final set comparison, after all native
  // commands closed; a valid snapshot may not escape with an expired timestamp.
  vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
    if (Array.isArray(args[0]) && args[0].length === 1 && args[0][0] === A && ++comparisons === 2) extraTime = 3000;
    return stringify(...args);
  });
  await expect(module.readNvidiaComputeSnapshot(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'GPU_PROBE_TIMEOUT' });
  expect(f.calls).toHaveLength(3); await f.stopped();
});
