/** Slice-1 internal integration entry point. Registered attempts are supplied
 * by the proof harness; the product's project/attempt store replaces that input
 * at the browser slice. This is not a finished studio UI or public agent API. */
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createSystemdGpuAdapter } from '../apps/server/src/jobs/systemd-gpu.ts';
import { startNativeCoordinator } from '../apps/server/src/http/native-coordinator.ts';
import { validateNativeSubmission, resolveNativeCommand } from '../apps/server/src/generation/native-command.ts';
import { GpuQueueError } from '../apps/server/src/jobs/gpu-queue.ts';

const { values } = parseArgs({ options: {
  runtime: { type: 'string' }, registry: { type: 'string' }, database: { type: 'string' },
  'gpu-uuid': { type: 'string' }, port: { type: 'string', default: '9122' },
  host: { type: 'string', default: '127.0.0.1' }, 'allowed-hosts': { type: 'string' },
  'runtime-limit-seconds': { type: 'string', default: '3600' },
} });
const runtime = values.runtime, registryPath = values.registry, database = values.database, gpuUuid = values['gpu-uuid'];
const port = Number(values.port), runtimeLimitSeconds = Number(values['runtime-limit-seconds']);
if (!runtime || !registryPath || !database || ![runtime, registryPath, database].every(isAbsolute) ||
  !gpuUuid || !/^GPU-[0-9a-f-]{36}$/.test(gpuUuid) || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Required: --runtime /absolute --registry /absolute/attempts.json --database /absolute/queue.sqlite --gpu-uuid GPU-uuid [--host 127.0.0.1 --port 9122 --allowed-hosts host:port,... --runtime-limit-seconds 3600]');
}
const registry: unknown = JSON.parse(await readFile(registryPath, 'utf8'));
type Parent = { id: string; projectId: string; tools: Array<'yue2' | 'h3'> };
if (!Array.isArray(registry) || registry.some(p => !p || typeof p.id !== 'string' || typeof p.projectId !== 'string' ||
  !Array.isArray(p.tools) || !p.tools.length || p.tools.some((t: unknown) => t !== 'yue2' && t !== 'h3')) ||
  new Set(registry.map(p => p.id)).size !== registry.length) throw new Error('Invalid explicit proof attempt registry');
const parents = new Map((registry as Parent[]).map(p => [p.id, p]));
const source = resolve(fileURLToPath(new URL('..', import.meta.url)));
await mkdir(runtime, { recursive: true, mode: 0o700 });
await mkdir(dirname(database), { recursive: true, mode: 0o700 });
const adapter = createSystemdGpuAdapter({ runRoot: join(runtime, 'jobs', 'native-units'), node: process.execPath,
  supervisor: join(source, 'scripts/native-gpu-supervisor.ts'), runtimeLimitSeconds,
  gpu: { executable: '/usr/bin/nvidia-smi', expectedGpuUuids: [gpuUuid], timeoutMs: 15000, cleanupTimeoutMs: 2000, maxOutputBytes: 1024 * 1024 },
  resolveCommand: call => resolveNativeCommand({ runtime, source, call }),
});
const coordinator = await startNativeCoordinator({ database, adapter, host: values.host!, port,
  allowedHosts: values['allowed-hosts']?.split(',') ?? [`127.0.0.1:${port}`, `localhost:${port}`],
  hasAttempt: id => parents.has(id), validateSubmission(call) {
    validateNativeSubmission(call);
    const parent = parents.get(call.attemptId);
    if (!parent || parent.projectId !== call.projectId || !parent.tools.includes(call.tool)) {
      throw new GpuQueueError('GPU_QUEUE_INPUT', 'Unknown or mismatched parent attempt');
    }
  },
});
console.log(`Internal native coordinator listening on ${values.host}:${port}; no studio UI yet. Native execution limit: ${runtimeLimitSeconds}s.`);
const stop = () => { void coordinator.close().catch(error => { console.error(error); process.exitCode = 1; }); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
