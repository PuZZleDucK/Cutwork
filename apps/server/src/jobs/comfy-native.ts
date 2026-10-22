import { once } from 'node:events';
import { readFile, readdir, readlink } from 'node:fs/promises';
import { request, type ClientRequest } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import { endianness } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { observeProcess } from '../providers/run.ts';
import type { ComfyObservation, NativeTerminal, ProcessOwner } from './native-control.ts';

type FailureCode = 'COMFY_IDENTITY' | 'COMFY_TARGET' | 'COMFY_ABORTED' | 'COMFY_TIMEOUT' |
  'COMFY_RESPONSE_LIMIT' | 'COMFY_HTTP_STATUS' | 'COMFY_RESPONSE' | 'COMFY_TRANSPORT';

export class ComfyNativeError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ComfyNativeError';
    this.code = code;
  }
}

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

export interface ConnectionEvidence {
  clientAddress: string; clientPort: number;
  serverAddress: string; serverPort: number;
  tcp: string; fdLinks: string[];
}

function procEndpoint(address: string, port: number): string | null {
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255) ||
      !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  // /proc/net/tcp renders the address's native-endian 32-bit value.
  const bytes = octets.map(part => Number(part).toString(16).padStart(2, '0'));
  if (endianness() === 'LE') bytes.reverse();
  return `${bytes.join('')}:${port.toString(16).padStart(4, '0')}`.toUpperCase();
}

/** /proc/<pid>/net/tcp is namespace-wide. Only an exact server-side ESTABLISHED
 * four-tuple AND an inode in that PID's FDs proves this connection's ownership. */
export function matchComfyConnection(evidence: ConnectionEvidence): boolean {
  const local = procEndpoint(evidence.serverAddress, evidence.serverPort);
  const remote = procEndpoint(evidence.clientAddress, evidence.clientPort);
  if (!local || !remote) return false;
  const fds = new Set(evidence.fdLinks);
  return evidence.tcp.split('\n').some(line => {
    const fields = line.trim().split(/\s+/);
    return fields[1] === local && fields[2] === remote && fields[3] === '01' &&
      !!fields[9] && /^[1-9]\d*$/.test(fields[9]) && fds.has(`socket:[${fields[9]}]`);
  });
}

export interface ComfyBindingConfig {
  port: number;
  owner: ProcessOwner;
  promptId: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface ComfyBindingIo {
  /** Fault injection only; ordinary operation reads the real Linux process. */
  readIdentity?: (pid: number, signal: AbortSignal) => Promise<ProcessOwner>;
}

function validOwner(owner: ProcessOwner): boolean {
  return !!owner && owner.kind === 'process' && Number.isSafeInteger(owner.pid) && owner.pid > 0 &&
    Number.isSafeInteger(owner.group) && owner.group > 0 && typeof owner.start === 'string' && !!owner.start &&
    typeof owner.boot === 'string' && !!owner.boot;
}
function sameOwner(expected: ProcessOwner, actual: ProcessOwner): boolean {
  return validOwner(actual) && expected.pid === actual.pid && expected.group === actual.group &&
    expected.start === actual.start && expected.boot === actual.boot;
}

/** Narrow owned-service binding; no global interrupt, retries, process kills,
 * resource-release claim or restrictions on an agent's normal tools. */
export function createComfyNativeBinding(input: ComfyBindingConfig, io: ComfyBindingIo = {}) {
  if (process.platform !== 'linux') throw new ComfyNativeError('COMFY_IDENTITY', 'The local Comfy binding requires Linux /proc');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535 ||
      typeof input.promptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.promptId) ||
      !Number.isFinite(input.requestTimeoutMs) || input.requestTimeoutMs <= 0 || input.requestTimeoutMs > 2_147_483_647 ||
      !Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes <= 0) {
    throw new ComfyNativeError('COMFY_TARGET', 'Invalid captured job, port or request budget');
  }
  if (!validOwner(input.owner)) throw new ComfyNativeError('COMFY_IDENTITY', 'Incomplete captured process identity');
  const { port, promptId, requestTimeoutMs, maxResponseBytes } = input;
  const owner = { ...input.owner };
  const readIdentity = io.readIdentity ?? observeProcess;
  const jobPath = `/api/jobs/${encodeURIComponent(promptId)}`;

  async function exchange<T>(method: 'GET' | 'POST', caller: AbortSignal, decode: (status: number, body: unknown) => T): Promise<T> {
    if (caller.aborted) throw new ComfyNativeError('COMFY_ABORTED', 'Comfy request aborted before connection');
    const expiresAt = performance.now() + requestTimeoutMs;
    const abort = new AbortController();
    let socket: Socket | undefined, req: ClientRequest | undefined;
    let waitingForOwner = false;
    const timeoutError = () => new ComfyNativeError(waitingForOwner ? 'COMFY_IDENTITY' : 'COMFY_TIMEOUT',
      waitingForOwner ? 'Server-side connection ownership remained unverified within request deadline' : 'Complete Comfy request deadline expired');
    const fail = (error: ComfyNativeError) => { if (!abort.signal.aborted) abort.abort(error); };
    const onAbort = () => fail(new ComfyNativeError('COMFY_ABORTED', 'Comfy request aborted by caller'));
    let rejectAbort!: (error: unknown) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onInternalAbort = () => {
      rejectAbort(abort.signal.reason);
      req?.destroy();
      socket?.destroy(); // Only our own client connection, never the service process.
    };
    abort.signal.addEventListener('abort', onInternalAbort, { once: true });
    caller.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => fail(timeoutError()), Math.ceil(requestTimeoutMs));
    const check = () => {
      if (performance.now() >= expiresAt) fail(timeoutError());
      abort.signal.throwIfAborted();
    };
    const verifyIdentity = async () => {
      check();
      try {
        const actual = await readIdentity(owner.pid, abort.signal);
        check();
        if (!sameOwner(owner, actual)) throw new ComfyNativeError('COMFY_IDENTITY', 'Captured Comfy process identity changed');
      } catch (cause) {
        check();
        throw new ComfyNativeError('COMFY_IDENTITY', 'Cannot verify captured Comfy process identity', cause);
      }
    };
    const action = async () => {
      await verifyIdentity();
      check();
      socket = createConnection({ host: '127.0.0.1', port, family: 4 });
      socket.on('error', cause => fail(new ComfyNativeError('COMFY_TRANSPORT', 'Comfy connection failed', cause)));
      await once(socket, 'connect', { signal: abort.signal });
      check();
      waitingForOwner = true;
      for (;;) {
        check();
        let tcp: string, fdLinks: string[];
        try {
          tcp = await readFile(`/proc/${owner.pid}/net/tcp`, { encoding: 'utf8', signal: abort.signal });
          check();
          const fds = await readdir(`/proc/${owner.pid}/fd`);
          check();
          fdLinks = [];
          for (const fd of fds) {
            check();
            try { fdLinks.push(await readlink(`/proc/${owner.pid}/fd/${fd}`)); }
            catch (error) {
              // A descriptor may close while enumerating; permissions and other
              // failures are uncertainty, never proof of an empty owner FD set.
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
          }
        } catch (cause) {
          check();
          throw new ComfyNativeError('COMFY_IDENTITY', 'Cannot read Comfy socket ownership', cause);
        }
        check();
        if (matchComfyConnection({ tcp, fdLinks, clientAddress: socket.localAddress ?? '',
          clientPort: socket.localPort ?? 0, serverAddress: '127.0.0.1', serverPort: port })) break;
        // accept() and the server FD can lag TCP connect. Send no HTTP while
        // waiting; this pause still consumes the one original request deadline.
        await wait(Math.min(10, Math.max(1, expiresAt - performance.now())), undefined, { signal: abort.signal });
      }
      waitingForOwner = false;
      await verifyIdentity();
      check();
      if (socket.destroyed) throw new ComfyNativeError('COMFY_TRANSPORT', 'Verified connection closed before request');
      const wire = await new Promise<{ status: number; bytes: Buffer }>((resolve, reject) => {
        // Do NOT set agent:false: Node creates an Agent in that case, bypassing
        // this custom connection. Omitted agent + createConnection uses exactly
        // the already-verified socket, with no DNS, pool, proxy or reconnect.
        req = request({ host: '127.0.0.1', port, method, path: method === 'GET' ? jobPath : `${jobPath}/cancel`,
          createConnection: () => socket!, maxHeaderSize: 16 * 1024,
          headers: { connection: 'close', accept: 'application/json',
            ...(method === 'POST' ? { 'content-type': 'application/json', 'content-length': '2' } : {}) },
        }, response => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            if (abort.signal.aborted) return;
            size += chunk.length;
            if (size > maxResponseBytes) { fail(new ComfyNativeError('COMFY_RESPONSE_LIMIT', 'Comfy response exceeded byte limit')); return; }
            chunks.push(chunk);
          });
          response.on('error', cause => reject(new ComfyNativeError('COMFY_TRANSPORT', 'Comfy response failed', cause)));
          response.on('aborted', () => reject(new ComfyNativeError('COMFY_TRANSPORT', 'Comfy response was incomplete')));
          response.on('end', () => {
            if (!response.complete) { reject(new ComfyNativeError('COMFY_TRANSPORT', 'Incomplete Comfy HTTP message')); return; }
            resolve({ status: response.statusCode ?? 0, bytes: Buffer.concat(chunks, size) });
          });
        });
        req.on('error', cause => reject(new ComfyNativeError('COMFY_TRANSPORT', 'Comfy request failed', cause)));
        req.on('upgrade', (_response, upgraded) => {
          upgraded.destroy();
          reject(new ComfyNativeError('COMFY_HTTP_STATUS', 'Comfy unexpectedly upgraded HTTP'));
        });
        req.end(method === 'POST' ? '{}' : undefined);
      });
      check();
      await verifyIdentity(); // Only complete, same-owner response evidence may escape.
      check();
      if (wire.status !== 200 && !(method === 'GET' && wire.status === 404)) {
        throw new ComfyNativeError('COMFY_HTTP_STATUS', `Unexpected Comfy HTTP status ${wire.status}`);
      }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(wire.bytes)); }
      catch (cause) { throw new ComfyNativeError('COMFY_RESPONSE', 'Invalid Comfy JSON response', cause); }
      const result = decode(wire.status, body);
      check();
      return result;
    };
    try {
      // Racing also bounds a fault-injected identity reader that ignores abort.
      // Late continuations check the signal before opening/sending anything.
      return await Promise.race([action(), interrupted]);
    } catch (error) {
      if (abort.signal.aborted) throw abort.signal.reason;
      if (error instanceof ComfyNativeError) throw error;
      throw new ComfyNativeError('COMFY_TRANSPORT', 'Comfy exchange failed', error);
    } finally {
      clearTimeout(timer);
      caller.removeEventListener('abort', onAbort);
      abort.signal.removeEventListener('abort', onInternalAbort);
      abort.abort();
      req?.destroy();
      socket?.destroy();
    }
  }

  return {
    observe: (signal: AbortSignal): Promise<ComfyObservation> => exchange('GET', signal, (status, body) =>
      ({ service: { ...owner }, ...decodeComfyJob(promptId, status, body) })),
    post: async (path: string, body: Record<string, never>, signal: AbortSignal): Promise<{ cancelled: boolean }> => {
      if (path !== `${jobPath}/cancel` || !record(body) || Reflect.ownKeys(body).length !== 0) {
        throw new ComfyNativeError('COMFY_TARGET', 'Only the captured job cancel path and empty body are permitted');
      }
      return exchange('POST', signal, (_status, response) => {
        if (!record(response) || typeof response.cancelled !== 'boolean') return invalid('Comfy cancel acknowledgement must be Boolean');
        return { cancelled: response.cancelled };
      });
    },
  };
}
