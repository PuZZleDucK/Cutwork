/** Injected observations/clock plus local plan files: no NVIDIA command, cgroup or native process. */
import { afterEach, expect, test, vi } from 'vitest';
import { settleGpuRelease } from '../../apps/server/src/jobs/gpu-release-settling.ts';
import { NvidiaQueryError, type ComputeSnapshot } from '../../apps/server/src/jobs/nvidia-query.ts';
const gpu = 'GPU-00000000-0000-4000-8000-000000000001';
function snapshot(pids: number[]): ComputeSnapshot {
  return { kind: 'nvidia-compute-process-snapshot', startedAtMs: 1, finishedAtMs: 2, gpuUuids: [gpu],
    processes: pids.map(pid => ({ gpuUuid: gpu, pid })), queries: [{ executable: '/fixture/nvidia-smi', argv: ['fixture'],
      pid: 901, startedAtMs: 1, finishedAtMs: 2, stdout: pids.map(pid => `${gpu}, ${pid}`).join('\n'), stderr: '', exitCode: 0, signal: null }] };
}
const config = { rememberedPids: [123], timeoutMs: 100, pollMs: 20, cleanupTimeoutMs: 10 };
function fixture(rows = [[123, 456], [456]]) {
  let clock = 0, index = 0;
  const isCgroupEmpty = vi.fn(async (_signal: AbortSignal) => true);
  const query = vi.fn(async (_remaining: number, _signal: AbortSignal) => snapshot(rows[Math.min(index++, rows.length - 1)]!));
  const wait = vi.fn(async (ms: number, _signal: AbortSignal) => { clock += ms; });
  const io = { isCgroupEmpty, query, wait, now: () => clock };
  return { io, advance: (ms: number) => { clock += ms; } };
}
afterEach(() => vi.useRealTimers());
test('stale owned GPU row then absence releases, preserving every complete raw snapshot and unrelated row', async () => {
  const { io } = fixture(); const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('released'); expect(result.observations).toHaveLength(2);
  expect(result.observations.map(x => x.gpu)).toEqual([snapshot([123, 456]), snapshot([456])]);
  expect(result.observations.every(x => x.emptyBefore === true && x.emptyAfter === true)).toBe(true);
  expect(io.isCgroupEmpty).toHaveBeenCalledTimes(4); expect(io.query.mock.calls.map(x => x[0])).toEqual([100, 80]);
  expect(result.finishedAtMs).toBe(20);
});
test('persistent owned row exhausts the original deadline; no fresh deadline or release', async () => {
  const { io } = fixture([[123]]); const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('uncertain'); expect(result.error?.code).toBe('GPU_RELEASE_TIMEOUT');
  expect(result.finishedAtMs).toBe(100); expect(io.query).toHaveBeenCalledTimes(5);
  expect(result.observations.filter(x => x.gpu)).toHaveLength(5);
  expect(io.query.mock.calls.map(x => x[0])).toEqual([100, 80, 60, 40, 20]);
});
test.each(['GPU_PROBE_TIMEOUT', 'GPU_PROBE_SCHEMA', 'GPU_PROBE_CLEANUP'] as const)('a %s query failure is unknown, never an empty snapshot or retry', async code => {
  const { io } = fixture(); io.query.mockRejectedValue(new NvidiaQueryError(code, 'fixture query failed', { cleanupConfirmed: code !== 'GPU_PROBE_CLEANUP', queryPid: 999 }));
  const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('uncertain'); expect(result.error).toMatchObject({ code, queryPid: 999, cleanupConfirmed: code !== 'GPU_PROBE_CLEANUP' });
  expect(io.query).toHaveBeenCalledTimes(1); expect(result.observations[0]?.gpu).toBeUndefined();
});
test('a query error after a lingering row preserves prior raw evidence and stops polling', async () => {
  const { io } = fixture(); io.query.mockResolvedValueOnce(snapshot([123])).mockRejectedValueOnce(new NvidiaQueryError('GPU_PROBE_SCHEMA', 'bad inventory'));
  const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('uncertain'); expect(io.query).toHaveBeenCalledTimes(2);
  expect(result.observations[0]?.gpu).toEqual(snapshot([123])); expect(result.observations[1]?.error?.code).toBe('GPU_PROBE_SCHEMA');
});
test('populated cgroup before query cannot authorize release or even query', async () => {
  const { io } = fixture(); io.isCgroupEmpty.mockResolvedValue(false);
  const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('uncertain'); expect(io.query).not.toHaveBeenCalled(); expect(result.observations[0]?.emptyBefore).toBe(false);
});
test('cgroup becomes populated after an empty GPU snapshot: preserve snapshot but never release', async () => {
  const { io } = fixture([[]]); io.isCgroupEmpty.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('uncertain'); expect(result.observations[0]).toMatchObject({ emptyBefore: true, emptyAfter: false, gpu: snapshot([]) });
});
test('unreadable cgroup is unknown rather than absent', async () => {
  const { io } = fixture(); io.isCgroupEmpty.mockRejectedValue(Object.assign(new Error('read denied'), { code: 'EACCES' }));
  const result = await settleGpuRelease(config, io);
  expect(result.state).toBe('uncertain'); expect(result.error?.code).toBe('EACCES'); expect(io.query).not.toHaveBeenCalled();
});
test('successful observation arriving at exact deadline is retained but cannot release', async () => {
  const f = fixture([[]]); f.io.query.mockImplementation(async () => { f.advance(100); return snapshot([]); });
  const result = await settleGpuRelease(config, f.io);
  expect(result.state).toBe('uncertain'); expect(result.error?.code).toBe('GPU_RELEASE_TIMEOUT');
  expect(result.observations[0]?.gpu).toEqual(snapshot([]));
});
test('closing cgroup verification belongs to the same deadline', async () => {
  const f = fixture([[]]); f.io.isCgroupEmpty.mockResolvedValueOnce(true).mockImplementationOnce(async () => { f.advance(100); return true; });
  const result = await settleGpuRelease(config, f.io);
  expect(result.state).toBe('uncertain'); expect(result.error?.code).toBe('GPU_RELEASE_TIMEOUT');
});
test('backwards clock is not release evidence', async () => {
  const f = fixture([[]]); f.io.query.mockImplementation(async () => { f.advance(-1); return snapshot([]); });
  const result = await settleGpuRelease(config, f.io);
  expect(result.state).toBe('uncertain'); expect(result.error?.code).toBe('GPU_RELEASE_CLOCK');
});
test('hanging query is aborted at the original deadline, gets bounded drain, and cannot change returned evidence later', async () => {
  vi.useFakeTimers();
  let resolveQuery!: (s: ComputeSnapshot) => void, signal: AbortSignal | undefined;
  const f = fixture(); f.io.now = () => Date.now();
  f.io.query.mockImplementation((_remaining, s) => { signal = s; return new Promise(resolve => { resolveQuery = resolve; }); });
  const pending = settleGpuRelease(config, f.io); await vi.advanceTimersByTimeAsync(0);
  expect(signal?.aborted).toBe(false); await vi.advanceTimersByTimeAsync(100); expect(signal?.aborted).toBe(true);
  let finished = false; void pending.then(() => { finished = true; }); expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(10); const result = await pending;
  expect(result.state).toBe('uncertain'); expect(result.error).toMatchObject({ code: 'GPU_RELEASE_TIMEOUT', settlementPending: true });
  const retained = JSON.stringify(result); resolveQuery(snapshot([])); await vi.advanceTimersByTimeAsync(0);
  expect(JSON.stringify(result)).toBe(retained); expect(f.io.query).toHaveBeenCalledTimes(1); expect(f.io.isCgroupEmpty).toHaveBeenCalledTimes(1);
});
test('native uncertain child-cleanup error during deadline drain remains explicit and blocks release', async () => {
  vi.useFakeTimers(); const f = fixture(); f.io.now = () => Date.now();
  f.io.query.mockImplementation((_remaining, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new NvidiaQueryError('GPU_PROBE_CLEANUP', 'child not reaped', { cleanupConfirmed: false, queryPid: 12345 })), { once: true });
  }));
  const pending = settleGpuRelease(config, f.io); await vi.advanceTimersByTimeAsync(100); const result = await pending;
  expect(result.state).toBe('uncertain'); expect(result.error).toMatchObject({ code: 'GPU_PROBE_CLEANUP', cleanupConfirmed: false, queryPid: 12345 });
});
test('configuration fails before any observation', async () => {
  for (const bad of [{ ...config, timeoutMs: 0 }, { ...config, rememberedPids: [NaN] }, { ...config, pollMs: 0 }]) {
    const { io } = fixture(); await expect(settleGpuRelease(bad, io)).rejects.toThrow(); expect(io.query).not.toHaveBeenCalled(); expect(io.isCgroupEmpty).not.toHaveBeenCalled();
  }
});
test('adapter preparation records the resolved default and explicit settling deadline before launch', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const { createSystemdGpuAdapter } = await import('../../apps/server/src/jobs/systemd-gpu.ts');
  const dir = await mkdtemp(join(tmpdir(), 'gpu-settling-plan-'));
  try {
    for (const timeout of [undefined, 1234]) {
      const adapter = createSystemdGpuAdapter({ runRoot: dir, node: '/fixture/node', supervisor: '/fixture/supervisor.ts',
        runtimeLimitSeconds: 30, ...(timeout === undefined ? {} : { gpuReleaseTimeoutMs: timeout }),
        gpu: { executable: '/fixture/nvidia-smi', expectedGpuUuids: [gpu], timeoutMs: 1000, cleanupTimeoutMs: 100, maxOutputBytes: 1000 },
        resolveCommand: async () => ({ executable: '/fixture/python', cwd: dir, args: [], env: {} }) });
      const plan = await adapter.prepare({ id: 'call', attemptId: 'attempt' } as never, new AbortController().signal) as Record<string, unknown>;
      expect(plan.gpuReleaseTimeoutMs).toBe(timeout ?? 30_000);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
