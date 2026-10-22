/** Real opt-in Comfy CPU lifecycle only. Tests, not this helper, assert job outcomes. */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, rename, lstat, readdir, open, copyFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { hostname } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { observeProcess } from '../../apps/server/src/providers/run.ts';
import { createOwnedComfyTransport } from '../../apps/server/src/jobs/comfy-http.ts';
import type { ProcessOwner } from '../../apps/server/src/jobs/native-control.ts';
import type { CpuFixture } from './comfy-cpu-contract.ts';
import { assertNoInheritedComfyConfig, createCpuRunGuard } from './comfy-cpu-guards.ts';

const runGuard = createCpuRunGuard();

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const errorText = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);
const requireFact = (value: unknown, message: string) => { if (!value) throw new Error(message); };
async function privateDirectory(path: string) {
  const info = await lstat(path);
  requireFact(info.isDirectory() && !info.isSymbolicLink(), `Missing or linked product directory: ${path}`);
}
async function unusedPort(): Promise<number> {
  const listener = createServer();
  try {
    listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string' || address.port < 1024 || address.port === 8188) throw new Error('Invalid fixture port');
    return address.port;
  } finally { if (listener.listening) await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve())); }
}
async function groupMembers(group: number, session: number): Promise<number[]> {
  const members: number[] = [];
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const text = await readFile(`/proc/${name}/stat`, 'utf8');
      const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (Number(fields[2]) === group && Number(fields[3]) === session) members.push(Number(name));
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  }
  return members;
}
async function waitForExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  const deadline = performance.now() + milliseconds;
  while (child.exitCode === null && child.signalCode === null && performance.now() < deadline) await wait(25);
  return child.exitCode !== null || child.signalCode !== null;
}

export async function createCpuFixture(input: { runtime: string; signal: AbortSignal }): Promise<CpuFixture> {
  if (process.env.STUDIO_CPU_COMFY !== '1' || hostname().split('.')[0] !== 'dundee' || Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('CPU Comfy fixture requires explicit opt-in and the Dundee Node 24 runtime');
  }
  const { runtime } = input;
  const signal = runGuard.signalFor(input.signal);
  if (!isAbsolute(runtime)) throw new Error('CPU fixture runtime must be absolute');
  signal.throwIfAborted();
  const tool = join(runtime, 'tools/comfyui');
  const recipeBytes = await readFile(new URL('../../integrations/comfyui/recipe.json', import.meta.url));
  const recipe = JSON.parse(recipeBytes.toString());
  const lock = await readFile(new URL('../../integrations/comfyui/requirements.lock', import.meta.url));
  const expectedMarker = [recipe.source.revision, recipe.python.sha256, sha(lock), sha(recipeBytes)].join(':');
  for (const path of [runtime, join(runtime, 'tools'), tool, join(tool, 'source'), join(tool, 'venv'), join(runtime, 'setup-jobs')]) await privateDirectory(path);
  await assertNoInheritedComfyConfig(join(tool, 'source'));
  for (const marker of ['.studio-recipe', '.studio-dependencies-ready', 'venv/.studio-recipe']) {
    requireFact((await readFile(join(tool, marker), 'utf8')).trim() === expectedMarker, `Comfy recipe mismatch: ${marker}`);
  }
  requireFact((await readFile(join(tool, 'source/.studio-archive-sha256'), 'utf8')).trim() === recipe.source.sha256, 'Source archive marker mismatch');
  const manifest = JSON.parse(await readFile(new URL('../fixtures/comfy-cpu-source-hashes.json', import.meta.url), 'utf8')) as {
    revision: string; archiveSha256: string; files: Record<string, string>;
  };
  requireFact(manifest.revision === recipe.source.revision && manifest.archiveSha256 === recipe.source.sha256, 'Source hash manifest pin mismatch');
  const sourceHashes: Record<string, string> = {};
  for (const [file, expected] of Object.entries(manifest.files)) {
    signal.throwIfAborted();
    sourceHashes[file] = sha(await readFile(join(tool, 'source', file)));
    requireFact(sourceHashes[file] === expected, `Critical source file mismatch: ${file}`);
  }
  const venvConfig = await readFile(join(tool, 'venv/pyvenv.cfg'), 'utf8');
  requireFact(/^include-system-site-packages\s*=\s*false\s*$/mi.test(venvConfig), 'Comfy must use its isolated Python environment');
  const fixtureSource = new URL('../fixtures/comfy-cpu-gate.py', import.meta.url);
  const fixtureHash = sha(await readFile(fixtureSource));
  signal.throwIfAborted();
  const directory = join(runtime, 'setup-jobs', `comfyui-cancellation.${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  const base = join(directory, 'comfy-base');
  await mkdir(base);
  for (const name of ['user', 'custom_nodes', 'models', 'input', 'output', 'temp']) await mkdir(join(base, name));
  for (const name of ['events', 'gates']) await mkdir(join(directory, name));
  const nodeDirectory = join(base, 'custom_nodes/studio_cpu_proof');
  await mkdir(nodeDirectory);
  await copyFile(fixtureSource, join(nodeDirectory, '__init__.py'));
  requireFact(sha(await readFile(join(nodeDirectory, '__init__.py'))) === fixtureHash, 'Staged fixture bytes changed');
  const port = await unusedPort();
  const command = [join(tool, 'venv/bin/python'), '-s', join(tool, 'source/main.py'), '--cpu', '--listen', '127.0.0.1',
    '--port', String(port), '--base-directory', base, '--user-directory', join(base, 'user'),
    '--disable-auto-launch', '--log-stdout'];
  const receipt: Record<string, unknown> = { state: 'prepared', command, sourceRevision: recipe.source.revision,
    sourceHashes, fixtureHash, recipeHash: sha(recipeBytes), lockHash: sha(lock),
    boundary: 'Owned CPU service and cooperative synthetic node; no model or GPU cancellation/resource-release proof' };
  async function save() {
    const temporary = join(directory, `${randomUUID()}.receipt.tmp`);
    await writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(directory, 'service-receipt.json'));
  }
  await save();
  const abort = new AbortController();
  const onAbort = () => abort.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  let child: ChildProcess | undefined, owner: ProcessOwner | undefined;
  let closePromise: Promise<{ ownedServiceExited: boolean; identityResolved: boolean }> | undefined;
  let spawnFailure: Error | undefined;
  let readyForCaller = false;
  const detachTermination = runGuard.attach(() => {
    // During startup let its catch own cleanup, after the child identity read
    // settles; racing cleanup against that read would lose ownership evidence.
    if (readyForCaller) void close().catch(error => { process.stderr.write(`CPU fixture cleanup: ${errorText(error)}\n`); });
  });
  function close() {
    return closePromise ??= (async () => {
      abort.abort(new Error('CPU fixture closing'));
      const signals: string[] = [];
      let identityResolved = true;
      try {
        if (child?.pid && owner) {
          for (const name of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
            if (child.exitCode !== null || child.signalCode !== null) break;
            let actual: ProcessOwner;
            try { actual = await observeProcess(owner.pid); }
            catch (error) {
              if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) {
                await waitForExit(child, 1000); break;
              }
              throw error;
            }
            requireFact(actual.pid === owner.pid && actual.group === owner.group && actual.start === owner.start && actual.boot === owner.boot,
              'Owned service identity changed; refusing signals');
            requireFact(owner.group === child.pid, 'Owned service is not its captured group leader');
            try { process.kill(-owner.group, name); signals.push(name); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
            if (await waitForExit(child, 5000)) break;
          }
        } else if (child?.pid && child.exitCode === null && child.signalCode === null) {
          throw new Error('Spawned service identity unresolved; refusing PID-only cleanup');
        }
        const gone = !child?.pid || child.exitCode !== null || child.signalCode !== null;
        requireFact(gone, 'Owned Comfy child did not exit');
        if (owner) requireFact((await groupMembers(owner.group, owner.pid)).length === 0, 'Owned service group still has members; reconciliation required');
        receipt.cleanup = { ownedServiceExited: true, identityResolved: true, signals,
          exitCode: child?.exitCode, signalCode: child?.signalCode };
        receipt.state = 'service-exited';
        return { ownedServiceExited: true, identityResolved: true };
      } catch (error) {
        identityResolved = false;
        receipt.cleanup = { ownedServiceExited: false, identityResolved, signals, error: errorText(error) };
        receipt.state = 'reconciling';
        throw error;
      } finally {
        detachTermination();
        signal.removeEventListener('abort', onAbort);
        await save();
      }
    })();
  }
  try {
    abort.signal.throwIfAborted();
    const log = await open(join(directory, 'service.log'), 'wx', 0o600);
    try {
      abort.signal.throwIfAborted();
      const env: NodeJS.ProcessEnv = { ...process.env, STUDIO_COMFY_CPU_PROOF_DIR: directory };
      delete env.PYTHONHOME; delete env.PYTHONPATH; // Native Python isolation, not agent tool restrictions.
      child = spawn(command[0]!, command.slice(1), { cwd: join(tool, 'source'), env, detached: true,
        stdio: ['ignore', log.fd, log.fd] });
      child.on('error', error => { spawnFailure = error; });
      if (!child.pid) throw new Error('Comfy child did not acquire a PID');
      owner = await observeProcess(child.pid);
      requireFact(owner.group === child.pid, 'Comfy child group identity mismatch');
      receipt.owner = owner; receipt.state = 'starting'; await save();
    } finally { await log.close(); }
    const config = { port, owner, requestTimeoutMs: 3000, maxResponseBytes: 2 * 1024 * 1024 };
    const transport = createOwnedComfyTransport(config);
    const deadline = performance.now() + 180_000;
    for (;;) {
      abort.signal.throwIfAborted();
      if (spawnFailure) throw spawnFailure;
      requireFact(child.exitCode === null && child.signalCode === null, 'Owned Comfy exited during startup');
      try {
        const stats = await transport.request({ method: 'GET', path: '/system_stats' }, abort.signal, (_status, body) => body) as {
          system: { comfyui_version: string; argv: string[] }; devices: Array<{ type: string }>;
        };
        requireFact(stats.system.comfyui_version === recipe.source.version, 'Native Comfy version mismatch');
        requireFact(JSON.stringify(stats.system.argv) === JSON.stringify(command.slice(2)), 'Native Comfy launch arguments mismatch');
        requireFact(stats.devices[0]?.type === 'cpu', 'Native service is not in CPU mode');
        await writeFile(join(directory, 'startup-stats.json'), JSON.stringify(stats, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        break;
      } catch (error) {
        abort.signal.throwIfAborted();
        // Retry startup connection refusal only. Identity/schema failures are
        // not readiness, and a POST is never performed by this startup loop.
        if ((error as { code?: string }).code !== 'COMFY_TRANSPORT' || performance.now() >= deadline) throw error;
        await wait(250, undefined, { signal: abort.signal });
      }
    }
    abort.signal.throwIfAborted();
    receipt.state = 'ready'; await save();
    abort.signal.throwIfAborted();
    readyForCaller = true;
    return { config, directory, command, sourceRevision: recipe.source.revision, signal: abort.signal, close };
  } catch (error) {
    receipt.startupError = errorText(error);
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], `CPU startup/cleanup failed; evidence: ${directory}`); }
    throw new Error(`CPU startup failed; evidence: ${directory}`, { cause: error });
  }
}
