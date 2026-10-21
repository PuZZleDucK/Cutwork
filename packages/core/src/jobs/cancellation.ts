import type { CancelAction, CancelInput, NativeOwner } from '../contracts/generation.ts';

function sameOwner(expected: NativeOwner, observed: NativeOwner | null): boolean {
  if (!observed || expected.kind !== observed.kind) return false;
  if (expected.kind === 'not-submitted' && observed.kind === 'not-submitted') return expected.attemptId === observed.attemptId;
  if (expected.kind === 'comfy' && observed.kind === 'comfy') return !!expected.promptId && expected.promptId === observed.promptId;
  if (expected.kind === 'process' && observed.kind === 'process') {
    return expected.pid > 0 && expected.group > 0 && !!expected.start && !!expected.boot &&
      expected.pid === observed.pid && expected.group === observed.group &&
      expected.start === observed.start && expected.boot === observed.boot;
  }
  return false;
}

/** Pure state/action decision, not an interrupt/kill implementation or GPU lock. */
export function cancel(input: CancelInput): {
  state: 'cancel_requested' | 'cancelled' | 'reconciling' | 'succeeded';
  actions: CancelAction[]; releaseGpu: boolean; maySubmit: boolean;
} {
  const pending = { state: 'cancel_requested' as const, actions: [] as CancelAction[], releaseGpu: false, maySubmit: false };
  if (input.successCommitted) return { ...pending, state: 'succeeded' };
  if (!sameOwner(input.owner, input.observedOwner)) return { ...pending, state: 'reconciling' };
  if (input.owner.kind === 'not-submitted') {
    return { ...pending, state: ['queued', 'cancel_requested'].includes(input.phase) ? 'cancelled' : 'reconciling' };
  }
  if (input.stopped) {
    return input.resourcesReleased ? { ...pending, state: 'cancelled', releaseGpu: true } : pending;
  }
  if (input.owner.kind === 'comfy') {
    if (input.nativePhase !== 'queued' && input.nativePhase !== 'running') return { ...pending, state: 'reconciling' };
    pending.actions.push({ type: input.nativePhase === 'queued' ? 'delete-queued-comfy' : 'interrupt-comfy', promptId: input.owner.promptId });
  } else {
    pending.actions.push({ type: 'stop-owned-process-group', group: input.owner.group });
  }
  return pending;
}

export function gpuHandoff(input: {
  currentTool: 'yue2' | 'h3'; nextTool: 'yue2' | 'h3'; ownerKnown: boolean;
  currentStopped: boolean; resourcesReleased: boolean; unloadFailed: boolean;
}): 'hold' | 'unload-owned-tool' | 'dispatch-next' {
  if (!input.ownerKnown || !input.currentStopped || input.unloadFailed) return 'hold';
  return input.resourcesReleased ? 'dispatch-next' : 'unload-owned-tool';
}
