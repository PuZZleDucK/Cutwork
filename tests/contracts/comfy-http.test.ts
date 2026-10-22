/** Approved transport extraction assertions; synthetic local HTTP fixtures only. */
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { observeProcess } from '../../apps/server/src/providers/run.ts';
import { type TransportModule, type JsonRequest } from '../support/comfy-cpu-contract.ts';
import * as transportModule from '../../apps/server/src/jobs/comfy-http.ts';

const module: TransportModule = transportModule;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  while (cleanups.length) { try { await cleanups.pop()!(); } catch (error) { errors.push(error); } }
  if (errors.length) throw new AggregateError(errors, 'Owned HTTP fixture cleanup failed');
});
const freshSignal = () => new AbortController().signal;
const raw = (status: number, body: unknown) => ({ status, body });
async function fixture(respond?: (response: ServerResponse) => void) {
  const received: Array<{ method: string; path: string; text: string; declaredBytes: string | undefined; bytes: number }> = [];
  const sockets = new Set<Socket>();
  let connections = 0, bytes = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      received.push({ method: request.method!, path: request.url!, text: body.toString('utf8'),
        declaredBytes: request.headers['content-length'], bytes: body.length });
      if (respond) respond(response);
      else { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}'); }
    });
  });
  server.on('connection', socket => {
    connections++; sockets.add(socket);
    socket.on('data', chunk => { bytes += chunk.length; });
    socket.on('close', () => sockets.delete(socket));
  });
  cleanups.push(async () => {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
    await closed;
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback fixture port');
  return { config: { port: address.port, owner: await observeProcess(process.pid), requestTimeoutMs: 1000, maxResponseBytes: 4096 },
    received, connections: () => connections, bytes: () => bytes };
}

test('nonempty JSON submission preserves Unicode and sends the actual UTF-8 Content-Length', async () => {
  const f = await fixture();
  const body = { prompt_id: '11111111-1111-4111-8111-111111111111', prompt: { '1': {
    class_type: 'StudioCpuCancellationGate', inputs: { token: 'fixture', note: 'écho 🎵 日本語' },
  } } };
  expect(await module.createOwnedComfyTransport(f.config).request({ method: 'POST', path: '/prompt', body }, freshSignal(), raw))
    .toEqual({ status: 200, body: { ok: true } });
  expect(f.received).toHaveLength(1);
  const entry = f.received[0]!;
  expect([entry.method, entry.path]).toEqual(['POST', '/prompt']);
  expect(JSON.parse(entry.text)).toEqual(body);
  expect(Number(entry.declaredBytes)).toBe(Buffer.byteLength(entry.text, 'utf8'));
  expect(entry.bytes).toBeGreaterThan(entry.text.length);
});

test('GET reads an owned service route without a body', async () => {
  const f = await fixture();
  expect(await module.createOwnedComfyTransport(f.config).request({ method: 'GET', path: '/queue' }, freshSignal(), raw))
    .toEqual({ status: 200, body: { ok: true } });
  expect(f.received[0]).toMatchObject({ method: 'GET', path: '/queue', text: '', bytes: 0 });
});

test('captures request path, method, nested JSON and transport configuration before awaiting identity', async () => {
  const f = await fixture();
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const config = { ...f.config, owner: { ...f.config.owner } };
  const input: JsonRequest = { method: 'POST', path: '/prompt', body: { prompt: { note: 'original' } } };
  const transport = module.createOwnedComfyTransport(config, { readIdentity: async pid => {
    entered(); await gate; return observeProcess(pid);
  } });
  const pending = transport.request(input, freshSignal(), raw);
  await started;
  input.path = '/interrupt'; input.method = 'GET';
  (input.body!.prompt as { note: string }).note = 'changed';
  config.port = 1; config.owner.start = 'changed';
  release();
  await pending;
  expect(f.received).toHaveLength(1);
  expect(f.received[0]).toMatchObject({ method: 'POST', path: '/prompt', text: '{"prompt":{"note":"original"}}' });
});

test('rejects absolute/authority/control-character paths and invalid request bodies before connecting', async () => {
  const f = await fixture();
  const transport = module.createOwnedComfyTransport(f.config);
  const invalid: JsonRequest[] = [
    { method: 'GET', path: 'http://127.0.0.1/queue' }, { method: 'GET', path: '//127.0.0.1/queue' },
    { method: 'GET', path: '' }, { method: 'GET', path: '/queue\r\nX-Test: value' },
    { method: 'GET', path: '/queue', body: {} }, { method: 'POST', path: '/prompt' },
    { method: 'POST', path: '/prompt', body: { impossible: 1n } },
  ];
  for (const input of invalid) await expect(transport.request(input, freshSignal(), raw))
    .rejects.toMatchObject({ code: 'COMFY_TARGET' });
  expect(f.connections()).toBe(0);
});

test('an ambiguous nonempty POST response never causes a second submission', async () => {
  const f = await fixture(response => response.destroy());
  await expect(module.createOwnedComfyTransport(f.config).request(
    { method: 'POST', path: '/prompt', body: { prompt_id: 'stable-identity', prompt: {} } }, freshSignal(), raw))
    .rejects.toMatchObject({ code: 'COMFY_TRANSPORT' });
  expect(f.received).toHaveLength(1);
});

test('unverified owner receives no HTTP bytes, including the submitted graph', async () => {
  const f = await fixture();
  const transport = module.createOwnedComfyTransport({ ...f.config, owner: { ...f.config.owner, start: 'wrong' } });
  await expect(transport.request({ method: 'POST', path: '/prompt', body: { prompt: {} } }, freshSignal(), raw))
    .rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
  expect(f.bytes()).toBe(0);
});

test('pre-aborted graph submission makes no connection', async () => {
  const f = await fixture();
  const abort = new AbortController(); abort.abort();
  await expect(module.createOwnedComfyTransport(f.config).request(
    { method: 'POST', path: '/prompt', body: { prompt: {} } }, abort.signal, raw))
    .rejects.toMatchObject({ code: 'COMFY_ABORTED' });
  expect(f.connections()).toBe(0);
});

test('aborting during JSON capture prevents any connection or submission', async () => {
  const f = await fixture();
  const abort = new AbortController();
  const body = { toJSON() { abort.abort(); return { prompt: {} }; } };
  await expect(module.createOwnedComfyTransport(f.config).request({ method: 'POST', path: '/prompt', body }, abort.signal, raw))
    .rejects.toMatchObject({ code: 'COMFY_ABORTED' });
  expect(f.connections()).toBe(0);
  expect(f.bytes()).toBe(0);
});

test('JSON capture consumes the original deadline rather than delaying its timer', async () => {
  const f = await fixture();
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  try {
    const body = { toJSON() { vi.advanceTimersByTime(60); return { prompt: {} }; } };
    const transport = module.createOwnedComfyTransport({ ...f.config, requestTimeoutMs: 100 }, {
      readIdentity: () => new Promise(() => {}),
    });
    let settled = false;
    const pending = transport.request({ method: 'POST', path: '/prompt', body }, freshSignal(), raw)
      .catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(39);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await pending).toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(f.connections()).toBe(0);
  } finally { vi.useRealTimers(); }
});
