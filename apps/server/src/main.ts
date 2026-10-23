import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir, hostname, networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startNativeCoordinator } from './http/native-coordinator.ts';
import { createSystemdGpuAdapter } from './jobs/systemd-gpu.ts';
import { resolveNativeCommand } from './generation/native-command.ts';
import { openStudioStore } from './studio/store.ts';
import { createStudioRuntime } from './studio/runtime.ts';
import { createDebugManager, type DebugManager } from './studio/debug.ts';
import { createSetupAdapter } from './studio/setup.ts';
import { registerStudioApi } from './studio/api.ts';
import { reconcileStudioStartup, validateStudioNativeCall,studioNativeSource } from './studio/recovery.ts';

/** Developer launch entrypoint. Full fresh-host packaging remains a later slice.
 * Uses one user-owned server/queue; inherited credentials and creative-agent tools
 * remain normal. Never stops unrelated services or replaces host Python. */
const source = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
const dataRoot = resolve(process.env.STUDIO_DATA_ROOT ?? join(homedir(), '.local/share/music-video-studio'));
const port = Number(process.env.STUDIO_PORT ?? 9122), host = process.env.STUDIO_HOST ?? '0.0.0.0';
const nativeLimit = Number(process.env.STUDIO_NATIVE_LIMIT_SECONDS ?? 3600);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('STUDIO_PORT must be an unprivileged TCP port');
const manifest = JSON.parse(await readFile(join(source, 'integrations/tool-manifest.json'), 'utf8'));
const node = join(dataRoot, `tools/runtime/node-v${manifest.node.version}-linux-x64/bin/node`);
const cli = join(dataRoot, `tools/provider-cli/codex-${manifest.providers.codex.version}_claude-${manifest.providers.claude.version}/node_modules/.bin`);
// Preserve the normal service account environment, adding only our pinned CLIs.
process.env.PATH = `${dirname(node)}:${cli}:${process.env.PATH ?? ''}`;
const webRoot = join(source, 'dist/web');
if (!(await stat(join(webRoot, 'index.html'))).isFile()) throw new Error('Build the browser with npm run build before starting');
const gpuText = (await promisify(execFile)('/usr/bin/nvidia-smi', ['--query-gpu=uuid', '--format=csv,noheader,nounits'], { timeout: 15_000, maxBuffer: 64_000 })).stdout;
const inventory = gpuText.trim().split(/\r?\n/).map(v => v.trim());
const gpu = process.env.STUDIO_GPU_UUID ?? (inventory.length === 1 ? inventory[0] : undefined);
if (!gpu || !/^GPU-[a-f0-9-]{36}$/.test(gpu) || !inventory.includes(gpu)) throw new Error('Select an installed NVIDIA GPU with STUDIO_GPU_UUID');
const localNames = [hostname(), `${hostname().replace(/\.local$/, '')}.local`, 'localhost', '127.0.0.1', '[::1]',
 ...Object.values(networkInterfaces()).flatMap(rows => (rows ?? []).filter(r => r.family === 'IPv4').map(r => r.address))];
const allowedHosts = process.env.STUDIO_ALLOWED_HOSTS?.split(',').map(v => v.trim()) ?? [...new Set(localNames)].map(name => `${name}:${port}`);
await mkdir(join(dataRoot, 'jobs'), { recursive: true, mode: 0o700 });
const store = openStudioStore(join(dataRoot, 'studio.sqlite'));
const adapter = createSystemdGpuAdapter({ runRoot: join(dataRoot, 'jobs/native-units'), node,
 supervisor: join(source, 'scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds: nativeLimit,
 gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpu], timeoutMs: 15_000, cleanupTimeoutMs: 2000, maxOutputBytes: 1_048_576 },
 resolveCommand: async call => resolveNativeCommand({ runtime: dataRoot, source:await studioNativeSource(store,call,source), call }) });
let studio: ReturnType<typeof createStudioRuntime> | undefined;
let debug: DebugManager | undefined;
const debugChecks=createSetupAdapter({runtime:dataRoot,source});
try {
 const server = await startNativeCoordinator({ database: join(dataRoot, 'jobs/gpu-queue.sqlite'), adapter, host, port, allowedHosts,
  hasAttempt: id => store.attempt(id) !== null || store.videoAttempt(id) !== null,
  cancelAttempt: id => studio!.cancelAttempt(id),
  validateSubmission: call => validateStudioNativeCall(store, call, dataRoot),
  async configure(app, queue) {
   reconcileStudioStartup(store, queue);
   studio = createStudioRuntime({ store, queue, runtime: dataRoot, source, origin: `http://127.0.0.1:${port}`, nativeRuntimeLimitSeconds: nativeLimit, hasExternalMaintenance:()=>debug?.isBlocking()??false });
   debug=await createDebugManager({runtime:dataRoot,source,queue,
    context:tool=>({provider:store.provider(),tool:store.tool(tool),setupJob:store.setupJobs().find(j=>j.id===store.tool(tool).jobId)??null}),
    hasActiveWork:()=>studio!.hasActiveWork(),
    checkProvider:async provider=>studio!.applyProviderStatus(await debugChecks.checkProvider(provider)),
    probe:async(tool,provider)=>{
     if(tool!=='agent')return debugChecks.probe(tool,provider);
     const status=studio!.applyProviderStatus(await debugChecks.checkProvider(provider));
     return {installed:status.installed,ready:status.installed&&status.auth==='signed-in',detail:status.detail};
    },
    closeChecks:()=>debugChecks.close(),
    applyReadiness:(tool,result)=>store.patchTool(tool,{installed:result.installed,state:result.ready?'ready':result.installed?'error':'missing',detail:result.detail,checkedAt:new Date().toISOString(),active:false}),
    onRecord:record=>{
     if(['disclosed','cancelled','expired','stale'].includes(record.state))return;
     const readiness=record.outcome?.readiness,working=['confirmed','running','checking'].includes(record.state);
     store.patchTool(record.tool,{state:record.state==='reconciling'?'reconciling':working?'checking':readiness?.ready?'ready':'error',active:working,
      ...(readiness?{installed:readiness.installed,checkedAt:new Date().toISOString()}:{}),
      detail:working?`Confirmed Debug: ${record.state}. Shared work is paused.`:record.error??readiness?.detail??'Debug completed; inspect its report.',
      log:[record.error,record.outcome?.provider?.report,readiness?.detail,record.outcome?.boundary].filter(Boolean).join('\n\n')});
    },
   });
   await registerStudioApi(app, { store, runtime: studio, dataRoot, webRoot, debug });
  },
 });
 let stopping = false;
 async function stop() {
  if (stopping) return; stopping = true;
  // runProvider receives the same process signal and stops its owned CLI group.
  // Keep coordinator/DB alive while its registered client and native work drain.
  try { const results=await Promise.allSettled([studio!.close(),debug!.close()]); const failed=results.find(r=>r.status==='rejected'); if(failed?.status==='rejected')throw failed.reason; }
  catch (error) { console.error('Studio tasks need shutdown review:', error); process.exitCode = 1; }
  finally {
   try { await server.close(); }
   catch (error) { console.error('Native coordinator needs shutdown review:', error); process.exitCode = 1; }
   finally { store.close(); }
  }
 }
 process.on('SIGTERM', () => { void stop(); }); process.on('SIGINT', () => { void stop(); });
 console.log(JSON.stringify({ event: 'studio-listening', host, port, allowedHosts, dataRoot, nativeRuntimeLimitSeconds: nativeLimit,
  warning: 'Trusted LAN only. Full-access agents; no user accounts. Never expose to the public Internet.' }));
 void studio!.start().catch(error => { console.error('Studio initial checks failed:', error); });
} catch (error) { debugChecks.close(); await Promise.allSettled([studio?.close(),debug?.close()]); store.close(); throw error; }
