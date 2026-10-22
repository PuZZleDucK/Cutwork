/** Explicit real-model verification of the shared lane. Separate from the
 * original 12-case live driver: it does not claim provider/UI/fresh-host proof. */
import { test, expect } from 'vitest';
import { hostname } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { GpuWorker } from '../../apps/server/src/jobs/gpu-worker.ts';
import { createSystemdGpuAdapter } from '../../apps/server/src/jobs/systemd-gpu.ts';
import { readNvidiaComputeSnapshot, NvidiaQueryError } from '../../apps/server/src/jobs/nvidia-query.ts';
import { seeds } from '../../apps/server/src/generation/seeds.ts';
import type { GpuCall, Json } from '../../apps/server/src/jobs/gpu-queue-contract.ts';
import { planVideo } from '../../packages/core/src/time/video-plan.ts';
import { activeNativeProgress } from '../support/native-progress.ts';
import { createComfyQueueBinding } from '../../apps/server/src/jobs/comfy-queue.ts';

const exec = promisify(execFile);
const enabled = process.env.STUDIO_MODEL_LANE === '1';
test.skipIf(!enabled)('Dundee real YuE2 → H3 → YuE2 release/handoff and queued/running cancellation', async () => {
  const runtime = process.env.STUDIO_LIVE_RUNTIME, root = process.env.STUDIO_MODEL_LANE_OUTPUT, uuid = process.env.STUDIO_GPU_UUID;
  if (hostname().split('.')[0] !== 'dundee' || process.env.STUDIO_LIVE !== '1' ||
    !runtime || !isAbsolute(runtime) || !root || !isAbsolute(root) || !uuid) throw new Error('Explicit Dundee model proof configuration required');
  const runtimeRoot = runtime, outputRoot = root;
  await mkdir(root, { mode: 0o700 });
  const projectId = `gpu-lane-${randomUUID()}`, workspace = join(runtime, 'projects', projectId, 'workspace');
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const q = openGpuQueue(join(root, 'queue.sqlite'));
  const gpuConfig = { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [uuid], timeoutMs: 15000, cleanupTimeoutMs: 2000, maxOutputBytes: 1024 * 1024 };
  const recipes = new Map<string, { path: string; receipt: string; port: number }>();
  const observations: Array<Record<string, unknown>> = [], transitions: Array<Record<string, unknown>> = [];
  const baseline = await readNvidiaComputeSnapshot(gpuConfig, new AbortController().signal);
  const baselineOwners = await Promise.all(baseline.processes.map(async p => ({ ...p,
    stat: await readFile(`/proc/${p.pid}/stat`, 'utf8'), comm: (await readFile(`/proc/${p.pid}/comm`, 'utf8')).trim() })));
  if (baselineOwners.some(p => /mps|proxy/i.test(p.comm))) throw new Error('MPS/GPU proxy attribution is unsupported');
  let interrupted = false, activeAttempt: string | undefined, active: Promise<GpuCall | null> | undefined;
  const interrupt = () => { interrupted = true; for (const c of q.list()) q.cancelAttempt(c.attemptId); };
  process.on('SIGTERM', interrupt); process.on('SIGINT', interrupt);
  const adapter = createSystemdGpuAdapter({ runRoot: join(root, 'units'), node: process.execPath,
    supervisor: resolve('scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds: 1800, gpu: gpuConfig,
    async resolveCommand(call) {
      const r = recipes.get(call.id)!;
      if (!r) throw new Error('Unregistered native request');
      return { executable: call.tool === 'yue2' ? join(runtime, 'tools/yue2/venv/bin/python') : '/usr/bin/python3',
        args: ['-I', '-u', resolve(`integrations/${call.tool}/generate.py`), '--request', r.path,
          ...(call.tool === 'yue2' ? ['--result', r.receipt] : ['--run', '--port', String(r.port), '--timeout-seconds', '1500'])],
        cwd: workspace, env: { STUDIO_DATA_ROOT: runtime } };
    },
  });
  const worker = new GpuWorker(q, adapter, { workerId: 'dundee-model-lane', cancelPollMs: 20 });
  const musicSeeds = seeds({ mode: 'fresh', stages: ['abc', 'semantic', 'nar'], previous: {},
    domains: Object.fromEntries(['abc', 'semantic', 'nar'].map(s => [s, { min: '0', max: '9223372036854775807' }])) });
  const musicBase = { parameters: { style: 'French electro funk, warm analog synthesizers, playful arpeggios, punchy syncopated bass, 120 BPM, English vocals, a short original programming jingle',
    lyrics: '[Verse]\nLight up the keys, let the rhythm compile\nBuild it together, one beat at a time\n[Chorus]\nCode into music, color into light', cot: 'full' },
    seeds: musicSeeds, sampling: { semantic: { min_tokens: 450, max_tokens: 500 } },
    execution: { device: 'cuda', memory_budget_gib: 16, offload_ar: true, vae_core_frames: 256, backend: 'torch', quantization: 'none' } };
  async function submit(tool: 'yue2' | 'h3', values: Record<string, Json>): Promise<string> {
    if (interrupted) throw new Error('Model proof interrupted; no more submissions');
    const id = randomUUID(), directory = join(outputRoot, id); await mkdir(directory, { mode: 0o700 });
    const request = { schemaVersion: 1, attemptId: id, ...(tool === 'h3' ? { projectId } : {}), ...values };
    const path = join(directory, 'request.json'); await writeFile(path, JSON.stringify(request, null, 2), { flag: 'wx', mode: 0o600 });
    let port = 0;
    if (tool === 'h3') {
      const server = createServer(); await new Promise<void>((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });
      port = (server.address() as { port: number }).port;
      await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r()));
    }
    const receipt = tool === 'yue2' ? join(directory, 'receipt.json') : join(runtimeRoot, 'projects', projectId, 'runs', id, 'receipt.json');
    recipes.set(id, { path, receipt, port }); q.submit({ id, attemptId: id, projectId, tool, request });
    return id;
  }
  async function perform(id: string, cancelWhileRunning = false) {
    console.log(`Native lane: ${q.get(id)!.tool} ${id} (${cancelWhileRunning ? 'running cancellation' : 'complete generation'})`);
    activeAttempt = id; active = worker.runNext(); let done = false;
    void active.then(() => { done = true; }, () => { done = true; });
    const deadline = performance.now() + 1_650_000;
    let cancelledAt: number | null = null, positiveInference = false, directGpuPidObserved = false;
    transitions.push({ id, tool: q.get(id)!.tool, action: 'dispatch', monotonicMs: performance.now() });
    while (!done) {
      if (performance.now() > deadline) { q.cancelAttempt(id); throw new Error('Native proof observation deadline exceeded'); }
      const call = q.get(id)!, owner = call.owner as { controlGroup?: string; directory?: string } | null;
      if (owner?.controlGroup && owner.directory) {
        let pids: number[] = [];
        try { pids = (await readFile(join('/sys/fs/cgroup', owner.controlGroup, 'cgroup.procs'), 'utf8')).trim().split('\n').filter(Boolean).map(Number); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        let gpu;
        try { gpu = await readNvidiaComputeSnapshot(gpuConfig, new AbortController().signal); }
        catch (error) {
          // This is progress telemetry, not release authority. A bounded query
          // timeout with confirmed query-child cleanup may be observed again;
          // retain the missing observation, never reinterpret it as an empty GPU.
          observations.push({ id, atMonotonicMs: performance.now(), observationError:
            error instanceof Error ? error.message : String(error) });
          if (!(error instanceof NvidiaQueryError) || error.code !== 'GPU_PROBE_TIMEOUT' || !error.cleanupConfirmed) throw error;
          await delay(1000); continue;
        }
        const matches = gpu.processes.filter(p => pids.includes(p.pid));
        if (matches.length) directGpuPidObserved = true;
        const log = call.tool === 'yue2' ? join(owner.directory, 'stderr.log') : join(runtimeRoot, 'projects', projectId, 'runs', id, 'service.log');
        let content = '';
        try { content = await readFile(log, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        let receipt: { state?: string; calls?: Array<{ stage: string; state: string }>; promptId?: string;
          owner?: { pid: number; processGroupId: number; startTicks: string; bootId: string } } = {};
        try { receipt = JSON.parse(await readFile(recipes.get(id)!.receipt, 'utf8')); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        const progress = activeNativeProgress(call.tool, content, receipt);
        let runningPrompt: unknown = null, marker = progress.active;
        if (marker && call.tool === 'h3') {
          if (!receipt.owner || !receipt.promptId) marker = false;
          else {
            const o = receipt.owner;
            const current = await createComfyQueueBinding({ port: recipes.get(id)!.port,
              owner: { kind: 'process', pid: o.pid, group: o.processGroupId, start: o.startTicks, boot: o.bootId },
              requestTimeoutMs: 3000, maxResponseBytes: 4 * 1024 * 1024 }).observe(AbortSignal.timeout(4000));
            runningPrompt = current; marker = current.running.includes(receipt.promptId);
          }
        }
        if (marker && matches.length) positiveInference = true;
        observations.push({ id, atMonotonicMs: performance.now(), state: call.state, pids, gpu,
          nativeProgress: progress, receiptState: receipt.state, lastStage: receipt.calls?.at(-1), runningPrompt });
        if (cancelWhileRunning && positiveInference && cancelledAt === null) {
          cancelledAt = performance.now(); q.cancelAttempt(id);
          console.log(`Native lane: cancellation requested after native progress and owned CUDA PID for ${id}`);
        }
      }
      if (!done) await delay(500);
    }
    const result = await active; active = undefined; activeAttempt = undefined;
    expect(result?.state, JSON.stringify(result)).toBe(cancelWhileRunning ? 'cancelled' : 'succeeded');
    expect(directGpuPidObserved).toBe(true);
    if (cancelWhileRunning) { expect(positiveInference).toBe(true); expect(cancelledAt).not.toBeNull(); }
    expect(q.heldLease()).toBeNull();
    transitions.push({ id, tool: result!.tool, action: 'stopped', monotonicMs: performance.now() },
      { id, tool: result!.tool, action: 'resources-released', monotonicMs: performance.now(), cancelledAt });
    console.log(`Native lane: ${result!.state}; release retained${cancelledAt === null ? '' : `; cancellation ${Math.round(performance.now() - cancelledAt)}ms`}`);
    for (const baseline of baselineOwners) {
      const current = await readFile(`/proc/${baseline.pid}/stat`, 'utf8');
      expect(current.slice(current.lastIndexOf(')') + 2).split(' ')[19]).toBe(baseline.stat.slice(baseline.stat.lastIndexOf(')') + 2).split(' ')[19]);
    }
    return JSON.parse(await readFile(recipes.get(id)!.receipt, 'utf8'));
  }
  try {
    // Queued cancellation uses the real durable lane and never launches helpers.
    for (const tool of ['yue2', 'h3'] as const) {
      const id = await submit(tool, { fixtureNeverLaunched: true }); q.cancelAttempt(id);
      expect(await worker.runNext()).toBeNull(); expect(q.get(id)?.owner).toBeNull();
    }
    const first = await submit('yue2', musicBase), music = await perform(first);
    expect(music.state).toBe('succeeded');
    const songPath = music.audio.path as string;
    const { stdout } = await exec('/usr/bin/ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', songPath]);
    const audio = JSON.parse(stdout).streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    expect(audio.sample_rate).toBe('48000'); expect(audio.channels).toBe(2);
    await exec('/usr/bin/ffmpeg', ['-v', 'error', '-xerror', '-i', songPath, '-f', 'null', '-']);
    const h3Seed = seeds({ mode: 'fresh', stages: ['h3'], previous: {}, domains: { h3: { min: '0', max: '18446744073709551615' } } }).h3!;
    const videoBase = { song: { path: songPath, sha256: createHash('sha256').update(await readFile(songPath)).digest('hex') },
      plan: { ...planVideo({ startFrame: 0, endFrame: 48, songSamples: Number(audio.duration_ts), sampleRate: 48000,
        supportedFrameCounts: [5, 22, 39, 56], requestedIntervalSeconds: { start: '0', end: '2' } }) },
      seed: h3Seed, prompt: 'A playful cinematic music video: a friendly chrome robot taps a rhythm beside a glowing synthesizer in a colorful workshop. One continuous slow camera move, warm orange and cool cyan lighting. Motion follows the provided music. No words or captions.' };
    const video = await perform(await submit('h3', videoBase)); expect(video.state).toBe('succeeded');
    const second = await perform(await submit('yue2', musicBase)); expect(second.state).toBe('succeeded');
    expect(second.assignedSeeds).toEqual(music.assignedSeeds); // Same-seed repeated native execution, not a simulated failed-call replay.
    await perform(await submit('yue2', { ...musicBase, sampling: { semantic: { min_tokens: 450, max_tokens: 5000 } } }), true);
    await perform(await submit('h3', videoBase), true);
  } finally {
    try {
      if (activeAttempt) q.cancelAttempt(activeAttempt);
      if (active) await active;
      await writeFile(join(root, 'evidence.json'), JSON.stringify({ projectId, scope: 'real native helper lane', baselineOwners,
        transitions, observations, calls: q.list(), recipes: Object.fromEntries(recipes), heldLease: q.heldLease() }, null, 2));
    } finally { process.off('SIGTERM', interrupt); process.off('SIGINT', interrupt); q.close(); }
  }
});
