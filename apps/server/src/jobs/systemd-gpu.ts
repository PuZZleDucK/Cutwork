import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir, link, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { GpuCall, Json } from './gpu-queue-contract.ts';
import type { NativeAdapter, NativeHandle, CleanupResult } from './gpu-worker.ts';
import { readNvidiaComputeSnapshot, type NvidiaQueryConfig } from './nvidia-query.ts';
import { settleGpuRelease } from './gpu-release-settling.ts';

export interface NativeCommand { executable: string; args: string[]; cwd: string; env: Record<string, string> }
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
const text = (s: unknown): s is string => typeof s === 'string' && !s.includes('\0');
export function validateCommand(value: unknown): NativeCommand {
  const c = value as NativeCommand | null;
  if (!c || !text(c.executable) || !isAbsolute(c.executable) || !text(c.cwd) || !isAbsolute(c.cwd) ||
    !Array.isArray(c.args) || !c.args.every(text) || !c.env || Array.isArray(c.env) ||
    Object.entries(c.env).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || !text(v))) throw new Error('Invalid native command');
  return structuredClone(c);
}
export function parseUnitProperties(raw: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const line of raw.trim().split('\n')) {
    const at = line.indexOf('=');
    if (at < 1 || Object.hasOwn(result, line.slice(0, at))) throw new Error('Invalid/duplicate unit property');
    result[line.slice(0, at)] = line.slice(at + 1);
  }
  return result;
}
export function isEmptyCgroup(raw: string): boolean {
  const matches = raw.trim().split('\n').filter(line => line.startsWith('populated '));
  if (matches.length !== 1 || !/^populated [01]$/.test(matches[0]!)) throw new Error('Invalid cgroup population evidence');
  return matches[0] === 'populated 0';
}
export function systemdLaunchArgs(unit: string, node: string, supervisor: string, plan: string, runtimeLimitSeconds: number): string[] {
  return ['--user', `--unit=${unit}`, '--quiet', '--expand-environment=no', '--property=Type=exec',
    '--property=RemainAfterExit=yes', '--property=KillMode=control-group', '--property=KillSignal=SIGTERM',
    '--property=TimeoutStopSec=10s', '--property=Restart=no', '--property=UMask=0077',
    `--property=RuntimeMaxSec=${runtimeLimitSeconds}s`,
    '--', node, supervisor, '--plan', plan];
}
const command = async (file: string, args: string[], timeout = 20000) => {
  const r = await promisify(execFile)(file, args, { timeout, maxBuffer: 1024 * 1024, encoding: 'utf8' });
  return r.stdout;
};
const show = async (unit: string) => parseUnitProperties(await command('/usr/bin/systemctl', ['--user', 'show', unit,
  '--property=Id,InvocationID,ControlGroup,MainPID,ActiveState,SubState,LoadState,Result,ExecMainStatus']));
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

/** Fixed local single-host implementation. Only supported helper invocations run
 * in these units; creative agents remain outside them with their normal powers.
 * The unit/cgroup owns ordinary descendants even when they start new sessions.
 * Deliberately migrating work to other units/hosts is unregistered work, not
 * covered by this adapter. No pid from an NVIDIA listing is ever signalled. */
export function createSystemdGpuAdapter(options: {
  runRoot: string;
  node: string;
  supervisor: string;
  /** Explicit native execution limit, captured in the launch plan. Caller must
   * show/configure this deadline; never infer a duration cap from clip length. */
  runtimeLimitSeconds: number;
  /** Post-stop NVML settling only; errors remain unknown. Default 30 seconds. */
  gpuReleaseTimeoutMs?: number;
  gpu: NvidiaQueryConfig;
  resolveCommand(call: GpuCall): Promise<NativeCommand>;
}): NativeAdapter {
  for (const p of [options.runRoot, options.node, options.supervisor]) if (!isAbsolute(p)) throw new Error('Adapter paths must be absolute');
  if (!Number.isSafeInteger(options.runtimeLimitSeconds) || options.runtimeLimitSeconds < 1 || options.runtimeLimitSeconds > 7 * 86400) {
    throw new Error('Expected an explicit native runtime limit between one second and seven days');
  }
  const gpuReleaseTimeoutMs = options.gpuReleaseTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(gpuReleaseTimeoutMs) || gpuReleaseTimeoutMs < 1 || gpuReleaseTimeoutMs > 2_147_483_647) {
    throw new Error('Expected a positive bounded GPU release settling deadline');
  }
  return {
    async prepare(call, signal) {
      signal.throwIfAborted();
      const cmd = validateCommand(await options.resolveCommand(call));
      signal.throwIfAborted();
      const id = randomUUID(), directory = join(options.runRoot, id), unit = `studio-gpu-${id}.service`;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const plan = { schemaVersion: 1, callId: call.id, attemptId: call.attemptId, directory, unit,
        command: { ...cmd }, gateToken: randomUUID(), runtimeLimitSeconds: options.runtimeLimitSeconds, gpuReleaseTimeoutMs,
        bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() };
      await writeFile(join(directory, 'plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
      return plan;
    },
    async launch(raw, context): Promise<NativeHandle> {
      const plan = raw as { directory: string; unit: string; gateToken: string; bootId: string; runtimeLimitSeconds: number; gpuReleaseTimeoutMs: number };
      const { directory, unit } = plan;
      const evidencePath = join(directory, 'release.json');
      // The queue has already committed this exact plan before starting a unit.
      await command('/usr/bin/systemd-run', systemdLaunchArgs(unit, options.node, options.supervisor, join(directory, 'plan.json'), plan.runtimeLimitSeconds));
      const executionDeadline = performance.now() + plan.runtimeLimitSeconds * 1000;
      let supervisor: { pid: number; group: number; session: number; startTicks: string; bootId: string; invocationId: string; unit: string } | undefined;
      const deadline = performance.now() + 10000;
      while (!supervisor && performance.now() < deadline) {
        try { supervisor = await json(join(directory, 'supervisor.json')); }
        catch (e) { if (!missing(e)) throw e; await delay(20); }
      }
      if (!supervisor) throw new Error(`Supervisor acknowledgement missing for ${unit}; launch gate stays closed`);
      const initial = await show(unit);
      if (initial.Id !== unit || initial.InvocationID !== supervisor.invocationId || !/^[a-f0-9]{32}$/.test(supervisor.invocationId) ||
        initial.MainPID !== String(supervisor.pid) || supervisor.bootId !== plan.bootId || supervisor.unit !== unit ||
        !initial.ControlGroup?.startsWith('/') || initial.ControlGroup.includes('..') || initial.ActiveState !== 'active') {
        throw new Error('Transient unit and supervisor identity do not agree; launch gate stays closed');
      }
      const controlGroup = initial.ControlGroup, cgroupPath = resolve('/sys/fs/cgroup', `.${controlGroup}`);
      const owner = { kind: 'systemd-unit', unit, invocationId: supervisor.invocationId, controlGroup,
        supervisor: { ...supervisor }, directory };
      context.recordOwner(owner);
      if (!context.signal.aborted) {
        const pendingGate = join(directory, 'go.pending.json');
        await writeFile(pendingGate, JSON.stringify({ token: plan.gateToken }), { flag: 'wx', mode: 0o600 });
        // link publishes a complete file atomically, and refuses replacement.
        // The supervisor must never observe partially written gate JSON.
        if (!context.signal.aborted) await link(pendingGate, join(directory, 'go.json'));
        await unlink(pendingGate);
      }
      const remembered = new Set<number>([supervisor.pid]);
      let stopped = false, stopPromise: Promise<void> | undefined;
      const actions: Json[] = [];
      async function samplePids(path = cgroupPath): Promise<void> {
        try {
          const raw = (await readFile(join(path, 'cgroup.procs'), 'utf8')).trim();
          for (const p of raw ? raw.split('\n') : []) {
            if (!/^[1-9]\d*$/.test(p) || !Number.isSafeInteger(Number(p))) throw new Error('Malformed cgroup PID');
            remembered.add(Number(p));
          }
          for (const entry of await readdir(path, { withFileTypes: true })) if (entry.isDirectory()) await samplePids(join(path, entry.name));
        } catch (e) { if (!missing(e)) throw e; }
      }
      async function sameUnit() {
        if ((await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== plan.bootId) throw new Error('Host boot identity changed');
        const s = await show(unit);
        if (s.Id !== unit || s.InvocationID !== owner.invocationId) throw new Error('Owned unit identity changed or disappeared before stop');
        return s;
      }
      const stop = () => stopPromise ??= (async () => {
        const before = await sameUnit(); await samplePids();
        actions.push({ kind: 'stop-requested', atUnixMs: Date.now(), before });
        // Unit name is unique and checked against the captured invocation. This
        // stops only this helper and its cgroup, not personal Comfy/GPU services.
        await command('/usr/bin/systemctl', ['--user', 'stop', unit], 20000);
        stopped = true;
        actions.push({ kind: 'stop-command-completed', atUnixMs: Date.now() });
      })();
      return {
        async wait() {
          while (!stopped) {
            if (performance.now() >= executionDeadline) {
              await stop();
              return { outcome: 'failed', result: { error: 'Configured native execution deadline exceeded', directory } };
            }
            await samplePids();
            try {
              const result = await json(join(directory, 'exit.json'));
              return { outcome: result.code === 0 && result.signal === null && !result.error ? 'succeeded' : 'failed', result: { ...result, directory } };
            } catch (e) { if (!missing(e)) throw e; }
            const s = await sameUnit();
            if (s.ActiveState === 'failed' || s.ActiveState === 'inactive') return { outcome: 'failed', result: { error: 'Supervisor exited without a terminal receipt', directory } };
            await delay(100);
          }
          return { outcome: 'failed', result: { stopped: true, directory } };
        },
        stop,
        async cleanup(): Promise<CleanupResult> {
          const evidence: { [key: string]: Json } = { owner, actions, evidencePath, scope: 'owned-local-systemd-cgroup',
            limitations: ['Unregistered work deliberately moved outside this cgroup is not covered.',
              'Direct host CUDA PID attribution only; MPS, GPU proxies and hidden PID namespaces are unsupported.'] };
          try {
            try { const native = await json(join(directory, 'native.json')); if (Number.isSafeInteger(native.pid) && native.pid > 0) remembered.add(native.pid); }
            catch (e) { if (!missing(e)) throw e; }
            await stop();
            const after = await show(unit); evidence.after = after;
            if (after.InvocationID && after.InvocationID !== owner.invocationId) throw new Error('Unit invocation changed after stop');
            if (after.LoadState !== 'not-found' && !['inactive', 'failed'].includes(after.ActiveState ?? '')) throw new Error('Owned unit is not inactive');
            async function empty(signal: AbortSignal) {
              try { return isEmptyCgroup(await readFile(join(cgroupPath, 'cgroup.events'), { encoding: 'utf8', signal })); }
              catch (e) { if (missing(e)) return true; throw e; }
            }
            evidence.rememberedPids = [...remembered].sort((a, b) => a - b);
            const settling = await settleGpuRelease({ rememberedPids: [...remembered], timeoutMs: plan.gpuReleaseTimeoutMs,
              pollMs: 250, cleanupTimeoutMs: options.gpu.cleanupTimeoutMs + 1000 }, {
              isCgroupEmpty: empty,
              query: (remainingMs, signal) => readNvidiaComputeSnapshot({ ...options.gpu,
                timeoutMs: Math.min(options.gpu.timeoutMs, remainingMs) }, signal),
            });
            evidence.gpuSettling = JSON.parse(JSON.stringify(settling));
            if (settling.state !== 'released') throw new Error(settling.reason ?? 'GPU release settling is uncertain');
            // Keep the final observation under the prior evidence field too.
            // Every earlier lingering row and raw command output remains above.
            evidence.gpu = JSON.parse(JSON.stringify(settling.observations.at(-1)!.gpu));
            evidence.cgroupEmptyBeforeAndAfterGpu = true; evidence.releasedUnixMs = Date.now();
            await writeFile(evidencePath, JSON.stringify(evidence, null, 2), { flag: 'wx', mode: 0o600 });
            return { state: 'released', evidence };
          } catch (e) {
            evidence.error = errText(e);
            await writeFile(evidencePath, JSON.stringify(evidence, null, 2), { flag: 'wx', mode: 0o600 });
            return { state: 'uncertain', reason: errText(e), evidence };
          } finally { stopped = true; }
        },
      };
    },
  };
}
