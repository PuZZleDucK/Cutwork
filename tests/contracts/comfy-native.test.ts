/** Approved native-binding assertions plus implementation regressions.
 * Real local HTTP/process fixtures with synthetic data; no Comfy, GPU or LAN jobs. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { createServer as createTcpServer, type Socket } from 'node:net';
import { beforeAll, afterEach, describe, expect, test } from 'vitest';
import { observeProcess } from '../../apps/server/src/providers/run.ts';
import { cancelComfyJob, type ProcessOwner, type ComfyObservation } from '../../apps/server/src/jobs/native-control.ts';
import * as bindingModule from '../../apps/server/src/jobs/comfy-native.ts';

type Projection = Pick<ComfyObservation, 'running' | 'queued' | 'terminal'>;
interface BindingConfig {
  port: number;
  owner: ProcessOwner;
  promptId: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
interface Binding {
  observe(signal: AbortSignal): Promise<ComfyObservation>;
  post(path: string, body: Record<string, never>, signal: AbortSignal): Promise<{ cancelled: boolean }>;
}
interface ConnectionEvidence {
  clientAddress: string; clientPort: number;
  serverAddress: string; serverPort: number;
  tcp: string; fdLinks: string[];
}
interface NativeModule {
  decodeComfyJob(promptId: string, httpStatus: number, body: unknown): Projection;
  matchComfyConnection(evidence: ConnectionEvidence): boolean;
  createComfyNativeBinding(config: BindingConfig, io?: {
    // Fault injection for unreadable/changing process identity. Ordinary calls
    // use the real Linux reader; socket ownership is not replaced by this seam.
    readIdentity?: (pid: number, signal: AbortSignal) => Promise<ProcessOwner>;
  }): Binding;
}

const native: NativeModule = bindingModule;
beforeAll(() => {
  if (process.platform !== 'linux') throw new Error('This binding targets the agreed Linux server');
});

const prompt = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const getPath = `/api/jobs/${prompt}`;
const cancelPath = `${getPath}/cancel`;
const signal = () => new AbortController().signal;
const empty = (): Projection => ({ running: [], queued: [], terminal: {} });
const pending = () => ({ id: prompt, status: 'pending' });
const running = () => ({ id: prompt, status: 'in_progress' });
const terminal = (status: 'completed' | 'failed' | 'cancelled', id = prompt) => ({
  id, status, execution_status: {
    status_str: status === 'completed' ? 'success' : 'error',
    completed: status === 'completed',
    messages: [[status === 'completed' ? 'execution_success' : status === 'failed' ? 'execution_error' : 'execution_interrupted',
      { prompt_id: id, timestamp: 123456 }]],
  },
});

describe('Pinned Comfy job decoding: explicit native facts, not normalised-label trust', () => {
  test.each([
    ['pending', pending(), { ...empty(), queued: [prompt] }],
    ['in progress', running(), { ...empty(), running: [prompt] }],
    ['completed', terminal('completed'), { ...empty(), terminal: { [prompt]: 'succeeded' } }],
    ['failed with completed=false', terminal('failed'), { ...empty(), terminal: { [prompt]: 'failed' } }],
    ['interrupted with completed=false', terminal('cancelled'), { ...empty(), terminal: { [prompt]: 'cancelled' } }],
  ])('decodes %s', (_label, body, expected) => {
    expect(native.decodeComfyJob(prompt, 200, body)).toEqual(expected);
  });

  test('exact owned-route 404 conveys absence only, never a stopped service or released GPU', () => {
    expect(native.decodeComfyJob(prompt, 404, { error: 'Job not found' })).toEqual(empty());
  });

  test.each([
    ['missing execution status', { id: prompt, status: 'completed' }],
    ['unknown job status', { id: prompt, status: 'new-upstream-state' }],
    ['wrong job ID', terminal('completed', other)],
    ['inconsistent success flag', { ...terminal('completed'), execution_status: { ...terminal('completed').execution_status, completed: false } }],
    ['inconsistent error flag', { ...terminal('failed'), execution_status: { ...terminal('failed').execution_status, completed: true } }],
    ['missing explicit status string', { ...terminal('completed'), execution_status: { completed: true, messages: [] } }],
    ['failed label with interruption', { ...terminal('cancelled'), status: 'failed' }],
    ['cancelled label without interruption', { ...terminal('failed'), status: 'cancelled' }],
    ['success with error event', { ...terminal('completed'), execution_status: { ...terminal('completed').execution_status, messages: terminal('failed').execution_status.messages } }],
    ['terminal event for another prompt', { ...terminal('completed'), execution_status: terminal('completed', other).execution_status }],
  ])('rejects %s rather than manufacturing terminal evidence', (_label, body) => {
    expect(() => native.decodeComfyJob(prompt, 200, body)).toThrow();
  });

  test('unexpected HTTP status and generic missing-route responses are not job absence', () => {
    for (const [status, body] of [[500, pending()], [302, pending()], [404, {}], [404, '<html>Not found</html>']] as const) {
      expect(() => native.decodeComfyJob(prompt, status, body)).toThrow();
    }
  });

  test.each(['completed', 'failed', 'cancelled'] as const)('an array masquerading as %s is invalid, not terminal evidence', status => {
    for (const messages of [terminal(status).execution_status.messages, []]) {
      const body = { ...terminal(status), status: [status],
        execution_status: { ...terminal(status).execution_status, messages } };
      expect(() => native.decodeComfyJob(prompt, 200, body))
        .toThrow(expect.objectContaining({ code: 'COMFY_RESPONSE' }));
    }
  });
});

describe('Kernel connection matching: exact server-side socket, not port or namespace alone', () => {
  const row = (local: string, remote: string, state: string, inode: string) =>
    `0: ${local} ${remote} ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1 0000000000000000`;
  const base: ConnectionEvidence = {
    clientAddress: '127.0.0.1', clientPort: 49152, serverAddress: '127.0.0.1', serverPort: 8198,
    tcp: '', fdLinks: ['socket:[900]'],
  };
  test.each([
    ['matching accepted connection and owner FD', row('0100007F:2006', '0100007F:C000', '01', '900'), true],
    ['listener only', row('0100007F:2006', '00000000:0000', '0A', '900'), false],
    ['client-side connection', row('0100007F:C000', '0100007F:2006', '01', '900'), false],
    ['server socket owned by someone else', row('0100007F:2006', '0100007F:C000', '01', '901'), false],
    ['different client connection', row('0100007F:2006', '0100007F:C001', '01', '900'), false],
  ])('%s', (_label, tcp, expected) => {
    expect(native.matchComfyConnection({ ...base, tcp })).toBe(expected);
  });
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  while (cleanups.length) {
    try { await cleanups.pop()!(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'HTTP fixture cleanup failed');
});
type Handler = (request: IncomingMessage, response: ServerResponse) => void;

async function httpFixture(handler: Handler) {
  const requests: Array<{ method: string; path: string; body: string }> = [];
  const sockets = new Set<Socket>();
  let bytes = 0, connections = 0;
  const server = createServer((request, response) => {
    const entry = { method: request.method!, path: request.url!, body: '' };
    requests.push(entry);
    request.on('data', chunk => { entry.body += String(chunk); });
    request.on('end', () => handler(request, response));
  });
  server.on('connection', socket => {
    connections++;
    sockets.add(socket);
    socket.on('data', chunk => { bytes += chunk.length; });
    socket.on('close', () => sockets.delete(socket));
  });
  cleanups.push(async () => {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
    await closed;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback fixture port');
  const config: BindingConfig = {
    port: address.port, owner: await observeProcess(process.pid), promptId: prompt,
    requestTimeoutMs: 1000, maxResponseBytes: 1024 * 1024,
  };
  return { config, requests, bytes: () => bytes, connections: () => connections, sockets };
}
function json(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
async function drained(f: Awaited<ReturnType<typeof httpFixture>>) {
  await wait(10); // Allow accepted/closed socket events to reach the fixture.
  const deadline = performance.now() + 1500;
  while (f.sockets.size && performance.now() < deadline) await wait(10);
  expect(f.sockets.size).toBe(0);
}
async function otherLiveOwner() {
  const child = spawn(process.execPath, ['-e', "process.send('ready'); setInterval(()=>{},1000)"],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit', { signal: AbortSignal.timeout(2000) });
      child.kill('SIGTERM'); // Only this test's freshly spawned, still-live child.
      await exited;
    }
  });
  await once(child, 'message', { signal: AbortSignal.timeout(2000) });
  return observeProcess(child.pid!);
}

async function childHttpFixture() {
  const path = fileURLToPath(new URL('../fixtures/comfy-http-child.mjs', import.meta.url));
  const child = spawn(process.execPath, [path, prompt], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr!.on('data', chunk => { stderr += String(chunk); });
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit', { signal: AbortSignal.timeout(2000) });
      child.send({ type: 'close' });
      try { await exited; }
      catch (error) {
        if (child.exitCode === null && child.signalCode === null) {
          const stopped = once(child, 'exit', { signal: AbortSignal.timeout(2000) });
          child.kill('SIGTERM'); // This test's child only, never a discovered service.
          await stopped;
        }
        throw error;
      }
    }
  });
  const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(2000) });
  if (ready?.type !== 'ready' || !Number.isInteger(ready.port)) throw new Error(`Child fixture not ready: ${stderr}`);
  const config: BindingConfig = { port: ready.port, owner: await observeProcess(child.pid!), promptId: prompt,
    requestTimeoutMs: 1000, maxResponseBytes: 1024 * 1024 };
  const counters = async () => {
    const reply = once(child, 'message', { signal: AbortSignal.timeout(2000) });
    child.send({ type: 'snapshot' });
    const [snapshot] = await reply;
    if (snapshot?.type !== 'snapshot') throw new Error('Invalid fixture counters');
    return snapshot as { type: 'snapshot'; bytes: number; requests: number };
  };
  return { config, counters };
}

describe('Actual loopback HTTP and process ownership, with synthetic Comfy responses', () => {
  test('reads the captured job from a real locally owned socket', async () => {
    const f = await httpFixture((_request, response) => json(response, running()));
    const binding = native.createComfyNativeBinding(f.config);
    expect(await binding.observe(signal())).toEqual({ service: f.config.owner, ...empty(), running: [prompt] });
    expect(f.requests).toEqual([{ method: 'GET', path: getPath, body: '' }]);
    await drained(f);
  });

  test.each([true, false])('POST retains Boolean acknowledgement %s, sends exactly one captured request', async cancelled => {
    const f = await httpFixture((_request, response) => json(response, { cancelled }));
    const binding = native.createComfyNativeBinding(f.config);
    expect(await binding.post(cancelPath, {}, signal())).toEqual({ cancelled });
    expect(f.requests).toEqual([{ method: 'POST', path: cancelPath, body: '{}' }]);
    await drained(f);
  });

  test.each(['pid', 'group', 'start', 'boot'] as const)('changed %s sends no HTTP bytes', async field => {
    const f = await httpFixture((_request, response) => json(response, { cancelled: true }));
    const badOwner = { ...f.config.owner, [field]: typeof f.config.owner[field] === 'number' ? 2_147_483_647 : 'not-this-process' } as ProcessOwner;
    const binding = native.createComfyNativeBinding({ ...f.config, owner: badOwner });
    await expect(binding.post(cancelPath, {}, signal())).rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
    await drained(f);
    expect(f.bytes()).toBe(0);
    expect(f.requests).toHaveLength(0);
  });

  test('another live PID in the same network namespace cannot claim the server socket', async () => {
    const f = await httpFixture((_request, response) => json(response, { cancelled: true }));
    const binding = native.createComfyNativeBinding({ ...f.config, owner: await otherLiveOwner() });
    await expect(binding.post(cancelPath, {}, signal())).rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
    await drained(f);
    expect(f.bytes()).toBe(0);
    expect(f.requests).toHaveLength(0);
  });

  test('a real child service is accepted when its server-side connection belongs to the captured child', async () => {
    const f = await childHttpFixture();
    expect((await native.createComfyNativeBinding(f.config).observe(signal())).running).toEqual([prompt]);
    const counters = await f.counters();
    expect(counters.requests).toBe(1);
    expect(counters.bytes).toBeGreaterThan(0);
  });

  test('owning the client socket does not authorise HTTP to a child-owned server', async () => {
    const f = await childHttpFixture();
    const clientOwner = await observeProcess(process.pid);
    await expect(native.createComfyNativeBinding({ ...f.config, owner: clientOwner }).post(cancelPath, {}, signal()))
      .rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
    await wait(20);
    const counters = await f.counters();
    expect(counters.requests).toBe(0);
    expect(counters.bytes).toBe(0);
  });

  test('configuration mutation cannot redirect requests or replace captured owner/prompt', async () => {
    const f = await httpFixture((_request, response) => json(response, pending()));
    const otherServer = await httpFixture((_request, response) => json(response, running()));
    const input = { ...f.config, owner: { ...f.config.owner } };
    const binding = native.createComfyNativeBinding(input);
    input.port = otherServer.config.port; input.promptId = other; input.owner.start = 'changed';
    expect((await binding.observe(signal())).queued).toEqual([prompt]);
    expect(f.requests[0]?.path).toBe(getPath);
    expect(otherServer.bytes()).toBe(0);
  });

  test('HTTP uses the verified connection even after another listener takes its port', async () => {
    const originalRequests: string[] = [];
    const original = createServer((request, response) => {
      originalRequests.push(request.url!); json(response, pending());
    });
    const sockets = new Set<Socket>();
    let originalConnections = 0, replacementConnections = 0;
    // A raw TCP listener lets us close only the listening socket without
    // http.Server.close() also closing idle accepted HTTP connections.
    const listener = createTcpServer(socket => {
      originalConnections++;
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      original.emit('connection', socket);
    });
    const replacement = createServer((_request, response) => json(response, running()));
    replacement.on('connection', socket => {
      replacementConnections++;
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    });
    let originalClosed: Promise<void> | undefined;
    cleanups.push(async () => {
      for (const socket of sockets) socket.destroy();
      original.closeAllConnections(); replacement.closeAllConnections();
      if (replacement.listening) await new Promise<void>((resolve, reject) => replacement.close(error => error ? reject(error) : resolve()));
      if (originalClosed) await originalClosed;
      else if (listener.listening) await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    });
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('Missing original listener port');
    const owner = await observeProcess(process.pid);
    let reads = 0;
    const binding = native.createComfyNativeBinding({ port: address.port, owner, promptId: prompt,
      requestTimeoutMs: 1000, maxResponseBytes: 4096 }, {
      readIdentity: async pid => {
        if (++reads === 2) {
          originalClosed = new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
          replacement.listen(address.port, '127.0.0.1');
          await once(replacement, 'listening');
        }
        return observeProcess(pid);
      },
    });
    expect((await binding.observe(signal())).queued).toEqual([prompt]);
    expect(reads).toBe(3); // Initial identity, verified connection, complete response.
    expect(originalRequests).toEqual([getPath]);
    expect(originalConnections).toBe(1);
    expect(replacementConnections).toBe(0);
  });

  test('global/different-job POST paths and nonempty cancel bodies are refused locally', async () => {
    const f = await httpFixture((_request, response) => json(response, { cancelled: true }));
    const binding = native.createComfyNativeBinding(f.config);
    for (const path of ['/interrupt', '/queue', '/api/jobs/cancel', `/api/jobs/${other}/cancel`]) {
      await expect(binding.post(path, {}, signal())).rejects.toMatchObject({ code: 'COMFY_TARGET' });
    }
    await expect(binding.post(cancelPath, { clear: true } as unknown as Record<string, never>, signal()))
      .rejects.toMatchObject({ code: 'COMFY_TARGET' });
    expect(f.bytes()).toBe(0);
  });

  test('a pre-aborted caller makes no connection or HTTP request', async () => {
    const f = await httpFixture((_request, response) => json(response, pending()));
    const aborted = new AbortController(); aborted.abort();
    await expect(native.createComfyNativeBinding(f.config).observe(aborted.signal))
      .rejects.toMatchObject({ code: 'COMFY_ABORTED' });
    await drained(f);
    expect(f.bytes()).toBe(0);
    expect(f.connections()).toBe(0);
  });

  test('invalid captured IDs, ports and request budgets fail before network work', async () => {
    const f = await httpFixture((_request, response) => json(response, pending()));
    for (const change of [
      { port: 0 }, { port: 65536 }, { port: Number.NaN },
      { promptId: '' }, { promptId: '../cancel' },
      { requestTimeoutMs: 0 }, { requestTimeoutMs: Infinity }, { maxResponseBytes: 0 },
    ]) {
      expect(() => native.createComfyNativeBinding({ ...f.config, ...change })).toThrow();
    }
    expect(f.connections()).toBe(0);
    expect(f.bytes()).toBe(0);
  });

  test.each(['headers', 'body', 'trickle'] as const)('bounds stalled %s by one complete-request deadline and closes the socket', async mode => {
    const f = await httpFixture((_request, response) => {
      if (mode === 'headers') return;
      response.writeHead(200, { 'content-type': 'application/json' }); response.flushHeaders();
      if (mode === 'trickle') {
        const timer = setInterval(() => response.write(' '), 20);
        response.on('close', () => clearInterval(timer));
      }
    });
    const started = performance.now();
    await expect(native.createComfyNativeBinding({ ...f.config, requestTimeoutMs: 250 }).observe(signal()))
      .rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(performance.now() - started).toBeLessThan(2000); // Generous diagnostic bound, not a product SLA.
    await drained(f);
    expect(f.requests).toHaveLength(1);
  });

  test('caller abort during an unfinished response closes the socket instead of waiting for the body', async () => {
    const aborted = new AbortController();
    const f = await httpFixture((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' }); response.flushHeaders();
      aborted.abort();
    });
    await expect(native.createComfyNativeBinding(f.config).observe(aborted.signal))
      .rejects.toMatchObject({ code: 'COMFY_ABORTED' });
    await drained(f);
    expect(f.requests).toHaveLength(1);
  });

  test('oversized JSON is an explicit observation failure, never a truncated success', async () => {
    const f = await httpFixture((_request, response) => json(response, { ...pending(), padding: 'x'.repeat(4096) }));
    await expect(native.createComfyNativeBinding({ ...f.config, maxResponseBytes: 256 }).observe(signal()))
      .rejects.toMatchObject({ code: 'COMFY_RESPONSE_LIMIT' });
    await drained(f);
  });

  test('a valid terminal JSON prefix without HTTP message completion is not stop evidence', async () => {
    const f = await httpFixture((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write(JSON.stringify(terminal('completed'))); // Valid JSON, but deliberately no response.end().
    });
    await expect(native.createComfyNativeBinding({ ...f.config, requestTimeoutMs: 250 }).observe(signal()))
      .rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(f.requests).toHaveLength(1);
    await drained(f);
  });

  test('delayed bytes count toward the cumulative response limit after a valid JSON prefix', async () => {
    const f = await httpFixture((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write(JSON.stringify(terminal('completed')));
      const timer = setInterval(() => response.write(' '.repeat(200)), 20);
      response.on('close', () => clearInterval(timer));
    });
    await expect(native.createComfyNativeBinding({ ...f.config, maxResponseBytes: 512 }).observe(signal()))
      .rejects.toMatchObject({ code: 'COMFY_RESPONSE_LIMIT' });
    expect(f.requests).toHaveLength(1);
    await drained(f);
  });

  test('redirects never forward the targeted POST to another endpoint', async () => {
    const target = await httpFixture((_request, response) => json(response, { cancelled: true }));
    const f = await httpFixture((_request, response) => {
      response.writeHead(307, { location: `http://127.0.0.1:${target.config.port}${cancelPath}` }); response.end();
    });
    await expect(native.createComfyNativeBinding(f.config).post(cancelPath, {}, signal()))
      .rejects.toMatchObject({ code: 'COMFY_HTTP_STATUS' });
    expect(target.bytes()).toBe(0);
    expect(f.requests).toHaveLength(1);
    await drained(f);
  });

  test.each(['malformed JSON', 'non-Boolean ACK', 'HTTP failure', 'dropped response'] as const)('%s never causes a second POST or invented acknowledgement', async kind => {
    const f = await httpFixture((request, response) => {
      if (kind === 'dropped response') { request.socket.destroy(); return; }
      if (kind === 'HTTP failure') { json(response, { cancelled: true }, 500); return; }
      if (kind === 'non-Boolean ACK') { json(response, { cancelled: 'true' }); return; }
      response.writeHead(200, { 'content-type': 'application/json' }); response.end('{');
    });
    await expect(native.createComfyNativeBinding(f.config).post(cancelPath, {}, signal())).rejects.toThrow();
    expect(f.requests).toHaveLength(1);
    await drained(f);
  });

  test('fault-injected identity drift after a valid response invalidates its evidence', async () => {
    let replied = false;
    const f = await httpFixture((_request, response) => { replied = true; json(response, terminal('completed')); });
    const binding = native.createComfyNativeBinding(f.config, {
      readIdentity: async pid => replied ? { ...f.config.owner, start: 'replacement' } : observeProcess(pid),
    });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
    expect(f.requests).toHaveLength(1);
    await drained(f);
  });

  test('a stuck initial identity read is bounded before any HTTP bytes can be sent', async () => {
    const f = await httpFixture((_request, response) => json(response, pending()));
    let observedSignal: AbortSignal | undefined;
    const binding = native.createComfyNativeBinding({ ...f.config, requestTimeoutMs: 250 }, {
      readIdentity: (_pid, signal) => { observedSignal = signal; return new Promise(() => {}); },
    });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(observedSignal?.aborted).toBe(true);
    await drained(f);
    expect(f.bytes()).toBe(0);
  });

  test('an initial identity read resolving after timeout cannot open a late connection', async () => {
    const f = await httpFixture((_request, response) => json(response, pending()));
    let release!: () => void;
    const binding = native.createComfyNativeBinding({ ...f.config, requestTimeoutMs: 100 }, {
      readIdentity: () => new Promise(resolve => { release = () => resolve(f.config.owner); }),
    });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    release();
    await wait(30);
    await drained(f);
    expect(f.connections()).toBe(0);
    expect(f.bytes()).toBe(0);
  });

  test('the same deadline includes a stuck final identity read after a complete response', async () => {
    let replied = false;
    const f = await httpFixture((_request, response) => { replied = true; json(response, terminal('completed')); });
    const binding = native.createComfyNativeBinding({ ...f.config, requestTimeoutMs: 250 }, {
      readIdentity: pid => replied ? new Promise(() => {}) : observeProcess(pid),
    });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(f.requests).toHaveLength(1);
    await drained(f);
  });

  test('response and final identity verification share one deadline rather than resetting it per phase', async () => {
    let replied = false, finalReadStarted = false;
    const f = await httpFixture((_request, response) => {
      const timer = setTimeout(() => { replied = true; json(response, terminal('completed')); }, 400);
      response.on('close', () => clearTimeout(timer));
    });
    const binding = native.createComfyNativeBinding({ ...f.config, requestTimeoutMs: 600 }, {
      readIdentity: async pid => {
        if (replied) { finalReadStarted = true; await wait(400); }
        return observeProcess(pid);
      },
    });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(replied).toBe(true);
    expect(finalReadStarted).toBe(true);
    await drained(f);
  });

  test('connects the actual controller to queued/ACK/absent HTTP fixtures without claiming GPU release', async () => {
    let removed = false;
    const f = await httpFixture((request, response) => {
      if (request.method === 'POST') { removed = true; json(response, { cancelled: true }); }
      else if (removed) json(response, { error: 'Job not found' }, 404);
      else json(response, pending());
    });
    const binding = native.createComfyNativeBinding(f.config);
    const result = await cancelComfyJob({ ...binding, promptId: prompt, owner: f.config.owner,
      now: () => performance.now(), wait, timeoutMs: 2500 });
    expect(result.state).toBe('native-stopped');
    expect(result.cancelAcknowledged).toBe(true);
    expect(Object.hasOwn(result, 'resourcesReleased')).toBe(false);
    expect(f.requests.map(r => [r.method, r.path])).toEqual([
      ['GET', getPath], ['POST', cancelPath], ['GET', getPath],
    ]);
    await drained(f);
  });
});
