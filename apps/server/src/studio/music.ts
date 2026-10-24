import {MUSIC_CONTEXT,formatTaskContext,readProductGuidance} from './task-context-text.ts';
import {DEFAULT_AGENT_TEMPLATES,renderAgentTemplate} from '../../../../packages/core/src/contracts/prompt-templates.ts';
import assert from 'node:assert/strict';
import {captureExecutionSource,fileHash,verifyExecutionSource,type ExecutionSource} from './execution-snapshot.ts';
import {settleCancellation} from './cancellation.ts';
import {runReplayCall,type ReplayCall} from './replay.ts';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { providerLaunch } from '../providers/launch.ts';
import { runProvider, ProviderLaunchAbortedError, type ProviderLaunch } from '../providers/run.ts';
import type { GpuCall, GpuQueue } from '../jobs/gpu-queue-contract.ts';
import { executeSetupCommand, type SetupExecutor } from './setup.ts';
import type { StudioStore } from './store-contract.ts';
import type { MusicAttempt, SongAnalysis } from '../../../../packages/core/src/contracts/studio.ts';

interface MusicOptions { runtime: string; source: string; origin: string; attempt: MusicAttempt; signal?: AbortSignal }
interface RunOptions extends MusicOptions { store: StudioStore; queue: GpuQueue; signal?: AbortSignal }
export interface MusicTaskDependencies { provider?: typeof runProvider; execute?: SetupExecutor }
interface Guidance { name: string; sourcePath: string; sha256: string; text: string }
type CapturedAttempt = Pick<MusicAttempt, 'id' | 'nativeCallId' | 'projectId' | 'provider' | 'model' | 'input' | 'seeds' | 'promptTemplate'>;
export interface MusicPlan {
  executionSource?: ExecutionSource; replayCall?: ReplayCall;
  schemaVersion: 1; runtime: string; source: string; origin: string; attempt: CapturedAttempt;
  guidance: Guidance[]; launch: ProviderLaunch; helperSha256: string; modelManifestSha256: string;
  paths: { planPath: string; nativeRequest: string; nativeReceipt: string; agentRequest: string;
    analysisDirectory: string; analysisRequest: string; analysisReceipt: string; analysisId: string };
}
type RecordValue = Record<string, unknown>;
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 12_000);
const record = (v: unknown): RecordValue => { assert.ok(v && typeof v === 'object' && !Array.isArray(v), 'Expected an evidence object'); return v as RecordValue; };
// Legacy attempts may retain a project visual style in history. New music tasks
// capture only music inputs, without mutating that historical attempt.
const captured = (a: MusicAttempt): CapturedAttempt => structuredClone({ id: a.id, nativeCallId: a.nativeCallId,
  projectId: a.projectId, provider: a.provider, model: a.model,
  input: { musicPrompt: a.input.musicPrompt, lyrics: a.input.lyrics }, seeds: a.seeds, ...(a.promptTemplate?{promptTemplate:a.promptTemplate}:{}) });
const pendingAnalysis = (): SongAnalysis => ({ state: 'pending', estimatedBpm: null, sampleIndices: [], waveformBucketSamples: 0, peaks: [], error: null, version: null });
function validateOptions({ runtime, source, origin, attempt }: MusicOptions) {
  assert.ok(isAbsolute(runtime) && isAbsolute(source), 'Absolute runtime and source paths required');
  const url = new URL(origin);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Use the loopback studio HTTP origin');
  for (const id of [attempt.id, attempt.nativeCallId, attempt.projectId]) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(Object.keys(attempt.seeds).sort(), ['abc', 'nar', 'semantic']);
  for (const seed of Object.values(attempt.seeds)) assert.ok(/^(0|[1-9][0-9]*)$/.test(seed) && BigInt(seed) < 2n ** 63n);
  assert.equal(new Set(Object.values(attempt.seeds)).size, 3);
}
function planPath(options: MusicOptions) { return join(options.runtime, 'projects', options.attempt.projectId, 'inputs', options.attempt.id, 'captured-task.json'); }
/** Preserve Python's large JSON integers rather than silently rounding seed provenance. */
function parseNative(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
    if (typeof value === 'number' && (Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
      assert.ok(context?.source, 'Lossless native JSON parsing requires Node 24'); return context.source;
    }
    return value;
  });
}
async function json(path: string, maxBytes = 2_000_000): Promise<RecordValue> {
  assert.ok((await stat(path)).size <= maxBytes, 'Evidence JSON exceeds bounded reader limit');
  return record(parseNative(await readFile(path, 'utf8')));
}
async function shaFile(path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const digest = createHash('sha256'); for await (const chunk of createReadStream(path, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000) })) digest.update(chunk); return digest.digest('hex');
}
async function managedFile(root: string, path: string) {
  assert.ok(isAbsolute(path) && resolve(path) === path, 'Expected an absolute normalized artifact path');
  const rel = relative(root, path); assert.ok(rel && !rel.startsWith('../') && !isAbsolute(rel), 'Artifact must belong to the captured project');
  assert.equal(await realpath(path), path, 'Linked artifacts are not managed output files'); assert.ok((await stat(path)).isFile(), 'Artifact must be a regular file');
}
function detail(value: unknown, fullEvidencePath: string, maxBytes: number): unknown {
  const text = JSON.stringify(value); if (Buffer.byteLength(text) <= maxBytes) return value;
  return { fullEvidencePath, sha256: hash(text), bytes: Buffer.byteLength(text), truncated: true, preview: text.slice(0, Math.floor(maxBytes / 2)) };
}
async function outputTail(path: string) {
  const file = await open(path, 'r'); try {
    const size = (await file.stat()).size, length = Math.min(size, 32_768), buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length); return { text: buffer.toString('utf8'), sourcePath: path, truncated: size > length };
  } finally { await file.close(); }
}

/** The immutable task exists before dispatch; runProvider alone creates its run directory. */
export async function prepareMusicTask(options: MusicOptions): Promise<{ planPath: string; planSha256?: string }> {
  options.signal?.throwIfAborted();validateOptions(options); const { runtime, source, origin, attempt } = options;
  const pins = await json(join(source, 'integrations/tool-manifest.json'));
  const providers = record(pins.providers), codex = record(providers.codex), claude = record(providers.claude), node = record(pins.node);
  assert.equal(record(providers[attempt.provider]).model, attempt.model);
  const launch: ProviderLaunch = providerLaunch(runtime, { projectId: attempt.projectId, attemptId: attempt.id, songId: attempt.nativeCallId,
    provider: attempt.provider, model: attempt.model, musicPrompt: attempt.input.musicPrompt, lyrics: attempt.input.lyrics,
    style: '', clipPrompt: '', startFrame: 0, endFrame: 0, seeds: attempt.seeds });
  launch.executable = join(runtime, `tools/provider-cli/codex-${codex.version}_claude-${claude.version}/node_modules/.bin`, attempt.provider);
  const paths: MusicPlan['paths'] = { planPath: planPath(options), nativeRequest: join(runtime, 'projects', attempt.projectId, 'inputs/native-calls', attempt.nativeCallId, 'request.json'),
    nativeReceipt: join(runtime, 'projects', attempt.projectId, 'runs', attempt.nativeCallId, 'receipt.json'), agentRequest: join(launch.runDirectory, 'music-request.json'),
    analysisId: randomUUID(), analysisDirectory: '', analysisRequest: '', analysisReceipt: '' };
  paths.analysisDirectory = join(runtime, 'projects', attempt.projectId, 'analysis', paths.analysisId);
  paths.analysisRequest = join(paths.analysisDirectory, 'request.json'); paths.analysisReceipt = join(paths.analysisDirectory, 'receipt.json');
  const guidance = await readProductGuidance(source,'music');
  const nativeClient = [join(runtime, `tools/runtime/node-v${node.version}-linux-x64/bin/node`), join(source, 'scripts/native-call.ts'), origin, attempt.projectId, attempt.id, 'yue2', paths.agentRequest].map(quote).join(' ');
  launch.stdin = renderAgentTemplate(attempt.promptTemplate?.template??DEFAULT_AGENT_TEMPLATES.music,formatTaskContext(MUSIC_CONTEXT,{
    project_id:attempt.projectId,attempt_id:attempt.id,native_call_id:attempt.nativeCallId,provider_model:`${attempt.provider}/${attempt.model}`,
    music_description:attempt.input.musicPrompt,lyrics:attempt.input.lyrics,source_root:source,data_root:runtime,workspace:launch.cwd,run_directory:launch.runDirectory,
    stage_seeds_json:JSON.stringify(attempt.seeds),agent_request_path:paths.agentRequest,native_client_command:nativeClient,receipt_path:paths.nativeReceipt,
  },guidance));

  // Historical queued requests predate editable templates. Keep their original
  // prompt wording and order rather than applying a later global configuration.
  if (!attempt.promptTemplate) {
  launch.stdin = [
    'Create one fresh song candidate for this music-only studio task. Perform the tool work, not merely propose a plan. No automatic variations or silent retries are requested.',
    'Use your normal capabilities, tools, research, relevant project context, scripts and score editing. The project workspace organises artifacts; it is not a filesystem sandbox. Reply naturally; no JSON answer schema is required.',
    `Project: ${attempt.projectId}\nParent attempt: ${attempt.id}\nCaptured native YuE2 call ID: ${attempt.nativeCallId}\nProvider/model: ${attempt.provider}/${attempt.model}`,
    `Music description:\n${attempt.input.musicPrompt}\n\nOptional user lyrics (preserve supplied words):\n${attempt.input.lyrics}`,
    `Integration source: ${source}\nSTUDIO_DATA_ROOT: ${runtime}\nWorkspace: ${launch.cwd}\nRun directory: ${launch.runDirectory}`,
    `Assigned exact decimal stage seeds: ${JSON.stringify(attempt.seeds)}. With generated planning use abc, semantic and nar; with a supplied score/planning off use semantic and nar. Do not allocate replacements or round seeds.`,
    'Translate the creative brief into the native parameters and choose suitable score, sampling and execution settings. The provided generator guidance describes the native request, not an answer schema for you. Tools are already installed; ordinary generation should not require reinstalling them.',
    `Write the native request to ${paths.agentRequest}. It must have schemaVersion:1 and attemptId:${attempt.nativeCallId}. Submit it through the running studio coordinator using:\n${nativeClient}\nThe server captures the exact request and writes ${paths.nativeReceipt}. Save client output and inspect the actual receipt and stage artifacts.`,
    'This cooperative helper registers native work with the shared GPU queue. It waits for owned process and CUDA release; a helper receipt alone is insufficient. Wait for client state succeeded. If failed, cancelled or reconciling, retain the evidence and explain; do not bypass a held lease or stop unrelated applications.',
    'Do not use the earlier 500-token feasibility ceiling as duration control. Aim for a complete composition matching the brief; record your sampling limits. Inspect both truncation flags and disclose truncation instead of hiding it with trimming, fades or mastering.',
    'Keep the original 48 kHz stereo float WAV. The studio independently validates and analyses it. This task does not request video generation, export, normalization or audio replacement. Report output paths, assumptions, failures and whether you actually listened. A natural-language success claim is not a validation result.',
    ...guidance.map(g => `Product guidance ${g.sourcePath}; SHA256 ${g.sha256}:\n\n${g.text}`),
  ].join('\n\n');
  }
  const plan: MusicPlan = { schemaVersion: 1, runtime, source, origin, attempt: captured(attempt), guidance, launch, paths,
    helperSha256: await shaFile(join(source, 'integrations/yue2/generate.py')), modelManifestSha256: await shaFile(join(source, 'integrations/yue2/models.json')) };
  await mkdir(join(runtime, 'projects', attempt.projectId, 'inputs'), { recursive: true, mode: 0o700 });
  await mkdir(join(paths.planPath, '..'), { mode: 0o700 });
  plan.executionSource = await captureExecutionSource(source, join(paths.planPath, '..', 'execution-source'), 'yue2');
  assert.equal(await fileHash(join(plan.executionSource.root,'integrations/yue2/generate.py')),plan.helperSha256,'Helper changed during capture');
  assert.equal(await fileHash(join(plan.executionSource.root,'integrations/yue2/models.json')),plan.modelManifestSha256,'Model manifest changed during capture');
  await mkdir(launch.cwd, { recursive: true, mode: 0o700 });
  await writeFile(paths.planPath, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { planPath: paths.planPath, planSha256: await fileHash(paths.planPath) };
}

async function verifyRelease(call: GpuCall, queue: GpuQueue, runtime: string) {
  assert.notEqual(queue.heldLease()?.callId, call.id, 'Native GPU lease is still held');
  const owner = record(call.owner), release = record(call.release);
  assert.equal(owner.kind, 'systemd-unit'); assert.equal(typeof owner.directory, 'string');
  const directory = owner.directory as string;
  await managedFile(join(runtime, 'jobs/native-units'), join(directory, 'release.json'));
  assert.deepEqual(release.owner, owner); assert.equal(release.cgroupEmptyBeforeAndAfterGpu, true);
  assert.equal(record(release.gpuSettling).state, 'released');
  assert.ok(Array.isArray(release.rememberedPids) && Array.isArray(record(release.gpu).processes));
  for (const p of record(release.gpu).processes as unknown[]) assert.ok(!(release.rememberedPids as unknown[]).includes(record(p).pid), 'An owned CUDA PID remains');
  assert.deepEqual(await json(join(directory, 'release.json')), release);
  if (call.state === 'succeeded') {
    const result = record(call.result); assert.equal(result.code, 0); assert.equal(result.signal, null);
    const exit = await json(join(directory, 'exit.json')); assert.equal(exit.code, 0); assert.equal(exit.signal, null);
  }
}
async function verifySong(plan: MusicPlan, call: GpuCall, execute: SetupExecutor, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const { runtime, source, attempt, paths } = plan, project = join(runtime, 'projects', attempt.projectId);
  assert.equal(call.state, 'succeeded'); assert.equal(call.id, attempt.nativeCallId); assert.equal(call.attemptId, attempt.id); assert.equal(call.projectId, attempt.projectId); assert.equal(call.tool, 'yue2');
  const command = record(record(call.launch).command); assert.ok(Array.isArray(command.args));
  const argv = command.args as string[]; assert.equal(argv[argv.indexOf('--request') + 1], paths.nativeRequest); assert.equal(argv[argv.indexOf('--result') + 1], paths.nativeReceipt);
  await managedFile(project, paths.nativeRequest); await managedFile(project, paths.nativeReceipt);
  const request = await json(paths.nativeRequest), receipt = await json(paths.nativeReceipt);
  assert.deepEqual(request, call.request); assert.equal(request.attemptId, attempt.nativeCallId); assert.equal(request.schemaVersion, 1);
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.state, 'succeeded'); assert.equal(receipt.attemptId, attempt.nativeCallId);
  assert.equal(receipt.requestSha256, await shaFile(paths.nativeRequest, signal)); assert.equal(receipt.helperSha256, plan.helperSha256); assert.equal(receipt.modelManifestSha256, plan.modelManifestSha256);
  const parameters = record(request.parameters), stochastic = (parameters.cot ?? 'full') !== 'off' && parameters.abc == null;
  const names = stochastic ? ['abc', 'semantic', 'nar'] : ['semantic', 'nar'];
  const assigned = record(receipt.assignedSeeds); assert.deepEqual(Object.keys(assigned).sort(), [...names].sort()); assert.deepEqual(assigned, request.seeds);
  for (const stage of names) assert.equal(assigned[stage], attempt.seeds[stage], `Assigned ${stage} seed changed`);
  assert.ok(Array.isArray(receipt.calls)); const calls = receipt.calls.map(record);
  assert.deepEqual(calls.map(c => c.stage), ['load', stochastic ? 'abc' : 'provided-plan', 'semantic', 'nar', 'decode']);
  for (const c of calls) assert.equal(c.state, 'succeeded');
  for (const stage of names) assert.equal(calls.find(c => c.stage === stage)?.suppliedSeed, assigned[stage], `Actual ${stage} seed changed`);
  const artifacts = join(paths.nativeReceipt, '../receipt-artifacts'); assert.ok(Array.isArray(receipt.artifacts) && receipt.artifacts.length > 0);
  const seen = new Map<string, RecordValue>();
  for (const item of receipt.artifacts) {
    signal?.throwIfAborted(); const entry = record(item); assert.equal(typeof entry.path, 'string'); const name = entry.path as string;
    assert.ok(name && !isAbsolute(name) && !name.split('/').some(p => !p || p === '.' || p === '..') && !seen.has(name), 'Invalid artifact manifest path');
    assert.ok(Number.isSafeInteger(entry.bytes) && (entry.bytes as number) >= 0); assert.match(String(entry.sha256), /^[a-f0-9]{64}$/);
    const path = join(artifacts, name); await managedFile(artifacts, path); assert.equal((await stat(path)).size, entry.bytes, 'Artifact byte count changed'); assert.equal(await shaFile(path, signal), entry.sha256, 'Artifact checksum changed'); seen.set(name, entry);
  }
  for (const name of ['audio.wav', 'submitted-request.json', 'effective-config.json', 'abc-output/plan.json', 'semantic-input/plan.json', 'nar-input/plan.json']) assert.ok(seen.has(name), `Missing captured artifact: ${name}`);
  assert.equal(seen.get('submitted-request.json')!.sha256, receipt.requestSha256);
  for (const [folder, seed] of [['abc-output', assigned[stochastic ? 'abc' : 'semantic']], ['semantic-input', assigned.semantic], ['nar-input', assigned.nar]]) {
    const stagePlan = await json(join(artifacts, folder as string, 'plan.json')); assert.equal(String(record(stagePlan.request).seed), seed, 'Saved native stage seed changed');
  }
  const audio = record(receipt.audio), audioPath = join(artifacts, 'audio.wav'); assert.equal(audio.path, audioPath); assert.equal(audio.sampleRate, 48000); assert.equal(audio.channels, 2); assert.equal(audio.subtype, 'FLOAT');
  assert.ok(Number.isSafeInteger(audio.samples) && (audio.samples as number) > 0, 'Invalid source sample count');
  const exec = async (executable: string, args: string[]) => { const r = await execute({ executable, args, cwd: project, env: { ...process.env, STUDIO_DATA_ROOT: runtime }, timeoutMs: 300_000, ...(signal ? { signal } : {}) }); assert.equal(r.code, 0, `${executable} failed: ${r.stderr.slice(-2000)}`); return r; };
  const probe = record(parseNative((await exec('/usr/bin/ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', audioPath])).stdout)); assert.ok(Array.isArray(probe.streams));
  assert.equal(probe.streams.length, 1); const stream = record(probe.streams[0]); assert.equal(stream.codec_type, 'audio'); assert.equal(stream.codec_name, 'pcm_f32le'); assert.equal(stream.sample_rate, '48000'); assert.equal(stream.channels, 2);
  assert.equal(typeof stream.time_base, 'string'); const parts = (stream.time_base as string).split('/'); assert.equal(parts.length, 2);
  assert.ok(/^\d+$/.test(String(stream.duration_ts)) && parts.every(p => /^\d+$/.test(p)), 'Exact audio duration unavailable');
  const numerator = BigInt(String(stream.duration_ts)) * BigInt(parts[0]!) * 48000n, denominator = BigInt(parts[1]!);
  assert.ok(denominator > 0n && numerator % denominator === 0n); assert.equal(numerator / denominator, BigInt(audio.samples as number), 'Decoded duration differs from native sample count');
  await exec('/usr/bin/ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-threads', '1', '-i', audioPath, '-f', 'null', '-']);
  assert.equal(await shaFile(audioPath, signal), seen.get('audio.wav')!.sha256, 'Audio changed during validation');
  const truncated = record(receipt.truncated); assert.equal(typeof truncated.abc, 'boolean'); assert.equal(typeof truncated.semantic, 'boolean');
  return { audioPath, sha256: seen.get('audio.wav')!.sha256 as string, samples: audio.samples as number,
    truncated: truncated.abc === true || truncated.semantic === true, request, receipt, config: await json(join(artifacts, 'effective-config.json')) };
}

function mapAnalysis(result: RecordValue, plan: MusicPlan, audio: { audioPath: string; sha256: string; samples: number }): SongAnalysis {
  assert.equal(result.schemaVersion, 1); assert.equal(result.attemptId, plan.paths.analysisId);
  assert.ok(result.state === 'succeeded' || result.state === 'partial', 'Analysis did not succeed');
  const source = record(result.source); assert.equal(source.path, audio.audioPath); assert.equal(source.sha256, audio.sha256); assert.equal(source.sampleCount, String(audio.samples)); assert.equal(source.sampleRate, 48000); assert.equal(source.channels, 2);
  const waveform = record(result.waveform), beats = record(result.beats); assert.equal(waveform.bucketSamples, 512); assert.ok(Array.isArray(waveform.peaks));
  assert.equal(waveform.peaks.length, Math.ceil(audio.samples / 512)); for (const p of waveform.peaks) assert.ok(typeof p === 'number' && Number.isFinite(p) && p >= 0);
  assert.equal(typeof result.analysisVersion, 'string'); assert.ok((result.analysisVersion as string).length <= 1000);
  assert.ok(Array.isArray(beats.sampleIndices)); let previous = -1n;
  for (const s of beats.sampleIndices) { assert.ok(typeof s === 'string' && /^(0|[1-9][0-9]*)$/.test(s)); const value = BigInt(s); assert.ok(value > previous && value < BigInt(audio.samples)); previous = value; }
  if (result.state === 'succeeded') {
    assert.equal(beats.status, 'available'); assert.ok(typeof beats.estimatedBpm === 'number' && Number.isFinite(beats.estimatedBpm) && beats.estimatedBpm > 0); assert.ok(beats.sampleIndices.length >= 2);
  } else { assert.equal(beats.status, 'unavailable'); assert.equal(beats.estimatedBpm, null); assert.equal(beats.sampleIndices.length, 0); }
  return { state: result.state === 'succeeded' ? 'available' : 'partial', estimatedBpm: beats.estimatedBpm as number | null,
    sampleIndices: beats.sampleIndices as string[], waveformBucketSamples: 512, peaks: waveform.peaks as number[],
    error: result.state === 'partial' ? String(beats.reason ?? 'Beat estimates unavailable').slice(0, 16000) : null, version: result.analysisVersion as string };
}

/** Provider exit, native release, file evidence and full decoding all precede ingestion. */
export async function runMusicTask(options: RunOptions, dependencies: MusicTaskDependencies = {}): Promise<void> {
  const { store, queue, attempt, runtime, source, origin } = options, provider = dependencies.provider ?? runProvider, execute = dependencies.execute ?? executeSetupCommand;
  let dispatched = false, nativeDispatched = false, providerKnownStopped = false, ingested = false;
  let activePlan: MusicPlan | undefined;
  let details: RecordValue = { ...(store.attempt(attempt.id)?.details ?? {}), planPath: planPath(options) };
  try {
    options.signal?.throwIfAborted();
    validateOptions(options); const raw = await json(planPath(options)); const plan = raw as unknown as MusicPlan;
    activePlan = plan;
    if (attempt.details.planSha256) assert.equal(await fileHash(planPath(options)), attempt.details.planSha256, 'Captured task hash changed');
    if (plan.executionSource) await verifyExecutionSource(plan.executionSource);
    assert.equal(plan.schemaVersion, 1); assert.equal(plan.runtime, runtime); if (!plan.executionSource) assert.equal(plan.source, source); assert.equal(plan.origin, origin);
    const expectedAttempt = captured(attempt);
    // Already-prepared v1 tasks retain their exact historical inputs and prompt.
    // Compare the whole old input, including visual style, rather than stripping
    // it from either side and accidentally accepting changes after capture.
    if (Object.hasOwn(record(plan.attempt.input), 'style')) expectedAttempt.input = structuredClone(attempt.input);
    assert.deepEqual(plan.attempt, expectedAttempt);
    assert.equal(plan.paths.planPath, planPath(options)); assert.equal(plan.launch.cwd, join(runtime, 'projects', attempt.projectId, 'workspace'));
    assert.equal(plan.launch.runDirectory, join(plan.launch.cwd, 'runs', attempt.id));
    details = { ...details, guidance: plan.guidance.map(g => ({ name: g.name, sourcePath: g.sourcePath, sha256: g.sha256 })), capturedProvider: attempt.provider, capturedModel: attempt.model, seedEncoding: 'Exact decimal strings; unsafe native JSON integers retained from original lexical text', analysisReceiptPath: plan.paths.analysisReceipt };
    options.signal?.throwIfAborted();
    store.patchAttempt(attempt.id, { state: 'running', stage: plan.replayCall ? 'Replaying exact captured native song request' : 'Creative agent translating music brief', details });
    if (plan.replayCall) {
      nativeDispatched = true; providerKnownStopped = true;
      details.recovery = { ...plan.replayCall, providerInvoked: false };
      await runReplayCall({ plan: plan.replayCall, attempt, queue, ...(options.signal ? { signal: options.signal } : {}) });
    } else {
    dispatched = true; const outcome = await provider(plan.launch, options.signal ? { signal: options.signal } : {}); const receiptPath = join(plan.launch.runDirectory, 'provider-receipt.json');
    assert.equal(outcome.receiptPath, receiptPath); const providerReceipt = await json(receiptPath);
    providerKnownStopped = ['exited', 'failed'].includes(String(providerReceipt.state)) && (typeof providerReceipt.code === 'number' || typeof providerReceipt.signal === 'string');
    details.providerReceiptPath = receiptPath; details.providerOutcome = detail(providerReceipt, receiptPath, 40_000);
    details.providerFinalProse = await outputTail(join(plan.launch.runDirectory, 'provider.stdout.log'));
    store.patchAttempt(attempt.id, { state: 'validating', stage: 'Verifying native release and original song', details });
    assert.ok(outcome.succeeded && outcome.code === 0 && outcome.signal === null && outcome.inputDelivered, 'Creative provider did not complete successfully');
    assert.equal(providerReceipt.state, 'exited'); assert.equal(providerReceipt.succeeded, true); assert.equal(providerReceipt.code, 0); assert.equal(providerReceipt.inputDelivered, true);
    assert.equal(providerReceipt.executable, plan.launch.executable); assert.deepEqual(providerReceipt.argv, plan.launch.argv); assert.equal(providerReceipt.cwd, plan.launch.cwd);
    }
    options.signal?.throwIfAborted();
    const call = queue.get(attempt.nativeCallId); assert.ok(call, 'Provider completed without the registered native song call');
    await verifyRelease(call, queue, runtime);
    const audio = await verifySong(plan, call, execute, options.signal);
    details = { ...details, nativeCallId: call.id, nativeReceiptPath: plan.paths.nativeReceipt,
      nativeRequest: detail(audio.request, plan.paths.nativeRequest, 900_000), stageCalls: detail(audio.receipt.calls, plan.paths.nativeReceipt, 200_000),
      nativeReceipt: detail(audio.receipt, plan.paths.nativeReceipt, 200_000), effectiveSettings: detail(audio.config, join(audio.audioPath, '../effective-config.json'), 100_000),
      nativeReleasePath: join(String(record(call.owner).directory), 'release.json'), audioSha256: audio.sha256,
      boundary: 'Recorded native call, retained release evidence and original file decoding verified. Listening quality and musical beat accuracy require judgement.' };
    options.signal?.throwIfAborted();
    const song = store.finishMusic(attempt.id, { title: (attempt.input.musicPrompt.split(/\r?\n/).find(s => s.trim()) ?? 'Generated song').trim().slice(0, 240).replace(/[\uD800-\uDBFF]$/u, ''),
      assetId: randomUUID(), assetPath: audio.audioPath, sha256: audio.sha256, sampleCount: String(audio.samples), sampleRate: 48000, channels: 2,
      durationSeconds: audio.samples / 48000, truncated: audio.truncated, analysis: pendingAnalysis() }, details);
    ingested = true;
    // A valid song remains playable even when optional CPU analysis fails.
    try {
      await mkdir(join(plan.paths.analysisDirectory, '..'), { recursive: true, mode: 0o700 }); await mkdir(plan.paths.analysisDirectory, { mode: 0o700 });
      await writeFile(plan.paths.analysisRequest, JSON.stringify({ schemaVersion: 1, attemptId: plan.paths.analysisId, source: { path: audio.audioPath, sha256: audio.sha256 }, waveformBucketSamples: 512 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      store.patchTool('analysis', { active: true });
      const result = await execute({ executable: join(runtime, 'tools/audio-analysis/venv/bin/python'), args: ['-I', join(source, 'integrations/analysis/analyze.py'), '--request', plan.paths.analysisRequest, '--result', plan.paths.analysisReceipt],
        cwd: plan.launch.cwd, env: { ...process.env, STUDIO_DATA_ROOT: runtime }, timeoutMs: 600_000, ...(options.signal ? { signal: options.signal } : {}) });
      await writeFile(join(plan.paths.analysisDirectory, 'process.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      assert.equal(result.code, 0, `Audio analysis failed: ${(result.stderr || result.stdout).slice(-4000)}`);
      store.setAnalysis(song.id, mapAnalysis(await json(plan.paths.analysisReceipt, 8_000_000), plan, audio));
    } catch (error) { store.setAnalysis(song.id, { ...pendingAnalysis(), state: 'failed', error: message(error) }); }
    finally { store.patchTool('analysis', { active: false }); }
  } catch (error) {
    if (ingested) throw error; // Do not rewrite a committed song as failed.
    if (options.signal?.aborted && !dispatched && !nativeDispatched && !store.attempt(attempt.id)?.cancellation) {
      const current = store.attempt(attempt.id);
      if (current && !['succeeded', 'failed', 'reconciling'].includes(current.state)) store.patchAttempt(attempt.id, { state: 'queued', stage: 'Queued; studio stopped before provider dispatch', error: null, details });
      return;
    }
    if (error instanceof ProviderLaunchAbortedError) providerKnownStopped = true;
    if (dispatched && !providerKnownStopped && activePlan) {
      try {
        const path = join(activePlan.launch.runDirectory, 'provider-receipt.json'), receipt = await json(path);
        const cleanup = receipt.cleanup && typeof receipt.cleanup === 'object' ? record(receipt.cleanup) : {};
        providerKnownStopped = ['exited', 'failed'].includes(String(receipt.state)) && (typeof receipt.code === 'number' || typeof receipt.signal === 'string' || cleanup.cliStopped === true);
        details.providerReceiptPath = path; details.providerOutcome = detail(receipt, path, 40_000);
        details.providerFinalProse = await outputTail(join(activePlan.launch.runDirectory, 'provider.stdout.log'));
      } catch { /* Missing or incomplete provider evidence remains uncertain. */ }
    }
    if (store.attempt(attempt.id)?.cancellation) { await settleCancellation({store,queue,runtime,attemptId:attempt.id,providerStopped:!dispatched||providerKnownStopped,details}); return; }
    const call = queue.get(attempt.nativeCallId); let uncertain = dispatched && !providerKnownStopped;
    if (call) {
      if (!['succeeded', 'failed', 'cancelled'].includes(call.state) || queue.heldLease()?.callId === call.id) { uncertain = true; queue.cancelAttempt(attempt.id); }
      else if (call.owner !== null) { try { await verifyRelease(call, queue, runtime); } catch { uncertain = true; } }
      else if (call.state === 'succeeded' || !call.release || record(call.release).neverLaunched !== true) uncertain = true;
    }
    details.failure = message(error);
    const current = store.attempt(attempt.id);
    if (current && current.state !== 'succeeded' && current.state !== 'failed') store.patchAttempt(attempt.id, { state: uncertain ? 'reconciling' : 'failed',
      stage: uncertain ? 'Stopped progressing: native/provider cleanup requires reconciliation' : 'Generation failed', error: message(error), details });
  }
}
