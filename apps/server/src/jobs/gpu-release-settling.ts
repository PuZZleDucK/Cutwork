/** Bounded post-stop NVML settling, not a general release/ownership detector.
 * Caller must already have stopped its verified owned unit. Only valid snapshots
 * still containing retained PIDs are polled again; errors are never retried. */
import { setTimeout as delay } from 'node:timers/promises';
import type { ComputeSnapshot } from './nvidia-query.ts';

export interface SettlingFault {
  name: string; message: string; code?: string; cleanupConfirmed?: boolean;
  queryPid?: number | null; settlementPending?: boolean;
}
export interface SettlingObservation {
  startedAtMs: number; emptyBefore?: boolean; gpu?: ComputeSnapshot;
  emptyAfter?: boolean; finishedAtMs?: number; error?: SettlingFault;
}
export interface ReleaseSettlement {
  state: 'released' | 'uncertain'; reason?: string; error?: SettlingFault;
  startedAtMs: number; finishedAtMs: number; timeoutMs: number;
  cleanupTimeoutMs: number; observations: SettlingObservation[];
}
export interface SettlingIo {
  isCgroupEmpty(signal: AbortSignal): Promise<boolean>;
  query(remainingMs: number, signal: AbortSignal): Promise<ComputeSnapshot>;
  now?(): number;
  wait?(ms: number, signal: AbortSignal): Promise<void>;
}
function failure(code: string, message: string) { return Object.assign(new Error(message), { code }); }
function fault(error: unknown): SettlingFault {
  const result: SettlingFault = { name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error) };
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.code === 'string') result.code = e.code;
    if (typeof e.cleanupConfirmed === 'boolean') result.cleanupConfirmed = e.cleanupConfirmed;
    if (e.queryPid === null || (Number.isSafeInteger(e.queryPid) && Number(e.queryPid) > 0)) result.queryPid = e.queryPid as number | null;
    if (typeof e.settlementPending === 'boolean') result.settlementPending = e.settlementPending;
  }
  return result;
}
export async function settleGpuRelease(config: {
  rememberedPids: readonly number[]; timeoutMs: number; pollMs: number; cleanupTimeoutMs: number;
}, io: SettlingIo): Promise<ReleaseSettlement> {
  if (![config.timeoutMs, config.pollMs, config.cleanupTimeoutMs].every(n => Number.isFinite(n) && n > 0 && n <= 2_147_483_647) ||
    !Array.isArray(config.rememberedPids) || !config.rememberedPids.length || config.rememberedPids.some(n => !Number.isSafeInteger(n) || n <= 0)) {
    throw new Error('Finite positive settling budgets and retained process IDs are required');
  }
  const remembered = new Set(config.rememberedPids), now = io.now ?? (() => performance.now());
  const startedAtMs = now(), deadline = startedAtMs + config.timeoutMs;
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(deadline)) throw new Error('Finite settling clock required');
  let lastNow = startedAtMs;
  const observations: SettlingObservation[] = [];
  function clock() {
    const value = now();
    if (!Number.isFinite(value) || value < lastNow) throw failure('GPU_RELEASE_CLOCK', 'Settling clock is not finite/monotonic');
    lastNow = value; return value;
  }
  function check() {
    const value = clock();
    if (value >= deadline) throw failure('GPU_RELEASE_TIMEOUT', 'Owned GPU rows did not settle within the original release deadline');
    return value;
  }
  async function phase<T>(call: (signal: AbortSignal, remaining: number) => Promise<T>, record?: (value: T) => void): Promise<T> {
    const remaining = deadline - check(), controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, drainTimer: ReturnType<typeof setTimeout> | undefined;
    let accepting = true;
    // Capture only while this phase/drain is owned. Late completion cannot mutate
    // a returned receipt, authorize release, or invoke the next observation.
    const settled = Promise.resolve().then(() => call(controller.signal, deadline - check())).then(value => {
      if (accepting) record?.(value);
      return { kind: 'value' as const, value };
    }).catch(error => ({ kind: 'error' as const, error }));
    const expired = new Promise<{ kind: 'expired' }>(resolve => {
      timer = setTimeout(() => resolve({ kind: 'expired' }), Math.max(1, Math.ceil(remaining)));
    });
    try {
      const result = await Promise.race([settled, expired]);
      if (result.kind === 'expired') {
        controller.abort();
        const drained = await Promise.race([settled, new Promise<{ kind: 'pending' }>(resolve => {
          drainTimer = setTimeout(() => resolve({ kind: 'pending' }), Math.ceil(config.cleanupTimeoutMs));
        })]);
        // Preserve native cleanup uncertainty instead of hiding it behind the
        // outer deadline. Even a late valid empty response cannot release.
        if (drained.kind === 'error') throw drained.error;
        throw Object.assign(failure('GPU_RELEASE_TIMEOUT', 'Release observation deadline expired'), { settlementPending: drained.kind === 'pending' });
      }
      if (result.kind === 'error') throw result.error;
      check(); return result.value;
    } finally {
      accepting = false; clearTimeout(timer); clearTimeout(drainTimer);
    }
  }
  try {
    while (true) {
      const observation: SettlingObservation = { startedAtMs: check() }; observations.push(observation);
      const before = await phase(s => io.isCgroupEmpty(s), value => { observation.emptyBefore = value; });
      if (before !== true) throw failure('GPU_RELEASE_CGROUP', 'Owned cgroup is not empty before GPU observation');
      await phase((s, remaining) => io.query(remaining, s), value => { observation.gpu = structuredClone(value); });
      const gpu = observation.gpu!;
      const after = await phase(s => io.isCgroupEmpty(s), value => { observation.emptyAfter = value; });
      if (after !== true) throw failure('GPU_RELEASE_CGROUP', 'Owned cgroup is not empty after GPU observation');
      const retained = gpu.processes.some(row => remembered.has(row.pid));
      observation.finishedAtMs = check();
      if (!retained) {
        const result: ReleaseSettlement = { state: 'released', startedAtMs, finishedAtMs: lastNow,
          timeoutMs: config.timeoutMs, cleanupTimeoutMs: config.cleanupTimeoutMs, observations };
        result.finishedAtMs = check(); return result;
      }
      const ms = Math.min(config.pollMs, deadline - check());
      await phase(signal => io.wait ? io.wait(ms, signal) : delay(ms, undefined, { signal }));
    }
  } catch (error) {
    const retained = fault(error);
    if (observations.length) observations.at(-1)!.error = retained;
    try { clock(); } catch { /* Preserve the first failure and last valid clock. */ }
    return { state: 'uncertain', reason: retained.message, error: retained, startedAtMs, finishedAtMs: lastNow,
      timeoutMs: config.timeoutMs, cleanupTimeoutMs: config.cleanupTimeoutMs, observations };
  }
}
