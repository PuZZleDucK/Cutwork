/** Supervised slice-1 provider experiment through the actual shared GPU lane. */
import { hostname, homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { providerLaunch, providerModels } from '../apps/server/src/providers/launch.ts';
import { runProvider } from '../apps/server/src/providers/run.ts';
import { seeds } from '../apps/server/src/generation/seeds.ts';
import type { Intent, Provider } from '../packages/core/src/contracts/generation.ts';
import { startNativeCoordinator } from '../apps/server/src/http/native-coordinator.ts';
import { createSystemdGpuAdapter } from '../apps/server/src/jobs/systemd-gpu.ts';
import { validateNativeSubmission, resolveNativeCommand } from '../apps/server/src/generation/native-command.ts';
import { GpuQueueError } from '../apps/server/src/jobs/gpu-queue.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

export function providerOutcomeState(succeeded: boolean, receiptState: string) {
  if (receiptState === 'exited' && succeeded) return 'provider-exited-awaiting-independent-validation';
  if (receiptState === 'failed' && !succeeded) return 'provider-failed';
  return 'reconciling'; // Unknown/inconsistent outcomes never prove an exit.
}

export function mediaProofRoot(env: NodeJS.ProcessEnv, home: string) {
  const root = env.STUDIO_DATA_ROOT ?? join(env.XDG_DATA_HOME ?? join(home, '.local/share'), 'music-video-studio');
  if (!isAbsolute(root)) throw new Error('An absolute studio data root is required');
  return resolve(root);
}

/** Reads guidance and allocates fresh intent only. No writes/processes/providers. */
export async function mediaProofPlan(root: string, source: string, provider: Provider) {
  if (!isAbsolute(root) || !isAbsolute(source)) throw new Error('Absolute runtime/source paths are required');
  if (provider !== 'codex' && provider !== 'claude') throw new Error('Choose codex or claude');
  const projectId = `provider-media-${provider}`;
  const attemptId = randomUUID();
  const native = { musicAttemptId: randomUUID(), h3AttemptId: randomUUID() };
  const domain63 = { min: '0', max: '9223372036854775807' };
  const allocated = seeds({ mode: 'fresh', stages: ['abc', 'semantic', 'nar', 'h3'], previous: {},
    domains: { abc: domain63, semantic: domain63, nar: domain63,
      h3: { min: '0', max: '18446744073709551615' } } });
  const intent: Intent = { projectId, attemptId, songId: native.musicAttemptId,
    provider, model: providerModels[provider],
    musicPrompt: 'Make a short original programming jingle: 90s French electronica flavour with dubstep beats. Playful, optimistic, and catchy; aim for roughly 15–25 seconds. Write a few original English lyric lines about turning code into music.',
    lyrics: '', style: 'A charming miniature futuristic workshop, polished handmade robots, warm amber and cool cyan lighting, cinematic but playful.',
    clipPrompt: 'Make the opening two seconds show a little robot bringing a homemade music machine to life in time with the song. Choose the action, framing and camera movement yourself. No titles or captions.',
    startFrame: 0, endFrame: 48, seeds: allocated };
  const launch = providerLaunch(root, intent);
  // The service launch puts the product-pinned CLI directory first on PATH;
  // runProvider retains the ordinary inherited environment/configuration.
  const paths = {
    requestDirectory: join(root, 'projects', projectId, 'proof-inputs', attemptId),
    musicRequest: join(launch.runDirectory, 'music-request.json'),
    musicReceipt: join(root, 'projects', projectId, 'runs', native.musicAttemptId, 'receipt.json'),
    videoRequest: join(launch.runDirectory, 'video-request.json'),
    videoReceipt: join(root, 'projects', projectId, 'runs', native.h3AttemptId, 'receipt.json'),
    exportPath: join(launch.runDirectory, 'validation-export.mp4'),
  };
  const guidance = await Promise.all(['README.md', 'music.md', 'video.md'].map(async name => {
    const sourcePath = `integrations/knowledge/${name}`;
    const bytes = await readFile(join(source, sourcePath));
    return { name, sourcePath, sha256: hash(bytes), text: bytes.toString('utf8') };
  }));
  launch.stdin += '\n\n' + [
    'This is a supervised sequential proof of the real creative-agent path. The studio UI is not ready yet. An actual local native-call coordinator is running at http://127.0.0.1:9122 and owns the durable shared GPU queue and registered helper cancellation. Perform the actual tool work, not merely propose a plan.',
    `Integration source root: ${source}\nSTUDIO_DATA_ROOT: ${root}\nPinned Node: ${join(root, 'tools/runtime/node-v24.22.0-linux-x64/bin/node')}\nYuE2 Python: ${join(root, 'tools/yue2/venv/bin/python')}`,
    'Use your normal tools, research, relevant context and script/score editing. These paths organize evidence; they do not restrict your filesystem or tool access. The tools and weights are already installed; ordinary generation should not require changing those installations.',
    `Captured native IDs: ${JSON.stringify(native)}\nEvidence/output paths: ${JSON.stringify(paths, null, 2)}`,
    'Generate one fresh song candidate, then one real H3 clip conditioned on that NEW song, then the validation export. This task is not asking for an automatic variation/retry loop. If a call fails, preserve it and explain the failure instead of silently substituting a model or synthetic media.',
    'For the supplied YuE2 helper, select abc/semantic/nar seeds from the assigned map as applicable to your chosen planning mode. Use h3 only for H3. Keep decimal strings exact. Write the resolved native requests before running them. The music request attemptId is musicAttemptId; the H3 request attemptId is h3AttemptId and its projectId is the captured project.',
    `Music tool: write the native request to musicRequest, then run ${join(root, 'tools/runtime/node-v24.22.0-linux-x64/bin/node')} ${join(source, 'scripts/native-call.ts')} http://127.0.0.1:9122 ${projectId} ${attemptId} yue2 <musicRequest>. This submits once and waits for the queue's terminal state. The server runs integrations/yue2/generate.py in isolated Python and writes musicReceipt. Save the client output; inspect the actual native receipt and artifacts. You may write your own orchestrating script and research the native API as needed. Preserve all native settings/score/stage evidence.`,
    'Inspect both truncation flags. Do not copy the earlier 500-token probe ceiling as a duration control. Aim for a short complete composition; record any chosen sampling limit. If truncated, retain the artifact and disclose it rather than fading/cutting it to disguise an incomplete composition.',
    'The coordinator holds the shared GPU lease until owned process and CUDA release are observed. A succeeded helper receipt is not sufficient: wait for the native-call client to return succeeded too. Failed/cancelled/reconciling state must remain explicit; do not bypass a held queue or automatically retry. The H3 proof lock alone is NOT a cross-tool scheduler. Do not stop unrelated GPU applications.',
    `For the video request, import planVideo from ${join(source, 'packages/core/src/time/video-plan.ts')} in your Node script. Supply startFrame:0, endFrame:48, actual 48000-Hz song sample count, sampleRate:48000, supportedFrameCounts:[5,22,39,56], requestedIntervalSeconds:{start:'0',end:'2'}. Do not use the standalone h3-proof-request.ts, which would allocate a different project and seed. Capture the song path/SHA256 and your final prompt text.`,
    `Video tool: ${join(root, 'tools/runtime/node-v24.22.0-linux-x64/bin/node')} ${join(source, 'scripts/native-call.ts')} http://127.0.0.1:9122 ${projectId} ${attemptId} h3 <videoRequest>. The server runs the real H3 helper in its owned native unit with a private Comfy port, not --fixture. Wait for coordinator success and inspect videoReceipt. It preserves all 56 frames but the initial placement uses only frames 1–48.`,
    'Create an ordinary FFmpeg validation export at exportPath: original song audio by default, the first 48 original PNG frames placed at time zero, black frames for the rest of the song. Duration in frames is max(48, ceil(actual song duration * 24)). Encode H.264/yuv420p at 640x480/24fps with AAC 48kHz stereo; silence-pad only any fractional final-frame audio tail. No looping the clip, fades, normalization, mastering or H3 audio replacement. This intentionally sparse validation movie is not a completed music video.',
    'Keep the exact export script/argument list and probe/decode results. Report generated file paths, any truncation/failure, and whether you actually watched/listened. A playable file is not a listening-quality claim. Finish naturally; no JSON answer schema is required. We independently inspect native session identity, receipts and media after you finish.',
    ...guidance.map(g => `Product guidance ${g.sourcePath}; SHA256 ${g.sha256}:\n\n${g.text}`),
  ].join('\n\n');
  return { schemaVersion: 1, intent, native, paths, guidance, launch };
}

async function main() {
  const [provider, flag, ...extra] = process.argv.slice(2);
  if ((provider !== 'codex' && provider !== 'claude') || (flag !== undefined && flag !== '--run') || extra.length) {
    throw new Error('Usage: node scripts/provider-media-proof.ts <codex|claude> [--run]');
  }
  if (flag === '--run' && (process.env.STUDIO_LIVE !== '1' || hostname().split('.')[0] !== 'dundee' || process.versions.node.split('.')[0] !== '24')) {
    throw new Error('STUDIO_LIVE=1 on Dundee with Node 24 is required; real provider credits/GPU/media will be used.');
  }
  const root = mediaProofRoot(process.env, homedir());
  const source = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const plan = await mediaProofPlan(root, source, provider);
  console.log(`Provider: ${provider}/${plan.intent.model}\nProject: ${plan.intent.projectId}\nAttempt: ${plan.intent.attemptId}\nNative attempts: ${JSON.stringify(plan.native)}\nInputs: ${plan.paths.requestDirectory}\nOutputs: ${plan.launch.runDirectory}`);
  if (flag !== '--run') {
    console.log('Plan only. No files written, provider started or generation submitted. Use --run explicitly.');
    return;
  }
  const gpuUuid = process.env.STUDIO_GPU_UUID;
  if (!gpuUuid || !/^GPU-[0-9a-f-]{36}$/.test(gpuUuid)) throw new Error('STUDIO_GPU_UUID must identify the actual verified Dundee GPU');
  await mkdir(join(root, 'projects', plan.intent.projectId, 'proof-inputs'), { recursive: true, mode: 0o700 });
  await mkdir(plan.paths.requestDirectory, { mode: 0o700 });
  const save = (name: string, value: unknown) => writeFile(join(plan.paths.requestDirectory, name),
    JSON.stringify(value, null, 2)+'\n', { flag: 'wx', mode: 0o600 });
  await save('captured-plan.json', plan);
  for (const g of plan.guidance) await writeFile(join(plan.paths.requestDirectory, g.name), g.text, { flag: 'wx', mode: 0o600 });
  await save('launch-source.json', { path: fileURLToPath(import.meta.url), sha256: hash(await readFile(fileURLToPath(import.meta.url))) });
  // runProvider owns creation of the distinct run directory; the captured inputs
  // above exist before launch, without pre-creating/overwriting its receipt path.
  await mkdir(join(root, 'jobs'), { recursive: true, mode: 0o700 });
  const adapter = createSystemdGpuAdapter({ runRoot: join(root, 'jobs/native-units'), node: process.execPath,
    supervisor: join(source, 'scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds: 3600,
    gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpuUuid], timeoutMs: 15000, cleanupTimeoutMs: 2000, maxOutputBytes: 1024 * 1024 },
    resolveCommand: call => resolveNativeCommand({ runtime: root, source, call }),
  });
  const coordinator = await startNativeCoordinator({ database: join(root, 'jobs/gpu-queue.sqlite'), adapter,
    host: '127.0.0.1', port: 9122, allowedHosts: ['127.0.0.1:9122', 'localhost:9122'],
    hasAttempt: id => id === plan.intent.attemptId,
    validateSubmission(call) {
      validateNativeSubmission(call);
      if (call.attemptId !== plan.intent.attemptId || call.projectId !== plan.intent.projectId ||
        call.id !== (call.tool === 'yue2' ? plan.native.musicAttemptId : plan.native.h3AttemptId)) {
        throw new GpuQueueError('GPU_QUEUE_INPUT', 'Call does not match this proof parent/intent');
      }
    },
  });
  try {
    const outcome = await runProvider(plan.launch);
    const nativeReceipt = JSON.parse(await readFile(outcome.receiptPath, 'utf8')) as { state: string };
    const state = providerOutcomeState(outcome.succeeded, nativeReceipt.state);
    await save('provider-outcome.json', { ...outcome,
      state, providerReceiptState: nativeReceipt.state,
      boundary: 'CLI result only. Native artifacts, session/model identity, media and resource release require independent inspection.' });
    console.log(`Provider outcome: ${state}. Independent verification is still required. Evidence: ${plan.paths.requestDirectory}`);
    if (state !== 'provider-exited-awaiting-independent-validation') process.exitCode ||= 1;
  } catch (error) {
    await save('launch-failure.json', { error: String(error), boundary: 'Inspect owned work; no automatic retry or global cleanup.' });
    throw error;
  } finally { await coordinator.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
