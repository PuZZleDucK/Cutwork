/** Reviewed control assertions with injected I/O; not native tool/GPU proof. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NativeOwner } from '../../packages/core/src/contracts/generation.ts';
import { cancelComfyJob, handoffGpu } from '../../apps/server/src/jobs/native-control.ts';

type Owner = Extract<NativeOwner, { kind: 'process' }>;
type Terminal = 'succeeded' | 'failed' | 'cancelled';
interface ComfyObservation {
  service: Owner | null;
  running: string[];
  queued: string[];
  terminal: Record<string, Terminal>;
}
interface Clock {
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}
interface CancelInput extends Clock {
  promptId: string;
  owner: Owner;
  timeoutMs: number;
  observe: (signal: AbortSignal) => Promise<ComfyObservation>;
  post: (path: string, body: Record<string, never>, signal: AbortSignal) => Promise<{ cancelled: boolean }>;
}
interface CancelResult {
  state: 'native-stopped' | 'reconciling';
  requestedAtMs: number;
  stoppedAtMs: number | null;
  alreadyTerminal: boolean;
  cancelAcknowledged: boolean | null;
  errors: string[];
}
interface ReleaseObservation {
  ownerKnown: boolean;
  activeOwnedProcesses: number[];
  unresolvedOwnedProcesses: number[];
  gpuProcessIds: number[] | null; // null = observation failed, not an empty GPU.
  registeredOwnedPids: number[];
  nativeQueueEmpty: boolean;
}
interface HandoffInput extends Clock {
  // Caller holds the shared GPU lease and prevents additional registered
  // submissions throughout observation and dispatch. This is not a lease test.
  timeoutMs: number;
  observe: (signal: AbortSignal) => Promise<ReleaseObservation>;
  dispatchNext: () => Promise<void>;
}
interface Controller {
  cancelComfyJob(input: CancelInput): Promise<CancelResult>;
  handoffGpu(input: HandoffInput): Promise<{
    state: 'dispatched' | 'reconciling'; releasedAtMs: number | null; errors: string[];
  }>;
}

// Static assignment checks production signatures against the reviewed test
// contract without a type assertion concealing an incompatible implementation.
const controller: Controller = { cancelComfyJob, handoffGpu };
afterEach(() => { vi.useRealTimers(); });

const prompt = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const owner: Owner = { kind: 'process', pid: 1234, group: 1234, start: '45678', boot: 'fixture-boot' };
const snapshot = (changes: Partial<ComfyObservation> = {}): ComfyObservation => ({
  service: structuredClone(owner), running: [prompt], queued: [], terminal: {}, ...changes,
});

describe('Native-control implementation regressions within the approved evidence boundaries', () => {
  test('loads directly in the project Node runtime without Vitest TypeScript transforms', async () => {
    const url = new URL('../../apps/server/src/jobs/native-control.ts', import.meta.url).href;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
      `const m = await import(${JSON.stringify(url)}); console.log(typeof m.cancelComfyJob, typeof m.handoffGpu);`,
    ], { timeout: 5000 });
    expect(stdout.trim()).toBe('function function');
  });

  test.each([false, null] as const)('queued disappearance with acknowledgement %s remains uncertain', async ack => {
    const f = fixture([snapshot({ running: [], queued: [prompt] }), snapshot({ running: [] })]);
    if (ack === null) f.post.mockRejectedValueOnce(new Error('fixture lost acknowledgement'));
    else f.post.mockResolvedValueOnce({ cancelled: ack });
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.cancelAcknowledged).toBe(ack);
    expect(result.stoppedAtMs).toBeNull();
    expect(f.now()).toBe(3000);
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  test('running disappearance without terminal evidence is not a stopped job', async () => {
    const f = fixture([snapshot(), snapshot({ running: [] })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  test('conflicting running and terminal evidence cannot claim stopping', async () => {
    const f = fixture([snapshot(), snapshot({ terminal: { [prompt]: 'succeeded' } })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(result.errors.join(' ')).toContain('conflicting');
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  test('caller mutation cannot retarget the captured job or service identity', async () => {
    const f = fixture([snapshot({ running: [], terminal: { [prompt]: 'cancelled' } })]);
    f.input.owner = { ...owner };
    f.observe.mockImplementationOnce(async () => {
      f.input.promptId = other;
      f.input.owner.start = 'changed-by-caller';
      return snapshot();
    });
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('native-stopped');
    expect(f.post.mock.calls.map(call => call[0])).toEqual([`/api/jobs/${prompt}/cancel`]);
  });

  test('later snapshots cannot forget an already registered owned GPU allocation', async () => {
    const f = releaseFixture([
      released({ activeOwnedProcesses: [1235], gpuProcessIds: [1235, 9999] }),
      released({ registeredOwnedPids: [], gpuProcessIds: [1235, 9999] }),
    ]);
    const result = await controller.handoffGpu(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.releasedAtMs).toBeNull();
    expect(f.dispatchNext).not.toHaveBeenCalled();
  });

  test.each(['activeOwnedProcesses', 'unresolvedOwnedProcesses'] as const)(
    'a previously observed %s child cannot be forgotten while its GPU allocation remains', async field => {
      const f = releaseFixture([
        released({ registeredOwnedPids: [1234], [field]: [1235], gpuProcessIds: [1235, 9999] }),
        released({ registeredOwnedPids: [1234], gpuProcessIds: [1235, 9999] }),
      ]);
      const result = await controller.handoffGpu(f.input);
      expect(result.state).toBe('reconciling');
      expect(result.releasedAtMs).toBeNull();
      expect(f.dispatchNext).not.toHaveBeenCalled();
    },
  );

  test('a stalled next-launch acknowledgement times out without attempting a second launch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = releaseFixture([released()]);
    f.input.now = () => Date.now();
    f.dispatchNext.mockImplementation(() => new Promise(() => {}));
    const pending = expect(controller.handoffGpu(f.input)).rejects.toThrow('dispatch next: native-control deadline expired');
    await vi.advanceTimersByTimeAsync(2001);
    await pending;
    expect(f.dispatchNext).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    // Rejection means launch outcome is uncertain; it does NOT cancel that launch.
  });

  test('a stalled polling wait is bounded by the original deadline too', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture([snapshot()]);
    f.input.now = () => Date.now();
    f.input.wait = () => new Promise(() => {});
    const pending = controller.cancelComfyJob(f.input);
    await vi.advanceTimersByTimeAsync(2001);
    const result = await pending;
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('early successful returns leave no deadline timers behind', async () => {
    vi.useFakeTimers();
    const f = fixture([snapshot({ running: [], terminal: { [prompt]: 'succeeded' } })]);
    const h = releaseFixture([released()]);
    expect((await controller.cancelComfyJob(f.input)).state).toBe('native-stopped');
    expect((await controller.handoffGpu(h.input)).state).toBe('dispatched');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('invalid timeout budgets fail before observing, cancelling or dispatching', async () => {
    for (const timeoutMs of [0, -1, Number.NaN, Infinity, 2_147_483_648]) {
      const f = fixture([snapshot()]);
      const h = releaseFixture([released()]);
      await expect(controller.cancelComfyJob({ ...f.input, timeoutMs })).rejects.toThrow();
      await expect(controller.handoffGpu({ ...h.input, timeoutMs })).rejects.toThrow();
      expect(f.observe).not.toHaveBeenCalled();
      expect(f.post).not.toHaveBeenCalled();
      expect(h.observe).not.toHaveBeenCalled();
      expect(h.dispatchNext).not.toHaveBeenCalled();
    }
  });
});
function fixture(observations: ComfyObservation[]) {
  let time = 1000;
  let index = 0;
  const post = vi.fn(async (_path: string, _body: Record<string, never>, _signal: AbortSignal) => ({ cancelled: true }));
  const observe = vi.fn(async (_signal: AbortSignal) => structuredClone(observations[Math.min(index++, observations.length - 1)]!));
  const input: CancelInput = {
    promptId: prompt, owner, timeoutMs: 2000, observe, post,
    now: () => time, wait: async ms => { expect(ms).toBeGreaterThan(0); time += ms; },
  };
  return { input, post, observe, now: () => time, advance: (ms: number) => { time += ms; } };
}

describe('Native cancellation: use the pinned job-specific endpoint and observe stopping', () => {
  test('queued deletion targets one ID and preserves observations of another queued job', async () => {
    const f = fixture([snapshot({ running: [], queued: [prompt, other] }), snapshot({ running: [], queued: [other] })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.post.mock.calls[0]!.slice(0, 2)).toEqual([`/api/jobs/${prompt}/cancel`, {}]);
    expect(f.post.mock.calls[0]![2]).toBeInstanceOf(AbortSignal);
    expect(result.state).toBe('native-stopped');
    expect(result.cancelAcknowledged).toBe(true);
    // Deliberately NOT a cancelled-state/resource-release assertion: the server
    // and the other queued job still exist. No global clear/interrupt/free call.
    expect(Object.hasOwn(result, 'resourcesReleased')).toBe(false);
  });

  test('a positive cancellation acknowledgement does not end observation while the job is running', async () => {
    const f = fixture([snapshot(), snapshot(), snapshot({ running: [], terminal: { [prompt]: 'cancelled' } })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(f.observe.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.state).toBe('native-stopped');
    expect(result.stoppedAtMs).toBeGreaterThan(result.requestedAtMs);
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  test('a negative cancellation acknowledgement cannot prove that a running job stopped', async () => {
    const f = fixture([snapshot()]);
    f.post.mockResolvedValue({ cancelled: false });
    const result = await controller.cancelComfyJob(f.input);
    expect(result.cancelAcknowledged).toBe(false);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.now()).toBe(3000);
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  test('terminal native evidence can establish stopping after a negative acknowledgement', async () => {
    const f = fixture([snapshot(), snapshot(), snapshot({ running: [], terminal: { [prompt]: 'succeeded' } })]);
    f.post.mockResolvedValue({ cancelled: false });
    const result = await controller.cancelComfyJob(f.input);
    expect(result.cancelAcknowledged).toBe(false);
    expect(result.state).toBe('native-stopped');
    expect(result.stoppedAtMs).toBeGreaterThan(result.requestedAtMs);
    expect(f.observe.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(f.post).toHaveBeenCalledTimes(1);
    // This is evidence of native completion, not a successful cancellation.
  });

  test('queued-to-running change stays on the same atomic per-job cancel route', async () => {
    const f = fixture([snapshot({ running: [], queued: [prompt] }), snapshot(), snapshot({ running: [], terminal: { [prompt]: 'cancelled' } })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('native-stopped');
    expect(f.post.mock.calls.map(call => call[0])).toEqual([`/api/jobs/${prompt}/cancel`]);
  });

  test('already completed native work is reported as terminal, not rewritten as a cancellation', async () => {
    const f = fixture([snapshot({ running: [], terminal: { [prompt]: 'succeeded' } })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('native-stopped');
    expect(result.alreadyTerminal).toBe(true);
    expect(result.cancelAcknowledged).toBeNull();
    expect(f.post).not.toHaveBeenCalled();
    // Application success-vs-cancel commitment remains the existing serialised decision.
  });

  test.each(['pid', 'group', 'start', 'boot'] as const)('changed service %s refuses cancellation', async key => {
    const changed = { ...owner, [key]: typeof owner[key] === 'number' ? 9876 : 'different' } as Owner;
    const f = fixture([snapshot({ service: changed })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.post).not.toHaveBeenCalled();
  });

  test('unknown prompt or missing service identity is not proof of stopping', async () => {
    for (const observation of [snapshot({ running: [] }), snapshot({ service: null })]) {
      const f = fixture([observation]);
      const result = await controller.cancelComfyJob(f.input);
      expect(result.state).toBe('reconciling');
      expect(result.stoppedAtMs).toBeNull();
      expect(f.post).not.toHaveBeenCalled();
    }
  });

  test('service replacement after acknowledgement prevents using its queue as stop evidence', async () => {
    const f = fixture([snapshot(), snapshot({ service: { ...owner, start: 'new-process' },
      running: [], terminal: { [prompt]: 'cancelled' } })]);
    const result = await controller.cancelComfyJob(f.input);
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
  });

  test('a transport timeout after POST retains uncertainty without repeating POST', async () => {
    const f = fixture([snapshot(), snapshot({ running: [], terminal: { [prompt]: 'cancelled' } })]);
    f.post.mockRejectedValueOnce(new Error('fixture response timeout after possible acceptance'));
    const result = await controller.cancelComfyJob(f.input);
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(result.cancelAcknowledged).toBeNull();
    expect(result.errors.join(' ')).toContain('fixture response timeout');
    expect(result.state).toBe('native-stopped'); // Native observation, not HTTP acknowledgement.
  });

  test('persistent running work reaches the original deadline without a false stopped time', async () => {
    const f = fixture([snapshot()]);
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.now()).toBe(3000);
    expect(f.observe.mock.calls.length).toBeGreaterThan(1);
    expect(f.post).toHaveBeenCalledTimes(1);
  });

  test('a successful response arriving after the deadline cannot become timely stop proof', async () => {
    const f = fixture([snapshot(), snapshot({ running: [], terminal: { [prompt]: 'cancelled' } })]);
    f.post.mockImplementationOnce(async () => { f.advance(2001); return { cancelled: true }; });
    const result = await controller.cancelComfyJob(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.observe).toHaveBeenCalledTimes(1);
  });

  test('a stuck observation is aborted at the overall deadline instead of hanging indefinitely', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture([snapshot()]);
    let observedSignal: AbortSignal | undefined;
    f.input.now = () => Date.now();
    f.input.observe = signal => { observedSignal = signal; return new Promise(() => {}); };
    const pending = controller.cancelComfyJob(f.input);
    await vi.advanceTimersByTimeAsync(2001);
    const result = await pending;
    expect(observedSignal?.aborted).toBe(true);
    expect(result.state).toBe('reconciling');
    expect(result.stoppedAtMs).toBeNull();
    expect(f.post).not.toHaveBeenCalled();
  });

  test('a stuck cancellation POST is aborted at the original deadline without a second POST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = fixture([snapshot()]);
    let observedSignal: AbortSignal | undefined;
    f.input.now = () => Date.now();
    f.input.wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    f.post.mockImplementation((_path, _body, signal) => {
      observedSignal = signal;
      return new Promise(() => {});
    });
    const pending = controller.cancelComfyJob(f.input);
    await vi.advanceTimersByTimeAsync(2001);
    const result = await pending;
    expect(observedSignal?.aborted).toBe(true);
    expect(result.state).toBe('reconciling');
    expect(result.cancelAcknowledged).toBeNull();
    expect(result.stoppedAtMs).toBeNull();
    expect(f.post).toHaveBeenCalledTimes(1);
  });
});

function releaseFixture(observations: ReleaseObservation[]) {
  let index = 0, time = 1000;
  const dispatchNext = vi.fn(async () => {});
  const observe = vi.fn(async (_signal: AbortSignal) => structuredClone(observations[Math.min(index++, observations.length - 1)]!));
  const input: HandoffInput = { timeoutMs: 2000, observe, dispatchNext, now: () => time,
    wait: async ms => { expect(ms).toBeGreaterThan(0); time += ms; } };
  return { input, observe, dispatchNext, now: () => time };
}
const released = (changes: Partial<ReleaseObservation> = {}): ReleaseObservation => ({
  ownerKnown: true, activeOwnedProcesses: [], unresolvedOwnedProcesses: [],
  gpuProcessIds: [9999], registeredOwnedPids: [1234, 1235], nativeQueueEmpty: true, ...changes,
});

describe('GPU handoff: observation precedes dispatch, not just a sequence of labels', () => {
  test('waits for the owned child and CUDA allocation, then dispatches once despite unrelated GPU use', async () => {
    const f = releaseFixture([
      released({ activeOwnedProcesses: [1235], gpuProcessIds: [1235, 9999] }),
      released({ gpuProcessIds: [1235, 9999] }), released(),
    ]);
    f.dispatchNext.mockImplementation(async () => { expect(f.observe).toHaveBeenCalledTimes(3); });
    const result = await controller.handoffGpu(f.input);
    expect(result.state).toBe('dispatched');
    expect(result.releasedAtMs).toBeGreaterThan(1000);
    expect(f.dispatchNext).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['unknown owner', released({ ownerKnown: false })],
    ['unresolved descendant', released({ unresolvedOwnedProcesses: [1235] })],
    ['GPU query failed', released({ gpuProcessIds: null })],
    ['native queue not empty', released({ nativeQueueEmpty: false })],
  ] as const)('%s holds the lane rather than dispatching', async (_label, observation) => {
    const f = releaseFixture([observation]);
    const result = await controller.handoffGpu(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.releasedAtMs).toBeNull();
    expect(f.dispatchNext).not.toHaveBeenCalled();
    expect(f.now()).toBeLessThanOrEqual(3000);
  });

  test('an observation error cannot be mistaken for an empty process/GPU list', async () => {
    const f = releaseFixture([released()]);
    f.observe.mockRejectedValue(new Error('fixture observation permission error'));
    const result = await controller.handoffGpu(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.errors.join(' ')).toContain('fixture observation permission error');
    expect(f.dispatchNext).not.toHaveBeenCalled();
  });

  test('a dispatch error is retained and never causes an automatic second generation', async () => {
    const f = releaseFixture([released()]);
    f.dispatchNext.mockRejectedValue(new Error('fixture next-worker launch failure'));
    await expect(controller.handoffGpu(f.input)).rejects.toThrow('fixture next-worker launch failure');
    expect(f.dispatchNext).toHaveBeenCalledTimes(1);
  });

  test('late release observations do not dispatch after the original deadline', async () => {
    const f = releaseFixture([released()]);
    f.input.observe = async () => { await f.input.wait(2001); return released(); };
    const result = await controller.handoffGpu(f.input);
    expect(result.state).toBe('reconciling');
    expect(result.releasedAtMs).toBeNull();
    expect(f.dispatchNext).not.toHaveBeenCalled();
  });

  test('a stuck release observation is aborted without ever dispatching', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = releaseFixture([released()]);
    let observedSignal: AbortSignal | undefined;
    f.input.now = () => Date.now();
    f.input.observe = signal => { observedSignal = signal; return new Promise(() => {}); };
    const pending = controller.handoffGpu(f.input);
    await vi.advanceTimersByTimeAsync(2001);
    const result = await pending;
    expect(observedSignal?.aborted).toBe(true);
    expect(result.state).toBe('reconciling');
    expect(f.dispatchNext).not.toHaveBeenCalled();
  });
});
