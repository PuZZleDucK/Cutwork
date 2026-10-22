import type { GpuCall, GpuQueue, Json } from './gpu-queue-contract.ts';

export interface NativeResult { outcome: 'succeeded' | 'failed'; result: Json }
export type CleanupResult =
  | { state: 'released'; evidence: { [key: string]: Json } }
  | { state: 'uncertain'; reason: string; evidence: { [key: string]: Json } };
export interface NativeHandle {
  wait(): Promise<NativeResult>;
  /** Only owned work; bounded by the adapter. A resolved stop is NOT release. */
  stop(): Promise<void>;
  /** Must establish native quiescence and resource release, even on failure.
   * An incomplete diagnostic observation must return uncertain, never released. */
  cleanup(): Promise<CleanupResult>;
}
export interface NativeAdapter {
  /** No GPU work or native generation may start during preparation. */
  prepare(call: GpuCall, signal: AbortSignal): Promise<Json>;
  /** Must durably record actual identity before allowing work through its launch
   * gate. A thrown/ambiguous launch holds the lane; it is never auto-retried.
   * Full native lifecycle deadlines/cleanup belong to this trusted adapter. */
  launch(plan: Json, context: { signal: AbortSignal; recordOwner(owner: Json): void }): Promise<NativeHandle>;
}
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

/** One worker in the app process, with SQLite providing durable admission rather
 * than an in-memory mutex. Constructing/restarting this worker never steals a
 * persisted lease. Startup reconciliation needs its own verified recovery path. */
export class GpuWorker {
  private readonly queue: GpuQueue;
  private readonly adapter: NativeAdapter;
  private readonly workerId: string;
  private readonly cancelPollMs: number;
  constructor(queue: GpuQueue, adapter: NativeAdapter, options: { workerId: string; cancelPollMs?: number }) {
    this.queue = queue; this.adapter = adapter; this.workerId = options.workerId;
    this.cancelPollMs = options.cancelPollMs ?? 100;
    if (!this.workerId || !Number.isSafeInteger(this.cancelPollMs) || this.cancelPollMs < 1 || this.cancelPollMs > 10000) {
      throw new Error('Invalid worker identity or cancellation poll interval');
    }
  }
  async runNext(): Promise<GpuCall | null> {
    const q = this.queue, lease = q.claim(this.workerId);
    if (!lease) return null;
    const controller = new AbortController();
    let notifyCancel!: () => void;
    const cancellation = new Promise<{ kind: 'cancel' }>(resolve => { notifyCancel = () => resolve({ kind: 'cancel' }); });
    const observeCancel = () => {
      try {
        if (q.get(lease.callId)?.cancelRequested) { controller.abort(); notifyCancel(); }
      } catch (e) { controller.abort(e); notifyCancel(); }
    };
    const poll = setInterval(observeCancel, this.cancelPollMs);
    let launchBegan = false;
    try {
      const call = q.get(lease.callId)!;
      observeCancel();
      const plan = await this.adapter.prepare(call, controller.signal);
      observeCancel();
      if (controller.signal.aborted) return q.finish(lease, 'cancelled', null, { neverLaunched: true });
      q.prepareLaunch(lease, plan);
      launchBegan = true;
      let acknowledged = false;
      const handle = await this.adapter.launch(plan, { signal: controller.signal, recordOwner(owner) {
        q.acknowledgeLaunch(lease, owner); acknowledged = true;
        // The DB may have accepted cancellation while the native unit was being
        // created. Refresh synchronously before the adapter opens its work gate.
        observeCancel();
      } });
      if (!acknowledged) {
        try { await handle.stop(); } catch { /* No proof means retained lease. */ }
        q.reconcile(lease, 'Native adapter returned without a persisted ownership acknowledgement');
        return q.get(lease.callId);
      }
      observeCancel();
      // Attach rejection handling immediately: late output after cancellation is
      // ignored, not an unhandled rejection and never an automatic placement.
      const completion = Promise.resolve().then(() => handle.wait()).then(
        value => ({ kind: 'complete' as const, value }),
        error => ({ kind: 'complete' as const, value: { outcome: 'failed' as const, result: { error: message(error) } } }),
      );
      const finished = await Promise.race([completion, cancellation]);
      let stopError: string | null = null;
      if (finished.kind === 'cancel') {
        try { await handle.stop(); } catch (e) { stopError = message(e); }
      }
      const cleanup = await handle.cleanup();
      if (cleanup.state !== 'released') {
        q.reconcile(lease, `Native cleanup unresolved: ${cleanup.reason}${stopError ? `; stop: ${stopError}` : ''}`);
        return q.get(lease.callId);
      }
      return q.finish(lease, finished.kind === 'cancel' ? 'cancelled' : finished.value.outcome,
        finished.kind === 'cancel' ? null : finished.value.result, cleanup.evidence);
    } catch (e) {
      if (launchBegan) q.reconcile(lease, `Native execution requires reconciliation: ${message(e)}`);
      else q.finish(lease, controller.signal.aborted ? 'cancelled' : 'failed', { error: message(e) }, { neverLaunched: true });
      return q.get(lease.callId);
    } finally { clearInterval(poll); }
  }
}
