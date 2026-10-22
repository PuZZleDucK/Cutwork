/** Proof-run safeguards; importing this module registers no signal handlers. */
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

export async function assertNoInheritedComfyConfig(source: string) {
  const path = join(source, 'extra_model_paths.yaml');
  try { await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  // The pinned main.py auto-loads this even with --base-directory. Do not
  // rename or change personal configuration; refuse this proof launch instead.
  throw new Error(`CPU proof refuses inherited Comfy configuration: ${path}`);
}

type Signals = Pick<NodeJS.Process, 'on' | 'off' | 'exitCode'>;
export function createCpuRunGuard(signals: Signals = process) {
  const terminated = new AbortController();
  return {
    signalFor(caller: AbortSignal) {
      const signal = AbortSignal.any([caller, terminated.signal]);
      signal.throwIfAborted(); // Includes every subsequent fixture launch.
      return signal;
    },
    attach(onTermination: () => void) {
      const stop = (name: 'SIGINT' | 'SIGTERM') => {
        terminated.abort(new Error(`CPU proof parent received ${name}`));
        // Cleanup must be awaited, not bypassed by process.exit().
        signals.exitCode = name === 'SIGINT' ? 130 : 143;
        onTermination();
      };
      const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
      signals.on('SIGINT', onInt); signals.on('SIGTERM', onTerm);
      return () => { signals.off('SIGINT', onInt); signals.off('SIGTERM', onTerm); };
    },
  };
}
