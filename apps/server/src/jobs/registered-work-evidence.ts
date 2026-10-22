import { isAbsolute } from 'node:path';
import { readLinuxProcessCensus, type CensusConfig, type ProcessCensus, type ProcessRecord } from './linux-process-census.ts';
import { readNvidiaComputeSnapshot, type NvidiaQueryConfig, type ComputeSnapshot } from './nvidia-query.ts';
import { createComfyQueueBinding, type WholeQueueSnapshot } from './comfy-queue.ts';
import type { OwnedTransportConfig } from './comfy-http.ts';

export interface Identity { bootId: string; pid: number; startTicks: string }
export interface RegisteredProcess {
  registrationId: string;
  identity: Identity;
  group: number;
  session: number;
}
export interface Registration {
  attemptId: string;
  revision: number;
  bootId: string;
  processes: RegisteredProcess[];
  comfyServices: Array<{ registrationId: string; transport: OwnedTransportConfig }>;
  unresolvedLaunchIds: string[];
}
export type Discovery =
  | { kind: 'registration'; registrationId: string; revision: number }
  | { kind: 'parent-link'; windowId: string; phase: 'before' | 'after'; parent: Identity;
      strength: 'observed-parent' | 'numeric-parent-only' }
  | { kind: 'numeric-group' | 'numeric-session'; windowId: string; phase: 'before' | 'after';
      registration: Identity; value: number };
export interface RememberedProcess { identity: Identity; discoveredBy: Discovery }
export interface ProcessMemory {
  attemptId: string;
  bootId: string;
  /** False on capacity overflow: retain raw evidence, do not reuse this as a complete ledger. */
  complete: boolean;
  entries: RememberedProcess[];
}
export interface EvidenceConfig {
  windowId: string;
  registration: Registration;
  memory: ProcessMemory;
  timeoutMs: number;
  /** Only waits for already-aborted I/O; never extends the observation deadline. */
  drainTimeoutMs: number;
  maxRememberedIdentities: number;
  census: CensusConfig;
  gpu: NvidiaQueryConfig;
}
export interface EvidenceIo {
  census(config: CensusConfig, signal: AbortSignal): Promise<ProcessCensus>;
  queue(config: OwnedTransportConfig, signal: AbortSignal): Promise<WholeQueueSnapshot>;
  gpu(config: NvidiaQueryConfig, signal: AbortSignal): Promise<ComputeSnapshot>;
}
/** Immediate native cause, copied as diagnostic data, never a release verdict.
 * No recursive causes, stacks, arbitrary properties or guessed native fields. */
export interface FaultCause {
  name?: string;
  message?: string;
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
}
export interface Fault {
  code: string;
  message: string;
  cleanupConfirmed?: boolean;
  queryPid?: number | null;
  cause?: FaultCause;
}
export type Observation<T> =
  | { state: 'ok'; startedAtMs: number; finishedAtMs: number; value: T }
  | { state: 'failed'; startedAtMs: number; finishedAtMs: number; error: Fault;
      settlement: 'settled' | 'pending'; adapterError?: Fault }
  | { state: 'not-started' };
export type Presence =
  | { state: 'present' | 'pid-reused'; record: ProcessRecord }
  | { state: 'not-observed' | 'unavailable' };
export interface GpuCorrelation {
  gpuUuid: string;
  pid: number;
  before: Identity | null;
  after: Identity | null;
  remembered: Identity[];
  /** Only correlates observed PID rows; none of these certify GPU ownership. */
  correlation: 'same-identity' | 'pid-reused' | 'one-sided' | 'unseen';
}
export interface RegisteredWorkEvidence {
  kind: 'registered-work-evidence';
  windowId: string;
  registration: Registration;
  startedAtMs: number;
  observationFinishedAtMs: number;
  finishedAtMs: number;
  collection: 'complete' | 'incomplete';
  stopReason: Fault | null;
  processes: { before: Observation<ProcessCensus>; after: Observation<ProcessCensus> };
  queues: Array<{ registrationId: string; before: Observation<WholeQueueSnapshot>;
    after: Observation<WholeQueueSnapshot>; changed: boolean | null }>;
  gpu: Observation<ComputeSnapshot>;
  identities: Array<{ identity: Identity; before: Presence; after: Presence }>;
  gpuCorrelations: GpuCorrelation[];
  memory: ProcessMemory;
  limitations: string[];
}

export class EvidenceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'EvidenceError'; this.code = code; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const gpuUuid = /^GPU-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idKey = (id: Identity) => `${id.bootId}:${id.pid}:${id.startTicks}`;
const same = (a: Identity, b: Identity) => idKey(a) === idKey(b);
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const budget = (n: number) => Number.isFinite(n) && n > 0 && n <= 2_147_483_647;
const textId = (s: string) => typeof s === 'string' && s.length > 0 && !s.includes('\0');
function validIdentity(id: Identity, boot: string) {
  return !!id && id.bootId === boot && positive(id.pid) && typeof id.startTicks === 'string' &&
    /^(0|[1-9]\d*)$/.test(id.startTicks) && BigInt(id.startTicks) <= (1n << 64n) - 1n;
}
function nativeCause(value: unknown): FaultCause | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>, result: FaultCause = {};
  for (const key of ['name', 'message', 'code', 'syscall', 'path'] as const) {
    const field = source[key];
    if (typeof field === 'string') result[key] = field;
  }
  const errno = source.errno;
  if (typeof errno === 'number' && Number.isInteger(errno)) result.errno = errno;
  return Object.keys(result).length ? result : undefined;
}
function fault(error: unknown): Fault {
  const source = error as Partial<Fault> | null;
  const cause = nativeCause(source?.cause);
  return { code: typeof source?.code === 'string' ? source.code : 'EVIDENCE_READER',
    message: typeof source?.message === 'string' ? source.message : 'Reader failed without a structured error',
    ...(cause ? { cause } : {}),
    ...(typeof source?.cleanupConfirmed === 'boolean' ? { cleanupConfirmed: source.cleanupConfirmed } : {}),
    ...(source?.queryPid === null || (typeof source?.queryPid === 'number' && positive(source.queryPid)) ? { queryPid: source.queryPid } : {}) };
}
const failure = (code: string, message: string): Fault => ({ code, message });
const terminal = new Set(['EVIDENCE_BOOT', 'EVIDENCE_CLOCK', 'EVIDENCE_LIMIT',
  'PROC_CENSUS_SCHEMA', 'PROC_CENSUS_CLOCK', 'GPU_PROBE_CLOCK']);

function validateConfig(c: EvidenceConfig, io: EvidenceIo) {
  const invalid = () => { throw new EvidenceError('EVIDENCE_CONFIG', 'Invalid captured registration, memory, reader configuration or budget'); };
  try {
    const r = c.registration, m = c.memory;
    if (!textId(c.windowId) || !textId(r.attemptId) || !positive(r.revision) || !uuid.test(r.bootId) ||
        !budget(c.timeoutMs) || !budget(c.drainTimeoutMs) || !positive(c.maxRememberedIdentities) ||
        m.attemptId !== r.attemptId || m.bootId !== r.bootId || m.complete !== true ||
        !Array.isArray(r.processes) || !Array.isArray(r.comfyServices) || !Array.isArray(r.unresolvedLaunchIds) || !Array.isArray(m.entries) ||
        r.unresolvedLaunchIds.some(id => !textId(id)) || new Set(r.unresolvedLaunchIds).size !== r.unresolvedLaunchIds.length ||
        !Object.values(io).every(fn => typeof fn === 'function')) invalid();
    const ids = new Set<string>(), pids = new Set<number>(), known = new Set<string>();
    for (const p of r.processes) {
      if (!textId(p.registrationId) || ids.has(p.registrationId) || !validIdentity(p.identity, r.bootId) ||
          pids.has(p.identity.pid) || !positive(p.group) || !positive(p.session)) invalid();
      ids.add(p.registrationId); pids.add(p.identity.pid); known.add(idKey(p.identity));
    }
    const remembered = new Set<string>();
    for (const entry of m.entries) {
      if (!validIdentity(entry.identity, r.bootId) || remembered.has(idKey(entry.identity))) invalid();
      const d = entry.discoveredBy;
      if (d.kind === 'registration') {
        if (!textId(d.registrationId) || !positive(d.revision) || d.revision > r.revision) invalid();
      } else {
        if (!textId(d.windowId) || !['before', 'after'].includes(d.phase)) invalid();
        if (d.kind === 'parent-link') {
          if (!validIdentity(d.parent, r.bootId) || !['observed-parent', 'numeric-parent-only'].includes(d.strength)) invalid();
        } else if (!['numeric-group', 'numeric-session'].includes(d.kind) || !validIdentity(d.registration, r.bootId) || !positive(d.value)) invalid();
      }
      remembered.add(idKey(entry.identity)); known.add(idKey(entry.identity));
    }
    if (known.size > c.maxRememberedIdentities) invalid();
    const services = new Set<string>(), ports = new Set<number>();
    for (const s of r.comfyServices) {
      const p = r.processes.find(p => p.registrationId === s.registrationId), t = s.transport;
      if (!p || services.has(s.registrationId) || !Number.isInteger(t.port) || t.port < 1 || t.port > 65535 || ports.has(t.port) ||
          t.owner.kind !== 'process' || t.owner.pid !== p.identity.pid || t.owner.start !== p.identity.startTicks ||
          t.owner.boot !== p.identity.bootId || t.owner.group !== p.group || !budget(t.requestTimeoutMs) || !positive(t.maxResponseBytes)) invalid();
      services.add(s.registrationId); ports.add(t.port);
    }
    if (c.census.expectedBootId !== r.bootId || !budget(c.census.timeoutMs) || !positive(c.census.maxDirectoryEntries) || !positive(c.census.maxFileBytes) ||
        typeof c.gpu.executable !== 'string' || !isAbsolute(c.gpu.executable) || c.gpu.executable.includes('\0') ||
        !budget(c.gpu.timeoutMs) || !budget(c.gpu.cleanupTimeoutMs) || !positive(c.gpu.maxOutputBytes) ||
        !Array.isArray(c.gpu.expectedGpuUuids) || !c.gpu.expectedGpuUuids.length ||
        c.gpu.expectedGpuUuids.some(id => !gpuUuid.test(id)) || new Set(c.gpu.expectedGpuUuids).size !== c.gpu.expectedGpuUuids.length) invalid();
  } catch { invalid(); }
}

/** Bounded read-only evidence, NOT release authorization. No lease, stop, unload,
 * dispatch, ownership promotion or agent restrictions. Optional I/O is a test
 * seam; production uses the three accepted native readers directly. */
export async function collectRegisteredWorkEvidence(input: EvidenceConfig, signal: AbortSignal,
  seam?: EvidenceIo): Promise<RegisteredWorkEvidence> {
  const startedAtMs = performance.now();
  if (!Number.isFinite(startedAtMs)) throw new EvidenceError('EVIDENCE_CLOCK', 'Invalid initial monotonic clock');
  let c: EvidenceConfig;
  try { c = structuredClone(input); }
  catch { throw new EvidenceError('EVIDENCE_CONFIG', 'Configuration must be a serializable captured record'); }
  const io: EvidenceIo = { census: seam ? seam.census : readLinuxProcessCensus,
    queue: seam ? seam.queue : ((config, current) => createComfyQueueBinding(config).observe(current)),
    gpu: seam ? seam.gpu : readNvidiaComputeSnapshot };
  validateConfig(c, io);
  const expires = startedAtMs + c.timeoutMs;
  if (!Number.isFinite(expires) || expires <= startedAtMs) throw new EvidenceError('EVIDENCE_CONFIG', 'Invalid window deadline');
  let lastNow = startedAtMs;
  const report: RegisteredWorkEvidence = { kind: 'registered-work-evidence', windowId: c.windowId,
    registration: c.registration, startedAtMs, observationFinishedAtMs: startedAtMs, finishedAtMs: startedAtMs,
    collection: 'incomplete', stopReason: null, processes: { before: { state: 'not-started' }, after: { state: 'not-started' } },
    queues: c.registration.comfyServices.map(s => ({ registrationId: s.registrationId,
      before: { state: 'not-started' }, after: { state: 'not-started' }, changed: null })),
    gpu: { state: 'not-started' }, identities: [], gpuCorrelations: [], memory: c.memory,
    limitations: ['non-atomic-window', 'visible-procfs-only', 'compute-contexts-only',
      'pid-attribution-unverified', 'unregistered-work-uncovered', 'lease-not-checked'] };
  const ledger = new Map(c.memory.entries.map(entry => [idKey(entry.identity), entry]));
  for (const p of c.registration.processes) if (!ledger.has(idKey(p.identity))) {
    const entry: RememberedProcess = { identity: { ...p.identity }, discoveredBy: {
      kind: 'registration', registrationId: p.registrationId, revision: c.registration.revision } };
    ledger.set(idKey(p.identity), entry); c.memory.entries.push(entry);
  }
  function now() {
    const n = performance.now();
    if (!Number.isFinite(n) || n < lastNow) throw new EvidenceError('EVIDENCE_CLOCK', 'Collector clock moved backwards or became nonfinite');
    lastNow = n; return n;
  }
  function check() {
    const n = now();
    if (signal.aborted) throw new EvidenceError('EVIDENCE_ABORTED', 'Caller aborted the observation window');
    if (n >= expires) throw new EvidenceError('EVIDENCE_TIMEOUT', 'Original observation deadline expired');
    return n;
  }
  function stop(error: Fault) {
    if (!report.stopReason) { report.stopReason = error; report.observationFinishedAtMs = lastNow; }
  }
  function interval(value: { startedAtMs: number; finishedAtMs: number }, start: number, end: number) {
    if (!Number.isFinite(value.startedAtMs) || !Number.isFinite(value.finishedAtMs) ||
        value.startedAtMs < start || value.finishedAtMs < value.startedAtMs || value.finishedAtMs > end) {
      throw new EvidenceError('EVIDENCE_CLOCK', 'Reader interval is outside its collector bracket');
    }
  }
  async function observe<T>(invoke: (remaining: number, current: AbortSignal) => Promise<T>,
    validate: (value: T, start: number, end: number) => void): Promise<Observation<T>> {
    if (report.stopReason) return { state: 'not-started' };
    let start: number;
    try { start = check(); } catch (error) { stop(fault(error)); return { state: 'not-started' }; }
    return new Promise(resolve => {
      const active = new AbortController();
      let done = false, adapterSettled = false, failed: Fault | undefined, adapterError: Fault | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined, drain: ReturnType<typeof setTimeout> | undefined;
      function dispose() { clearTimeout(timer); clearTimeout(drain); signal.removeEventListener('abort', onAbort); }
      function finishFailure() {
        if (done) return;
        done = true; dispose();
        try { now(); } catch { /* Keep the last valid timestamp; the window is already failed. */ }
        resolve({ state: 'failed', startedAtMs: start, finishedAtMs: lastNow, error: failed!,
          settlement: adapterSettled ? 'settled' : 'pending', ...(adapterError ? { adapterError } : {}) });
      }
      function fail(error: Fault, stopWindow: boolean) {
        if (done || failed) return;
        failed = error; clearTimeout(timer);
        if (stopWindow) stop(error);
        if (adapterSettled) { finishFailure(); return; }
        // Arm before abort: native cleanup can settle synchronously/very quickly.
        drain = setTimeout(finishFailure, Math.ceil(c.drainTimeoutMs));
        active.abort(new EvidenceError(error.code, error.message));
      }
      function onAbort() {
        try { now(); } catch (error) { fail(fault(error), true); return; }
        fail(failure('EVIDENCE_ABORTED', 'Caller aborted the observation window'), true);
      }
      timer = setTimeout(() => {
        try { now(); } catch (error) { fail(fault(error), true); return; }
        fail(failure('EVIDENCE_TIMEOUT', 'Original observation deadline expired'), true);
      }, Math.max(1, Math.ceil(expires - start)));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) { adapterSettled = true; onAbort(); return; }
      // Attach both handlers even if the reader ignores abort. Late settlement
      // is consumed but cannot alter the returned report or invoke another read.
      Promise.resolve().then(() => {
        const n = check(); return invoke(expires - n, active.signal);
      }).then(raw => {
        adapterSettled = true;
        if (done) return;
        if (failed) { finishFailure(); return; }
        try {
          const value = structuredClone(raw), end = check(); validate(value, start, end);
          const finishedAtMs = check();
          done = true; dispose(); resolve({ state: 'ok', startedAtMs: start, finishedAtMs, value });
        } catch (error) { const e = fault(error); fail(e, terminal.has(e.code) || e.code === 'EVIDENCE_TIMEOUT' || e.code === 'EVIDENCE_ABORTED'); }
      }, error => {
        adapterSettled = true;
        if (done) return;
        const e = fault(error);
        if (failed) { adapterError = e; finishFailure(); return; }
        // The adapter can fail at/after the collector deadline before its timer.
        try { check(); }
        catch (clockOrAbort) { adapterError = e; fail(fault(clockOrAbort), true); return; }
        fail(e, terminal.has(e.code));
      });
    });
  }

  function discover(snapshot: ProcessCensus, phase: 'before' | 'after') {
    const rows = new Map(snapshot.processes.map(row => [row.pid, row]));
    const children = new Map<number, ProcessRecord[]>();
    for (const row of rows.values()) { const list = children.get(row.parentPid) ?? []; list.push(row); children.set(row.parentPid, list); }
    const additions = new Map<string, RememberedProcess>();
    const all = new Map(ledger);
    const identity = (row: ProcessRecord): Identity => ({ bootId: snapshot.bootId, pid: row.pid, startTicks: row.startTicks });
    function add(row: ProcessRecord, discoveredBy: Discovery) {
      check(); const id = identity(row), key = idKey(id);
      if (all.has(key)) return;
      if (all.size >= c.maxRememberedIdentities) {
        // Raw census remains in report; do not silently evict or reuse a partial ledger.
        c.memory.complete = false; throw new EvidenceError('EVIDENCE_LIMIT', 'Remembered identity capacity exceeded');
      }
      const entry = { identity: id, discoveredBy }; all.set(key, entry); additions.set(key, entry);
    }
    function strongClosure() {
      // A growing FIFO, each exact identity visited once; cycles cannot recurse.
      const queue = [...all.values()], seen = new Set<string>();
      for (let index = 0; index < queue.length; index++) {
        check(); const parent = queue[index]!.identity, key = idKey(parent);
        if (seen.has(key)) continue; seen.add(key);
        const actual = rows.get(parent.pid);
        if (!actual || actual.startTicks !== parent.startTicks) continue;
        for (const child of children.get(parent.pid) ?? []) {
          const key = idKey(identity(child));
          if (all.has(key)) continue;
          add(child, { kind: 'parent-link', windowId: c.windowId, phase, parent: { ...parent }, strength: 'observed-parent' });
          queue.push(all.get(key)!);
        }
      }
    }
    try {
      strongClosure();
      // Missing/reused parent numbers remain only hints. Growing iteration also
      // covers descendants of these candidates, with exact links where visible.
      const parents = [...all.values()];
      for (let i = 0; i < parents.length; i++) {
        check(); const parent = parents[i]!.identity;
        for (const child of children.get(parent.pid) ?? []) {
          const key = idKey(identity(child)); if (all.has(key)) continue;
          add(child, { kind: 'parent-link', windowId: c.windowId, phase, parent: { ...parent }, strength: 'numeric-parent-only' });
          strongClosure();
          for (const entry of all.values()) if (!parents.includes(entry)) parents.push(entry);
        }
      }
      for (const field of ['group', 'session'] as const) for (const registration of c.registration.processes) {
        for (const row of rows.values()) if (row[field] === registration[field]) {
          add(row, { kind: field === 'group' ? 'numeric-group' : 'numeric-session', windowId: c.windowId, phase,
            registration: { ...registration.identity }, value: registration[field] });
          strongClosure();
        }
      }
      // Prefer a later-found exact parent within this phase, but do not replace
      // earlier-window provenance or turn discovery provenance into a cycle.
      for (const entry of additions.values()) {
        check(); const row = rows.get(entry.identity.pid)!, parentRow = rows.get(row.parentPid);
        if (!parentRow) continue;
        const parent = identity(parentRow); if (!all.has(idKey(parent))) continue;
        let current: Identity | undefined = parent; const seen = new Set<string>(); let cyclic = false;
        while (current && !seen.has(idKey(current))) {
          if (same(current, entry.identity)) { cyclic = true; break; }
          seen.add(idKey(current)); const origin: Discovery | undefined = all.get(idKey(current))?.discoveredBy;
          current = origin?.kind === 'parent-link' ? origin.parent : undefined;
        }
        if (!cyclic) entry.discoveredBy = { kind: 'parent-link', windowId: c.windowId, phase, parent, strength: 'observed-parent' };
      }
    } catch (error) { c.memory.complete = false; stop(fault(error)); }
    // Preserve every discovery already made even when a subsequent phase fails.
    for (const [key, entry] of additions) { ledger.set(key, entry); c.memory.entries.push(entry); }
  }
  async function scan(phase: 'before' | 'after') {
    const observation = await observe((remaining, current) => io.census({ ...c.census,
      timeoutMs: Math.min(remaining, c.census.timeoutMs) }, current), (value, start, end) => {
      if (value.bootId !== c.registration.bootId) throw new EvidenceError('EVIDENCE_BOOT', 'Census boot differs from captured registration');
      if (value.kind !== 'linux-process-census' || value.scope !== 'visible-procfs' || !Array.isArray(value.processes)) {
        throw new EvidenceError('PROC_CENSUS_SCHEMA', 'Unexpected census envelope');
      }
      interval(value, start, end);
    });
    report.processes[phase] = observation;
    if (observation.state === 'ok') discover(observation.value, phase);
  }
  async function queues(phase: 'before' | 'after') {
    for (const [i, service] of c.registration.comfyServices.entries()) {
      report.queues[i]![phase] = await observe((remaining, current) => io.queue({ ...service.transport,
        owner: { ...service.transport.owner }, requestTimeoutMs: Math.min(remaining, service.transport.requestTimeoutMs) }, current), value => {
        const a = service.transport.owner, b = value.service;
        if (value.kind !== 'comfy-whole-queue' || !b || b.kind !== a.kind || b.pid !== a.pid || b.group !== a.group || b.start !== a.start || b.boot !== a.boot) {
          throw new EvidenceError('EVIDENCE_IDENTITY', 'Queue snapshot is not from the captured service');
        }
      });
    }
  }
  await scan('before'); await queues('before');
  report.gpu = await observe((remaining, current) => io.gpu({ ...c.gpu, expectedGpuUuids: [...c.gpu.expectedGpuUuids],
    timeoutMs: Math.min(remaining, c.gpu.timeoutMs) }, current), (value, start, end) => {
    if (value.kind !== 'nvidia-compute-process-snapshot') throw new EvidenceError('EVIDENCE_READER', 'Unexpected GPU snapshot envelope');
    interval(value, start, end);
  });
  await queues('after'); await scan('after');

  const censusRows = (o: Observation<ProcessCensus>) => o.state === 'ok' ? new Map(o.value.processes.map(row => [row.pid, row])) : null;
  const before = censusRows(report.processes.before), after = censusRows(report.processes.after);
  function presence(id: Identity, rows: Map<number, ProcessRecord> | null): Presence {
    if (!rows) return { state: 'unavailable' };
    const row = rows.get(id.pid);
    return row ? { state: row.startTicks === id.startTicks ? 'present' : 'pid-reused', record: { ...row } } : { state: 'not-observed' };
  }
  report.identities = c.memory.entries.map(({ identity }) => ({ identity: { ...identity }, before: presence(identity, before), after: presence(identity, after) }));
  const fromRow = (row: ProcessRecord | undefined): Identity | null => row ? { bootId: c.registration.bootId, pid: row.pid, startTicks: row.startTicks } : null;
  if (report.gpu.state === 'ok') report.gpuCorrelations = report.gpu.value.processes.map(row => {
    const a = fromRow(before?.get(row.pid)), b = fromRow(after?.get(row.pid));
    return { ...row, before: a, after: b,
      remembered: c.memory.entries.filter(entry => entry.identity.pid === row.pid).map(entry => ({ ...entry.identity })),
      correlation: a && b ? (same(a, b) ? 'same-identity' : 'pid-reused') : a || b ? 'one-sided' : 'unseen' };
  });
  for (const q of report.queues) if (q.before.state === 'ok' && q.after.state === 'ok') {
    q.changed = JSON.stringify([q.before.value.running, q.before.value.queued]) !== JSON.stringify([q.after.value.running, q.after.value.queued]);
  }
  const observations = [report.processes.before, report.processes.after, report.gpu, ...report.queues.flatMap(q => [q.before, q.after])];
  const allObserved = observations.every(o => o.state === 'ok');
  if (!report.stopReason) {
    try { report.observationFinishedAtMs = check(); } catch (error) { stop(fault(error)); }
  }
  // No awaited OR data-sized work after the final check. Classification cost
  // belongs to the original deadline too; do not take an unchecked timestamp.
  report.finishedAtMs = lastNow;
  report.collection = !report.stopReason && c.memory.complete && allObserved ? 'complete' : 'incomplete';
  return report;
}
