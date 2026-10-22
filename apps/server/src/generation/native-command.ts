import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createServer } from 'node:net';
import type { CallInput } from '../jobs/gpu-queue-contract.ts';
import type { NativeCommand } from '../jobs/systemd-gpu.ts';
import { GpuQueueError } from '../jobs/gpu-queue.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateNativeSubmission(call: CallInput): void {
  const r = call.request;
  if (!['yue2', 'h3'].includes(call.tool) || !uuid.test(call.id) || !uuid.test(call.attemptId) || !/^[A-Za-z0-9_-]+$/.test(call.projectId) ||
    !r || typeof r !== 'object' || Array.isArray(r) || r.schemaVersion !== 1 || r.attemptId !== call.id ||
    (call.tool === 'h3' && r.projectId !== call.projectId)) {
    throw new GpuQueueError('GPU_QUEUE_INPUT', 'Native request must retain the captured call/project identity and schema');
  }
}
async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  // This is a candidate, not an ownership guarantee. The helper still validates
  // its own service/endpoint and fails if another process acquires the port.
  return port;
}

/** Built-in cooperative helper path. Native JSON is the generator's input file,
 * never a required format for the creative agent's answer. Normal agent tools
 * and alternative scripts remain available. The API caller separately validates
 * that project/attempt parents exist before accepting this immutable call. */
export async function resolveNativeCommand(options: {
  runtime: string; source: string; call: CallInput; allocatePort?: () => Promise<number>;
}): Promise<NativeCommand> {
  const { runtime, source, call } = options;
  if (!isAbsolute(runtime) || !isAbsolute(source)) throw new Error('Runtime and source paths must be absolute');
  validateNativeSubmission(call);
  const port = call.tool === 'h3' ? await (options.allocatePort ?? allocatePort)() : null;
  if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error('Invalid owned-service port candidate');
  const project = join(runtime, 'projects', call.projectId), cwd = join(project, 'workspace');
  const requestDirectory = join(project, 'inputs', 'native-calls', call.id);
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  await mkdir(join(project, 'inputs', 'native-calls'), { recursive: true, mode: 0o700 });
  await mkdir(requestDirectory, { mode: 0o700 }); // no reuse, even a partial preparation
  const request = join(requestDirectory, 'request.json');
  await writeFile(request, JSON.stringify(call.request, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return {
    executable: call.tool === 'yue2' ? join(runtime, 'tools/yue2/venv/bin/python') : '/usr/bin/python3',
    args: ['-I', '-u', join(source, 'integrations', call.tool, 'generate.py'), '--request', request,
      ...(call.tool === 'yue2' ? ['--result', join(project, 'runs', call.id, 'receipt.json')]
        : ['--run', '--port', String(port), '--timeout-seconds', '3600'])],
    cwd, env: { STUDIO_DATA_ROOT: runtime },
  };
}
