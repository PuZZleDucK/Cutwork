import { createOwnedComfyTransport, ComfyNativeError, type OwnedTransportConfig, type OwnedTransportIo } from './comfy-http.ts';
import type { ProcessOwner } from './native-control.ts';

export interface QueueProjection { running: string[]; queued: string[] }
export interface WholeQueueSnapshot extends QueueProjection {
  kind: 'comfy-whole-queue';
  service: ProcessOwner;
}
export interface QueueBinding { observe(signal: AbortSignal): Promise<WholeQueueSnapshot> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const invalid = (message: string): never => { throw new ComfyNativeError('COMFY_RESPONSE', message); };

/** Pinned /queue schema, not the filtered single-job endpoint. Preserve every
 * ID and wire order (pending heap storage is NOT execution/FIFO order). */
export function decodeComfyQueue(httpStatus: number, body: unknown): QueueProjection {
  if (httpStatus !== 200) throw new ComfyNativeError('COMFY_HTTP_STATUS', `Unexpected Comfy queue HTTP status ${httpStatus}`);
  if (!record(body) || Reflect.ownKeys(body).length !== 2 ||
      !Object.hasOwn(body, 'queue_running') || !Object.hasOwn(body, 'queue_pending') ||
      !Array.isArray(body.queue_running) || !Array.isArray(body.queue_pending)) {
    return invalid('Expected both complete Comfy queue lists without extra envelope fields');
  }
  const seen = new Set<string>();
  function ids(rows: unknown[]): string[] {
    const result: string[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 5 ||
          typeof row[0] !== 'number' || !Number.isFinite(row[0]) ||
          typeof row[1] !== 'string' || !UUID.test(row[1]) ||
          !record(row[2]) || !record(row[3]) || !Array.isArray(row[4])) {
        return invalid('Malformed Comfy queue row; no partial observation is usable');
      }
      // Validate ancillary containers, not the workflow's executable semantics.
      for (const output of row[4]) if (typeof output !== 'string') return invalid('Invalid output node ID in Comfy queue row');
      if (seen.has(row[1])) return invalid('Duplicate Comfy job identity within or across queue lists');
      seen.add(row[1]); result.push(row[1]);
    }
    return result;
  }
  return { running: ids(body.queue_running), queued: ids(body.queue_pending) };
}

/** Read-only point-in-request evidence. No cache, retry, single-job filter,
 * process signal, model unload, resource-release verdict or dispatch permission.
 * Later composition must bracket fresh calls and reconcile identity/attribution
 * under its real lease; an empty queue does not establish a stopped service. */
export function createComfyQueueBinding(input: OwnedTransportConfig, io: OwnedTransportIo = {}): QueueBinding {
  const config: OwnedTransportConfig = { port: input.port, owner: { ...input.owner },
    requestTimeoutMs: input.requestTimeoutMs, maxResponseBytes: input.maxResponseBytes };
  const transport = createOwnedComfyTransport(config, io);
  return {
    observe: signal => transport.request({ method: 'GET', path: '/queue' }, signal,
      (status, body) => ({ kind: 'comfy-whole-queue', service: { ...config.owner }, ...decodeComfyQueue(status, body) })),
  };
}
