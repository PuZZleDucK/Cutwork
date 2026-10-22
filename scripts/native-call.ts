/** Cooperative creative-agent helper. This calls the app's native queue API;
 * it never opens SQLite, starts a generator itself, or requires an agent reply
 * schema. Native request files/settings stay exact, including decimal seeds. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type { CallInput, Json } from '../apps/server/src/jobs/gpu-queue-contract.ts';

export async function submitAndWait(server: string, input: CallInput, options: {
  fetcher?: typeof fetch; pollMs?: number; timeoutMs?: number; signal?: AbortSignal;
  onState?: (state: string) => void;
} = {}): Promise<{ id: string; state: string; [key: string]: Json }> {
  const base = new URL(server), fetcher = options.fetcher ?? fetch;
  if (base.protocol !== 'http:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Expected the local studio HTTP origin, without credentials or a path');
  }
  const pollMs = options.pollMs ?? 1000, timeoutMs = options.timeoutMs ?? 3_700_000;
  if (![pollMs, timeoutMs].every(v => Number.isSafeInteger(v) && v > 0)) throw new Error('Invalid client polling/deadline');
  const deadline = performance.now() + timeoutMs;
  const timedOut = () => new Error('Tracking wait timed out; the native call may still be running. Inspect its ID; no automatic retry was made.');
  const endpoint = (path: string) => new URL(path, base).href;
  async function request(path: string, init?: RequestInit, cancelling = false) {
    const remaining = cancelling ? 10000 : deadline - performance.now();
    if (remaining <= 0) throw timedOut();
    const timeout = new AbortController();
    const signal = options.signal && !cancelling ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(new Error('Coordinator request timed out')), Math.max(1, Math.ceil(Math.min(10000, remaining))));
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      const body = await Promise.race([aborted, (async () => {
        const response = await fetcher(endpoint(path), { ...init, signal, redirect: 'error' });
        if (!response.ok) throw new Error(`Native coordinator HTTP ${response.status}; do not blindly resubmit, inspect this call ID first`);
        return response.json();
      })()]);
      if (!cancelling && performance.now() >= deadline) throw timedOut();
      return body;
    } catch (error) {
      if (!cancelling && performance.now() >= deadline) throw timedOut();
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  }
  let cancellationAttempted = false;
  async function cancellation() {
    if (!options.signal?.aborted) return false;
    cancellationAttempted = true;
    try { await request(`/api/attempts/${encodeURIComponent(input.attemptId)}/cancel`, { method: 'POST' }, true); }
    catch (cause) { throw new Error('Cancellation could not be confirmed; native work may still be running. Inspect this attempt before restarting.', { cause }); }
    throw new Error('Cancellation requested; native cleanup is asynchronous, inspect the call status before restarting');
  }
  // If a caller was cancelled before submission, no native work is accepted.
  options.signal?.throwIfAborted();
  try {
    let call = await request('/api/internal/native-calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    let previous = '';
    for (;;) {
      await cancellation();
      if (!call || call.id !== input.id || typeof call.state !== 'string') throw new Error('Coordinator returned another call or malformed state');
      if (call.state !== previous) { options.onState?.(call.state); previous = call.state; }
      if (['succeeded', 'failed', 'cancelled', 'reconciling'].includes(call.state)) return call;
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw timedOut();
      await delay(Math.min(pollMs, remaining), undefined, options.signal ? { signal: options.signal } : undefined);
      await cancellation();
      call = await request(`/api/internal/native-calls/${encodeURIComponent(input.id)}`);
    }
  } catch (error) {
    // The POST might have been accepted even when its response was lost. A
    // caller abort must still freeze the known attempt, without submitting twice.
    if (options.signal?.aborted && !cancellationAttempted) await cancellation();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [server, projectId, attemptId, tool, path, ...extra] = process.argv.slice(2);
  if (!server || !projectId || !attemptId || (tool !== 'yue2' && tool !== 'h3') || !path || extra.length) {
    throw new Error('Usage: node scripts/native-call.ts <studio-origin> <project-id> <attempt-id> <yue2|h3> <native-request.json>');
  }
  const native = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (typeof native.attemptId !== 'string') throw new Error('Native request must contain its exact call ID in attemptId');
  const controller = new AbortController();
  const stop = () => controller.abort(); process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const result = await submitAndWait(server, { id: native.attemptId, projectId, attemptId, tool, request: native },
      { signal: controller.signal, onState: state => process.stderr.write(`Native call ${native.attemptId}: ${state}\n`) });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.state !== 'succeeded') process.exitCode = 1;
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
