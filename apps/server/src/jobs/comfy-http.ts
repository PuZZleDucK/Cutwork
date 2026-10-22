import { once } from 'node:events';
import { readFile, readdir, readlink } from 'node:fs/promises';
import { request as httpRequest, type ClientRequest } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import { endianness } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { observeProcess } from '../providers/run.ts';
import type { ProcessOwner } from './native-control.ts';

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

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

export interface OwnedTransportConfig {
  port: number;
  owner: ProcessOwner;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface OwnedTransportIo {
  readIdentity?: (pid: number, signal: AbortSignal) => Promise<ProcessOwner>;
}
export interface JsonRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
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

/** One owned Linux/loopback connection per request. Internal primitive, not a
 * browser-supplied URL API. No automatic redirects, retries, proxy or reconnect. */
export function createOwnedComfyTransport(input: OwnedTransportConfig, io: OwnedTransportIo = {}) {
  if (process.platform !== 'linux') throw new ComfyNativeError('COMFY_IDENTITY', 'The local Comfy binding requires Linux /proc');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535 ||
      !Number.isFinite(input.requestTimeoutMs) || input.requestTimeoutMs <= 0 || input.requestTimeoutMs > 2_147_483_647 ||
      !Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes <= 0) {
    throw new ComfyNativeError('COMFY_TARGET', 'Invalid captured port or request budget');
  }
  if (!validOwner(input.owner)) throw new ComfyNativeError('COMFY_IDENTITY', 'Incomplete captured process identity');
  const { port, requestTimeoutMs, maxResponseBytes } = input;
  const owner = { ...input.owner };
  const readIdentity = io.readIdentity ?? observeProcess;

  async function exchange<T>(input: JsonRequest, caller: AbortSignal, decode: (status: number, body: unknown) => T): Promise<T> {
    if (caller.aborted) throw new ComfyNativeError('COMFY_ABORTED', 'Comfy request aborted before connection');
    const expiresAt = performance.now() + requestTimeoutMs;
    // Snapshot the whole outbound request before the first await. JSON bytes,
    // rather than a retained mutable graph, are the actual submitted intent.
    const { method, path } = input;
    if (!['GET', 'POST'].includes(method) || typeof path !== 'string' ||
        !path.startsWith('/') || path.startsWith('//') || /[^\x21-\x7e]|[#\\]/.test(path) ||
        (method === 'GET' && Object.hasOwn(input, 'body')) || (method === 'POST' && !record(input.body))) {
      throw new ComfyNativeError('COMFY_TARGET', 'Expected a relative HTTP path and a POST-only JSON object');
    }
    let payload: string | undefined;
    if (method === 'POST') {
      try {
        payload = JSON.stringify(input.body);
        if (typeof payload !== 'string' || !record(JSON.parse(payload))) throw new Error('Not a JSON object');
      } catch (cause) { throw new ComfyNativeError('COMFY_TARGET', 'Cannot capture POST JSON body', cause); }
    }
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
    // User-defined JSON getters/toJSON can abort or consume time synchronously.
    // Neither may create a fresh waiting budget or slip past the abort listener.
    if (caller.aborted) onAbort();
    const timer = setTimeout(() => fail(timeoutError()), Math.max(1, Math.ceil(expiresAt - performance.now())));
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
        req = httpRequest({ host: '127.0.0.1', port, method, path,
          createConnection: () => socket!, maxHeaderSize: 16 * 1024,
          headers: { connection: 'close', accept: 'application/json',
            ...(method === 'POST' ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload!, 'utf8')) } : {}) },
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
        req.end(payload);
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

  return { request: exchange };
}
