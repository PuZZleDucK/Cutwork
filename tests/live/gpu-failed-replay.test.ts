/** Actual same-input retry of a retained failed YuE2 call. Explicit opt-in;
 * not a fresh variation, output-byte determinism claim, or synthetic failure. */
import { expect, test } from 'vitest';
import { hostname } from 'node:os';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { startNativeCoordinator } from '../../apps/server/src/http/native-coordinator.ts';
import { createSystemdGpuAdapter } from '../../apps/server/src/jobs/systemd-gpu.ts';
import { resolveNativeCommand, validateNativeSubmission } from '../../apps/server/src/generation/native-command.ts';
import { submitAndWait } from '../../scripts/native-call.ts';
import type { GpuCall, Json } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const enabled = process.env.STUDIO_FAILED_REPLAY === '1';
test.skipIf(!enabled)('replays the actual OOM-failed YuE2 call with identical captured creative inputs and stage seeds', async () => {
  const runtime = process.env.STUDIO_LIVE_RUNTIME, root = process.env.STUDIO_REPLAY_OUTPUT;
  const originalEvidence = process.env.STUDIO_FAILED_LANE_EVIDENCE, originalId = process.env.STUDIO_FAILED_CALL_ID;
  const gpuUuid = process.env.STUDIO_GPU_UUID;
  if (hostname().split('.')[0] !== 'dundee' || process.env.STUDIO_LIVE !== '1' || !runtime || !root ||
    !originalEvidence || ![runtime, root, originalEvidence].every(isAbsolute) || !originalId || !gpuUuid) {
    throw new Error('Explicit Dundee replay configuration and retained failed-call evidence required');
  }
  const retained = JSON.parse(await readFile(originalEvidence, 'utf8')) as {
    calls: GpuCall[]; recipes: Record<string, { path: string; receipt: string }>;
  };
  const original = retained.calls.find(c => c.id === originalId);
  expect(original?.tool).toBe('yue2'); expect(original?.state).toBe('reconciling');
  const oldOwner = original!.owner as { directory: string };
  const oldRelease = JSON.parse(await readFile(join(oldOwner.directory, 'release.json'), 'utf8'));
  // The original helper was genuinely killed, not merely labelled failed.
  expect(oldRelease.after.Result).toBe('oom-kill');
  const oldRecipe = retained.recipes[originalId]!;
  const oldBytes = await readFile(oldRecipe.path), oldRequest = JSON.parse(oldBytes.toString());
  const oldReceipt = JSON.parse(await readFile(oldRecipe.receipt, 'utf8'));
  expect(oldRequest).toEqual(original!.request);
  expect(oldReceipt.attemptId).toBe(originalId); expect(oldReceipt.state).not.toBe('succeeded');
  expect(oldReceipt.requestSha256).toBe(createHash('sha256').update(oldBytes).digest('hex'));
  expect(oldReceipt.assignedSeeds).toEqual(oldRequest.seeds);
  await mkdir(root, { mode: 0o700 });
  const id = randomUUID(), projectId = `replay-${randomUUID()}`, request = { ...oldRequest, attemptId: id };
  const unchanged = (r: Record<string, Json>) => Object.fromEntries(Object.entries(r).filter(([key]) => key !== 'attemptId'));
  expect(unchanged(request)).toEqual(unchanged(oldRequest));
  await writeFile(join(root, 'captured-replay.json'), JSON.stringify({ originalEvidence, originalId, id, projectId, request }, null, 2), { flag: 'wx', mode: 0o600 });
  const server = createServer(); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port; await new Promise<void>(r => server.close(() => r()));
  const adapter = createSystemdGpuAdapter({ runRoot: join(root, 'units'), node: process.execPath,
    supervisor: resolve('scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds: 1200,
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpuUuid], timeoutMs: 15000, cleanupTimeoutMs: 2000, maxOutputBytes: 1024 * 1024 },
    resolveCommand: call => resolveNativeCommand({ runtime, source: resolve('.'), call }),
  });
  const coordinator = await startNativeCoordinator({ database: join(root, 'queue.sqlite'), adapter, host: '127.0.0.1', port,
    allowedHosts: [`127.0.0.1:${port}`], hasAttempt: parent => parent === id,
    validateSubmission(call) { validateNativeSubmission(call); expect(call).toEqual({ id, attemptId: id, projectId, tool: 'yue2', request }); },
  });
  const record: Record<string, unknown> = { originalEvidence, originalId, retryId: id, projectId,
    originalInputs: unchanged(oldRequest), retryInputs: unchanged(request), state: 'running' };
  try {
    const result = await submitAndWait(`http://127.0.0.1:${port}`, { id, attemptId: id, projectId, tool: 'yue2', request },
      { timeoutMs: 1_300_000, onState: state => console.log(`Replay ${id}: ${state}`) });
    record.call = result; expect(result.state).toBe('succeeded');
    const receiptPath = join(runtime, 'projects', projectId, 'runs', id, 'receipt.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')); record.receiptPath = receiptPath;
    expect(receipt.state).toBe('succeeded'); expect(receipt.assignedSeeds).toEqual(oldReceipt.assignedSeeds);
    expect(receipt.execution).toEqual(oldReceipt.execution); expect(receipt.helperSha256).toBe(oldReceipt.helperSha256);
    expect(receipt.modelManifestSha256).toBe(oldReceipt.modelManifestSha256);
    expect(receipt.versions).toEqual(oldReceipt.versions);
    expect(receipt.calls.filter((c: { stage: string }) => ['abc', 'semantic', 'nar'].includes(c.stage)).map((c: { suppliedSeed: string }) => c.suppliedSeed))
      .toEqual(oldReceipt.calls.filter((c: { stage: string }) => ['abc', 'semantic', 'nar'].includes(c.stage)).map((c: { suppliedSeed: string }) => c.suppliedSeed));
    expect((await fetch(`http://127.0.0.1:${port}/api/internal/coordinator`).then(r => r.json())).heldCallId).toBeNull();
    record.state = 'succeeded'; record.truncated = receipt.truncated;
  } catch (error) { record.state = 'failed'; record.error = String(error); throw error; }
  finally {
    try { await coordinator.close(); }
    finally { await writeFile(join(root, 'evidence.json'), JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 }); }
  }
});
