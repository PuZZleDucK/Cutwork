/** Synthetic procfs bytes and controlled promises, not native process/GPU proof.
 * Runs the production reader through its synthetic filesystem test seam. */
import { afterEach, expect, test, vi } from 'vitest';
import * as module from '../../apps/server/src/jobs/linux-process-census.ts';
import type { CensusConfig, CensusIo } from '../../apps/server/src/jobs/linux-process-census.ts';

const BOOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_BOOT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bootPath = '/proc/sys/kernel/random/boot_id';
const aborts: AbortController[] = [];
afterEach(() => {
  for (const abort of aborts.splice(0)) abort.abort(new Error('Test ended'));
  vi.useRealTimers(); vi.restoreAllMocks();
});
const config = (): CensusConfig => ({ expectedBootId: BOOT, timeoutMs: 1000,
  maxDirectoryEntries: 100, maxFileBytes: 4096 });
function stat(pid = 10, changes: Partial<{ parent: string; group: string; session: string;
  start: string; state: string; name: Uint8Array; ancillary: Record<number, string> }> = {}): Buffer {
  // Field numbers from kernel procfs documentation: pid/comm/state/ppid/pgrp/
  // session, then fields 7..21, starttime (22), and numeric fields 23..52.
  const fields = [changes.state ?? 'S', changes.parent ?? '1', changes.group ?? '10',
    changes.session ?? '10', ...Array<string>(15).fill('0'), changes.start ?? '500', ...Array<string>(30).fill('0')];
  fields[5] = '-1'; // tpgid: this fixture has no controlling terminal.
  fields[15] = '20'; // Ordinary non-realtime priority.
  for (const [field, value] of Object.entries(changes.ancillary ?? {})) {
    if (Number(field) < 7 || Number(field) > 21) throw new Error('Fixture ancillary field outside range');
    fields[Number(field) - 3] = value;
  }
  const suffix = fields.join(' ');
  return Buffer.concat([Buffer.from(`${pid} (`), changes.name ?? Buffer.from('fixture'), Buffer.from(`) ${suffix}\n`)]);
}
function fixture() {
  const abort = new AbortController(); aborts.push(abort);
  const files = new Map<string, Buffer>([[bootPath, Buffer.from(BOOT + '\n')], ['/proc/10/stat', stat()]]);
  let entries = ['self', 'thread-self', 'sys', '10'];
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const io: CensusIo = {
    readdir: vi.fn(async (path, signal) => {
      if (abort.signal.aborted || signal.aborted) throw new Error('Late/aborted fixture read');
      calls.push(path); signals.push(signal);
      if (path !== '/proc') throw new Error(`Unexpected directory: ${path}`);
      return [...entries];
    }),
    readFile: vi.fn(async (path, signal) => {
      if (abort.signal.aborted || signal.aborted) throw new Error('Late/aborted fixture read');
      calls.push(path); signals.push(signal);
      const data = files.get(path);
      if (!data) throw Object.assign(new Error('fixture missing file'), { code: 'ENOENT' });
      return Buffer.from(data);
    }),
  };
  return { abort, files, io, calls, signals, setEntries: (value: string[]) => { entries = value; } };
}

// Collection never invokes the fake filesystem or reads actual /proc.
test('complete read-only census retains every record and exact identity, in canonical PID order', async () => {
  const f = fixture(); f.setEntries(['10', 'self', '2', 'sys', 'thread-self']);
  f.files.set('/proc/2/stat', stat(2, { parent: '0', group: '0', session: '0', state: 'I', start: '0' }));
  const result = await module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  expect(result).toMatchObject({ kind: 'linux-process-census', scope: 'visible-procfs', bootId: BOOT,
    processes: [{ pid: 2, parentPid: 0, group: 0, session: 0, startTicks: '0', state: 'I' },
      { pid: 10, parentPid: 1, group: 10, session: 10, startTicks: '500', state: 'S' }] });
  expect(f.calls).toEqual([bootPath, '/proc', '/proc/2/stat', '/proc/10/stat', bootPath]);
  expect(Number.isFinite(result.startedAtMs)).toBe(true);
  expect(result.finishedAtMs).toBeGreaterThanOrEqual(result.startedAtMs);
  expect(result.finishedAtMs - result.startedAtMs).toBeLessThan(config().timeoutMs);
  for (const key of ['ownerKnown', 'allHostProcesses', 'resourcesReleased', 'gpuClear']) expect(Object.hasOwn(result, key)).toBe(false);
});

test('command names with spaces, parentheses, newline and non-UTF8 bytes cannot shift stat fields', async () => {
  const f = fixture();
  f.files.set('/proc/10/stat', stat(10, { name: Buffer.from([119, 32, 40, 41, 10, 255, 41]), start: '18446744073709551615' }));
  const result = await module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  expect(result.processes).toEqual([{ pid: 10, parentPid: 1, group: 10, session: 10, state: 'S', startTicks: '18446744073709551615' }]);
});

test('signed ancillary fields and running, blocked, stopped and traced states remain valid', async () => {
  const f = fixture(); const states = ['R', 'D', 'T', 't'];
  f.setEntries(states.map((_state, index) => String(10 + index)));
  states.forEach((state, index) => f.files.set(`/proc/${10 + index}/stat`,
    stat(10 + index, { state, ancillary: { 8: '-1', 18: '-100', 19: '-20' } })));
  const result = await module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  expect(result.processes).toEqual(states.map((state, index) => ({
    pid: 10 + index, parentPid: 1, group: 10, session: 10, startTicks: '500', state,
  })));
});

test('leader absence cannot erase a remaining group/session member or zombie', async () => {
  const f = fixture(); f.setEntries(['11', '12']); f.files.delete('/proc/10/stat');
  f.files.set('/proc/11/stat', stat(11, { group: '10', session: '10', parent: '1', start: '501' }));
  f.files.set('/proc/12/stat', stat(12, { group: '10', session: '10', parent: '11', state: 'Z', start: '502' }));
  const result = await module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  expect(result.processes).toEqual([
    { pid: 11, parentPid: 1, group: 10, session: 10, startTicks: '501', state: 'S' },
    { pid: 12, parentPid: 11, group: 10, session: 10, startTicks: '502', state: 'Z' },
  ]);
});

test('fresh calls do not cache an earlier identity when a PID is reused', async () => {
  const f = fixture();
  const first = await module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  f.files.set('/proc/10/stat', stat(10, { start: '900', group: '20', session: '20' }));
  const second = await module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  expect(first.processes[0]).toMatchObject({ startTicks: '500', group: 10, session: 10 });
  expect(second.processes[0]).toMatchObject({ startTicks: '900', group: 20, session: 20 });
  expect(f.calls.filter(x => x === '/proc/10/stat')).toHaveLength(2);
});

test.each([
  ['no visible PID', ['self', 'sys']], ['duplicate PID', ['10', '10']], ['zero PID', ['0', '10']],
  ['leading-zero PID', ['010', '10']], ['unsafe PID', ['9007199254740993', '10']],
])('%s directory result cannot supply a successful census', async (_label, entries) => {
  const f = fixture(); f.setEntries(entries);
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_SCHEMA' });
  expect(f.calls).toEqual([bootPath, '/proc']);
});

test.each([
  ['PID differs from directory', () => stat(11)],
  ['missing command delimiters', () => Buffer.from('10 fixture S 1 10 10\n')],
  ['truncated before start ticks', () => Buffer.from('10 (fixture) S 1 10 10\n')],
  ['unknown state', () => stat(10, { state: '?' })],
  ['invalid parent PID', () => stat(10, { parent: '9007199254740993' })],
  ['noninteger group', () => stat(10, { group: '10.5' })],
  ['negative session', () => stat(10, { session: '-1' })],
  ['inexact start ticks', () => stat(10, { start: '5e2' })],
  ['trailing diagnostic', () => Buffer.concat([stat(), Buffer.from('permission denied\n')])],
] as const)('%s invalidates the full observation instead of dropping one record', async (_label, bytes) => {
  const f = fixture(); f.files.set('/proc/10/stat', bytes());
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_SCHEMA' });
  expect(f.calls).toEqual([bootPath, '/proc', '/proc/10/stat']);
});

test.each(['ENOENT', 'EACCES', 'EIO'])('%s reading a listed process stays unknown, never an empty group', async code => {
  const f = fixture(); const read = f.io.readFile;
  f.io.readFile = vi.fn(async (path, signal) => {
    if (path === '/proc/10/stat') throw Object.assign(new Error('fixture read failure'), { code });
    return read(path, signal);
  });
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_IO' });
  expect(f.io.readFile).toHaveBeenCalledTimes(2); // No retry or final success sample.
});

test('directory read failure never becomes an empty process list', async () => {
  const f = fixture(); f.io.readdir = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_IO' });
  expect(f.io.readdir).toHaveBeenCalledOnce(); expect(f.calls).toEqual([bootPath]);
});

test.each(['initial', 'final'] as const)('%s boot read failure invalidates the observation', async phase => {
  const f = fixture(); const read = f.io.readFile; let bootReads = 0;
  f.io.readFile = vi.fn(async (path, signal) => {
    if (path === bootPath && ++bootReads === (phase === 'initial' ? 1 : 2)) throw new Error('boot read failed');
    return read(path, signal);
  });
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_IO' });
  expect(bootReads).toBe(phase === 'initial' ? 1 : 2);
});

test.each(['malformed', 'different-expected', 'changed-after-scan'] as const)('%s boot identity cannot validate a census', async mode => {
  const f = fixture(); const read = f.io.readFile; let bootReads = 0;
  f.io.readFile = vi.fn(async (path, signal) => {
    if (path === bootPath) {
      bootReads++;
      if (mode === 'malformed') return Buffer.from('not-a-boot-id\n');
      if (mode === 'different-expected' || bootReads === 2) return Buffer.from(OTHER_BOOT + '\n');
    }
    return read(path, signal);
  });
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_SCHEMA' });
  expect(bootReads).toBe(mode === 'changed-after-scan' ? 2 : 1);
});

test('invalid config and pre-aborted calls perform no filesystem I/O', async () => {
  const f = fixture();
  for (const changes of [{ expectedBootId: '' }, { timeoutMs: 0 }, { timeoutMs: Infinity },
    { maxDirectoryEntries: 0 }, { maxDirectoryEntries: 1.5 }, { maxFileBytes: 0 }]) {
    await expect(module.readLinuxProcessCensus({ ...config(), ...changes }, f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_CONFIG' });
  }
  f.abort.abort();
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_ABORTED' });
  expect(f.io.readFile).not.toHaveBeenCalled(); expect(f.io.readdir).not.toHaveBeenCalled();
});

test('directory entry budget counts non-PID names too, before reading any stat', async () => {
  const f = fixture();
  await expect(module.readLinuxProcessCensus({ ...config(), maxDirectoryEntries: 3 }, f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_LIMIT' });
  expect(f.calls).toEqual([bootPath, '/proc']);
});

test.each([bootPath, '/proc/10/stat'])('oversized file %s cannot bypass the per-file budget', async path => {
  const f = fixture(); f.files.set(path, Buffer.alloc(4097, 32));
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_LIMIT' });
});

test('entry capture prevents caller config or callback mutation from changing an in-flight census', async () => {
  const f = fixture(); const input = config(); const read = f.io.readFile;
  const replacement = vi.fn().mockRejectedValue(new Error('mutated callback must not run'));
  f.io.readFile = vi.fn(async (path, signal) => {
    input.expectedBootId = OTHER_BOOT; input.maxDirectoryEntries = 1; input.maxFileBytes = 1;
    f.io.readFile = replacement; f.io.readdir = replacement;
    return read(path, signal);
  });
  const result = await module.readLinuxProcessCensus(input, f.abort.signal, f.io);
  expect(result.bootId).toBe(BOOT); expect(result.processes).toHaveLength(1);
  expect(replacement).not.toHaveBeenCalled();
});

test('abort during a stalled read settles promptly, aborts its I/O signal and starts no next phase', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const f = fixture(); let resolve!: (bytes: Uint8Array) => void;
  f.io.readFile = vi.fn((_path, signal) => {
    f.signals.push(signal); return new Promise<Uint8Array>(done => { resolve = done; });
  });
  const run = module.readLinuxProcessCensus(config(), f.abort.signal, f.io);
  let settled = false; void run.then(() => { settled = true; }, () => { settled = true; });
  const checked = expect(run).rejects.toMatchObject({ code: 'PROC_CENSUS_ABORTED' });
  await vi.advanceTimersByTimeAsync(20); expect(f.io.readFile).toHaveBeenCalledOnce();
  f.abort.abort(); await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(true); // Do not advance to the 1000 ms timeout to obtain ABORTED.
  await checked; expect(f.signals[0]!.aborted).toBe(true);
  resolve(Buffer.from(BOOT + '\n')); await vi.advanceTimersByTimeAsync(0);
  expect(f.io.readFile).toHaveBeenCalledOnce(); expect(f.io.readdir).not.toHaveBeenCalled();
});

test('stalled stat read gets only the original remaining budget; late success cannot resume the scan', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const f = fixture(); const read = f.io.readFile;
  let finishFirst!: (bytes: Uint8Array) => void, finishStat!: (bytes: Uint8Array) => void;
  f.io.readFile = vi.fn((path, signal) => {
    f.signals.push(signal);
    if (path === bootPath) return new Promise<Uint8Array>(resolve => { finishFirst = resolve; });
    if (path === '/proc/10/stat') return new Promise<Uint8Array>(resolve => { finishStat = resolve; });
    return read(path, signal);
  });
  const run = module.readLinuxProcessCensus({ ...config(), timeoutMs: 100 }, f.abort.signal, f.io);
  let settled = false; void run.then(() => { settled = true; }, () => { settled = true; });
  const checked = expect(run).rejects.toMatchObject({ code: 'PROC_CENSUS_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(80); expect(f.io.readFile).toHaveBeenCalledOnce();
  finishFirst(Buffer.from(BOOT + '\n')); await vi.advanceTimersByTimeAsync(0);
  expect(f.io.readFile).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(19); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(settled).toBe(true); await checked;
  expect(f.signals.at(-1)!.aborted).toBe(true);
  finishStat(stat()); await vi.advanceTimersByTimeAsync(0);
  expect(f.io.readFile).toHaveBeenCalledTimes(2); expect(f.io.readdir).toHaveBeenCalledOnce();
});

test('final boot read still consumes the original deadline and cannot yield expired success', async () => {
  const f = fixture(); const read = f.io.readFile; let count = 0, extraTime = 0;
  const originalNow = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => originalNow() + extraTime);
  f.io.readFile = vi.fn(async (path, signal) => {
    const bytes = await read(path, signal);
    if (path === bootPath && ++count === 2) extraTime = 2000;
    return bytes;
  });
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_TIMEOUT' });
});

test('the final timestamp at the exact original deadline rejects, even after otherwise valid reads', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  let reads = 0;
  const now = vi.spyOn(performance, 'now').mockImplementation(() => { reads++; return 0; });
  const first = fixture();
  // Calibrate the last clock read on the same successful path. No fixed internal
  // helper/call count: this catches an unchecked final timestamp as well as cost
  // reaching a final check. All filesystem promises resolve in microtasks.
  await module.readLinuxProcessCensus({ ...config(), timeoutMs: 100 }, first.abort.signal, first.io);
  const lastRead = reads; expect(lastRead).toBeGreaterThan(0);
  reads = 0; now.mockImplementation(() => ++reads >= lastRead ? 100 : 0);
  const second = fixture();
  await expect(module.readLinuxProcessCensus({ ...config(), timeoutMs: 100 }, second.abort.signal, second.io))
    .rejects.toMatchObject({ code: 'PROC_CENSUS_TIMEOUT' });
  expect(reads).toBeGreaterThanOrEqual(lastRead);
});

test.each([NaN, -100])('non-finite/backward clock %s is failure, never a successful census', async clock => {
  const f = fixture(); const read = f.io.readFile;
  f.io.readFile = vi.fn(async (path, signal) => {
    const bytes = await read(path, signal); vi.spyOn(performance, 'now').mockReturnValue(clock); return bytes;
  });
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io)).rejects.toMatchObject({ code: 'PROC_CENSUS_CLOCK' });
});

test('a trailing newline in expected boot identity is invalid config, before any I/O', async () => {
  const f = fixture();
  await expect(module.readLinuxProcessCensus({ ...config(), expectedBootId: BOOT + '\n' }, f.abort.signal, f.io))
    .rejects.toMatchObject({ code: 'PROC_CENSUS_CONFIG' });
  expect(f.io.readFile).not.toHaveBeenCalled(); expect(f.io.readdir).not.toHaveBeenCalled();
});

test('a newline-suffixed directory PID cannot be coerced into a different path', async () => {
  const f = fixture(); f.setEntries(['10\n']);
  await expect(module.readLinuxProcessCensus(config(), f.abort.signal, f.io))
    .rejects.toMatchObject({ code: 'PROC_CENSUS_SCHEMA' });
  expect(f.calls).toEqual([bootPath, '/proc']);
});
