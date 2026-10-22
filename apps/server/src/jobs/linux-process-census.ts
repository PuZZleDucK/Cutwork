import { readdir, readFile } from 'node:fs/promises';

export interface ProcessRecord {
  pid: number;
  parentPid: number;
  group: number;
  session: number;
  /** Exact kernel decimal, never rounded through a JavaScript Number. */
  startTicks: string;
  /** Includes zombies/stopped tasks; not a liveness or release verdict. */
  state: string;
}
export interface ProcessCensus {
  kind: 'linux-process-census';
  scope: 'visible-procfs';
  bootId: string;
  startedAtMs: number;
  finishedAtMs: number;
  processes: ProcessRecord[];
}
export interface CensusConfig {
  expectedBootId: string;
  timeoutMs: number;
  maxDirectoryEntries: number;
  maxFileBytes: number;
}
/** Test seam only. Production always reads fixed paths under /proc. */
export interface CensusIo {
  readdir(path: string, signal: AbortSignal): Promise<string[]>;
  readFile(path: string, signal: AbortSignal): Promise<Uint8Array>;
}
type FailureCode = 'PROC_CENSUS_CONFIG' | 'PROC_CENSUS_SCHEMA' | 'PROC_CENSUS_IO' |
  'PROC_CENSUS_LIMIT' | 'PROC_CENSUS_ABORTED' | 'PROC_CENSUS_TIMEOUT' | 'PROC_CENSUS_CLOCK';
export class ProcessCensusError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ProcessCensusError'; this.code = code;
  }
}
const BOOT_PATH = '/proc/sys/kernel/random/boot_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSIGNED = /^(?:0|[1-9]\d*)$/;
const INTEGER = /^(?:0|-?[1-9]\d*)$/;
const STATES = new Set('RSDZTtXxKWPI');
const MAX_TIMER = 2_147_483_647;
const MAX_TICKS = (1n << 64n) - 1n;
// Kernel stat field numbers, not array indices. Other established numeric
// fields are unsigned. Later appended numeric fields may be signed.
const SIGNED_FIELDS = new Set([7, 8, 16, 17, 18, 19, 20, 21, 24, 38, 39, 44, 52]);
const schema = (message: string) => new ProcessCensusError('PROC_CENSUS_SCHEMA', message);

function numericId(value: string | undefined, positive = false): number {
  if (!value || !UNSIGNED.test(value) || !Number.isSafeInteger(Number(value)) || (positive && Number(value) === 0)) {
    throw schema('Expected a canonical safe process identifier');
  }
  return Number(value);
}

function processRecord(data: Buffer, pid: number): ProcessRecord {
  const prefix = Buffer.from(`${pid} (`), close = data.lastIndexOf(0x29);
  if (!data.subarray(0, prefix.length).equals(prefix) || close < prefix.length || data[close + 1] !== 0x20) {
    throw schema(`Malformed stat header for PID ${pid}`);
  }
  // comm is arbitrary bytes and may contain ')' or a newline. Do not decode it,
  // split the entire record on whitespace, or mask non-ASCII tail bytes via ascii.
  let tail = data.toString('latin1', close + 1);
  if (tail.endsWith('\n')) tail = tail.slice(0, -1);
  if (tail.includes('\n') || !/^ [\x20-\x7e]*$/.test(tail)) throw schema(`Invalid stat bytes for PID ${pid}`);
  const fields = tail.trim().split(/ +/), state = fields[0];
  // Ubuntu's supported kernel record includes fields 1..52. Additional numeric
  // fields can be retained structurally without shifting the selected fields.
  if (fields.length < 50 || !state || !STATES.has(state)) throw schema(`Incomplete/unsupported stat for PID ${pid}`);
  for (let index = 1; index < fields.length; index++) {
    const fieldNumber = index + 3;
    const pattern = SIGNED_FIELDS.has(fieldNumber) || fieldNumber > 52 ? INTEGER : UNSIGNED;
    if (!pattern.test(fields[index]!)) throw schema(`Invalid stat field ${fieldNumber} for PID ${pid}`);
  }
  const startTicks = fields[19]!;
  if (BigInt(startTicks) > MAX_TICKS) throw schema(`Out-of-range start ticks for PID ${pid}`);
  return { pid, parentPid: numericId(fields[1]), group: numericId(fields[2]),
    session: numericId(fields[3]), startTicks, state };
}

/** Read-only, non-atomic census of visible procfs. Not host-namespace coverage,
 * process ownership, stopped/released evidence, or permission to dispatch.
 * A listed PID disappearing invalidates the scan: no skipping/caching/retry. */
export async function readLinuxProcessCensus(input: CensusConfig, signal: AbortSignal,
  io?: CensusIo): Promise<ProcessCensus> {
  const startedAtMs = performance.now();
  const aborted = () => new ProcessCensusError('PROC_CENSUS_ABORTED', 'Process census aborted by caller');
  if (signal.aborted) throw aborted();
  const { expectedBootId, timeoutMs, maxDirectoryEntries, maxFileBytes } = input;
  const read = io?.readFile ?? ((path: string, current: AbortSignal) => readFile(path, { signal: current }));
  // Node readdir has no AbortSignal option. Its late result is still ignored;
  // stopping promise waiting is not a claim to interrupt a kernel syscall.
  const list = io?.readdir ?? ((path: string) => readdir(path));
  if (typeof expectedBootId !== 'string' || !UUID.test(expectedBootId) ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER ||
      ![maxDirectoryEntries, maxFileBytes].every(value => Number.isSafeInteger(value) && value > 0) ||
      typeof read !== 'function' || typeof list !== 'function') {
    throw new ProcessCensusError('PROC_CENSUS_CONFIG', 'Expected a boot UUID, positive finite budgets and valid I/O callbacks');
  }
  if (!Number.isFinite(startedAtMs)) throw new ProcessCensusError('PROC_CENSUS_CLOCK', 'Census clock is not finite');
  const expiresAt = startedAtMs + timeoutMs;
  if (!Number.isFinite(expiresAt) || expiresAt <= startedAtMs) throw new ProcessCensusError('PROC_CENSUS_CONFIG', 'Invalid census deadline');
  let lastNow = startedAtMs;
  function check(): number {
    if (signal.aborted) throw aborted();
    const stamp = performance.now();
    if (!Number.isFinite(stamp) || stamp < lastNow) throw new ProcessCensusError('PROC_CENSUS_CLOCK', 'Census clock is not finite/monotonic');
    lastNow = stamp;
    if (stamp >= expiresAt) throw new ProcessCensusError('PROC_CENSUS_TIMEOUT', 'Whole process census deadline expired');
    return stamp;
  }

  function operation<T>(path: string, action: (current: AbortSignal) => Promise<T>): Promise<T> {
    const remaining = expiresAt - check();
    return new Promise<T>((resolve, reject) => {
      const current = new AbortController();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const dispose = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
      function fail(error: ProcessCensusError) {
        if (settled) return;
        settled = true; dispose(); reject(error); current.abort(error);
      }
      function onAbort() { fail(aborted()); }
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => fail(new ProcessCensusError('PROC_CENSUS_TIMEOUT', 'Whole process census deadline expired')), Math.ceil(remaining));
      try {
        check(); // Includes abort/config-capture races, before starting I/O.
        Promise.resolve(action(current.signal)).then(value => {
          if (settled) return; // Late completion may not resume the scan.
          try { check(); settled = true; dispose(); resolve(value); }
          catch (error) { fail(error as ProcessCensusError); }
        }, cause => fail(new ProcessCensusError('PROC_CENSUS_IO', `Could not read ${path}`, cause)));
      } catch (cause) {
        fail(cause instanceof ProcessCensusError ? cause : new ProcessCensusError('PROC_CENSUS_IO', `Could not read ${path}`, cause));
      }
    });
  }

  async function bytes(path: string): Promise<Buffer> {
    const result = await operation(path, current => read(path, current));
    check();
    if (!(result instanceof Uint8Array)) throw schema(`Non-byte filesystem result for ${path}`);
    if (result.byteLength > maxFileBytes) throw new ProcessCensusError('PROC_CENSUS_LIMIT', `File byte budget exceeded: ${path}`);
    return Buffer.from(result);
  }
  async function boot(): Promise<string> {
    const data = await bytes(BOOT_PATH);
    // Latin1 preserves invalid high bytes for rejection; comm is the only field
    // allowed arbitrary bytes. Kernel boot_id is a UUID plus an optional LF.
    const value = data.toString('latin1').replace(/\n$/, '');
    if (!UUID.test(value) || value !== expectedBootId) throw schema('Missing, changed or unexpected boot identity');
    check(); return value;
  }

  const bootId = await boot();
  const names = await operation('/proc', current => list('/proc', current));
  check();
  if (!Array.isArray(names)) throw schema('Procfs directory result is not an array');
  if (names.length > maxDirectoryEntries) throw new ProcessCensusError('PROC_CENSUS_LIMIT', 'Directory entry budget exceeded');
  const pids = new Set<number>();
  for (const name of names) {
    if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\0') || name === '.' || name === '..') {
      throw schema('Invalid procfs directory entry');
    }
    if (!/^\d+$/.test(name)) continue;
    const pid = numericId(name, true);
    if (pids.has(pid)) throw schema('Duplicate procfs PID entry');
    pids.add(pid);
  }
  if (!pids.size) throw schema('No visible procfs process records');
  check();
  const processes: ProcessRecord[] = [];
  for (const pid of [...pids].sort((a, b) => a - b)) {
    processes.push(processRecord(await bytes(`/proc/${pid}/stat`), pid));
    check();
  }
  await boot();
  const finishedAtMs = check(); // Validate the timestamp itself, not an earlier read.
  return { kind: 'linux-process-census', scope: 'visible-procfs', bootId,
    startedAtMs, finishedAtMs, processes };
}
