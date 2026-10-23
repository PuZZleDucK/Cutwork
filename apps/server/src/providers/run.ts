import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, open, readFile, rename, writeFile, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import type { NativeOwner } from '../../../../packages/core/src/contracts/generation.ts';
import type { providerLaunch, ProviderSessionBinding } from './launch.ts';

// Old immutable captured tasks and ordinary fixture executables have no binding.
export type ProviderLaunch = Omit<ReturnType<typeof providerLaunch>, 'executable' | 'sessionBinding'> & { executable: string; sessionBinding?: ProviderSessionBinding };
export interface ProviderSession {
  provider: 'codex' | 'claude' | null;
  status: 'observed' | 'assigned' | 'unavailable';
  sessionId: string | null;
  source: 'native-stderr-header' | 'cli-argument' | null;
  detail: string;
  cliVersion?: string;
}
const sessionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sessionPrefixBytes = 65_536;
const unavailableCodex = (detail: string): ProviderSession => ({ provider: 'codex', status: 'unavailable', sessionId: null, source: 'native-stderr-header', detail });

/** Only the first native fenced header is evidence, never prompt/tool/reply prose. */
export function parseCodexSessionHeader(prefix: string, expected: { cwd: string; model: string }): ProviderSession {
  if (Buffer.byteLength(prefix, 'utf8') > sessionPrefixBytes) return unavailableCodex('Native header exceeds the bounded prefix');
  const lines = prefix.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/);
  const version = /^OpenAI Codex v([0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?)$/.exec(lines[0] ?? '')?.[1];
  if (!version || lines[1] !== '--------') return unavailableCodex('Initial native Codex header is unavailable; no later prose is searched');
  const closing = lines.indexOf('--------', 2);
  if (closing < 0 || closing > 64) return unavailableCodex('Native Codex header is incomplete or exceeds the header line bound');
  const fields = new Map<string, string>();
  for (const line of lines.slice(2, closing)) {
    const match = /^(workdir|model|session id): (.*)$/.exec(line);
    if (!match) continue;
    if (fields.has(match[1]!)) return unavailableCodex('Ambiguous repeated identity field in native Codex header');
    fields.set(match[1]!, match[2]!);
  }
  if (fields.get('workdir') !== expected.cwd || fields.get('model') !== expected.model) return unavailableCodex('Native header cwd/model does not match this captured launch');
  const id = fields.get('session id');
  if (!id || !sessionUuid.test(id)) return unavailableCodex('Native header has no canonical session UUID');
  return { provider: 'codex', status: 'observed', sessionId: id, source: 'native-stderr-header', cliVersion: version,
    detail: 'Observed native CLI startup header for this exact cwd/model; not independent transcript or server attestation.' };
}

function sessionForLaunch(launch: ProviderLaunch): ProviderSession {
  const binding = launch.sessionBinding;
  const name = binding?.provider ?? basename(launch.executable);
  if (binding && !((binding.provider === 'codex' && binding.capture === 'native-stderr-header') || (binding.provider === 'claude' && binding.capture === 'assigned-cli-argument'))) throw new Error('Invalid captured provider session binding');
  if (name === 'codex') return unavailableCodex('Native startup header has not yet been observed');
  if (name === 'claude') {
    const flags = launch.argv.flatMap((value, index) => value === '--session-id' ? [index] : []);
    const id = flags.length === 1 ? launch.argv[flags[0]! + 1] : undefined;
    if (binding?.provider === 'claude' && (!sessionUuid.test(binding.sessionId) || id !== binding.sessionId)) throw new Error('Captured Claude session ID does not match the CLI argument');
    if (id && sessionUuid.test(id)) return { provider: 'claude', status: 'assigned', sessionId: id, source: 'cli-argument',
      detail: 'Assigned through the captured native --session-id argument; native transcript identity has not been independently observed.' };
    return { provider: 'claude', status: 'unavailable', sessionId: null, source: null,
      detail: 'Legacy captured launch has no unambiguous assigned session UUID; no global/latest history is searched.' };
  }
  return { provider: null, status: 'unavailable', sessionId: null, source: null, detail: 'Executable has no known provider session protocol.' };
}

async function observedSession(launch: ProviderLaunch, session: ProviderSession, stderr: FileHandle): Promise<ProviderSession> {
  if (session.provider !== 'codex') return session;
  const modelFlags = launch.argv.flatMap((value, index) => value === '--model' ? [index] : []);
  const model = modelFlags.length === 1 ? launch.argv[modelFlags[0]! + 1] : undefined;
  if (!model) return unavailableCodex('Captured launch has no unambiguous explicit model to bind the native header');
  try {
    const buffer = Buffer.alloc(sessionPrefixBytes);
    // Positional read of the original regular file, not a path reopen (which
    // could follow a replacement or block on a newly created FIFO). This does
    // not move the native writer's shared file offset.
    const { bytesRead } = await stderr.read(buffer, 0, buffer.length, 0);
    return parseCodexSessionHeader(buffer.subarray(0, bytesRead).toString('utf8'), { cwd: launch.cwd, model });
  } catch (error) {
    return unavailableCodex(`Native header could not be read: ${message(error).slice(0, 1000)}`);
  }
}
type ProcessOwner = Extract<NativeOwner, { kind: 'process' }>;
type Exit = { code: number | null; signal: string | null };
export class ProviderLaunchAbortedError extends Error {
  constructor() { super('Provider launch cancelled before process creation'); this.name = 'ProviderLaunchAbortedError'; }
}

/** Linux identity observation, never PID-only ownership. */
export async function observeProcess(pid: number): Promise<ProcessOwner> {
  const [stat, boot] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf8'), readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
  ]);
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  if (!fields[19] || !fields[2]) throw new Error('Incomplete Linux process identity');
  return { kind: 'process', pid, group: Number(fields[2]), start: fields[19], boot: boot.trim() };
}

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Execute one reviewed provider task using its normal inherited configuration.
 * Handles SIGINT/SIGTERM, not SIGKILL/power loss. Cleanup observes the registered
 * CLI's exit, NOT termination/resource release of every unregistered native job.
 * Durable scheduling, descendant reconciliation and GPU cancellation are separate.
 */
export async function runProvider(launchInput: ProviderLaunch, options: { signal?: AbortSignal } = {}) {
  const checkBeforeLaunch = () => { if (options.signal?.aborted) throw new ProviderLaunchAbortedError(); };
  checkBeforeLaunch();
  const launch = structuredClone(launchInput);
  const session = sessionForLaunch(launch); // Validate new metadata before any child or run directory.
  await mkdir(dirname(launch.runDirectory), { recursive: true, mode: 0o700 });
  await mkdir(launch.runDirectory, { mode: 0o700 }); // never overwrite an earlier attempt
  const stdoutPath = join(launch.runDirectory, 'provider.stdout.log');
  const stderrPath = join(launch.runDirectory, 'provider.stderr.log');
  const receiptPath = join(launch.runDirectory, 'provider-receipt.json');
  const receipt: Record<string, unknown> = {
    schemaVersion: 1, state: 'prepared', executable: launch.executable,
    argv: launch.argv, cwd: launch.cwd, preparedAt: new Date().toISOString(),
    stdoutPath, stderrPath, providerSession: session,
  };
  const save = async () => {
    const pending = `${receiptPath}.${randomUUID()}.tmp`;
    await writeFile(pending, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(pending, receiptPath);
  };
  await writeFile(join(launch.runDirectory, 'user-and-task-prompt.txt'), launch.stdin, { mode: 0o600, flag: 'wx' });
  await save();
  const stdout = await open(stdoutPath, 'wx', 0o600);
  try {
    const stderr = await open(stderrPath, 'wx+', 0o600);
    try {
      let interrupted: 'SIGINT' | 'SIGTERM' | 'abort' | undefined;
      let wakeInterruption!: () => void;
      const interruption = new Promise<'interrupted'>(resolve => { wakeInterruption = () => resolve('interrupted'); });
      const onSignal = (signal: 'SIGINT' | 'SIGTERM') => {
        interrupted ??= signal;
        process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
        wakeInterruption(); // repeated signals share the same bounded cleanup
      };
      const onInt = () => onSignal('SIGINT');
      const onTerm = () => onSignal('SIGTERM');
      // Runtime-owned cancellation uses the same identity-checked cleanup without
      // assigning a process-wide signal exit code to an ordinary shutdown call.
      const onAbort = () => { interrupted ??= 'abort'; wakeInterruption(); };
      process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        checkBeforeLaunch();
        const child = spawn(launch.executable, launch.argv, {
          cwd: launch.cwd, shell: false, detached: true,
          stdio: ['pipe', stdout.fd, stderr.fd],
          // No env filtering, HOME redirection, tool denylist or forced reply format.
        });
        let outcome: Exit | undefined;
        const closed = new Promise<Exit>(resolve => {
          child.once('close', (code, signal) => { outcome = { code, signal }; resolve(outcome); });
        });
        let inputError: Error | undefined;
        let processError: Error | undefined;
        let wakeFailure!: () => void;
        const failure = new Promise<'failure'>(resolve => { wakeFailure = () => resolve('failure'); });
        child.on('error', error => { processError = error; wakeFailure(); });
        child.stdin!.on('error', error => { inputError = error; wakeFailure(); });
        let owner: ProcessOwner | null = null;
        let stopPromise: Promise<{ cliStopped: boolean; detail: string; signals: string[] }> | undefined;
        const stop = () => stopPromise ??= (async () => {
          child.stdin!.destroy(); // never leave a failed launch waiting for our prompt
          const signals: string[] = [];
          if (outcome) return { cliStopped: true, detail: 'CLI already exited', signals };
          if (!child.pid) {
            const exited = await within(closed, 1000);
            return { cliStopped: !!exited, detail: 'No process was successfully started', signals };
          }
          // Each escalation revalidates the leader. A reused PID or missing
          // identity is not permission to signal a process or a process group.
          for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
            if (outcome) break;
            try {
              if (!owner) throw new Error('No verified provider process identity');
              const current = await observeProcess(owner.pid);
              if (current.start !== owner.start || current.boot !== owner.boot ||
                  current.group !== owner.group || owner.group !== owner.pid) {
                throw new Error('Provider process/group identity changed');
              }
              process.kill(-owner.group, signal);
              signals.push(signal);
            } catch (error) {
              if (await within(closed, 100)) break;
              return { cliStopped: false, detail: message(error), signals };
            }
            if (await within(closed, 1000)) break;
          }
          return {
            cliStopped: outcome !== undefined,
            detail: outcome ? 'Registered CLI exit observed; unregistered work is not verified' : 'CLI exit not confirmed within cleanup budget',
            signals,
          };
        })();
        try {
          await once(child, 'spawn');
          receipt.pid = child.pid;
          try { owner = await observeProcess(child.pid!); }
          catch { receipt.ownershipWarning = 'Identity not captured; never infer ownership from PID alone.'; }
          receipt.owner = owner;
          receipt.state = 'running'; receipt.startedAt = new Date().toISOString();
          await save(); // persist identity before dispatch
          if (!interrupted) child.stdin!.end(launch.stdin);
          const event = await Promise.race([closed, interruption, failure]);
          if (event === 'interrupted') {
            receipt.cleanup = await stop();
          } else if (event === 'failure') {
            // A brief wait preserves a naturally arriving native exit code (e.g.
            // EPIPE followed by exit 0). A wedged receiver is still bounded.
            if (!(await within(closed, 1000))) receipt.cleanup = await stop();
          }
          const cleanup = receipt.cleanup as Awaited<ReturnType<typeof stop>> | undefined;
          const inputDelivered = child.stdin!.writableFinished && !inputError;
          const succeeded = outcome?.code === 0 && inputDelivered && !processError && !interrupted;
          Object.assign(receipt, {
            state: cleanup?.cliStopped === false ? 'reconciling' : succeeded ? 'exited' : 'failed',
            ...(outcome ?? { code: child.exitCode, signal: child.signalCode }),
            succeeded, inputDelivered, endedAt: new Date().toISOString(),
          });
          if (inputError) receipt.inputError = inputError.message;
          if (processError) receipt.processError = processError.message;
          if (interrupted) receipt.interruptedBy = interrupted;
          // Metadata absence is a provenance limitation, never a reason to retry
          // expensive work or overwrite the native launch/cleanup outcome.
          receipt.providerSession = await observedSession(launch, session, stderr);
          await save();
          return {
            ...(outcome ?? { code: child.exitCode, signal: child.signalCode }),
            succeeded, inputDelivered, stdoutPath, stderrPath, receiptPath, owner,
          };
        } catch (error) {
          const cleanup = await stop();
          Object.assign(receipt, {
            state: cleanup.cliStopped ? 'failed' : 'reconciling', succeeded: false,
            error: message(error), cleanup, ...(outcome ?? {}), endedAt: new Date().toISOString(),
          });
          receipt.providerSession = await observedSession(launch, session, stderr);
          try { await save(); }
          catch (saveError) { throw new AggregateError([error, saveError], 'Provider failed; receipt update also failed'); }
          throw error;
        } finally {
          // On uncertainty, leave the receipt explicit rather than keeping the
          // terminal hung forever or killing unidentified work.
          if (!outcome) child.unref();
        }
      } finally {
        process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
        options.signal?.removeEventListener('abort', onAbort);
      }
    } finally { await stderr.close(); }
  } finally { await stdout.close(); }
}
