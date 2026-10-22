import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { Provider, ProviderStatus, ToolId } from '../../../../packages/core/src/contracts/studio.ts';

export interface SetupCommand { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; terminationGraceMs?: number; signal?: AbortSignal }
export interface SetupCommandResult { code: number; stdout: string; stderr: string }
export type SetupExecutor = (command: SetupCommand, onLog?: (text: string) => void) => Promise<SetupCommandResult>;
export interface SetupReadiness { installed: boolean; ready: boolean; detail: string }
interface SetupOptions { runtime: string; source: string; execute?: SetupExecutor; allocatePort?: () => Promise<number> }
interface Manifest { node: { version: string }; providers: Record<Provider, { version: string; model: string }> }
interface ModelManifest { models: { repository: string; revision: string; files: { path: string; bytes: number; sha256: string }[] }[] }
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/** Only owned recipe process groups are terminated, never services or GPU-listed PIDs. */
export const executeSetupCommand: SetupExecutor = (command, onLog) => new Promise((accept, reject) => {
  if (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs <= 0 || command.timeoutMs > 14_400_000) {
    reject(new Error('Invalid bounded setup command runtime')); return;
  }
  if (command.signal?.aborted) { reject(new Error('Setup command cancelled before launch')); return; }
  const grace = command.terminationGraceMs ?? 10_000;
  if (!Number.isSafeInteger(grace) || grace <= 0 || grace > 90_000) { reject(new Error('Invalid bounded setup termination grace')); return; }
  const child = spawn(command.executable, command.args, { cwd: command.cwd, env: command.env,
    stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: true });
  let stdout = '', stderr = '', stopKind: 'timeout' | 'cancelled' | null = null, closed = false, forced = false, failure: Error | undefined;
  let escalation: NodeJS.Timeout | undefined, drain: NodeJS.Timeout | undefined;
  const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
  const pending = { stdout: '', stderr: '' };
  function stop(signal: NodeJS.Signals) {
    if (child.pid) { try { process.kill(-child.pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failure ??= new Error('Owned setup process cleanup could not be confirmed'); } }
  }
  function endWithStop(kind: 'timeout' | 'cancelled') {
    if (stopKind || closed) return;
    stopKind = kind; stop('SIGTERM');
    escalation = setTimeout(() => { forced = true; stop('SIGKILL'); drain = setTimeout(() => reject(new Error('Setup command stopped waiting; owned process cleanup unconfirmed')), 2_000); }, grace);
  }
  const endWithTimeout = () => endWithStop('timeout');
  const onAbort = () => endWithStop('cancelled');
  command.signal?.addEventListener('abort', onAbort, { once: true });
  if (command.signal?.aborted) onAbort();
  const timer = setTimeout(endWithTimeout, command.timeoutMs);
  function emit(text: string) { if (text && onLog && !failure) { try { onLog(text); } catch { failure = new Error('Setup progress recording failed'); endWithTimeout(); } } }
  function output(which: 'stdout' | 'stderr', chunk: Buffer) {
    const text = decoders[which].write(chunk);
    if (which === 'stdout') stdout = (stdout + text).slice(-32_768); else stderr = (stderr + text).slice(-32_768);
    pending[which] += text;
    let end: number;
    while ((end = pending[which].indexOf('\n')) >= 0) { emit(pending[which].slice(0, end + 1)); pending[which] = pending[which].slice(end + 1); }
    if (pending[which].length > 4096) { emit(pending[which]); pending[which] = ''; }
  }
  child.stdout.on('data', (b: Buffer) => output('stdout', b)); child.stderr.on('data', (b: Buffer) => output('stderr', b));
  child.on('error', () => { failure ??= new Error('Setup executable could not be started'); });
  child.on('close', code => {
    closed = true; command.signal?.removeEventListener('abort', onAbort);
    clearTimeout(timer); if (escalation) clearTimeout(escalation); if (drain) clearTimeout(drain);
    for (const key of ['stdout', 'stderr'] as const) emit(pending[key] + decoders[key].end());
    if (forced) reject(new Error(`${failure?.message ?? 'Setup command forcibly terminated'}; owned descendant cleanup unconfirmed`));
    else if (failure) reject(failure); else if (stopKind === 'timeout') reject(new Error(`Setup command timed out after ${command.timeoutMs} ms`));
    else if (stopKind === 'cancelled') reject(new Error('Setup command cancelled; owned command exit observed'));
    else accept({ code: code ?? 1, stdout, stderr });
  });
});

// This is a native dependency probe, not an agent restriction. -I and private
// prefixes prevent host/user Python packages from disguising a broken install.
const ENV_PROBE = String.raw`
import hashlib, importlib, importlib.metadata, json, pathlib, re, subprocess, sys, urllib.parse
root, source, name = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
folder = 'audio-analysis' if name == 'analysis' else name
tool = root / 'tools' / folder
recipe_path = source / 'integrations' / name / 'recipe.json'
lock_path = recipe_path.with_name('requirements.lock')
recipe = json.loads(recipe_path.read_text())
expected = ':'.join(([recipe['source']['revision']] if name != 'analysis' else []) + [recipe['python']['sha256'], hashlib.sha256(lock_path.read_bytes()).hexdigest(), hashlib.sha256(recipe_path.read_bytes()).hexdigest()])
for directory in (tool, tool/'venv'):
    if directory.is_symlink() or not directory.is_dir(): raise RuntimeError('Missing or linked private tool environment')
    marker = directory/'.studio-recipe'
    if marker.is_symlink() or marker.read_text().strip() != expected: raise RuntimeError('Tool recipe marker mismatch')
prefix = (tool/'venv').resolve()
base = root/'tools/runtime'/recipe['python']['directory']
if pathlib.Path(sys.prefix).resolve() != prefix or pathlib.Path(sys.base_prefix).resolve() != base.resolve() or sys.prefix == sys.base_prefix: raise RuntimeError('Wrong isolated Python environment')
if '.'.join(map(str,sys.version_info[:3])) != recipe['python']['version']: raise RuntimeError('Python version mismatch')
if (base/'.studio-archive-sha256').read_text().strip() != recipe['python']['sha256']: raise RuntimeError('Interpreter ownership mismatch')
if 'include-system-site-packages = false' not in (prefix/'pyvenv.cfg').read_text().lower(): raise RuntimeError('Host site packages are enabled')
for path in sys.path:
    if ('site-packages' in path or 'dist-packages' in path) and not pathlib.Path(path).resolve().is_relative_to(prefix): raise RuntimeError('External Python packages on search path')
count = 0
for line in lock_path.read_text().splitlines():
    match = re.match(r'^([\w.-]+)==([^\s\\]+)',line)
    if match: package,version = match.groups()
    else:
        match = re.match(r'^([\w.-]+) @ (https://\S+)',line)
        if not match: continue
        package,url = match.groups(); version = urllib.parse.unquote(urllib.parse.urlsplit(url).path).rsplit('/',1)[1].split('-')[1]
    if importlib.metadata.version(package) != version: raise RuntimeError('Dependency pin mismatch: '+package)
    count += 1
if count < 3: raise RuntimeError('Incomplete dependency lock')
modules = {'yue2':['torch','transformers','numpy','soundfile','yue2'], 'comfyui':['torch','torchvision','transformers','av'], 'analysis':['librosa','numba','numpy','scipy','soundfile']}[name]
for name_to_import in modules:
    module = importlib.import_module(name_to_import)
    if not pathlib.Path(module.__file__).resolve().is_relative_to(prefix): raise RuntimeError('Module outside isolated environment')
if name == 'yue2':
    from yue2 import YuE2Pipeline
    if importlib.metadata.version(recipe['source']['package']) != recipe['source']['version']: raise RuntimeError('YuE2 source package pin mismatch')
if name == 'comfyui':
    if (tool/'.studio-dependencies-ready').read_text().strip() != expected: raise RuntimeError('Comfy dependency marker mismatch')
    if (tool/'source/.studio-archive-sha256').read_text().strip() != recipe['source']['sha256']: raise RuntimeError('Comfy source marker mismatch')
if name == 'analysis' and (tool/'.studio-analysis-ready').read_text().strip() != expected: raise RuntimeError('Analysis completion marker mismatch')
subprocess.run([sys.executable,'-I','-m','pip','--isolated','check'], check=True, timeout=120, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
print('Verified isolated Python, pinned dependencies and CPU imports; no model loading or GPU inference.')
`;
async function unusedPort() {
  return new Promise<number>((accept, reject) => {
    const server = createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => {
      const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => error ? reject(error) : accept(port));
    });
  });
}

/** Setup is host-wide; the caller serializes durable setup jobs separately from projects. */
export function createSetupAdapter({ runtime, source, execute = executeSetupCommand, allocatePort = unusedPort }: SetupOptions) {
  if (!isAbsolute(runtime) || !isAbsolute(source)) throw new Error('Setup runtime and source paths must be absolute');
  const controller = new AbortController();
  const ensureOpen = () => controller.signal.throwIfAborted();
  const modelCache = new Map<string, string>();
  async function pins(): Promise<Manifest> { ensureOpen(); return JSON.parse(await readFile(join(source, 'integrations/tool-manifest.json'), { encoding: 'utf8', signal: controller.signal })) as Manifest; }
  async function command(executable: string, args: string[], timeoutMs: number, log?: (text: string) => void, terminationGraceMs?: number) {
    const pin = await pins(); const nodeBin = join(runtime, `tools/runtime/node-v${pin.node.version}-linux-x64/bin`);
    const cliBin = join(runtime, `tools/provider-cli/codex-${pin.providers.codex.version}_claude-${pin.providers.claude.version}/node_modules/.bin`);
    ensureOpen();
    const result = await execute({ executable, args, cwd: source, timeoutMs, signal: controller.signal, ...(terminationGraceMs === undefined ? {} : { terminationGraceMs }),
      env: { ...process.env, STUDIO_DATA_ROOT: runtime, PATH: `${nodeBin}:${cliBin}:${process.env.PATH ?? ''}` } }, log);
    ensureOpen(); return result;
  }
  async function checked(executable: string, args: string[], timeoutMs: number, log?: (text: string) => void, terminationGraceMs?: number) {
    const result = await command(executable, args, timeoutMs, log, terminationGraceMs);
    if (result.code !== 0) throw new Error(`Setup check exited ${result.code}: ${(result.stderr || result.stdout || 'No diagnostic output').trim().slice(-1500)}`);
    return result;
  }
  async function checkProvider(provider: Provider): Promise<ProviderStatus> {
    const pin = await pins(); const info = pin.providers[provider];
    const signInCommand = `STUDIO_DATA_ROOT=${shellQuote(runtime)} ${shellQuote(join(source, 'scripts/provider.sh'))} ${provider === 'codex' ? 'codex login --device-auth' : 'claude auth login'}`;
    const status: ProviderStatus = { provider, model: info.model, installed: false, auth: 'unknown', detail: 'Pinned provider runtime is not installed or did not pass its version check.', signInCommand };
    const binary = join(runtime, `tools/provider-cli/codex-${pin.providers.codex.version}_claude-${pin.providers.claude.version}/node_modules/.bin`, provider);
    try {
      const node = await command(join(runtime, `tools/runtime/node-v${pin.node.version}-linux-x64/bin/node`), ['--version'], 30_000);
      if (node.code !== 0 || node.stdout.trim() !== `v${pin.node.version}`) return status;
      const version = await command(binary, ['--version'], 30_000);
      if (version.code !== 0 || version.stdout.trim() !== (provider === 'codex' ? `codex-cli ${info.version}` : `${info.version} (Claude Code)`)) return status;
      status.installed = true;
      const auth = await command(binary, provider === 'codex' ? ['login', 'status'] : ['auth', 'status'], 30_000);
      if (provider === 'codex') {
        const output = auth.stdout + '\n' + auth.stderr;
        if (auth.code === 0 && /Logged in using /i.test(output)) status.auth = 'signed-in';
        else if (auth.code !== 0 && /not logged in/i.test(output)) status.auth = 'sign-in-required';
      } else {
        let data: unknown; try { data = JSON.parse(auth.stdout); } catch { /* Unknown output never establishes auth. */ }
        if (data && typeof data === 'object' && 'loggedIn' in data) {
          if (auth.code === 0 && data.loggedIn === true) status.auth = 'signed-in';
          else if (data.loggedIn === false) status.auth = 'sign-in-required';
        }
      }
    } catch { /* Never expose native auth output, account identity, or credentials. */ }
    if (status.installed) status.detail = status.auth === 'signed-in'
      ? 'Pinned CLI is signed in. Model access is checked when a generation is requested.'
      : status.auth === 'sign-in-required' ? 'Sign in on the server using the displayed command, then check again.'
      : 'Pinned CLI is installed, but authentication could not be confirmed. Check sign-in on the server and retry.';
    return status;
  }
  async function nativeEnvironment(tool: 'yue2' | 'comfyui' | 'analysis', log?: (text: string) => void) {
    const folder = tool === 'analysis' ? 'audio-analysis' : tool;
    await checked(join(runtime, 'tools', folder, 'venv/bin/python'), ['-I', '-c', ENV_PROBE, runtime, source, tool], 240_000, log);
  }
  async function verifyModels(tool: 'yue2' | 'h3', log?: (text: string) => void) {
    ensureOpen();
    const manifestText = await readFile(join(source, 'integrations', tool, 'models.json'), { encoding: 'utf8', signal: controller.signal });
    const manifestHash = sha(manifestText), manifest = JSON.parse(manifestText) as ModelManifest;
    if (!Array.isArray(manifest.models) || !manifest.models.length) throw new Error('Empty model manifest');
    const repositories = tool === 'yue2' ? ['m-a-p/YuE2-3B', 'm-a-p/YuE2-Vae'] : ['Comfy-Org/MiniMax-H3', 'MiniMaxAI/MiniMax-H3'];
    for (const model of manifest.models) {
      ensureOpen();
      if (!repositories.includes(model.repository) || !/^[a-f0-9]{40}$/.test(model.revision) || !Array.isArray(model.files) || !model.files.length) throw new Error('Invalid model manifest identity');
      const directory = join(runtime, 'models', tool, model.repository.split('/')[1]!, model.revision);
      const marker = join(directory, '.studio-model-manifest');
      if (await realpath(directory) !== resolve(directory) || (await lstat(marker)).isSymbolicLink() || (await readFile(marker, 'utf8')).trim() !== manifestHash) throw new Error('Model manifest ownership mismatch');
      const seen = new Set<string>();
      for (const entry of model.files) {
        ensureOpen();
        if (typeof entry.path !== 'string' || !entry.path || entry.path.split('/').some(p => p === '.' || p === '..' || !p) || isAbsolute(entry.path) || seen.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) throw new Error('Invalid model manifest file');
        seen.add(entry.path); const file = join(directory, entry.path);
        if (await realpath(file) !== resolve(file)) throw new Error('Linked model file is not an owned installation');
        const info = await stat(file, { bigint: true });
        if (!info.isFile() || info.size !== BigInt(entry.bytes)) throw new Error(`Model file size mismatch: ${entry.path}`);
        const fingerprint = `${manifestHash}:${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
        if (modelCache.get(file) === fingerprint) continue;
        log?.(`Verifying ${tool} model checksum: ${entry.path}\n`);
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(file, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(900_000)]) })) digest.update(chunk);
        ensureOpen(); const after = await stat(file, { bigint: true });
        const afterFingerprint = `${manifestHash}:${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}:${after.ctimeNs}`;
        if (fingerprint !== afterFingerprint || digest.digest('hex') !== entry.sha256) throw new Error(`Model checksum mismatch or file changed during verification: ${entry.path}`);
        modelCache.set(file, fingerprint);
      }
    }
  }
  async function inspect(tool: ToolId, provider: Provider, log?: (text: string) => void): Promise<SetupReadiness> {
    ensureOpen();
    if (tool === 'agent') { const s = await checkProvider(provider); return { installed: s.installed, ready: s.auth === 'signed-in', detail: s.detail }; }
    let installed = false;
    try {
      await nativeEnvironment(tool === 'h3' ? 'comfyui' : tool, log); installed = true;
      if (tool === 'yue2' || tool === 'h3') await verifyModels(tool, log);
      if (tool === 'comfyui') {
        const port = await allocatePort(); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid CPU probe port');
        await mkdir(join(runtime, 'setup-jobs'), { recursive: true, mode: 0o700 });
        // The CPU probe owns a separate-session Comfy child. Preserve its
        // finally cleanup: up to 10 s network wait + 3 x 15 s child waits.
        // Killing the controller at the generic 10 s grace could orphan Comfy.
        await checked('/usr/bin/python3', ['-I', join(source, 'scripts/probe-comfyui-nodes.py'), '--run', '--port', String(port)], 300_000, log, 75_000);
      }
      if (tool === 'analysis') {
        await mkdir(join(runtime, 'setup-jobs'), { recursive: true, mode: 0o700 });
        await checked(join(runtime, 'tools/audio-analysis/venv/bin/python'), ['-I', join(source, 'integrations/analysis/probe.py'), '--prefix', join(runtime, 'tools/audio-analysis/venv'), '--output', join(runtime, 'setup-jobs', `studio-analysis-check.${randomUUID()}`)], 300_000, log);
      }
      ensureOpen();
      return { installed, ready: true, detail: tool === 'analysis' ? 'Isolated dependency pins, CPU analysis and native FFmpeg/ffprobe media checks passed.'
        : tool === 'comfyui' ? 'Isolated dependency pins and owned CPU service/node registration passed. No model loading or GPU generation was run.'
        : 'Isolated dependency pins/imports and model checksums passed. GPU capacity and generation are checked when used.' };
    } catch (error) {
      if (error instanceof Error && /cleanup.*unconfirmed|cleanup could not be confirmed/i.test(error.message)) throw error;
      return { installed, ready: false, detail: (error instanceof Error ? error.message : 'Readiness check failed').slice(0, 1800) };
    }
  }
  async function install(tool: ToolId, provider: Provider, onLog: (text: string) => void): Promise<SetupReadiness> {
    ensureOpen();
    const shell = async (name: string) => checked('/bin/bash', [join(source, 'scripts', name), '--install'], 14_400_000, onLog);
    const models = async (name: string) => checked('/usr/bin/python3', ['-I', '-u', join(source, 'scripts', name), '--install'], 14_400_000, onLog);
    onLog(`Starting ${tool} setup. Progress comes from real tool output; no estimated percentages.\n`);
    if (tool === 'agent') await shell('prepare-runtime.sh');
    else if (tool === 'yue2') { await shell('prepare-yue2.sh'); await models('prepare-yue2-models.py'); }
    else if (tool === 'comfyui') await shell('prepare-comfyui.sh');
    else if (tool === 'h3') await models('prepare-h3-models.py');
    else await shell('prepare-analysis.sh');
    const status = await inspect(tool, provider, onLog); ensureOpen(); onLog(`${status.detail}\n`); return status;
  }
  return { checkProvider, probe: (tool: ToolId, provider: Provider) => inspect(tool, provider), install,
    close() { controller.abort(new Error('Setup adapter is stopping; no further commands will start')); } };
}
