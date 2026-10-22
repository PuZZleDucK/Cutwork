import { createOwnedComfyTransport, ComfyNativeError, type OwnedTransportConfig, type OwnedTransportIo } from './comfy-http.ts';
import type { ComfyObservation, NativeTerminal } from './native-control.ts';
export { ComfyNativeError, matchComfyConnection } from './comfy-http.ts';
export type { ConnectionEvidence } from './comfy-http.ts';

type Projection = Pick<ComfyObservation, 'running' | 'queued' | 'terminal'>;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const invalid = (message: string): never => { throw new ComfyNativeError('COMFY_RESPONSE', message); };

/** Single-job projection only. Empty arrays are NOT a whole-queue/GPU-release observation.
 * The pinned normalizer can label incomplete history completed; require native facts. */
export function decodeComfyJob(promptId: string, httpStatus: number, body: unknown): Projection {
  const empty: Projection = { running: [], queued: [], terminal: {} };
  if (httpStatus === 404 && record(body) && Object.keys(body).length === 1 && body.error === 'Job not found') return empty;
  if (httpStatus !== 200) throw new ComfyNativeError('COMFY_HTTP_STATUS', `Unexpected Comfy job HTTP status ${httpStatus}`);
  if (!record(body) || body.id !== promptId) return invalid('Missing or mismatched Comfy job identity');
  if (body.status === 'pending' || body.status === 'in_progress') {
    if (body.execution_status !== undefined) return invalid('Active job has conflicting execution history');
    return body.status === 'pending' ? { ...empty, queued: [promptId] } : { ...empty, running: [promptId] };
  }
  if (typeof body.status !== 'string' || !['completed', 'failed', 'cancelled'].includes(body.status)) {
    return invalid('Unknown Comfy job status');
  }
  const execution = body.execution_status;
  if (!record(execution) || !Array.isArray(execution.messages)) return invalid('Missing explicit native execution status');
  const successful = body.status === 'completed';
  if (execution.status_str !== (successful ? 'success' : 'error') || execution.completed !== successful) {
    return invalid('Conflicting native completion fields');
  }
  const events = new Set<string>();
  for (const entry of execution.messages) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !record(entry[1])) {
      return invalid('Malformed native execution event');
    }
    const [kind, details] = entry as [string, Record<string, unknown>];
    if (Object.hasOwn(details, 'prompt_id') && details.prompt_id !== promptId) return invalid('Execution event names another prompt');
    if (['execution_success', 'execution_error', 'execution_interrupted'].includes(kind)) {
      if (details.prompt_id !== promptId) return invalid('Terminal execution event lacks matching prompt identity');
      events.add(kind);
    }
  }
  const expectedEvent = successful ? 'execution_success' : body.status === 'failed' ? 'execution_error' : 'execution_interrupted';
  if ([...events].some(kind => kind !== expectedEvent) || (body.status === 'cancelled' && !events.has(expectedEvent))) {
    return invalid('Conflicting or absent native terminal event');
  }
  const state: NativeTerminal = successful ? 'succeeded' : body.status === 'failed' ? 'failed' : 'cancelled';
  return { ...empty, terminal: { [promptId]: state } };
}

export interface ComfyBindingConfig extends OwnedTransportConfig { promptId: string }
export type ComfyBindingIo = OwnedTransportIo;

/** Captured-job API, intentionally narrower than the internal HTTP transport. */
export function createComfyNativeBinding(input: ComfyBindingConfig, io: ComfyBindingIo = {}) {
  if (typeof input.promptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.promptId)) {
    throw new ComfyNativeError('COMFY_TARGET', 'Invalid captured prompt identity');
  }
  const transport = createOwnedComfyTransport(input, io);
  const owner = { ...input.owner };
  const promptId = input.promptId;
  const jobPath = `/api/jobs/${encodeURIComponent(promptId)}`;
  return {
    observe: (signal: AbortSignal): Promise<ComfyObservation> => transport.request({ method: 'GET', path: jobPath }, signal,
      (status, body) => ({ service: { ...owner }, ...decodeComfyJob(promptId, status, body) })),
    post: async (path: string, body: Record<string, never>, signal: AbortSignal): Promise<{ cancelled: boolean }> => {
      if (path !== `${jobPath}/cancel` || !record(body) || Reflect.ownKeys(body).length !== 0) {
        throw new ComfyNativeError('COMFY_TARGET', 'Only the captured job cancel path and empty body are permitted');
      }
      return transport.request({ method: 'POST', path, body: {} }, signal, (_status, response) => {
        if (!record(response) || typeof response.cancelled !== 'boolean') return invalid('Comfy cancel acknowledgement must be Boolean');
        return { cancelled: response.cancelled };
      });
    },
  };
}
