import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { openGpuQueue } from '../jobs/gpu-queue.ts';
import { GpuWorker, type NativeAdapter } from '../jobs/gpu-worker.ts';
import { createNativeApi, type NativeApiOptions } from './native-api.ts';
import type { FastifyInstance } from 'fastify';
import type { GpuQueue } from '../jobs/gpu-queue-contract.ts';

/** Single app process owns HTTP, the durable queue and one native worker.
 * Browser/agent clients can disconnect without cancelling work. A deliberate
 * server shutdown stops its active owned call; queued attempts stay durable.
 * Restart never clears a retained lease or blindly resubmits a native call. */
export async function startNativeCoordinator(options: {
  database: string; adapter: NativeAdapter; host: string; port: number;
  allowedHosts: string[]; pollMs?: number;
  validateSubmission: NativeApiOptions['validateSubmission'];
  hasAttempt: NativeApiOptions['hasAttempt'];
  /** Trusted application composition, before listening; never a browser hook. */
  configure?: (app: FastifyInstance, queue: GpuQueue) => Promise<void> | void;
}) {
  const pollMs = options.pollMs ?? 250;
  if (!Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > 10000) throw new Error('Invalid worker poll interval');
  const queue = openGpuQueue(options.database);
  const retainedOnStartup = queue.heldLease();
  let app;
  try {
    app = createNativeApi({ queue, allowedHosts: options.allowedHosts,
      validateSubmission: options.validateSubmission, hasAttempt: options.hasAttempt });
  } catch (error) { queue.close(); throw error; }
  const workerId = `server-${randomUUID()}`;
  const worker = new GpuWorker(queue, options.adapter, { workerId });
  let stopping = false, fault: string | null = null;
  let loop: Promise<void> | undefined, closing: Promise<void> | undefined;
  let shutdownError: unknown;
  app.get('/api/internal/coordinator', () => {
    const lease = queue.heldLease(), call = lease ? queue.get(lease.callId) : null;
    return { state: fault ? 'error' : retainedOnStartup || call?.state === 'reconciling' ? 'reconciling' : 'ready',
      heldCallId: lease?.callId ?? null, queued: queue.list().filter(c => c.state === 'queued').length,
      error: fault ? 'Worker stopped after an internal failure; inspect the server log before recovery' : null };
  });
  async function pump() {
    while (!stopping) {
      try {
        const result = await worker.runNext();
        if (!result && !stopping) await delay(pollMs);
      } catch (error) {
        fault = error instanceof Error ? error.message : String(error);
        // A failed persistence boundary is not permission for another dispatch.
        process.stderr.write(`Native coordinator worker stopped: ${fault}\n`);
        break;
      }
    }
  }
  function beginStop() {
    if (stopping) return;
    // Freeze the pump synchronously, before Fastify waits for in-flight HTTP
    // requests. Already accepted submissions may finish persisting, but cannot
    // start another native call while this server drains.
    stopping = true;
    try {
      const lease = queue.heldLease();
      // Another app/worker may have claimed an idle database since startup.
      // Closing this instance is not permission to cancel its neighbour.
      if (lease?.workerId === workerId) {
        const call = queue.get(lease.callId);
        if (call && call.state !== 'reconciling') queue.cancelAttempt(call.attemptId);
      }
    } catch (error) {
      shutdownError = error;
      fault = error instanceof Error ? error.message : String(error);
    }
  }
  app.addHook('preClose', async () => { beginStop(); });
  app.addHook('onClose', async () => {
    beginStop();
    try {
      await loop;
      if (shutdownError !== undefined) throw shutdownError;
    } finally { queue.close(); }
  });
  try { await options.configure?.(app, queue); await app.listen({ host: options.host, port: options.port }); }
  catch (error) { await app.close(); throw error; }
  loop = pump();
  return { app, close: () => { beginStop(); return closing ??= app.close(); } };
}
