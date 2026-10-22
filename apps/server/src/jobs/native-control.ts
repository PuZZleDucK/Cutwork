import type { NativeOwner } from '../../../../packages/core/src/contracts/generation.ts';

export type ProcessOwner = Extract<NativeOwner, { kind: 'process' }>;
export type NativeTerminal = 'succeeded' | 'failed' | 'cancelled';

/** Normalised native evidence, not application/agent status. The adapter must
 * verify service identity and collect queue/history from that same service. */
export interface ComfyObservation {
  service: ProcessOwner | null;
  running: string[];
  queued: string[];
  terminal: Record<string, NativeTerminal>;
}

export interface ControlClock {
  /** Monotonic milliseconds (e.g. performance.now), shared by the whole call. */
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}

export interface CancelComfyInput extends ControlClock {
  promptId: string;
  owner: ProcessOwner;
  timeoutMs: number;
  observe: (signal: AbortSignal) => Promise<ComfyObservation>;
  /** Target the captured owned service; consume/validate the full response
   * within this promise. Aborting HTTP does NOT prove native cancellation. */
  post: (path: string, body: Record<string, never>, signal: AbortSignal) => Promise<{ cancelled: boolean }>;
}

export interface CancelComfyResult {
  state: 'native-stopped' | 'reconciling';
  /** Controller entry time, not an invented HTTP acceptance timestamp. */
  requestedAtMs: number;
  /** Time stop evidence was observed, not the native worker's exact exit time. */
  stoppedAtMs: number | null;
  alreadyTerminal: boolean;
  cancelAcknowledged: boolean | null;
  errors: string[];
}

export interface ReleaseObservation {
  ownerKnown: boolean;
  activeOwnedProcesses: number[];
  unresolvedOwnedProcesses: number[];
  gpuProcessIds: number[] | null; // null is unknown, never an empty GPU.
  registeredOwnedPids: number[];
  nativeQueueEmpty: boolean;
}

export interface HandoffGpuInput extends ControlClock {
  timeoutMs: number;
  observe: (signal: AbortSignal) => Promise<ReleaseObservation>;
  /** Caller must hold the shared GPU lease and block other registered submissions
   * throughout observation/dispatch. Reserve/record the next attempt before
   * launch, and resolve on launch acknowledgement, NOT generation completion.
   * A rejection/timeout may follow a launch: reconcile, never blindly retry. */
  dispatchNext: () => Promise<void>;
}

export interface HandoffGpuResult {
  state: 'dispatched' | 'reconciling';
  releasedAtMs: number | null;
  errors: string[];
}

const POLL_MS = 250;
const MAX_TIMER_MS = 2_147_483_647;

class DeadlineExpired extends Error {
  constructor(operation: string) {
    super(`${operation}: native-control deadline expired`);
    this.name = 'DeadlineExpired';
  }
}

/** One original deadline, including stalled I/O. Promise.race bounds waiting
 * even if an adapter ignores AbortSignal. It cannot preempt synchronous JS or
 * stop external work; late results are ignored, never used as stop evidence. */
class Deadline {
  readonly startedAt: number;
  private readonly expiresAt: number;
  private readonly clock: ControlClock;
  private lastNow: number;

  constructor(clock: ControlClock, timeoutMs: number) {
    this.clock = clock;
    this.startedAt = clock.now();
    this.lastNow = this.startedAt;
    this.expiresAt = this.startedAt + timeoutMs;
    if (!Number.isFinite(this.startedAt) || !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0 || timeoutMs > MAX_TIMER_MS ||
        !Number.isFinite(this.expiresAt) || this.expiresAt <= this.startedAt) {
      throw new RangeError('A finite monotonic clock and positive timer-sized timeout are required');
    }
  }

  remaining(): number {
    const now = this.clock.now();
    if (!Number.isFinite(now) || now < this.lastNow) throw new Error('Control clock must be finite and monotonic');
    this.lastNow = now;
    return this.expiresAt - now;
  }

  stamp(): number {
    if (this.remaining() <= 0) throw new DeadlineExpired('observation');
    return this.lastNow;
  }

  async run<T>(operation: string, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const remaining = this.remaining();
    if (remaining <= 0) throw new DeadlineExpired(operation);
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new DeadlineExpired(operation);
        reject(error);
        abort.abort(error);
      }, Math.ceil(remaining));
    });
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => {
          if (abort.signal.aborted || this.remaining() <= 0) throw new DeadlineExpired(operation);
          return action(abort.signal);
        }),
        timeout,
      ]);
      if (this.remaining() <= 0) throw new DeadlineExpired(operation);
      return value;
    } catch (error) {
      abort.abort(error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async pause(): Promise<void> {
    await this.run('poll wait', () => this.clock.wait(Math.min(POLL_MS, this.remaining())));
  }
}

function remember(errors: string[], context: string, error: unknown): void {
  const message = `${context}: ${error instanceof Error ? error.message : String(error)}`;
  if (!errors.includes(message)) errors.push(message);
}

async function pause(deadline: Deadline, errors: string[]): Promise<boolean> {
  try { await deadline.pause(); return true; }
  catch (error) { remember(errors, 'poll', error); return false; }
}

function validOwner(owner: ProcessOwner): boolean {
  return owner.kind === 'process' && Number.isSafeInteger(owner.pid) && owner.pid > 0 &&
    Number.isSafeInteger(owner.group) && owner.group > 0 && !!owner.start && !!owner.boot;
}

function sameOwner(expected: ProcessOwner, observed: ProcessOwner | null): boolean {
  return !!observed && observed.kind === 'process' && expected.pid === observed.pid &&
    expected.group === observed.group && expected.start === observed.start && expected.boot === observed.boot;
}

function jobPhase(observation: ComfyObservation, promptId: string): 'running' | 'queued' | 'terminal' | 'missing' | 'conflicting' {
  const running = observation.running.includes(promptId);
  const queued = observation.queued.includes(promptId);
  const terminal = Object.hasOwn(observation.terminal, promptId) &&
    ['succeeded', 'failed', 'cancelled'].includes(observation.terminal[promptId]!);
  if (Number(running) + Number(queued) + Number(terminal) > 1) return 'conflicting';
  return running ? 'running' : queued ? 'queued' : terminal ? 'terminal' : 'missing';
}

/** Issue at most one targeted cancellation, then observe the captured job.
 * No global interrupt, process kill, resource-release claim, or app-state commit.
 * The caller must prevent further submissions for the cancelled attempt. */
export async function cancelComfyJob(input: CancelComfyInput): Promise<CancelComfyResult> {
  // Capture identity/callbacks before awaiting; changing a form/config must not
  // retarget an in-flight operation. Native transport must pin the service too.
  const { promptId, observe, post, now, wait, timeoutMs } = input;
  const owner = { ...input.owner };
  if (!promptId.trim() || !validOwner(owner)) throw new Error('Captured prompt and full process identity are required');
  const path = `/api/jobs/${encodeURIComponent(promptId)}/cancel`;
  const deadline = new Deadline({ now, wait }, timeoutMs);
  const result: CancelComfyResult = {
    state: 'reconciling', requestedAtMs: deadline.startedAt, stoppedAtMs: null,
    alreadyTerminal: false, cancelAcknowledged: null, errors: [],
  };
  let posted = false;
  let sawRunning = false;

  do {
    let observation: ComfyObservation;
    try { observation = await deadline.run('observe Comfy', observe); }
    catch (error) {
      remember(result.errors, 'observe Comfy', error);
      if (error instanceof DeadlineExpired) return result;
      continue;
    }
    if (!sameOwner(owner, observation.service)) {
      result.errors.push('Comfy service identity is missing or changed');
      return result;
    }
    const phase = jobPhase(observation, promptId);
    if (phase === 'conflicting' || (!posted && phase === 'missing')) {
      result.errors.push(`Captured Comfy job state is ${phase}`);
      return result;
    }
    if (phase === 'running') sawRunning = true;
    // Queued removal need not produce history. Running work needs terminal
    // evidence: a disappearance from one observation alone is not sufficient.
    if (phase === 'terminal' || (posted && !sawRunning && phase === 'missing' && result.cancelAcknowledged === true)) {
      try { result.stoppedAtMs = deadline.stamp(); }
      catch (error) { remember(result.errors, 'stop observation', error); return result; }
      result.state = 'native-stopped';
      result.alreadyTerminal = !posted;
      return result;
    }
    if (!posted) {
      posted = true; // Even an ambiguous transport failure must not resend.
      try {
        const acknowledgement = await deadline.run('cancel Comfy', signal => post(path, {}, signal));
        if (typeof acknowledgement.cancelled !== 'boolean') throw new Error('Invalid Comfy cancellation acknowledgement');
        result.cancelAcknowledged = acknowledgement.cancelled;
      } catch (error) {
        remember(result.errors, 'cancel Comfy', error);
        if (error instanceof DeadlineExpired) return result;
      }
    }
  } while (await pause(deadline, result.errors));
  return result;
}

/** Ordering inside one caller-held GPU lease, not a lock or scheduler itself.
 * Observers must account for all registered descendants, native queues and GPU
 * allocations. Unregistered agent work is outside this proof boundary. */
export async function handoffGpu(input: HandoffGpuInput): Promise<HandoffGpuResult> {
  const { now, wait, timeoutMs, observe, dispatchNext } = input;
  const deadline = new Deadline({ now, wait }, timeoutMs);
  const result: HandoffGpuResult = { state: 'reconciling', releasedAtMs: null, errors: [] };
  const ownedPids = new Set<number>();
  do {
    let observation: ReleaseObservation;
    try { observation = await deadline.run('observe release', observe); }
    catch (error) {
      remember(result.errors, 'observe release', error);
      if (error instanceof DeadlineExpired) return result;
      continue;
    }
    // A child can exit before its allocation vanishes. Remember every PID ever
    // identified as owned (or unresolved-owned), not just explicit registrations.
    // Do not reclassify lingering allocation as unrelated on the next snapshot.
    for (const pid of [
      ...observation.registeredOwnedPids,
      ...observation.activeOwnedProcesses,
      ...observation.unresolvedOwnedProcesses,
    ]) ownedPids.add(pid);
    if (observation.ownerKnown && observation.activeOwnedProcesses.length === 0 &&
        observation.unresolvedOwnedProcesses.length === 0 && observation.nativeQueueEmpty &&
        observation.gpuProcessIds !== null && !observation.gpuProcessIds.some(pid => ownedPids.has(pid))) {
      try { result.releasedAtMs = deadline.stamp(); }
      catch (error) { remember(result.errors, 'release observation', error); return result; }
      // A launch may already have happened before a rejection or timeout.
      // Propagate it for reconciliation; do not hide it or attempt dispatch twice.
      await deadline.run('dispatch next', () => dispatchNext());
      result.state = 'dispatched';
      return result;
    }
  } while (await pause(deadline, result.errors));
  return result;
}
