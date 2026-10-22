import { isDeepStrictEqual as equal } from 'node:util';
import type { ProcessOwner } from './native-control.ts';
import type { ProcessCensus, ProcessRecord } from './linux-process-census.ts';
import type { Registration, ProcessMemory, RegisteredWorkEvidence, Identity,
  Discovery, Presence, GpuCorrelation, Observation, RememberedProcess } from './registered-work-evidence.ts';

/** Trusted owned-child exit event, recorded before the bound observation window.
 * Not a signal-sent receipt, a PID lookup, or user/agent supplied evidence.
 * All times belong to the same in-memory monotonic-clock lifetime. */
export interface NativeExitReceipt {
  receiptId: string;
  attemptId: string;
  registrationId: string;
  beforeWindowId: string;
  owner: ProcessOwner;
  observedAtMs: number;
  exitCode: number | null;
  signalCode: string | null;
}
export interface AssessmentInput {
  expectedRegistration: Registration;
  priorMemory: ProcessMemory;
  evidence: RegisteredWorkEvidence;
  exits: NativeExitReceipt[];
}
export interface Finding {
  kind: 'registered-process-observed' | 'associated-process-observed' | 'queue-work-observed' | 'gpu-pid-match';
  identity?: Identity;
  registrationId?: string;
  phase?: 'before' | 'after';
  gpuRowIndex?: number;
}
export interface Unresolved {
  code: 'report-binding-mismatch' | 'memory-incomplete' | 'history-lost' | 'collection-stopped' |
    'unresolved-launch' | 'census-unavailable' | 'gpu-unavailable' | 'reader-pending' |
    'query-cleanup-unresolved' | 'process-pid-reused' | 'candidate-association' |
    'gpu-correlation-uncertain' | 'historical-gpu-pid' | 'service-exit-unverified' |
    'exit-evidence-conflict' | 'report-inconsistent';
  phase?: 'before' | 'after';
  registrationId?: string;
  identity?: Identity;
  gpuRowIndex?: number;
  receiptId?: string;
}
export interface WorkAssessment {
  kind: 'registered-work-assessment';
  scope: 'captured-registration-only';
  windowId: string;
  attemptId: string;
  registrationRevision: number;
  startedAtMs: number;
  finishedAtMs: number;
  state: 'activity-observed' | 'indeterminate' | 'no-matching-activity-observed';
  findings: Finding[];
  unresolved: Unresolved[];
  processes: Array<{ identity: Identity; discoveredBy: Discovery; before: Presence; after: Presence }>;
  gpuRows: GpuCorrelation[];
  retiredServices: Array<{ registrationId: string; identity: Identity; receiptId: string;
    queue: 'unavailable-after-confirmed-exit' }>;
  limitations: string[];
}

const phases = ['before', 'after'] as const;
const key = (id: Identity) => `${id.bootId}:${id.pid}:${id.startTicks}`;
const identityOf = (bootId: string, row: ProcessRecord): Identity => ({ bootId, pid: row.pid, startTicks: row.startTicks });
function presence(id: Identity, census: Observation<ProcessCensus>): Presence {
  if (census.state !== 'ok' || census.value.bootId !== id.bootId) return { state: 'unavailable' };
  const row = census.value.processes.find(row => row.pid === id.pid);
  return row ? { state: row.startTicks === id.startTicks ? 'present' : 'pid-reused', record: row }
    : { state: 'not-observed' };
}
function settledFailure(o: Observation<unknown>): boolean {
  return o.state === 'failed' && o.settlement === 'settled' &&
    o.error.cleanupConfirmed !== false && o.adapterError?.cleanupConfirmed !== false;
}
function terminalReceipt(r: NativeExitReceipt): boolean {
  return (Number.isSafeInteger(r.exitCode) && r.exitCode! >= 0 && r.signalCode === null) ||
    (r.exitCode === null && typeof r.signalCode === 'string' && /^SIG[A-Z0-9]+$/.test(r.signalCode));
}

/** Descriptive reconciliation of a trusted, in-memory collector report. No I/O,
 * clock reads, ownership promotion, stop/unload, lease or dispatch. Rechecking
 * derived rows prevents accidental evidence loss; it does not authenticate
 * arbitrary JSON or make a historical window fresh enough to release a GPU. */
export function assessRegisteredWork(input: AssessmentInput): WorkAssessment {
  const { expectedRegistration: registration, priorMemory, evidence: e, exits } = input;
  const result: WorkAssessment = { kind: 'registered-work-assessment', scope: 'captured-registration-only',
    windowId: e.windowId, attemptId: registration.attemptId, registrationRevision: registration.revision,
    startedAtMs: e.startedAtMs, finishedAtMs: e.finishedAtMs, state: 'indeterminate',
    findings: [], unresolved: [], processes: [], gpuRows: [], retiredServices: [],
    limitations: [...new Set([...e.limitations, 'not-dispatch-authorization'])] };
  const unknown = (code: Unresolved['code'], refs: Omit<Unresolved, 'code'> = {}) => {
    const item = { code, ...refs };
    if (!result.unresolved.some(existing => equal(existing, item))) result.unresolved.push(item);
  };
  const finish = () => structuredClone(result);
  // Do not attach a foreign report's positive findings to the expected attempt.
  if (!equal(registration, e.registration) || [priorMemory, e.memory].some(m =>
    m.attemptId !== registration.attemptId || m.bootId !== registration.bootId)) {
    unknown('report-binding-mismatch'); return finish();
  }

  if (![e.startedAtMs, e.observationFinishedAtMs, e.finishedAtMs].every(Number.isFinite) ||
      e.startedAtMs < 0 || e.observationFinishedAtMs < e.startedAtMs || e.finishedAtMs < e.observationFinishedAtMs) {
    unknown('report-inconsistent');
  }
  if (!priorMemory.complete || !e.memory.complete) unknown('memory-incomplete');
  if (e.stopReason) unknown('collection-stopped');
  if (registration.unresolvedLaunchIds.length) unknown('unresolved-launch');

  function inspect(o: Observation<unknown>, refs: Omit<Unresolved, 'code'> = {}) {
    if (o.state === 'not-started') return;
    if (!Number.isFinite(o.startedAtMs) || !Number.isFinite(o.finishedAtMs) ||
        o.startedAtMs < e.startedAtMs || o.finishedAtMs < o.startedAtMs || o.finishedAtMs > e.finishedAtMs) {
      unknown('report-inconsistent', refs);
    }
    if (o.state === 'failed') {
      if (o.settlement === 'pending') unknown('reader-pending', refs);
      if (o.error.cleanupConfirmed === false || o.adapterError?.cleanupConfirmed === false) {
        unknown('query-cleanup-unresolved', refs);
      }
    }
  }
  for (const phase of phases) {
    const o = e.processes[phase]; inspect(o, { phase });
    if (o.state !== 'ok') unknown('census-unavailable', { phase });
    else if (o.value.bootId !== registration.bootId ||
      new Set(o.value.processes.map(p => p.pid)).size !== o.value.processes.length) unknown('report-inconsistent', { phase });
  }
  inspect(e.gpu);
  if (e.gpu.state !== 'ok') unknown('gpu-unavailable');

  // Union the historical, registered and observed identities; a dropped entry
  // must not erase a surviving child or historical GPU PID from the explanation.
  const ledger = new Map<string, RememberedProcess>();
  for (const entry of priorMemory.entries) {
    ledger.set(key(entry.identity), entry);
    const retained = e.memory.entries.find(row => key(row.identity) === key(entry.identity));
    if (!retained || !equal(retained.discoveredBy, entry.discoveredBy)) unknown('history-lost', { identity: entry.identity });
  }
  for (const p of registration.processes) if (!ledger.has(key(p.identity))) {
    ledger.set(key(p.identity), { identity: p.identity, discoveredBy: {
      kind: 'registration', registrationId: p.registrationId, revision: registration.revision } });
  }
  for (const entry of e.memory.entries) if (!ledger.has(key(entry.identity))) ledger.set(key(entry.identity), entry);
  if (ledger.size !== e.memory.entries.length || ledger.size !== e.identities.length ||
      new Set(e.memory.entries.map(p => key(p.identity))).size !== e.memory.entries.length ||
      new Set(e.identities.map(p => key(p.identity))).size !== e.identities.length) unknown('report-inconsistent');
  for (const entry of ledger.values()) {
    const observed = e.identities.find(p => key(p.identity) === key(entry.identity));
    const row = { ...entry, before: presence(entry.identity, e.processes.before), after: presence(entry.identity, e.processes.after) };
    if (!observed || !equal(observed.before, row.before) || !equal(observed.after, row.after)) {
      unknown('report-inconsistent', { identity: entry.identity });
    }
    result.processes.push(row);
    const registered = registration.processes.find(p => key(p.identity) === key(entry.identity));
    for (const phase of phases) {
      if (row[phase].state === 'pid-reused') unknown('process-pid-reused', { identity: row.identity, phase });
      if (row[phase].state !== 'present') continue;
      result.findings.push({ kind: registered ? 'registered-process-observed' : 'associated-process-observed',
        identity: row.identity, phase, ...(registered ? { registrationId: registered.registrationId } : {}) });
      if (!registered) unknown('candidate-association', { identity: row.identity, phase });
    }
  }

  // Correlate all raw GPU rows with all retained identities, including an old
  // identity whose numeric PID now names a different process in both censuses.
  const gpuIdentity = (pid: number, phase: 'before' | 'after'): Identity | null => {
    const o = e.processes[phase];
    if (o.state !== 'ok' || o.value.bootId !== registration.bootId) return null;
    const row = o.value.processes.find(p => p.pid === pid);
    return row ? identityOf(o.value.bootId, row) : null;
  };
  if (e.gpu.state === 'ok') {
    result.gpuRows = e.gpu.value.processes.map(({ gpuUuid, pid }) => {
      const before = gpuIdentity(pid, 'before'), after = gpuIdentity(pid, 'after');
      return { gpuUuid, pid, before, after,
        remembered: [...ledger.values()].filter(p => p.identity.pid === pid).map(p => p.identity),
        correlation: before && after ? (equal(before, after) ? 'same-identity' : 'pid-reused')
          : before || after ? 'one-sided' : 'unseen' };
    });
  }
  if (!equal(result.gpuRows, e.gpuCorrelations)) unknown('report-inconsistent');
  for (const [gpuRowIndex, row] of result.gpuRows.entries()) {
    if (row.correlation !== 'same-identity') unknown('gpu-correlation-uncertain', { gpuRowIndex });
    for (const id of row.remembered) {
      result.findings.push({ kind: 'gpu-pid-match', gpuRowIndex, identity: id });
      if (!equal(id, row.before) || !equal(id, row.after)) unknown('historical-gpu-pid', { gpuRowIndex, identity: id });
    }
  }

  const serviceIds = new Set(registration.comfyServices.map(s => s.registrationId));
  if (e.queues.length !== serviceIds.size || e.queues.some(q => !serviceIds.has(q.registrationId))) unknown('report-inconsistent');
  for (const service of registration.comfyServices) {
    const { registrationId, transport } = service;
    const queues = e.queues.filter(q => q.registrationId === registrationId);
    const p = registration.processes.find(p => p.registrationId === registrationId);
    if (queues.length !== 1 || !p) { unknown('report-inconsistent', { registrationId }); continue; }
    const q = queues[0]!, row = result.processes.find(row => key(row.identity) === key(p.identity))!;
    for (const phase of phases) {
      const o = q[phase]; inspect(o, { registrationId, phase });
      if (o.state !== 'ok') continue;
      if (!equal(o.value.service, transport.owner)) { unknown('report-inconsistent', { registrationId, phase }); continue; }
      if (o.value.running.length || o.value.queued.length) result.findings.push({ kind: 'queue-work-observed', registrationId, phase });
    }
    const receipt = exits.find(r => r.receiptId.length > 0 && r.registrationId === registrationId &&
      r.attemptId === registration.attemptId && r.beforeWindowId === e.windowId && equal(r.owner, transport.owner) &&
      Number.isFinite(r.observedAtMs) && r.observedAtMs >= 0 && r.observedAtMs <= e.startedAtMs && terminalReceipt(r));
    const absent = phases.every(phase => row[phase].state === 'not-observed');
    // Queue reads and censuses are sequential, not atomic: a live service can
    // answer a queue read then exit before the closing census. Do not turn that
    // ordinary transition into a contradictory report. Absence in BOTH brackets
    // plus successful owned transport remains unresolved, even without a receipt.
    if (absent && phases.some(phase => q[phase].state === 'ok')) unknown('report-inconsistent', { registrationId });
    const live = phases.some(phase => row[phase].state === 'present' || q[phase].state === 'ok');
    if (receipt && live) unknown('exit-evidence-conflict', { registrationId, receiptId: receipt.receiptId });
    const failedAndSettled = phases.every(phase => settledFailure(q[phase]));
    if (receipt && absent && failedAndSettled) {
      result.retiredServices.push({ registrationId, identity: p.identity, receiptId: receipt.receiptId,
        queue: 'unavailable-after-confirmed-exit' });
    } else if (!phases.every(phase => q[phase].state === 'ok')) {
      unknown('service-exit-unverified', { registrationId });
    }
  }
  // Decide only after inspecting every service, so ordering cannot hide a
  // later contradiction. Retain positive findings and all raw input evidence.
  if (result.unresolved.some(u => u.code === 'report-inconsistent')) result.retiredServices = [];
  result.state = result.findings.length ? 'activity-observed' : result.unresolved.length ? 'indeterminate' : 'no-matching-activity-observed';
  return finish();
}
