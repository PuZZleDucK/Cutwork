/** Real durable-queue cancellation before dispatch. No model is supposed to
 * launch: this measures the queued path, not Comfy inference interruption. */
import { test, expect } from 'vitest';
import { hostname } from 'node:os';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { GpuWorker } from '../../apps/server/src/jobs/gpu-worker.ts';
import { createSystemdGpuAdapter } from '../../apps/server/src/jobs/systemd-gpu.ts';

test.skipIf(process.env.STUDIO_QUEUED_CANCEL !== '1')('Dundee queued YuE2 and H3 cancellations never dispatch, including after reopen', async () => {
  const root = process.env.STUDIO_QUEUED_CANCEL_OUTPUT, gpu = process.env.STUDIO_GPU_UUID;
  if (hostname().split('.')[0] !== 'dundee' || process.env.STUDIO_LIVE !== '1' ||
      !root || !isAbsolute(root) || !gpu) throw new Error('Explicit Dundee queued-cancellation configuration required');
  await mkdir(root, { mode: 0o700 });
  const database = join(root, 'queue.sqlite');
  let q = openGpuQueue(database), commandResolutions = 0;
  const records: Array<Record<string, unknown>> = [];
  const adapter = createSystemdGpuAdapter({ runRoot: join(root, 'units'), node: process.execPath,
    supervisor: resolve('scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds: 30,
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpu], timeoutMs: 15000,
      cleanupTimeoutMs: 2000, maxOutputBytes: 1024 * 1024 },
    resolveCommand() {
      commandResolutions++;
      throw new Error('A cancelled queued request must never resolve a native command');
    },
  });
  try {
    for (const tool of ['yue2', 'h3'] as const) {
      const id = randomUUID();
      q.submit({ id, attemptId: id, projectId: `queued-cancel-${id}`, tool,
        request: { schemaVersion: 1, attemptId: id,
          note: 'Queue-only diagnostic input: intentionally never passed to a generator' } });
      expect(q.get(id)?.state).toBe('queued');
      const requestedAt = performance.now();
      q.cancelAttempt(id);
      const cancelled = q.get(id)!;
      const confirmedAt = performance.now();
      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.owner).toBeNull(); expect(cancelled.launch).toBeNull();
      expect(q.heldLease()).toBeNull();
      records.push({ tool, id, requestedAt, confirmedAt, elapsedMs: confirmedAt - requestedAt,
        state: cancelled.state, inferenceStarted: false, nativeLaunched: false });
    }
    q.close(); q = openGpuQueue(database);
    const worker = new GpuWorker(q, adapter, { workerId: 'queued-cancel-native-proof' });
    expect(await worker.runNext()).toBeNull();
    expect(commandResolutions).toBe(0); expect(q.heldLease()).toBeNull();
    expect(q.list().map(c => c.state)).toEqual(['cancelled', 'cancelled']);
    expect((await readdir(root)).includes('units')).toBe(false);
    await writeFile(join(root, 'evidence.json'), JSON.stringify({ records, calls: q.list(), commandResolutions,
      boundary: 'Actual SQLite queue on Dundee; no helper, GPU query or native model was launched. Timings measure durable queued cancellation, not running inference stop.' }, null, 2), { flag: 'wx', mode: 0o600 });
  } finally { q.close(); }
});
