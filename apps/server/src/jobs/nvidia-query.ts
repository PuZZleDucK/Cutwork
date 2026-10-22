import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute } from 'node:path';

export interface NvidiaQueryConfig {
  executable: string;
  expectedGpuUuids: string[];
  timeoutMs: number;
  cleanupTimeoutMs: number;
  maxOutputBytes: number;
}
export interface NvidiaQueryIo {
  spawn: (file: string, argv: readonly string[], options: {
    shell: false; detached: false; stdio: 'pipe';
  }) => ChildProcessWithoutNullStreams;
}
export interface QueryEvidence {
  executable: string;
  argv: string[];
  pid: number | null;
  startedAtMs: number;
  finishedAtMs: number;
  stdout: string;
  stderr: string;
  exitCode: 0;
  signal: null;
}
export interface ComputeSnapshot {
  kind: 'nvidia-compute-process-snapshot';
  startedAtMs: number;
  finishedAtMs: number;
  gpuUuids: string[];
  processes: Array<{ gpuUuid: string; pid: number }>;
  /** Bounded native command evidence, not a resource-release verdict. */
  queries: QueryEvidence[];
}
type FailureCode = 'GPU_PROBE_CONFIG' | 'GPU_PROBE_ABORTED' | 'GPU_PROBE_TIMEOUT' |
  'GPU_PROBE_SPAWN' | 'GPU_PROBE_EXIT' | 'GPU_PROBE_OUTPUT' | 'GPU_PROBE_SCHEMA' |
  'GPU_PROBE_CLEANUP' | 'GPU_PROBE_CLOCK';
export class NvidiaQueryError extends Error {
  readonly code: FailureCode;
  readonly cleanupConfirmed: boolean;
  readonly queryPid: number | null;
  constructor(code: FailureCode, message: string, options: {
    cleanupConfirmed?: boolean; queryPid?: number | null; cause?: unknown;
  } = {}) {
    super(message, { cause: options.cause });
    this.name = 'NvidiaQueryError'; this.code = code;
    this.cleanupConfirmed = options.cleanupConfirmed ?? true;
    this.queryPid = options.queryPid ?? null;
  }
}
const UUID = /^GPU-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_TIMER = 2_147_483_647;
const inventoryArgs = ['--query-gpu=uuid', '--format=csv,noheader,nounits'];
const computeArgs = ['--query-compute-apps=gpu_uuid,pid', '--format=csv,noheader,nounits'];
const schemaError = (message: string) => new NvidiaQueryError('GPU_PROBE_SCHEMA', message);
function lines(text: string): string[] { return text.trim() ? text.trim().split(/\r?\n/).map(line => line.trim()) : []; }
function inventory(text: string, expected: string[]): string[] {
  const rows = lines(text), unique = new Set(rows);
  if (!rows.length || unique.size !== rows.length || rows.some(row => !UUID.test(row)) || expected.some(uuid => !unique.has(uuid))) {
    throw schemaError('GPU inventory is missing, unsupported, duplicated or does not contain the expected GPUs');
  }
  return rows.sort();
}
function computeRows(text: string, gpuUuids: string[]): ComputeSnapshot['processes'] {
  const known = new Set(gpuUuids), pairs = new Set<string>();
  const rows = lines(text).map(line => {
    const fields = line.split(',').map(field => field.trim());
    const [gpuUuid, rawPid] = fields;
    if (fields.length !== 2 || !gpuUuid || !known.has(gpuUuid) || !rawPid || !/^[1-9]\d*$/.test(rawPid) || !Number.isSafeInteger(Number(rawPid))) {
      throw schemaError('Invalid GPU/PID compute row; no row may be silently dropped');
    }
    const key = `${gpuUuid}:${rawPid}`;
    if (pairs.has(key)) throw schemaError('Duplicate GPU/PID compute row');
    pairs.add(key);
    return { gpuUuid, pid: Number(rawPid) };
  });
  return rows.sort((a, b) => a.gpuUuid < b.gpuUuid ? -1 : a.gpuUuid > b.gpuUuid ? 1 : a.pid - b.pid);
}

/** Read-only compute-context observation. NOT ownership, all GPU allocations,
 * an atomic snapshot, a lease, or permission to dispatch. MPS/translated PID/
 * unverified MIG/vGPU attribution requires separate integration support. */
export async function readNvidiaComputeSnapshot(input: NvidiaQueryConfig, signal: AbortSignal,
  io?: NvidiaQueryIo): Promise<ComputeSnapshot> {
  const startedAtMs = performance.now();
  const aborted = () => new NvidiaQueryError('GPU_PROBE_ABORTED', 'GPU observation aborted by caller');
  if (signal.aborted) throw aborted();
  const { executable, timeoutMs, cleanupTimeoutMs, maxOutputBytes } = input;
  const expected = Array.isArray(input.expectedGpuUuids) ? [...input.expectedGpuUuids] : [];
  const launch = io?.spawn ?? ((file, argv, options) => spawn(file, [...argv], options));
  if (typeof executable !== 'string' || !isAbsolute(executable) || executable.includes('\0') ||
      !expected.length || expected.some(uuid => typeof uuid !== 'string' || !UUID.test(uuid)) || new Set(expected).size !== expected.length ||
      ![timeoutMs, cleanupTimeoutMs].every(value => Number.isFinite(value) && value > 0 && value <= MAX_TIMER) ||
      !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0 || !Number.isFinite(startedAtMs)) {
    throw new NvidiaQueryError('GPU_PROBE_CONFIG', 'Expected an absolute binary, distinct GPU UUIDs and finite positive budgets');
  }
  const expiresAt = startedAtMs + timeoutMs;
  let lastNow = startedAtMs;
  function now() {
    const value = performance.now();
    if (!Number.isFinite(value) || value < lastNow) throw new NvidiaQueryError('GPU_PROBE_CLOCK', 'Observation clock is not finite/monotonic');
    lastNow = value; return value;
  }
  function check() {
    if (signal.aborted) throw aborted();
    const timestamp = now();
    if (timestamp >= expiresAt) throw new NvidiaQueryError('GPU_PROBE_TIMEOUT', 'Whole GPU observation deadline expired');
    return timestamp;
  }

  async function query(argvInput: string[]): Promise<QueryEvidence> {
    check();
    const argv = [...argvInput], queryStarted = now();
    let child: ChildProcessWithoutNullStreams;
    try { child = launch(executable, argv, { shell: false, detached: false, stdio: 'pipe' }); }
    catch (cause) { throw new NvidiaQueryError('GPU_PROBE_SPAWN', 'Could not launch the GPU query', { cause }); }
    return new Promise<QueryEvidence>((resolve, reject) => {
      let settled = false, closed = false, exitObserved = false, spawnFailed = false;
      let stdoutEnded = false, stderrEnded = false;
      let exitCode: number | null = null, exitSignal: string | null = null;
      let failure: NvidiaQueryError | undefined;
      let bytes = 0;
      const out: Buffer[] = [], err: Buffer[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      let escalation: ReturnType<typeof setTimeout> | undefined;
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      const cleanupKnown = () => closed && (exitObserved || spawnFailed);
      function dispose() {
        clearTimeout(timer); clearTimeout(escalation); clearTimeout(cleanupTimer);
        signal.removeEventListener('abort', onAbort);
        child.stdout.off('data', onOut); child.stderr.off('data', onErr);
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        // Keep guarded error listeners for a late native error after an uncertain
        // close. They cannot revive this request or launch another query.
      }
      function rejectOnce(error: NvidiaQueryError) {
        if (settled) return;
        settled = true; dispose(); reject(error);
      }
      function tryFinish() {
        if (settled || !closed) return;
        if (failure) {
          if (cleanupKnown()) rejectOnce(new NvidiaQueryError(failure.code, failure.message,
            { cause: failure, queryPid: child.pid ?? null, cleanupConfirmed: true }));
          return;
        }
        if (!stdoutEnded || !stderrEnded) return;
        try {
          check();
          if (!exitObserved || exitCode !== 0 || exitSignal !== null) {
            throw new NvidiaQueryError('GPU_PROBE_EXIT', 'GPU query did not exit normally with status zero');
          }
          const decoder = new TextDecoder('utf-8', { fatal: true });
          let stdout: string, stderr: string;
          try { stdout = decoder.decode(Buffer.concat(out)); stderr = decoder.decode(Buffer.concat(err)); }
          catch (cause) { throw new NvidiaQueryError('GPU_PROBE_OUTPUT', 'Invalid UTF-8 GPU query output', { cause }); }
          if (stderr.trim()) throw new NvidiaQueryError('GPU_PROBE_OUTPUT', 'GPU query emitted stderr diagnostics');
          const evidence: QueryEvidence = { executable, argv, pid: child.pid ?? null,
            startedAtMs: queryStarted, finishedAtMs: now(), stdout, stderr, exitCode: 0, signal: null };
          check(); settled = true; dispose(); resolve(evidence);
        } catch (error) { fail(error instanceof NvidiaQueryError ? error : new NvidiaQueryError('GPU_PROBE_OUTPUT', 'Invalid GPU query outcome', { cause: error })); }
      }
      function stop(name: 'SIGTERM' | 'SIGKILL') {
        // Only the newly returned child handle. No listed GPU PID/group is ever
        // signalled. An exited child may leave inherited pipes, not a live PID.
        if (exitObserved || spawnFailed || closed) return;
        try { child.kill(name); } catch { /* Unconfirmed cleanup remains failure. */ }
      }
      function fail(error: NvidiaQueryError) {
        if (settled || failure) return;
        failure = error; clearTimeout(timer);
        if (cleanupKnown()) { tryFinish(); return; }
        // Arm the complete cleanup budget before signalling: a scripted or real
        // child can report close synchronously/very quickly after termination.
        cleanupTimer = setTimeout(() => {
          if (settled) return;
          child.unref?.();
          rejectOnce(new NvidiaQueryError('GPU_PROBE_CLEANUP', 'GPU query child cleanup could not be confirmed',
            { cause: failure, cleanupConfirmed: false, queryPid: child.pid ?? null }));
        }, Math.ceil(cleanupTimeoutMs));
        escalation = setTimeout(() => stop('SIGKILL'), Math.max(1, Math.floor(cleanupTimeoutMs / 2)));
        stop('SIGTERM');
        // Stop consuming failed output. This closes only our pipe endpoints,
        // not another process that might have inherited a write descriptor.
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        tryFinish();
      }
      function onAbort() { fail(aborted()); }
      function chunk(value: Buffer | string, destination: Buffer[]) {
        if (settled || failure) return;
        const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
        bytes += data.length;
        if (bytes > maxOutputBytes) { fail(new NvidiaQueryError('GPU_PROBE_OUTPUT', 'Combined GPU query output exceeded the byte limit')); return; }
        destination.push(data);
      }
      const onOut = (data: Buffer) => chunk(data, out), onErr = (data: Buffer) => chunk(data, err);
      child.stdout.on('data', onOut); child.stderr.on('data', onErr);
      child.stdout.on('end', () => { stdoutEnded = true; tryFinish(); });
      child.stderr.on('end', () => { stderrEnded = true; tryFinish(); });
      child.stdout.on('error', cause => fail(new NvidiaQueryError('GPU_PROBE_OUTPUT', 'GPU stdout stream failed', { cause })));
      child.stderr.on('error', cause => fail(new NvidiaQueryError('GPU_PROBE_OUTPUT', 'GPU stderr stream failed', { cause })));
      child.stdin.on('error', cause => fail(new NvidiaQueryError('GPU_PROBE_OUTPUT', 'GPU query input stream failed', { cause })));
      child.on('error', cause => {
        if (settled) return;
        // A spawn error with no PID means no process was created, but still wait
        // for Node's close event before reporting confirmed cleanup.
        spawnFailed = child.pid === undefined;
        fail(new NvidiaQueryError('GPU_PROBE_SPAWN', 'GPU query process failed', { cause }));
      });
      child.on('exit', (code, nativeSignal) => { exitObserved = true; exitCode = code; exitSignal = nativeSignal; });
      child.on('close', () => { closed = true; tryFinish(); });
      signal.addEventListener('abort', onAbort, { once: true });
      try { check(); timer = setTimeout(() => fail(new NvidiaQueryError('GPU_PROBE_TIMEOUT', 'Whole GPU observation deadline expired')),
        Math.max(1, Math.ceil(expiresAt - now()))); child.stdin.end(); }
      catch (error) { fail(error instanceof NvidiaQueryError ? error : new NvidiaQueryError('GPU_PROBE_OUTPUT', 'GPU query setup failed', { cause: error })); }
    });
  }

  const first = await query(inventoryArgs);
  check(); const gpuUuids = inventory(first.stdout, expected); check();
  const compute = await query(computeArgs);
  check(); const processes = computeRows(compute.stdout, gpuUuids); check();
  const last = await query(inventoryArgs);
  check(); const finalInventory = inventory(last.stdout, expected); check();
  if (JSON.stringify(gpuUuids) !== JSON.stringify(finalInventory)) throw schemaError('GPU inventory changed during the observation interval');
  // The final timestamp is part of the original budget too, including any
  // synchronous validation/comparison work after the last native child closed.
  const finishedAtMs = check();
  return { kind: 'nvidia-compute-process-snapshot', startedAtMs, finishedAtMs, gpuUuids,
    processes, queries: [first, compute, last] };
}
