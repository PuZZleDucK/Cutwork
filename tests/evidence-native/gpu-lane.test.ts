/** Opt-in actual SQLite + systemd lifecycle + live NVIDIA queries. Native payloads
 * are CPU Node fixtures, not YuE2/H3 inference or model cancellation proof. */
import { expect, test } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { GpuWorker } from '../../apps/server/src/jobs/gpu-worker.ts';
import { createSystemdGpuAdapter } from '../../apps/server/src/jobs/systemd-gpu.ts';

const enabled = process.env.STUDIO_GPU_LANE === '1';
test.skipIf(!enabled)('real durable lane, gated native units, descendant cancellation and failed GPU observation', async () => {
  const root = process.env.STUDIO_GPU_LANE_OUTPUT, uuid = process.env.STUDIO_GPU_UUID;
  if (!root || !isAbsolute(root) || !uuid) throw new Error('Explicit new absolute output directory and GPU UUID required');
  await mkdir(root, { mode: 0o700 }); // exclusive; never reuse evidence
  const q = openGpuQueue(join(root, 'queue.sqlite'));
  const sentinel = spawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),120000);setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const sentinelExit = new Promise<void>((r, reject) => { sentinel.once('exit', () => r()); sentinel.once('error', reject); });
  const sentinelStat = await readFile(`/proc/${sentinel.pid}/stat`, 'utf8');
  const ownerTicks = (s: string) => s.slice(s.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  const sentinelTicks = ownerTicks(sentinelStat);
  const measurements: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  let active: Promise<unknown> | undefined;
  let activeAttempt: string | undefined;
  let interrupted = false;
  const terminating = () => { interrupted = true; for (const c of q.list()) q.cancelAttempt(c.attemptId); };
  process.on('SIGTERM', terminating); process.on('SIGINT', terminating);
  const options = {
    runRoot: join(root, 'runs'), node: process.execPath, supervisor: resolve('scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds: 30,
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [uuid], timeoutMs: 5000, cleanupTimeoutMs: 2000, maxOutputBytes: 1024 * 1024 },
    async resolveCommand(call: { id: string; request: unknown }) {
      calls.push(call.id);
      const persistent = (call.request as { persistent?: boolean }).persistent;
      const script = persistent
        ? `const {spawn}=require('node:child_process');const fs=require('node:fs');
          const c=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),15000);setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
          fs.writeFileSync(${JSON.stringify(join(root, 'child-'))}+${JSON.stringify(call.id)},String(c.pid));setTimeout(()=>process.exit(0),15000);setInterval(()=>{},1000);`
        : 'process.stdout.write("CPU lifecycle fixture, no generation\\n")';
      return { executable: process.execPath, args: ['-e', script], cwd: root!, env: {} };
    },
  };
  const worker = new GpuWorker(q, createSystemdGpuAdapter(options), { workerId: 'native-proof', cancelPollMs: 20 });
  const submit = (id: string, tool: 'yue2' | 'h3', persistent = false) => {
    if (interrupted) throw new Error('Fixture interrupted; no more work will be submitted');
    return q.submit({ id, attemptId: id, projectId: id.includes('h3') ? 'project-b' : 'project-a', tool, request: { persistent, fixtureOnly: true } });
  };
  async function unchangedSentinel() {
    expect(ownerTicks(await readFile(`/proc/${sentinel.pid}/stat`, 'utf8'))).toBe(sentinelTicks);
  }
  try {
    for (const [id, tool] of [['music-a', 'yue2'], ['h3-a', 'h3'], ['music-b', 'yue2']] as const) submit(id, tool);
    for (const id of ['music-a', 'h3-a', 'music-b']) {
      const result = await worker.runNext(); expect(result?.id).toBe(id); expect(result?.state).toBe('succeeded');
      expect(q.heldLease()).toBeNull(); await unchangedSentinel();
    }
    for (const tool of ['yue2', 'h3'] as const) {
      const id = `queued-${tool}`; submit(id, tool); q.cancelAttempt(id);
      expect(await worker.runNext()).toBeNull(); expect(calls).not.toContain(id);
    }
    for (const tool of ['yue2', 'h3'] as const) {
      const id = `running-${tool}`; submit(id, tool, true); activeAttempt = id; active = worker.runNext();
      const deadline = performance.now() + 20000; let childPid = 0;
      while (performance.now() < deadline) {
        try { childPid = Number(await readFile(join(root, `child-${id}`), 'utf8')); break; }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; await delay(25); }
      }
      expect(childPid).toBeGreaterThan(0); expect(q.get(id)?.state).toBe('running');
      const requested = performance.now(); q.cancelAttempt(id);
      const result = await active; active = undefined; activeAttempt = undefined;
      measurements.push({ id, requestMonotonicMs: requested, confirmedMonotonicMs: performance.now(), childPid });
      expect(result).toMatchObject({ state: 'cancelled' }); expect(q.heldLease()).toBeNull();
      await expect(readFile(`/proc/${childPid}/stat`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await unchangedSentinel();
    }
    // Same real CPU execution, deliberately unresolvable expected GPU inventory.
    // A failed probe must leave a durable reconciliation hold, not dispatch next.
    submit('uncertain', 'yue2'); submit('must-not-start', 'h3');
    const brokenGpu = new GpuWorker(q, createSystemdGpuAdapter({ ...options,
      gpu: { ...options.gpu, expectedGpuUuids: ['GPU-00000000-0000-4000-8000-000000000000'] } }), { workerId: 'negative-control' });
    expect((await brokenGpu.runNext())?.state).toBe('reconciling');
    expect(q.heldLease()?.callId).toBe('uncertain'); expect(await worker.runNext()).toBeNull();
    expect(calls).not.toContain('must-not-start'); await unchangedSentinel();
  } finally {
    try {
      if (activeAttempt) q.cancelAttempt(activeAttempt);
      if (active) await active;
      await writeFile(join(root, 'evidence.json'), JSON.stringify({ kind: 'cpu-lifecycle-with-live-gpu-observation',
        modelInferencePerformed: false, measurements, nativeInvocations: calls, calls: q.list(),
        events: q.list().flatMap(c => q.events(c.id)), heldLease: q.heldLease(), sentinelPid: sentinel.pid, sentinelTicks }, null, 2));
    } finally {
      process.off('SIGTERM', terminating); process.off('SIGINT', terminating);
      try { q.close(); } finally { sentinel.kill('SIGTERM'); await sentinelExit; }
    }
  }
});
