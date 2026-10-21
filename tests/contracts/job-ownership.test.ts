import { beforeAll, describe, expect, test } from 'vitest';
import { loadContractDriver } from '../support/load-driver.ts';
import type { CancelInput, SliceOneDriver } from '../support/slice1-contract.ts';

let driver: SliceOneDriver;
beforeAll(async () => { driver = await loadContractDriver(); });
const running = (): CancelInput => ({
  phase: 'running', nativePhase: 'running', owner: { kind: 'comfy', promptId: 'owned-1' },
  observedOwner: { kind: 'comfy', promptId: 'owned-1' },
  stopped: false, resourcesReleased: false, successCommitted: false,
});

describe('S1-CANCEL: target only owned work and do not confuse acknowledgement with stopping', () => {
  test('cancels a not-yet-submitted music attempt without inventing or killing a process', () => {
    const owner = { kind: 'not-submitted' as const, attemptId: 'attempt-queued' };
    const result = driver.cancel({ ...running(), phase: 'queued', owner, observedOwner: owner });
    expect(result.state).toBe('cancelled');
    expect(result.actions).toEqual([]);
    expect(result.maySubmit).toBe(false);
    expect(result.releaseGpu).toBe(false); // this waiting attempt never owned the active lease
  });
  test.each(['queued', 'running'] as const)('%s Comfy cancellation includes the exact prompt ID', phase => {
    const result = driver.cancel({ ...running(), phase, nativePhase: phase });
    expect(result.actions).toEqual([{
      type: phase === 'queued' ? 'delete-queued-comfy' : 'interrupt-comfy', promptId: 'owned-1',
    }]);
    expect(result.state).toBe('cancel_requested');
    expect(result.releaseGpu).toBe(false);
    expect(result.maySubmit).toBe(false);
  });
  test('stops an owned process group rather than just the frontier agent', () => {
    const owner = { kind: 'process' as const, pid: 1234, group: 1234, start: '100', boot: 'boot-a' };
    const result = driver.cancel({ ...running(), owner, observedOwner: owner });
    expect(result.actions).toEqual([{ type: 'stop-owned-process-group', group: 1234 }]);
    expect(result.state).toBe('cancel_requested');
  });
  test.each(['pid', 'group', 'start', 'boot'] as const)('does not kill when process identity %s differs', key => {
    const owner = { kind: 'process' as const, pid: 1234, group: 1234, start: '100', boot: 'boot-a' };
    const observed = { ...owner, [key]: typeof owner[key] === 'number' ? 9999 : 'changed' };
    const result = driver.cancel({ ...running(), owner, observedOwner: observed as typeof owner });
    expect(result.state).toBe('reconciling');
    expect(result.actions).toEqual([]);
    expect(result.releaseGpu).toBe(false);
  });
  test('unknown ownership cannot claim cancellation or free the lane', () => {
    const result = driver.cancel({ ...running(), observedOwner: null });
    expect(result.state).toBe('reconciling');
    expect(result.actions).toEqual([]);
    expect(result.releaseGpu).toBe(false);
    expect(result.maySubmit).toBe(false);
  });
  test('an unrelated Comfy job is never interrupted', () => {
    const result = driver.cancel({ ...running(), observedOwner: { kind: 'comfy', promptId: 'unrelated' } });
    expect(result.state).toBe('reconciling');
    expect(result.actions).toEqual([]);
  });
  test('a cancellation acknowledgement with work still running remains pending', () => {
    const result = driver.cancel({ ...running(), phase: 'cancel_requested' });
    expect(result.state).toBe('cancel_requested');
    expect(result.releaseGpu).toBe(false);
  });
  test('confirmed stopped work still holds the lane until its resources are released', () => {
    const result = driver.cancel({ ...running(), phase: 'cancel_requested', stopped: true });
    expect(result.state).not.toBe('cancelled');
    expect(result.releaseGpu).toBe(false);
  });
  test('only confirmed stop plus resource release exposes the cancelled state', () => {
    const result = driver.cancel({ ...running(), phase: 'cancel_requested', stopped: true, resourcesReleased: true });
    expect(result.state).toBe('cancelled');
    expect(result.releaseGpu).toBe(true);
    expect(result.maySubmit).toBe(false);
  });
  test('a success committed before cancellation remains success', () => {
    const result = driver.cancel({ ...running(), phase: 'succeeded', successCommitted: true, stopped: true, resourcesReleased: true });
    expect(result.state).toBe('succeeded');
    expect(result.actions).toEqual([]);
  });
});

describe('S1-GPU: explicit model handoff in both directions', () => {
  test.each([['yue2', 'h3'], ['h3', 'yue2']] as const)('%s → %s unloads, verifies, then dispatches', (currentTool, nextTool) => {
    const state = { currentTool, nextTool, ownerKnown: true, currentStopped: true, resourcesReleased: false, unloadFailed: false };
    expect(driver.gpuHandoff(state)).toBe('unload-owned-tool');
    expect(driver.gpuHandoff({ ...state, resourcesReleased: true })).toBe('dispatch-next');
    expect(driver.gpuHandoff({ ...state, currentStopped: false })).toBe('hold');
    expect(driver.gpuHandoff({ ...state, ownerKnown: false })).toBe('hold');
    expect(driver.gpuHandoff({ ...state, unloadFailed: true })).toBe('hold');
  });
});
