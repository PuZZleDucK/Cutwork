/** Approved whole-queue contract: synthetic payloads and owned loopback HTTP only.
 * Import/collection starts no fixture. No Comfy, GPU, provider or LAN calls. */
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { observeProcess } from '../../apps/server/src/providers/run.ts';
import * as module from '../../apps/server/src/jobs/comfy-queue.ts';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';
const row = (id = first, number = 0): unknown[] => [number, id,
  { '1': { class_type: 'SyntheticNode', inputs: { text: 'fixture-only prompt' } } },
  { client_id: 'fixture-client', extra_pnginfo: { note: 'not returned by reader' } }, ['1']];
const body = (running: unknown[] = [], queued: unknown[] = []) => ({ queue_running: running, queue_pending: queued });
const callers: AbortController[] = [];
function caller() { const value = new AbortController(); callers.push(value); return value; }
const signal = () => caller().signal;
const changedRow = (index: number, value: unknown) => { const result = row(); result[index] = value; return result; };

// Queue order is retained as wire order, NOT advertised as FIFO/execution order.
describe('Complete queue decoder, not a single-job projection', () => {
  test('accepts explicit complete empty arrays only as queue data, without release flags', () => {
    expect(module.decodeComfyQueue(200, body())).toEqual({ running: [], queued: [] });
  });
  test('keeps every job, including unrelated IDs, without sorting heap storage or leaking payloads', () => {
    const input = body([row(first)], [row(third, 3), row(second, 1)]);
    const result = module.decodeComfyQueue(200, input);
    expect(result).toEqual({ running: [first], queued: [third, second] });
    input.queue_running.length = 0; input.queue_pending.length = 0;
    expect(result).toEqual({ running: [first], queued: [third, second] });
    expect(JSON.stringify(result)).not.toMatch(/fixture-only|client_id|extra_pnginfo/);
  });
  test('accepts finite negative/fractional and repeated priorities, and canonical non-v4 UUIDs', () => {
    const nonV4 = 'aaaaaaaa-aaaa-1aaa-aaaa-aaaaaaaaaaaa';
    expect(module.decodeComfyQueue(200, body([row(nonV4, -2.5)], [row(first, 0.25), row(second, 0.25)])))
      .toEqual({ running: [nonV4], queued: [first, second] });
  });
  test.each([
    ['null body', null], ['array body', []], ['single-job projection', { running: [], queued: [], terminal: {} }],
    ['missing pending', { queue_running: [] }], ['missing running', { queue_pending: [] }],
    ['non-array running', { queue_running: {}, queue_pending: [] }],
    ['non-array pending', { queue_running: [], queue_pending: null }],
    ['diagnostic envelope', { ...body(), error: 'partial queue observation' }],
  ])('rejects %s rather than calling it empty', (_label, value) => {
    expect(() => module.decodeComfyQueue(200, value)).toThrow(expect.objectContaining({ code: 'COMFY_RESPONSE' }));
  });
  test.each([
    ['object row', { number: 0, id: first }], ['short row', row().slice(0, 4)],
    ['extra tuple field', [...row(), { fixtureSensitive: 'must not escape' }]],
    ['string priority', changedRow(0, '0')], ['NaN priority', changedRow(0, Number.NaN)],
    ['infinite priority', changedRow(0, Infinity)], ['empty ID', changedRow(1, '')],
    ['non-string ID', changedRow(1, [first])], ['noncanonical ID', changedRow(1, first + '\n')],
    ['same-length non-hex ID', changedRow(1, 'gggggggg-1111-4111-8111-111111111111')],
    ['uppercase ID', changedRow(1, 'AAAAAAAA-aaaa-4aaa-8aaa-aaaaaaaaaaaa')],
    ['array graph', changedRow(2, [])], ['null metadata', changedRow(3, null)],
    ['non-array outputs', changedRow(4, {})], ['non-string output ID', changedRow(4, [1])],
  ])('rejects %s in either list without silently filtering the bad row', (_label, invalid) => {
    for (const value of [body([row(second), invalid], []), body([], [row(second), invalid])]) {
      expect(() => module.decodeComfyQueue(200, value)).toThrow(expect.objectContaining({ code: 'COMFY_RESPONSE' }));
    }
  });
  test.each([
    ['running', body([row(), row()])], ['pending', body([], [row(), row()])],
    ['both lists', body([row()], [row()])],
  ])('duplicate identity in %s is ambiguous, not deduplicated', (_label, value) => {
    expect(() => module.decodeComfyQueue(200, value)).toThrow(expect.objectContaining({ code: 'COMFY_RESPONSE' }));
  });
  test.each([204, 302, 404, 500])('HTTP %s cannot assert an empty queue, even with empty-array JSON', status => {
    expect(() => module.decodeComfyQueue(status, body())).toThrow(expect.objectContaining({ code: 'COMFY_HTTP_STATUS' }));
  });
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  // Retire any late observation BEFORE closing its fixture, even on a failed test.
  for (const abort of callers.splice(0)) abort.abort(new Error('Queue test ended'));
  const errors: unknown[] = [];
  while (cleanups.length) { try { await cleanups.pop()!(); } catch (error) { errors.push(error); } }
  vi.restoreAllMocks();
  if (errors.length) throw new AggregateError(errors, 'Owned loopback queue fixture cleanup failed');
});
function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value));
}
async function fixture(respond: (response: ServerResponse, requestIndex: number) => void = response => json(response, body())) {
  const requests: Array<{ method: string; path: string; text: string }> = [];
  const sockets = new Set<Socket>();
  let bytes = 0, connections = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method!, path: request.url!, text: Buffer.concat(chunks).toString('utf8') });
      respond(response, requests.length);
    });
  });
  server.on('connection', socket => {
    connections++; sockets.add(socket);
    socket.on('data', chunk => { bytes += chunk.length; });
    socket.on('close', () => sockets.delete(socket));
  });
  cleanups.push(async () => {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections(); for (const socket of sockets) socket.destroy(); await closed;
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback queue fixture port');
  const config = { port: address.port, owner: await observeProcess(process.pid), requestTimeoutMs: 2000, maxResponseBytes: 65536 };
  return { config, requests, sockets, bytes: () => bytes, connections: () => connections, server };
}
async function drained(f: Awaited<ReturnType<typeof fixture>>) {
  const until = performance.now() + 1500;
  do { await wait(10); if (!f.sockets.size) return; } while (performance.now() < until);
  expect(f.sockets.size).toBe(0);
}

describe('Owned read-only whole-queue binding', () => {
  test('uses only GET /queue and returns the exact service plus complete job lists', async () => {
    const f = await fixture(response => json(response, body([row(first)], [row(second)])));
    const binding = module.createComfyQueueBinding(f.config);
    expect(Object.keys(binding)).toEqual(['observe']);
    const result = await binding.observe(signal());
    expect(result).toEqual({ kind: 'comfy-whole-queue', service: f.config.owner, running: [first], queued: [second] });
    expect(f.requests).toEqual([{ method: 'GET', path: '/queue', text: '' }]);
    expect(f.connections()).toBe(1);
    await drained(f); expect(f.server.listening).toBe(true); // Client cleanup is not service teardown.
  });
  test('explicit repeated observations read fresh data; an earlier empty response is not cached', async () => {
    const f = await fixture((response, index) => json(response, index === 1 ? body() : body([], [row()])));
    const binding = module.createComfyQueueBinding(f.config);
    const previous = await binding.observe(signal());
    previous.service.start = 'caller-mutated'; previous.queued.push(second);
    expect(await binding.observe(signal())).toEqual({ kind: 'comfy-whole-queue', service: f.config.owner, running: [], queued: [first] });
    expect(f.requests).toHaveLength(2); await drained(f);
  });
  test('captures configuration and does not retarget the service after construction', async () => {
    const f = await fixture(); const expected = structuredClone(f.config.owner);
    const binding = module.createComfyQueueBinding(f.config);
    f.config.port = 1; f.config.owner.start = 'changed'; f.config.maxResponseBytes = 1;
    expect(await binding.observe(signal())).toEqual({ kind: 'comfy-whole-queue', service: expected, running: [], queued: [] });
    expect(f.requests).toHaveLength(1); await drained(f);
  });
  test('a wrong captured process identity sends zero HTTP bytes, rather than assuming emptiness', async () => {
    const f = await fixture();
    const binding = module.createComfyQueueBinding({ ...f.config, owner: { ...f.config.owner, start: 'not-the-start-time' } });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
    expect(f.requests).toEqual([]); expect(f.bytes()).toBe(0); expect(f.connections()).toBe(0);
  });
  test('service identity change after response rejects empty-looking queue data', async () => {
    let responded = false;
    const f = await fixture(response => { responded = true; json(response, body()); });
    const binding = module.createComfyQueueBinding(f.config, { readIdentity: async () => ({
      ...f.config.owner, start: responded ? 'replacement-start' : f.config.owner.start,
    }) });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_IDENTITY' });
    expect(f.requests).toHaveLength(1); await drained(f);
  });
  test.each([404, 500])('HTTP %s is not retried, converted to empty, or replaced by another endpoint', async status => {
    const f = await fixture(response => json(response, body(), status));
    await expect(module.createComfyQueueBinding(f.config).observe(signal())).rejects.toMatchObject({ code: 'COMFY_HTTP_STATUS' });
    expect(f.requests).toEqual([{ method: 'GET', path: '/queue', text: '' }]); await drained(f);
  });
  test('a malformed row rejects the entire HTTP observation, with no valid-prefix success', async () => {
    const f = await fixture(response => json(response, body([], [row(), [0, second]])));
    await expect(module.createComfyQueueBinding(f.config).observe(signal())).rejects.toMatchObject({ code: 'COMFY_RESPONSE' });
    expect(f.requests).toHaveLength(1); await drained(f);
  });
  test('invalid JSON is not an empty queue', async () => {
    const f = await fixture(response => { response.writeHead(200); response.end('{"queue_running":[],'); });
    await expect(module.createComfyQueueBinding(f.config).observe(signal())).rejects.toMatchObject({ code: 'COMFY_RESPONSE' });
    expect(f.requests).toHaveLength(1); await drained(f);
  });
  test('connection loss is uncertainty, not queue clearance or an automatic retry', async () => {
    const f = await fixture(response => { response.socket!.destroy(); });
    await expect(module.createComfyQueueBinding(f.config).observe(signal())).rejects.toMatchObject({ code: 'COMFY_TRANSPORT' });
    expect(f.requests).toHaveLength(1); await drained(f);
  });
  test('oversized payload is rejected by the existing whole-response byte limit', async () => {
    const f = await fixture(response => json(response, body([row()])));
    f.config.maxResponseBytes = 32;
    await expect(module.createComfyQueueBinding(f.config).observe(signal())).rejects.toMatchObject({ code: 'COMFY_RESPONSE_LIMIT' });
    expect(f.requests).toHaveLength(1); await drained(f);
  });
  test('pre-abort starts no connection or request', async () => {
    const f = await fixture(); const abort = caller(); abort.abort();
    await expect(module.createComfyQueueBinding(f.config).observe(abort.signal)).rejects.toMatchObject({ code: 'COMFY_ABORTED' });
    expect(f.connections()).toBe(0); expect(f.requests).toEqual([]); expect(f.bytes()).toBe(0);
  });
  test('active abort closes only the client and does not wait for the request deadline', async () => {
    let entered!: () => void;
    const observedRequest = new Promise<void>(resolve => { entered = resolve; });
    const f = await fixture(response => { response.writeHead(200); response.write('{'); entered(); });
    f.config.requestTimeoutMs = 10_000;
    const abort = caller();
    const promise = module.createComfyQueueBinding(f.config).observe(abort.signal);
    const rejected = expect(promise).rejects.toMatchObject({ code: 'COMFY_ABORTED' });
    // An implementation that never reaches the endpoint must not outlive this
    // test's cleanup. This guard is independent of the 10 s production budget.
    const guard = new AbortController();
    try {
      await Promise.race([observedRequest, wait(1500, undefined, { signal: AbortSignal.any([abort.signal, guard.signal]) })
        .then(() => { throw new Error('Queue fixture did not receive request within 1500 ms'); })]);
    } finally { guard.abort(); abort.abort(); }
    await rejected;
    expect(f.requests).toHaveLength(1); await drained(f); expect(f.server.listening).toBe(true);
  });
  test('an incomplete body consumes one request deadline, never a fresh retry budget', async () => {
    const f = await fixture(response => { response.writeHead(200); response.write('{"queue_running":[],'); });
    f.config.requestTimeoutMs = 1000;
    await expect(module.createComfyQueueBinding(f.config).observe(signal())).rejects.toMatchObject({ code: 'COMFY_TIMEOUT' });
    expect(f.requests).toHaveLength(1); await drained(f); expect(f.server.listening).toBe(true);
  });
  test('a later failed read cannot return the last successful empty queue', async () => {
    const f = await fixture((response, index) => json(response, index === 1 ? body() : { error: 'fixture failure' }, index === 1 ? 200 : 500));
    const binding = module.createComfyQueueBinding(f.config);
    expect(await binding.observe(signal())).toMatchObject({ running: [], queued: [] });
    await expect(binding.observe(signal())).rejects.toMatchObject({ code: 'COMFY_HTTP_STATUS' });
    expect(f.requests).toHaveLength(2); await drained(f);
  });
});
