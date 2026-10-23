import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { join, isAbsolute, resolve, relative } from 'node:path';
import { providerModels } from '../providers/launch.ts';
import type { GpuQueue, MaintenanceLease } from '../jobs/gpu-queue-contract.ts';
import { createSetupAdapter, type SetupReadiness } from './setup.ts';
import { prepareMusicTask, runMusicTask } from './music.ts';
import { prepareVideoTask, runVideoTask } from './video.ts';
import { runStudioRender } from './render.ts';
import type { RenderPlan } from './render-contract.ts';
import { StudioStoreError } from './store.ts';
import type { StudioStore } from './store-contract.ts';
import type { StudioRuntime } from './runtime-contract.ts';
import type { MusicInput, Provider, ProviderStatus, SetupJob, ToolId, StudioRender } from '../../../../packages/core/src/contracts/studio.ts';

interface RuntimeOptions {
 store: StudioStore; queue: GpuQueue; runtime: string; source: string; origin: string;
 setupAdapter?: Omit<ReturnType<typeof createSetupAdapter>, 'close'> & { close?(): void | Promise<void> };
 prepareMusic?: typeof prepareMusicTask; runMusic?: typeof runMusicTask;
 prepareVideo?: typeof prepareVideoTask; runVideo?: typeof runVideoTask; runRender?: typeof runStudioRender; pollMs?: number; nativeRuntimeLimitSeconds?: number;
}
const ids: ToolId[] = ['agent', 'yue2', 'comfyui', 'h3', 'analysis'];
const active = ['preparing', 'waiting_gpu', 'running', 'validating'];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 12_000);
const cleanupUncertain = (text: string) => /cleanup.*unconfirmed|cleanup could not be confirmed/i.test(text);
const maintenanceTool = (id: ToolId) => id === 'yue2' ? 'yue2' as const : id === 'h3' || id === 'comfyui' ? 'h3' as const : null;

/** Server-owned scheduling. Browser connections have no ownership of work.
 * Readiness checks are cached, not executed by polling. No background installs,
 * automatic replay of interrupted work, or stopping unrelated host services. */
export function createStudioRuntime(options: RuntimeOptions): StudioRuntime & { start(): Promise<void>; close(): Promise<void> } {
 const { store, queue, runtime, source, origin } = options;
 const adapter = options.setupAdapter ?? createSetupAdapter({ runtime, source });
 const prepareMusic = options.prepareMusic ?? prepareMusicTask, runMusic = options.runMusic ?? runMusicTask;
 const prepareVideo = options.prepareVideo ?? prepareVideoTask, runVideo = options.runVideo ?? runVideoTask, runRender = options.runRender ?? runStudioRender;
 const pollMs = options.pollMs ?? 500;
 const nativeRuntimeLimitSeconds = options.nativeRuntimeLimitSeconds ?? 3600;
 if (!Number.isSafeInteger(nativeRuntimeLimitSeconds) || nativeRuntimeLimitSeconds < 1) throw new Error('Invalid native runtime limit');
 const controller = new AbortController();
 if (!Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > 10_000) throw new Error('Invalid studio poll interval');
 const providers = new Map<Provider, ProviderStatus>();
 const providerChecks = new Map<Provider, number>();
 const checking = new Set<Promise<ProviderStatus>>();
 const captures = new Map<string, Promise<void>>();
 const renderChecks = new Set<Promise<StudioRender>>();
 let started = false, stopped = false, initial: Promise<void> | undefined, running: Promise<void> | undefined, renderRunning: Promise<void> | undefined;
 let timer: NodeJS.Timeout | undefined, closing: Promise<void> | undefined, fault: string | null = null;
 function unknown(provider: Provider): ProviderStatus {
  return { provider, model: providerModels[provider], installed: false, auth: 'unknown', detail: 'Checking the pinned CLI and server sign-in.', signInCommand: '' };
 }
 function applyProvider(status: ProviderStatus) {
  providers.set(status.provider, status);
  if (store.provider() === status.provider) {
   const current = store.tool('agent');
   if (!['queued', 'installing', 'reconciling'].includes(current.state)) store.patchTool('agent', { installed: status.installed,
    state: status.installed && status.auth === 'signed-in' ? 'ready' : status.installed ? 'error' : 'missing', detail: status.detail, checkedAt: new Date().toISOString() });
  }
  return status;
 }
 function check(provider: Provider): Promise<ProviderStatus> {
  const sequence = (providerChecks.get(provider) ?? 0) + 1; providerChecks.set(provider, sequence);
  const promise = (async () => {
   let result: ProviderStatus;
   try { result = await adapter.checkProvider(provider); }
   catch (error) { result = { ...unknown(provider), detail: `Provider check failed: ${message(error)}` }; }
   // A late observation cannot replace a more recently requested auth check.
   return providerChecks.get(provider) === sequence ? applyProvider(result) : result;
  })();
  checking.add(promise); void promise.then(() => checking.delete(promise), () => checking.delete(promise)); return promise;
 }
 function applyReadiness(id: ToolId, result: SetupReadiness) {
  store.patchTool(id, { installed: result.installed, state: result.ready ? 'ready' : result.installed ? 'error' : 'missing',
   detail: result.detail, checkedAt: new Date().toISOString(), active: false });
 }
 function reconcileTool(id: ToolId, detail: string) { store.patchTool(id, { state: 'reconciling', detail, active: false }); }
 async function probe(id: ToolId) {
  if (id === 'agent') { const p = await check(store.provider()); return { installed: p.installed, ready: p.installed && p.auth === 'signed-in', detail: p.detail }; }
  return adapter.probe(id, store.provider());
 }
 async function initialChecks() {
  store.markInterrupted();
  // Songs are committed before optional CPU analysis. A crash in that interval
  // must not leave an eternal pending badge or silently rerun analysis on boot.
  for (const project of store.listProjects()) {
   for (const song of store.project(project.id).songs) if (song.analysis.state === 'pending') {
    store.setAnalysis(song.id, { ...song.analysis, state: 'failed',
     error: 'Audio analysis was interrupted by a server restart. The original song remains available; analysis was not automatically rerun.' });
   }
  }
  store.patchTool('analysis', { active: false });
  for (const attempt of store.attempts()) if (attempt.state === 'queued' && !attempt.details.planPath && !captures.has(attempt.id)) {
   store.patchAttempt(attempt.id, { state: 'failed', stage: 'Task capture was interrupted before dispatch; submit a new request', error: 'No complete captured task was recorded before server restart' });
  }
  for (const attempt of store.videoAttempts()) if (attempt.state === 'queued' && !attempt.details.planPath && !captures.has(attempt.id)) {
   store.patchVideoAttempt(attempt.id, { state: 'failed', stage: 'Task capture was interrupted before dispatch; submit a new request', error: 'No complete captured task was recorded before server restart' });
  }
  for (const id of ids) {
   if (stopped) break;
   if (store.tool(id).state === 'reconciling') continue;
   const tool = maintenanceTool(id); let lease: MaintenanceLease | null = null;
   if (tool) {
    if (queue.heldLease()) { reconcileTool(id, 'An existing native lease requires reconciliation before setup verification.'); continue; }
    lease = queue.acquireMaintenance(tool);
    if (!lease) { reconcileTool(id, 'A retained setup maintenance lease requires reconciliation.'); continue; }
   }
   try {
    const prior = store.tool(id); const queued = prior.state === 'queued';
    if (!queued) store.patchTool(id, { state: 'checking', detail: 'Verifying the managed installation; no model generation.' });
    const result = await probe(id);
    if (cleanupUncertain(result.detail)) { lease = null; reconcileTool(id, result.detail); continue; }
    // Do not overwrite a request queued while this background check was running.
    if (store.tool(id).state !== 'queued') applyReadiness(id, result);
   } catch (error) {
    const detail = message(error);
    if (cleanupUncertain(detail)) { lease = null; reconcileTool(id, detail); }
    else if (store.tool(id).state !== 'queued') store.patchTool(id, { state: 'error', detail, checkedAt: new Date().toISOString() });
   }
   finally { if (lease) queue.releaseMaintenance(lease); }
  }
 }
 async function setupJob(job: SetupJob): Promise<boolean> {
  const tool = maintenanceTool(job.tool); let lease: MaintenanceLease | null = null;
  if (tool) {
   if (queue.heldLease()) return false;
   lease = queue.acquireMaintenance(tool); if (!lease) { store.patchSetup(job.id, 'reconciling', 'Retained maintenance lease requires reconciliation'); reconcileTool(job.tool, 'Retained maintenance lease requires reconciliation'); return true; }
  }
  const log = (text: string) => store.patchTool(job.tool, { log: (store.tool(job.tool).log + text).slice(-64_000) });
  let installDispatched = false;
  const defer = () => { store.patchSetup(job.id, 'queued'); store.patchTool(job.tool, { state: 'queued', active: false, detail: 'Queued; shutdown occurred before installation dispatch' }); };
  try {
   store.patchSetup(job.id, 'running'); store.patchTool(job.tool, { state: 'installing', active: true, detail: 'Checking prerequisites and installation…', log: '' });
   if (job.tool !== 'agent' && !store.tool('agent').installed) throw new Error('Agent runtime prerequisite is not installed. Retry agent setup first.');
   if (job.tool === 'h3' && store.tool('comfyui').state !== 'ready') throw new Error('ComfyUI prerequisite is not ready. Retry ComfyUI setup first.');
   let result = await probe(job.tool);
   if (cleanupUncertain(result.detail)) throw new Error(result.detail);
   if (stopped) { defer(); return true; }
   if (!result.ready && !(job.tool === 'agent' && result.installed)) { installDispatched = true; result = await adapter.install(job.tool, store.provider(), log); }
   if (cleanupUncertain(result.detail)) throw new Error(result.detail);
   if (stopped) { if (!installDispatched) { defer(); return true; } throw new Error('Setup stopped during server shutdown; verify before retrying'); }
   if (job.tool === 'agent') { const p = await check(store.provider()); result = { installed: p.installed, ready: p.installed && p.auth === 'signed-in', detail: p.detail }; }
   log(`${result.detail}\n`);
   if (!result.ready && !(job.tool === 'agent' && result.installed)) throw new Error(result.detail);
   store.patchSetup(job.id, 'succeeded'); applyReadiness(job.tool, result);
  } catch (error) {
   const text = message(error), uncertain = cleanupUncertain(text);
   if (uncertain) lease = null; // Retain ownership even if persistence/logging subsequently fails.
   if (stopped && !installDispatched && !uncertain) { defer(); return true; }
   store.patchSetup(job.id, uncertain ? 'reconciling' : 'failed', text);
   store.patchTool(job.tool, { state: uncertain ? 'reconciling' : 'error', detail: text, active: false }); log(`${text}\n`);
  } finally { if (lease) queue.releaseMaintenance(lease); }
  return true;
 }
 async function renderJob(job: StudioRender) {
  try {
   const { snapshot } = job, songAsset = store.asset(snapshot.song.assetId);
   if (!songAsset || songAsset.projectId !== job.projectId || songAsset.sha256 !== snapshot.song.sha256 || snapshot.song.sampleRate !== 48000 || snapshot.song.channels !== 2) throw new Error('Captured render song asset is unavailable or changed');
   const plan: RenderPlan = { schemaVersion: 1, projectId: job.projectId, songId: job.songId, revision: job.revision,
    song: { path: songAsset.path, sha256: songAsset.sha256, sampleCount: snapshot.song.sampleCount, sampleRate: 48000, channels: 2 },
    placements: snapshot.arrangement.placements.map(p => {
     const clip = snapshot.clips.find(c => c.id === p.clipId); if (!clip) throw new Error('Captured render clip is missing');
     return { ...p, frames: clip.rawFrames.map(f => { const asset = store.asset(f.assetId);
      if (!asset || asset.projectId !== job.projectId || asset.sha256 !== f.sha256) throw new Error('Captured render frame asset is unavailable or changed');
      return { path: asset.path, sha256: asset.sha256 }; }) };
    }) };
   if (stopped) return;
   store.patchRender(job.id, { state: 'running', stage: 'Rendering captured arrangement' });
   const result = await runRender({ runtime, renderId: job.id, plan, signal: controller.signal,
    onProgress: (frame, totalFrames) => store.patchRender(job.id, { stage: `Rendering frame ${frame} of ${totalFrames}`, details: { progress: { frame, totalFrames } } }) });
   store.finishRender(job.id, { assetId: randomUUID(), path: result.outputPath, sha256: result.sha256, frameCount: result.frameCount, planHash: result.planHash, receiptPath: result.receiptPath },
    { validationReceiptPath: result.receiptPath, bytes: result.bytes, sampleCount: result.sampleCount });
  } catch (error) {
   const text = message(error); store.patchRender(job.id, { state: cleanupUncertain(text) ? 'reconciling' : 'failed', stage: 'Render stopped', error: text });
  }
 }
 async function step() {
  if (stopped || fault || queue.heldLease()) return;
  // Unknown creative work may still use managed tools outside the native lane.
  const music = store.attempts(), videos = store.videoAttempts();
  if ([...music, ...videos].some(a => a.state === 'reconciling') || store.renders().some(r => r.state === 'reconciling')) return;
  const job = store.setupJobs().find(j => j.state === 'queued');
  if (job) { await setupJob(job); return; }
  const pending = [...music.map(attempt => ({ kind: 'music' as const, attempt })), ...videos.map(attempt => ({ kind: 'video' as const, attempt }))]
   .filter(v => v.attempt.state === 'queued' && typeof v.attempt.details.planPath === 'string').sort((a, b) => a.attempt.sequence - b.attempt.sequence);
  const next = pending[0];
  if (!next) return;
  const { attempt } = next, video = next.kind === 'video';
  const patch = video ? store.patchVideoAttempt.bind(store) : store.patchAttempt.bind(store);
  const read = () => video ? store.videoAttempt(attempt.id)! : store.attempt(attempt.id)!;
  patch(attempt.id, { state: 'preparing', stage: `Checking captured provider and ${video ? 'video' : 'music'} tool readiness` });
  try {
   const status = await check(attempt.provider);
   if (stopped) { patch(attempt.id, { state: 'queued', stage: 'Queued; shutdown occurred before provider dispatch' }); return; }
   if (!status.installed || status.auth !== 'signed-in') throw new Error('Captured provider needs server sign-in. Check its configuration before a new request.');
   if (video) {
    if (store.tool('comfyui').state !== 'ready' || store.tool('h3').state !== 'ready') throw new Error('ComfyUI and H3 must be ready before a new request.');
    await runVideo({ runtime, source, origin, attempt: store.videoAttempt(attempt.id)!, store, queue, signal: controller.signal });
   } else {
    if (store.tool('yue2').state !== 'ready') throw new Error('YuE2 is not ready. Complete or verify its setup before a new request.');
    await runMusic({ runtime, source, origin, attempt: store.attempt(attempt.id)!, store, queue, signal: controller.signal });
   }
  } catch (error) {
   const current = read();
   if (stopped && current.state === 'preparing') { patch(attempt.id, { state: 'queued', stage: 'Queued; shutdown occurred before provider dispatch' }); return; }
   if (!['succeeded', 'failed', 'reconciling'].includes(current.state)) patch(attempt.id, {
    state: current.state === 'preparing' ? 'failed' : 'reconciling', stage: 'Generation stopped', error: message(error) });
   else if (current.state === 'succeeded') process.stderr.write(`Media retained; post-ingestion error: ${message(error)}\n`);
  }
 }
 function wakeRender() {
  if (!started || stopped || fault || renderRunning) return;
  const attempts = [...store.attempts(), ...store.videoAttempts()];
  if (attempts.some(a => a.state === 'reconciling') || store.renders().some(r => r.state === 'reconciling')) return;
  const lease = queue.heldLease(), held = lease ? queue.get(lease.callId) : null;
  if (lease && (!held || held.state === 'reconciling' || !attempts.some(a => a.id === held.attemptId && active.includes(a.state)))) return;
  const job = store.renders().find(r => r.state === 'queued'); if (!job) return;
  renderRunning = renderJob(job).catch(error => { fault = message(error); process.stderr.write(`Studio renderer stopped: ${fault}\n`); }).finally(() => { renderRunning = undefined; });
 }
 async function cachedRenderValid(render: StudioRender): Promise<boolean> {
  try {
   const asset = render.assetId ? store.asset(render.assetId) : null;
   if (!asset || asset.projectId !== render.projectId || asset.sha256 !== render.sha256 || asset.mediaType !== 'video/mp4') return false;
   const root = join(runtime, 'projects', render.projectId), rel = relative(root, asset.path);
   if (!isAbsolute(asset.path) || resolve(asset.path) !== asset.path || !rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel) || await realpath(asset.path) !== asset.path || !(await stat(asset.path)).isFile()) return false;
   const hash = createHash('sha256');
   for await (const chunk of createReadStream(asset.path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]) })) hash.update(chunk);
   return hash.digest('hex') === render.sha256;
  } catch (error) { if (stopped) throw error; return false; }
 }
 function wake() {
  wakeRender();
  if (!started || stopped || running || fault) return;
  running = step().catch(error => { fault = message(error); process.stderr.write(`Studio scheduler stopped: ${fault}\n`); }).finally(() => { running = undefined; });
 }
 function assertOpen() { if (stopped) throw new StudioStoreError(409, 'STUDIO_STOPPING', 'The studio is shutting down. Retry after it restarts.'); }
 return {
  start() {
   if (initial) return initial;
   initial = initialChecks().then(() => { if (!stopped) { started = true; timer = setInterval(wake, pollMs); wake(); } });
   return initial;
  },
  overview() {
   const attempts = [...store.attempts(), ...store.videoAttempts()], native = queue.list(), tools = store.tools().map(t => {
    if (t.id === 'agent') return { ...t, active: t.active || attempts.some(a => active.includes(a.state)), queued: attempts.filter(a => a.state === 'queued').length };
    if (t.id === 'yue2' || t.id === 'h3' || t.id === 'comfyui') {
     // H3 runs through the owned ComfyUI service; both indicators describe the
     // same native lane, not additional jobs or pre-agent reservations.
     const nativeTool = t.id === 'comfyui' ? 'h3' : t.id;
     return { ...t, active: t.active || native.some(c => c.tool === nativeTool && ['leased', 'launching', 'running', 'cancel_requested'].includes(c.state)), queued: native.filter(c => c.tool === nativeTool && c.state === 'queued').length };
    }
    return t;
   });
   const warnings = ['Trusted LAN only: anyone who can access this studio can run full-access creative agents on the server.',
    'Models share one GPU lane. Other resident applications can exhaust RAM or VRAM; the studio never stops unrelated services.',
    `Each native generation is bounded to ${nativeRuntimeLimitSeconds} seconds; a job exceeding this limit is stopped, not silently retried.`];
   if (queue.heldLease() && !attempts.some(a => active.includes(a.state))) warnings.push('An existing native lease blocks new dispatch until reconciliation.');
   if (attempts.some(a => a.state === 'reconciling') || tools.some(t => t.state === 'reconciling') || store.renders().some(r => r.state === 'reconciling')) warnings.push('Interrupted work requires reconciliation; it is not automatically replayed.');
   if (fault) warnings.push('Studio scheduler stopped after an internal error. Inspect the server log before recovery.');
   return { projects: store.listProjects(), selectedProjectId: store.selectedProject(), provider: providers.get(store.provider()) ?? unknown(store.provider()), tools, warnings };
  },
  async selectProvider(provider) { assertOpen(); store.setProvider(provider); return check(provider); },
  checkProvider() { assertOpen(); return check(store.provider()); },
  setup(tool) {
   assertOpen(); const plan: ToolId[] = tool === 'all' ? [...ids] : [];
   if (tool !== 'all') {
    if (tool !== 'agent' && !store.tool('agent').installed) plan.push('agent');
    if (tool === 'h3' && store.tool('comfyui').state !== 'ready') plan.push('comfyui');
    plan.push(tool);
   }
   // Enqueue synchronously as one group; the timer cannot interleave dependencies.
   return plan.map(id => store.enqueueSetup(id));
  },
  async submitMusic(projectId: string, idempotencyKey: string, input: MusicInput) {
   assertOpen(); const attempt = store.submitMusic(projectId, idempotencyKey, input);
   if (attempt.state !== 'queued' || attempt.details.planPath) return attempt;
   let capture = captures.get(attempt.id);
   if (!capture) {
    capture = (async () => {
     try { const result = await prepareMusic({ runtime, source, origin, attempt }); store.patchAttempt(attempt.id, { details: { ...attempt.details, ...result }, stage: 'Queued; immutable task captured' }); }
     catch (error) { store.patchAttempt(attempt.id, { state: 'failed', stage: 'Could not capture generation task', error: message(error) }); }
    })();
    captures.set(attempt.id, capture);
   }
   await capture; captures.delete(attempt.id); return store.attempt(attempt.id)!;
  },
  async submitVideo(projectId, idempotencyKey, input) {
   assertOpen(); const attempt = store.submitVideo(projectId, idempotencyKey, input);
   if (attempt.state !== 'queued' || attempt.details.planPath) return attempt;
   let capture = captures.get(attempt.id);
   if (!capture) {
    capture = (async () => {
     try { const result = await prepareVideo({ runtime, source, origin, attempt, store }); store.patchVideoAttempt(attempt.id, { details: { ...attempt.details, ...result }, stage: 'Queued; immutable video task captured' }); }
     catch (error) { store.patchVideoAttempt(attempt.id, { state: 'failed', stage: 'Could not capture video task', error: message(error) }); }
    })(); captures.set(attempt.id, capture);
   }
   await capture; captures.delete(attempt.id); return store.videoAttempt(attempt.id)!;
  },
  render(projectId, songId, revision, idempotencyKey) {
   assertOpen();
   const work = (async () => {
    for (const previous of store.renders().filter(r => r.projectId === projectId && r.songId === songId && r.revision === revision && r.state === 'succeeded')) {
     if (!await cachedRenderValid(previous)) store.invalidateRenderCache(previous.id);
    }
    assertOpen(); const result = store.enqueueRender(projectId, songId, revision, idempotencyKey);
    // Cover a success racing the first scan and exact idempotency replay of an
    // invalid old artifact; never rewrite its historical successful record.
    if (result.state === 'succeeded' && !await cachedRenderValid(result)) {
     store.invalidateRenderCache(result.id);
     throw new StudioStoreError(409, 'STUDIO_RENDER_UNAVAILABLE', 'The previously rendered file is missing or changed. Request a new render with a new idempotency key.');
    }
    return result;
   })();
   renderChecks.add(work); void work.then(() => renderChecks.delete(work), () => renderChecks.delete(work)); return work;
  },
  close() {
   if (closing) return closing;
   stopped = true; controller.abort(new Error('Studio is shutting down')); if (timer) clearInterval(timer);
   // Abort owned setup/check work now, before awaiting a potentially blocked probe.
   let adapterClosed: Promise<void>;
   try { adapterClosed = Promise.resolve(adapter.close?.()); } catch (error) { adapterClosed = Promise.reject(error); }
   return closing = (async () => {
    const results = await Promise.allSettled([adapterClosed, initial, ...captures.values(), running, renderRunning, ...renderChecks, ...checking]);
    const failed = results.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
   })();
  },
 };
}
