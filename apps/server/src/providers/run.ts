import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import type { NativeOwner } from '../../../../packages/core/src/contracts/generation.ts';
import type { providerLaunch } from './launch.ts';

export type ProviderLaunch = ReturnType<typeof providerLaunch>;
type ProcessOwner = Extract<NativeOwner, { kind: 'process' }>;
type Exit = { code: number | null; signal: string | null };

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
export async function runProvider(launchInput: ProviderLaunch) {
  const launch = structuredClone(launchInput);
  await mkdir(dirname(launch.runDirectory), { recursive: true, mode: 0o700 });
  await mkdir(launch.runDirectory, { mode: 0o700 }); // never overwrite an earlier attempt
  const stdoutPath = join(launch.runDirectory, 'provider.stdout.log');
  const stderrPath = join(launch.runDirectory, 'provider.stderr.log');
  const receiptPath = join(launch.runDirectory, 'provider-receipt.json');
  const receipt: Record<string, unknown> = {
    schemaVersion: 1, state: 'prepared', executable: launch.executable,
    argv: launch.argv, cwd: launch.cwd, preparedAt: new Date().toISOString(),
    stdoutPath, stderrPath,
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
    const stderr = await open(stderrPath, 'wx', 0o600);
    try {
      let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
      let wakeInterruption!: () => void;
      const interruption = new Promise<'interrupted'>(resolve => { wakeInterruption = () => resolve('interrupted'); });
      const onSignal = (signal: 'SIGINT' | 'SIGTERM') => {
        interrupted ??= signal;
        process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
        wakeInterruption(); // repeated signals share the same bounded cleanup
      };
      const onInt = () => onSignal('SIGINT');
      const onTerm = () => onSignal('SIGTERM');
      process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
      try {
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
      }
    } finally { await stderr.close(); }
  } finally { await stdout.close(); }
}
