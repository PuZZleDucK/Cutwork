/** In-process HTTP injection + real SQLite only; no listener, worker or generator. */
import { afterEach, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { GpuQueueError, openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import type { CallInput, GpuQueue } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const host = 'studio.local:4310', base = '/api/internal/native-calls';
const directories: string[] = [], queues: GpuQueue[] = [], servers: FastifyInstance[] = [];
const input = (id = 'call-a', changes: Partial<CallInput> = {}): CallInput => ({
  id, attemptId: 'attempt-a', projectId: 'project-a', tool: 'yue2', request: { seed: '18446744073709551615', prompt: 'Music' }, ...changes,
});
const publicKeys = ['id', 'attemptId', 'projectId', 'tool', 'sequence', 'state', 'cancelRequested', 'result', 'error'].sort();
function setup(options: { validateSubmission?: (input: CallInput) => void; hasAttempt?: (id: string) => boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'native-api-')); directories.push(dir);
  const path = join(dir, 'queue.sqlite'), queue = openGpuQueue(path); queues.push(queue);
  const validate = vi.fn(options.validateSubmission ?? (() => {}));
  const known = vi.fn(options.hasAttempt ?? (id => id === 'attempt-a'));
  const app = createNativeApi({ queue, allowedHosts: [host, '127.0.0.1:4310'], validateSubmission: validate, hasAttempt: known }); servers.push(app);
  return { app, queue, path, validate, known };
}
afterEach(async () => {
  const failures: unknown[] = [];
  for (const app of servers.splice(0)) try { await app.close(); } catch (e) { failures.push(e); }
  for (const queue of queues.splice(0)) try { queue.close(); } catch (e) { failures.push(e); }
  for (const dir of directories.splice(0)) try { rmSync(dir, { recursive: true, force: true }); } catch (e) { failures.push(e); }
  if (failures.length) throw new AggregateError(failures, 'Native API fixture cleanup failed');
});

test('health has the narrow coordinator scope and does not bind a listener or mutate the queue', async () => {
  const { app, queue } = setup();
  const r = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
  expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ status: 'ok', scope: 'native-call-coordinator' });
  expect(app.server.listening).toBe(false); expect(queue.list()).toEqual([]); expect(queue.heldLease()).toBeNull();
});
test('submit invokes parent validation before mutation and preserves exact seed strings', async () => {
  let q!: GpuQueue;
  const { app, queue, validate } = setup({ validateSubmission: value => {
    expect(value).toEqual(input()); expect(q.list()).toEqual([]);
  } }); q = queue;
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  expect(r.statusCode).toBe(202); expect(validate).toHaveBeenCalledTimes(1);
  expect(Object.keys(r.json()).sort()).toEqual(publicKeys); expect(r.json()).toMatchObject({ id: 'call-a', state: 'queued', sequence: 1 });
  expect(queue.get('call-a')?.request).toEqual(input().request); expect(queue.heldLease()).toBeNull();
});
test('canonical duplicate is idempotent; changed immutable input is a 409', async () => {
  const { app, queue } = setup();
  const first = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  const duplicate = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input('call-a', { request: { prompt: 'Music', seed: '18446744073709551615' } }) });
  expect(duplicate.statusCode).toBe(202); expect(duplicate.json()).toEqual(first.json());
  const changed = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input('call-a', { projectId: 'other' }) });
  expect(changed.statusCode).toBe(409); expect(changed.json().code).toBe('GPU_QUEUE_CONFLICT');
  expect(queue.events('call-a').filter(e => e.kind === 'submitted')).toHaveLength(1);
});
test('parent rejection of a missing attempt happens before any persisted mutation', async () => {
  const { app, queue } = setup({ validateSubmission: () => { throw new GpuQueueError('GPU_QUEUE_INPUT', 'Missing parent attempt'); } });
  const mutate = vi.spyOn(queue, 'submit');
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  expect(r.statusCode).toBe(400); expect(mutate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test('required parent callbacks cannot be omitted at runtime', () => {
  const { queue } = setup();
  for (const callbacks of [{}, { validateSubmission() {} }, { hasAttempt: () => true }]) {
    expect(() => createNativeApi({ queue, allowedHosts: [host], ...callbacks } as never)).toThrow();
  }
  expect(queue.list()).toEqual([]);
});
test('callback exceptions and storage faults are generic 500s, never leaked messages or stacks', async () => {
  const { app, queue } = setup({ validateSubmission: () => { throw new Error('secret /home/private/token'); } });
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  expect(r.statusCode).toBe(500); expect(r.body).not.toMatch(/secret|private|stack|Error:/); expect(queue.list()).toEqual([]);
  vi.spyOn(queue, 'list').mockImplementation(() => { throw new Error('secret storage stack'); });
  const list = await app.inject({ method: 'GET', url: base, headers: { host } });
  expect(list.statusCode).toBe(500); expect(list.body).not.toMatch(/secret|storage|stack/);
});
test('async parent validation also settles before persistence and cannot silently reject after submit', async () => {
  const { app, queue } = setup({ validateSubmission: async () => { await Promise.resolve(); throw new GpuQueueError('GPU_QUEUE_INPUT', 'Missing parent'); } });
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  expect(r.statusCode).toBe(400); expect(queue.list()).toEqual([]);
});
test('a validator cannot change the captured submission through its argument', async () => {
  const { app, queue } = setup({ validateSubmission: value => { value.projectId = 'mutated'; value.request = null; } });
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  expect(r.statusCode).toBe(202); expect(queue.get('call-a')).toMatchObject(input());
});

test.each([
  ['null body', null], ['array body', []], ['extra field', { ...input(), lease: 'not-allowed' }],
  ['missing request', { id: 'x', attemptId: 'a', projectId: 'p', tool: 'h3' }],
  ['empty id', input('')], ['blank attempt', input('x', { attemptId: '  ' })],
  ['NUL identifier', input('x\0')], ['unpaired identifier', input('x\ud800')],
  ['coerced identifier', { ...input(), id: 12 }], ['unsupported tool', { ...input(), tool: 'ffmpeg' }],
])('rejects %s without stripping/coercion or calling the parent', async (_name, payload) => {
  const { app, queue, validate } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  expect(r.statusCode).toBe(400); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test.each(['{"id":', '{"__proto__":{"polluted":true}}', JSON.stringify(input()).replace('"request":{', '"request":{"bad":1e999,'), JSON.stringify(input()).replace('"request":{', '"request":{"bad":9007199254740993,'), JSON.stringify(input()).replace('"request":{', '"request":{"bad":-0,')])('rejects malformed, poisoned or lossy JSON: %s', async payload => {
  const { app, queue, validate } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host, 'content-type': 'application/json' }, payload });
  expect(r.statusCode).toBe(400); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test.each([null, false, 12.5, 'text', ['one', 2, null]])('request supports any lossless JSON value (%j)', async request => {
  const { app, queue } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input('call-a', { request }) });
  expect(r.statusCode).toBe(202); expect(queue.get('call-a')?.request).toEqual(request);
});
test.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp'])('rejects non-JSON media type %s', async contentType => {
  const { app, queue, validate } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host, 'content-type': contentType }, payload: JSON.stringify(input()) });
  expect(r.statusCode).toBe(415); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test('enforces the one MiB body limit before parent validation', async () => {
  const { app, queue, validate } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host }, payload: input('x', { request: 'x'.repeat(1024 * 1024) }) });
  expect(r.statusCode).toBe(413); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});

test.each(['evil.local:4310', 'studio.local:80', 'studio.local', 'studio.local:4310.evil', 'STUDIO.local:4310'])('requires the exact allowed Host, rejecting %s', async badHost => {
  const { app, queue, validate } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host: badHost, 'x-forwarded-host': host }, payload: input() });
  expect(r.statusCode).toBe(403); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test.each(['null', 'http://evil.local:4310', 'https://studio.local:4310', 'http://studio.local:9999', 'http://studio.local:4310/path', 'http://studio.local:4310/', 'http://studio.local:4310@evil.local'])('rejects non-same HTTP origin %s', async origin => {
  const { app, queue } = setup();
  const r = await app.inject({ method: 'POST', url: base, headers: { host, origin }, payload: input() });
  expect(r.statusCode).toBe(403); expect(queue.list()).toEqual([]);
});
test('accepts exact same-origin JSON and native CLI requests without Origin, without CORS headers', async () => {
  const { app } = setup();
  for (const headers of [{ host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' }, { host }]) {
    const r = await app.inject({ method: 'POST', url: base, headers, payload: input() });
    expect(r.statusCode).toBe(202); expect(r.headers['access-control-allow-origin']).toBeUndefined();
  }
});
test('cross-site fetch mutation is rejected even without Origin or with a forged same-origin value', async () => {
  const { app, queue } = setup();
  for (const origin of [undefined, `http://${host}`]) {
    const r = await app.inject({ method: 'POST', url: base, headers: { host, 'sec-fetch-site': 'cross-site', ...(origin ? { origin } : {}) }, payload: input() });
    expect(r.statusCode).toBe(403);
  }
  expect(queue.list()).toEqual([]);
});
test('Host/Origin guards also cover reads and attempt cancellation', async () => {
  const { app, queue, known } = setup(); queue.submit(input());
  expect((await app.inject({ url: base, headers: { host, origin: 'null' } })).statusCode).toBe(403);
  expect((await app.inject({ url: '/api/health', headers: { host: 'evil.local:4310' } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'POST', url: '/api/attempts/attempt-a/cancel', headers: { host, 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403);
  expect(known).not.toHaveBeenCalled(); expect(queue.get('call-a')?.state).toBe('queued');
});
test('allowlist is captured and invalid/wildcard/no-port configuration fails closed', async () => {
  const { queue } = setup(), hosts = [host];
  const app = createNativeApi({ queue, allowedHosts: hosts, validateSubmission() {}, hasAttempt: () => true }); servers.push(app);
  hosts.push('evil.local:4310');
  expect((await app.inject({ url: '/api/health', headers: { host: 'evil.local:4310' } })).statusCode).toBe(403);
  for (const bad of [[], ['*'], ['studio.local'], ['http://studio.local:4310'], ['studio.local:70000'], ['studio.local:4310/path']]) {
    expect(() => createNativeApi({ queue, allowedHosts: bad, validateSubmission() {}, hasAttempt: () => true })).toThrow();
  }
});

test('read/list/submit expose only public projection, never ownership or gate/lease/release data', async () => {
  const { app, queue } = setup(); queue.submit(input());
  const lease = queue.claim('private-worker')!;
  queue.prepareLaunch(lease, { gateToken: 'secret-gate', command: 'secret-command' });
  queue.acknowledgeLaunch(lease, { secretOwner: 'private-identity' });
  queue.finish(lease, 'succeeded', { output: 'public-output' }, { secretRelease: 'private-proof' });
  for (const url of [base, `${base}/call-a`]) {
    const r = await app.inject({ url, headers: { host } }); expect(r.statusCode).toBe(200);
    const value = url === base ? r.json()[0] : r.json();
    expect(Object.keys(value).sort()).toEqual(publicKeys); expect(value.result).toEqual({ output: 'public-output' });
    expect(r.body).not.toMatch(/secret|private|gateToken/); expect(r.body).not.toContain(lease.token);
  }
  expect((await app.inject({ url: `${base}/absent`, headers: { host } })).statusCode).toBe(404);
});
test('cancel known attempt persists the freeze across API/DB reopen; duplicates do not resume it', async () => {
  const { app, queue, path } = setup();
  await app.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  const cancel = await app.inject({ method: 'POST', url: '/api/attempts/attempt-a/cancel', headers: { host } });
  expect(cancel.statusCode).toBe(202); expect(cancel.json()).toEqual({ attemptId: 'attempt-a', cancelRequested: true });
  await app.close(); queue.close();
  const reopened = openGpuQueue(path); queues.push(reopened);
  const next = createNativeApi({ queue: reopened, allowedHosts: [host], validateSubmission() {}, hasAttempt: () => true }); servers.push(next);
  expect(reopened.get('call-a')?.state).toBe('cancelled');
  const duplicate = await next.inject({ method: 'POST', url: base, headers: { host }, payload: input() });
  expect(duplicate.statusCode).toBe(202); expect(duplicate.json().state).toBe('cancelled');
  const fresh = await next.inject({ method: 'POST', url: base, headers: { host }, payload: input('later') });
  expect(fresh.statusCode).toBe(409); expect(fresh.json().code).toBe('GPU_QUEUE_CANCELLED');
});
test('known parent with no native calls is frozen; unknown parent never calls cancelAttempt', async () => {
  const { app, queue } = setup(); const cancel = vi.spyOn(queue, 'cancelAttempt');
  expect((await app.inject({ method: 'POST', url: '/api/attempts/unknown/cancel', headers: { host } })).statusCode).toBe(404);
  expect(cancel).not.toHaveBeenCalled();
  expect((await app.inject({ method: 'POST', url: '/api/attempts/attempt-a/cancel', headers: { host } })).statusCode).toBe(202);
  expect(() => queue.submit(input())).toThrow(/stopped/);
});
test('active cancellation keeps the persisted lane; HTTP cannot fabricate cleanup/release', async () => {
  const { app, queue } = setup(); queue.submit(input()); const lease = queue.claim('worker')!;
  queue.prepareLaunch(lease, { fixture: true }); queue.acknowledgeLaunch(lease, { fixture: true });
  expect((await app.inject({ method: 'POST', url: '/api/attempts/attempt-a/cancel', headers: { host } })).statusCode).toBe(202);
  expect(queue.get('call-a')?.state).toBe('cancel_requested'); expect(queue.heldLease()).toEqual(lease);
  for (const route of ['finish', 'release', 'reconcile', 'maintenance', 'claim']) {
    const r = await app.inject({ method: 'POST', url: `${base}/call-a/${route}`, headers: { host }, payload: { token: lease.token, released: true } });
    expect(r.statusCode).toBe(404);
  }
  expect(queue.heldLease()).toEqual(lease); expect(queue.get('call-a')?.state).toBe('cancel_requested');
});
test('attempt cancellation rejects unexpected payload fields instead of silently ignoring them', async () => {
  const { app, queue } = setup(); queue.submit(input());
  const r = await app.inject({ method: 'POST', url: '/api/attempts/attempt-a/cancel', headers: { host }, payload: { release: true } });
  expect(r.statusCode).toBe(400); expect(queue.get('call-a')?.state).toBe('queued');
});
test('malformed UTF-8 is rejected rather than silently rewriting submitted JSON bytes', async () => {
  const { app, queue, validate } = setup();
  const prefix = Buffer.from('{"id":"x","attemptId":"attempt-a","projectId":"project-a","tool":"yue2","request":"');
  const payload = Buffer.concat([prefix, Buffer.from([0xff]), Buffer.from('"}')]);
  const r = await app.inject({ method: 'POST', url: base, headers: { host, 'content-type': 'application/json' }, payload });
  expect(r.statusCode).toBe(400); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test('excessive JSON nesting is rejected before parent validation', async () => {
  const { app, queue, validate } = setup();
  const nested = '['.repeat(130) + '0' + ']'.repeat(130);
  const payload = '{"id":"x","attemptId":"attempt-a","projectId":"project-a","tool":"yue2","request":' + nested + '}';
  const r = await app.inject({ method: 'POST', url: base, headers: { host, 'content-type': 'application/json' }, payload });
  expect(r.statusCode).toBe(400); expect(validate).not.toHaveBeenCalled(); expect(queue.list()).toEqual([]);
});
test('duplicated Host or Origin headers cannot be collapsed into an allowed value', async () => {
  const { app, queue } = setup();
  for (const headers of [{ host: [host, host] }, { host, origin: [`http://${host}`, `http://${host}`] }]) {
    // Deliberately malformed wire headers exceed the normal typed API shape.
    const r = await app.inject({ method: 'POST', url: base, headers: headers as never, payload: input() });
    expect(r.statusCode).toBe(403);
  }
  expect(queue.list()).toEqual([]);
});
