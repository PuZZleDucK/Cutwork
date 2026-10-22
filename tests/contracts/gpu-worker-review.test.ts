/** Review regression: actual durable queue, injected adapter, no native work. */
import { expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { GpuWorker, type NativeAdapter } from '../../apps/server/src/jobs/gpu-worker.ts';

test('cancellation committed before ownership acknowledgement closes the native launch gate synchronously', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gpu-worker-review-'));
  const queue = openGpuQueue(join(directory, 'queue.sqlite'));
  try {
    queue.submit({ id: 'call', attemptId: 'attempt', projectId: 'project', tool: 'h3', request: {} });
    let launchGateOpened = false;
    const adapter: NativeAdapter = {
      async prepare() { return { fixtureOnly: true }; },
      async launch(_plan, context) {
        // No timer/microtask intervenes: the durable cancel wins before ownership
        // is recorded, and the adapter's next action would be to publish its gate.
        queue.cancelAttempt('attempt');
        context.recordOwner({ fixtureOnly: true });
        launchGateOpened = !context.signal.aborted;
        return {
          async wait() { return { outcome: 'failed' as const, result: null }; },
          async stop() {},
          async cleanup() { return { state: 'released' as const, evidence: { fixtureOnly: true } }; },
        };
      },
    };
    const result = await new GpuWorker(queue, adapter, { workerId: 'worker', cancelPollMs: 10000 }).runNext();
    expect(result?.state).toBe('cancelled');
    expect(queue.get('call')?.owner).toEqual({ fixtureOnly: true }); // Keep actual owner for cleanup.
    expect(launchGateOpened).toBe(false);
  } finally { queue.close(); rmSync(directory, { recursive: true, force: true }); }
});
