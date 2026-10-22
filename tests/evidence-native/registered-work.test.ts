/** Draft assessment extension of the accepted native composition; not release proof.
 * Listing runs no hooks. After separate run approval, use an audited Dundee snapshot and
 * finite outer user service; personal Comfy is never the HTTP/signal target. */
import { beforeAll, afterEach, expect, test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { observeProcess } from '../../apps/server/src/providers/run.ts';
import { createOwnedComfyTransport } from '../../apps/server/src/jobs/comfy-http.ts';
import { loadCpuFixture, type CpuFixture, type CpuFixtureModule } from '../support/comfy-cpu-contract.ts';
import { createCpuRunGuard } from '../support/comfy-cpu-guards.ts';
import * as module from '../../apps/server/src/jobs/registered-work-evidence.ts';
import { type EvidenceConfig,
  type Observation, type RegisteredWorkEvidence } from '../../apps/server/src/jobs/registered-work-evidence.ts';
import { assessRegisteredWork, type AssessmentInput, type NativeExitReceipt } from '../../apps/server/src/jobs/registered-work-assessment.ts';

let factory: CpuFixtureModule, runtime: string, gpuUuids: string[];
const scenarioGuard = createCpuRunGuard(); // No signal handlers until the test attaches.
let active: { abort: AbortController; launch: Promise<CpuFixture>; detach: () => void } | undefined;
beforeAll(async () => {
  if (process.env.STUDIO_ASSESSMENT_EVIDENCE !== '1') throw new Error('Requires separate approval and STUDIO_ASSESSMENT_EVIDENCE=1');
  if (process.env.STUDIO_COMPOSED_EVIDENCE !== '1') throw new Error('Requires explicit STUDIO_COMPOSED_EVIDENCE=1');
  gpuUuids = (process.env.STUDIO_GPU_UUIDS ?? '').split(',');
  if (!gpuUuids.length || gpuUuids.some(id => !/^GPU-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))) {
    throw new Error('STUDIO_GPU_UUIDS must contain the independently verified native GPU inventory');
  }
  const loaded = await loadCpuFixture(); factory = loaded.module; runtime = loaded.runtime;
});
afterEach(async () => {
  const closing = active; active = undefined;
  if (!closing) return;
  closing.abort.abort(new Error('Native evidence scenario ended'));
  try {
    const session = await closing.launch;
    const result = await session.close();
    expect(result).toMatchObject({ ownedServiceExited: true, identityResolved: true });
  } finally { closing.detach(); }
});
function value<T>(observation: Observation<T>): T {
  expect(observation.state).toBe('ok');
  if (observation.state !== 'ok') throw new Error('Expected complete native evidence');
  return observation.value;
}
function checkGpuRows(result: RegisteredWorkEvidence) {
  const snapshot = value(result.gpu);
  expect(snapshot.queries).toHaveLength(3);
  const query = snapshot.queries[1]!;
  expect(query.argv).toEqual(['--query-compute-apps=gpu_uuid,pid', '--format=csv,noheader,nounits']);
  expect(query.exitCode).toBe(0); expect(query.signal).toBeNull(); expect(query.stderr).toBe('');
  // Independent projection of retained native stdout, not the product decoder.
  const raw = query.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [gpuUuid, pid] = line.split(',').map(field => field.trim());
    return { gpuUuid, pid: Number(pid) };
  }).sort((a, b) => a.gpuUuid! < b.gpuUuid! ? -1 : a.gpuUuid! > b.gpuUuid! ? 1 : a.pid - b.pid);
  expect(snapshot.processes).toEqual(raw);
  expect(result.gpuCorrelations.map(({ gpuUuid, pid }) => ({ gpuUuid, pid }))).toEqual(raw);
  expect(result.limitations).toContain('pid-attribution-unverified');
}

/** The fixture writes actual ChildProcess exitCode/signalCode before close()
 * resolves. Read that evidence, not only its two cleanup booleans. The timestamp
 * is when THIS worker observed the completed receipt, not the exact exit time. */
async function recordedExit(session: CpuFixture, config: EvidenceConfig, signal: AbortSignal): Promise<NativeExitReceipt> {
  signal.throwIfAborted();
  const bytes = await readFile(join(session.directory, 'service-receipt.json'), { signal });
  const raw: { state: unknown; owner: unknown; command: unknown; sourceRevision: unknown;
    cleanup: { ownedServiceExited: unknown; identityResolved: unknown; exitCode: unknown; signalCode: unknown } } = JSON.parse(bytes.toString());
  expect(raw.state).toBe('service-exited'); expect(raw.owner).toEqual(session.config.owner);
  expect(raw.command).toEqual(session.command); expect(raw.sourceRevision).toBe(session.sourceRevision);
  expect(raw.cleanup).toMatchObject({ ownedServiceExited: true, identityResolved: true });
  const { exitCode, signalCode } = raw.cleanup;
  let outcome: Pick<NativeExitReceipt, 'exitCode' | 'signalCode'>;
  if (typeof exitCode === 'number' && Number.isSafeInteger(exitCode) && exitCode >= 0 && signalCode === null) {
    outcome = { exitCode, signalCode };
  } else if (exitCode === null && typeof signalCode === 'string' && /^SIG[A-Z0-9]+$/.test(signalCode)) {
    outcome = { exitCode, signalCode };
  } else throw new Error('Owned fixture receipt has no unambiguous actual child exit outcome');
  signal.throwIfAborted();
  const receipt: NativeExitReceipt = { receiptId: randomUUID(), attemptId: config.registration.attemptId,
    registrationId: 'owned-cpu-service', beforeWindowId: config.windowId,
    owner: { ...session.config.owner }, observedAtMs: performance.now(), ...outcome };
  await writeFile(join(session.directory, 'assessment-exit-receipt.json'), JSON.stringify({
    sourceFile: 'service-receipt.json', sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    source: raw, observation: 'After awaited close and verified file read in this worker monotonic-clock lifetime', receipt,
  }, null, 2), { flag: 'wx', mode: 0o600 });
  return receipt;
}

async function recordAssessment(session: CpuFixture, name: string, input: AssessmentInput) {
  const original = JSON.stringify(input);
  const assessment = assessRegisteredWork(input);
  await writeFile(join(session.directory, name), JSON.stringify({ input, assessment }, null, 2), { flag: 'wx', mode: 0o600 });
  expect(JSON.stringify(input)).toBe(original);
  expect(assessment).toMatchObject({ kind: 'registered-work-assessment', scope: 'captured-registration-only',
    windowId: input.evidence.windowId, attemptId: input.expectedRegistration.attemptId,
    registrationRevision: input.expectedRegistration.revision,
    startedAtMs: input.evidence.startedAtMs, finishedAtMs: input.evidence.finishedAtMs });
  expect(assessment.limitations).toEqual(expect.arrayContaining([...input.evidence.limitations, 'not-dispatch-authorization']));
  expect(assessment.gpuRows).toEqual(input.evidence.gpuCorrelations); // All native rows, not just matching ones.
  for (const field of ['ownerKnown', 'nativeQueueEmpty', 'gpuClear', 'resourcesReleased', 'maySubmit', 'dispatchNext']) {
    expect(assessment).not.toHaveProperty(field);
  }
  return assessment;
}

test('native live-service, confirmed-exit and withheld-receipt assessments preserve evidence without authorizing handoff', async () => {
  const abort = new AbortController();
  // This guard spans BOTH windows; deliberate fixture close aborts session.signal,
  // but parent SIGINT/SIGTERM must also stop the later post-exit census/GPU work.
  const scenarioSignal = scenarioGuard.signalFor(abort.signal);
  const detach = scenarioGuard.attach(() => abort.abort(new Error('Native evidence parent terminated')));
  const lifecycle = { abort, detach, launch: Promise.resolve().then(() => {
    scenarioSignal.throwIfAborted(); return factory.createCpuFixture({ runtime, signal: scenarioSignal });
  }) };
  active = lifecycle;
  const session = await lifecycle.launch;
  const liveSignal = AbortSignal.any([scenarioSignal, session.signal]);
  liveSignal.throwIfAborted();
  const owner = session.config.owner;
  expect(session.config.port).not.toBe(8188);
  expect(session.command).toContain('--cpu');
  const stat = await readFile(`/proc/${owner.pid}/stat`, { encoding: 'utf8', signal: liveSignal });
  const fields = stat.slice(stat.lastIndexOf(') ') + 2).trim().split(/ +/);
  expect(fields[19]).toBe(owner.start); expect(Number(fields[2])).toBe(owner.group);
  const sessionId = Number(fields[3]); expect(Number.isSafeInteger(sessionId) && sessionId > 0).toBe(true);
  liveSignal.throwIfAborted(); expect(await observeProcess(owner.pid)).toEqual(owner);
  const id = { bootId: owner.boot, pid: owner.pid, startTicks: owner.start };
  const config: EvidenceConfig = {
    windowId: randomUUID(), timeoutMs: 10_000, drainTimeoutMs: 2000, maxRememberedIdentities: 4096,
    registration: { attemptId: randomUUID(), revision: 1, bootId: owner.boot,
      processes: [{ registrationId: 'owned-cpu-service', identity: id, group: owner.group, session: sessionId }],
      comfyServices: [{ registrationId: 'owned-cpu-service', transport: session.config }], unresolvedLaunchIds: [] },
    memory: { attemptId: '', bootId: owner.boot, complete: true, entries: [] },
    census: { expectedBootId: owner.boot, timeoutMs: 3000, maxDirectoryEntries: 32768, maxFileBytes: 65536 },
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: gpuUuids, timeoutMs: 3000,
      cleanupTimeoutMs: 1000, maxOutputBytes: 1024 * 1024 },
  };
  config.memory.attemptId = config.registration.attemptId;
  const http = createOwnedComfyTransport(session.config);
  async function rawEmptyQueue() {
    liveSignal.throwIfAborted();
    const result = await http.request({ method: 'GET', path: '/queue' }, liveSignal, (status, body) => ({ status, body }));
    expect(result).toEqual({ status: 200, body: { queue_running: [], queue_pending: [] } });
    return result;
  }
  const rawBefore = await rawEmptyQueue();
  const liveRegistration = structuredClone(config.registration), livePriorMemory = structuredClone(config.memory);
  // Deliberately no injected reader I/O: exact application-to-native composition.
  const live = await module.collectRegisteredWorkEvidence(config, liveSignal);
  await writeFile(join(session.directory, 'composed-live.json'), JSON.stringify({ config, rawBefore, evidence: live }, null, 2), { flag: 'wx', mode: 0o600 });
  const rawAfter = await rawEmptyQueue();
  await writeFile(join(session.directory, 'composed-raw-after.json'), JSON.stringify(rawAfter, null, 2), { flag: 'wx', mode: 0o600 });
  expect(live.collection).toBe('complete');
  for (const phase of ['before', 'after'] as const) {
    expect(value(live.processes[phase]).processes).toContainEqual(expect.objectContaining({ pid: id.pid, startTicks: id.startTicks }));
    expect(value(live.queues[0]![phase])).toEqual({ kind: 'comfy-whole-queue', service: owner, running: [], queued: [] });
    expect(live.identities.find(row => row.identity.pid === owner.pid)?.[phase].state).toBe('present');
  }
  expect(live.queues[0]!.changed).toBe(false); checkGpuRows(live);
  const liveAssessment = await recordAssessment(session, 'assessment-live.json', {
    expectedRegistration: liveRegistration, priorMemory: livePriorMemory, evidence: live, exits: [],
  });
  expect(liveAssessment.state).toBe('activity-observed'); expect(liveAssessment.retiredServices).toEqual([]);
  for (const phase of ['before', 'after'] as const) {
    expect(liveAssessment.findings).toContainEqual({ kind: 'registered-process-observed',
      identity: id, registrationId: 'owned-cpu-service', phase });
  }
  liveSignal.throwIfAborted(); expect(await observeProcess(owner.pid)).toEqual(owner); // Empty queue did not mean exit.

  const cleanup = await session.close(); // Separate existing identity-checked fixture teardown, NOT collector action.
  expect(cleanup).toMatchObject({ ownedServiceExited: true, identityResolved: true });
  config.windowId = randomUUID(); config.memory = live.memory;
  const exitReceipt = await recordedExit(session, config, scenarioSignal);
  const goneRegistration = structuredClone(config.registration), gonePriorMemory = structuredClone(config.memory);
  scenarioSignal.throwIfAborted();
  const gone = await module.collectRegisteredWorkEvidence(config, scenarioSignal);
  await writeFile(join(session.directory, 'composed-after-exit.json'), JSON.stringify({ config, cleanup, evidence: gone }, null, 2), { flag: 'wx', mode: 0o600 });
  expect(gone.collection).toBe('incomplete');
  for (const phase of ['before', 'after'] as const) {
    value(gone.processes[phase]);
    const presence = gone.identities.find(row => row.identity.pid === owner.pid && row.identity.startTicks === owner.start)?.[phase];
    expect(['not-observed', 'pid-reused']).toContain(presence?.state);
    expect(gone.queues[0]![phase].state).toBe('failed');
  }
  expect(gone.queues[0]!.changed).toBeNull(); checkGpuRows(gone);
  expect(Object.hasOwn(gone, 'resourcesReleased')).toBe(false);
  expect(exitReceipt.observedAtMs).toBeLessThanOrEqual(gone.startedAtMs);
  const goneInput: AssessmentInput = { expectedRegistration: goneRegistration, priorMemory: gonePriorMemory,
    evidence: gone, exits: [exitReceipt] };
  // Persist all three assessment reports before checking the nominal post-exit
  // outcome, so an inconclusive run keeps its negative-control evidence too.
  const goneAssessment = await recordAssessment(session, 'assessment-after-exit.json', goneInput);
  const withoutReceipt = await recordAssessment(session, 'assessment-after-exit-no-receipt.json', { ...goneInput, exits: [] });
  expect(goneAssessment.state).toBe('no-matching-activity-observed');
  expect(goneAssessment.findings).toEqual([]); expect(goneAssessment.unresolved).toEqual([]);
  expect(goneAssessment.retiredServices).toEqual([{ registrationId: 'owned-cpu-service', identity: id,
    receiptId: exitReceipt.receiptId, queue: 'unavailable-after-confirmed-exit' }]);
  expect(withoutReceipt.state).toBe('indeterminate'); expect(withoutReceipt.retiredServices).toEqual([]);
  expect(withoutReceipt.unresolved).toContainEqual({ code: 'service-exit-unverified', registrationId: 'owned-cpu-service' });
  for (const phase of ['before', 'after'] as const) expect(gone.queues[0]![phase].state).toBe('failed');
});
