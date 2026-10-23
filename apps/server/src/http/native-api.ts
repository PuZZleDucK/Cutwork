/** Internal cooperating-helper transport, not a public/headless product API.
 * The app owns the queue/worker lifetime. Creating or closing this Fastify
 * instance neither starts native work nor closes the caller's database. */
import Fastify, { type FastifyInstance } from 'fastify';
import { GpuQueueError } from '../jobs/gpu-queue.ts';
import type { CallInput, GpuCall, GpuQueue } from '../jobs/gpu-queue-contract.ts';

export interface NativeApiOptions {
  queue: GpuQueue;
  allowedHosts: string[];
  /** Validate parent attempt/project membership and the resolved native request.
   * Throw GPU_QUEUE_INPUT for rejected input; unexpected failures stay private. */
  validateSubmission(input: CallInput): void;
  hasAttempt(id: string): boolean;
  /** The composed studio owns provider + native cancellation; fixtures may use
   * the narrow queue-only fallback. Never invoke both for one request. */
  cancelAttempt?(id: string): unknown | Promise<unknown>;
}
function inputError(): never { throw new GpuQueueError('GPU_QUEUE_INPUT', 'Invalid native call input'); }
function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) inputError();
}
/** Match the queue's lossless JSON boundary before calling parent validation.
 * HTTP JSON parsing has already excluded getters/cycles and prototype poison. */
function checkJson(value: unknown, depth = 0): void {
  if (depth > 128) inputError();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))) inputError();
    return;
  }
  if (typeof value !== 'object') inputError();
  for (const child of Object.values(value)) checkJson(child, depth + 1);
}
function captureInput(body: unknown): CallInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) inputError();
  const keys = Object.keys(body);
  if (keys.length !== 5 || keys.some(k => !['id', 'attemptId', 'projectId', 'tool', 'request'].includes(k))) inputError();
  const input = body as CallInput;
  identifier(input.id); identifier(input.attemptId); identifier(input.projectId);
  if (input.tool !== 'yue2' && input.tool !== 'h3') inputError();
  checkJson(input); // Depth is anchored at the entire CallInput, as in the queue.
  return structuredClone(input);
}
function projection(call: GpuCall) {
  return { id: call.id, attemptId: call.attemptId, projectId: call.projectId, tool: call.tool,
    sequence: call.sequence, state: call.state, cancelRequested: call.cancelRequested,
    result: call.result, error: call.error };
}
function allowedHost(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9][A-Za-z0-9.-]*):([1-9]\d{0,4})$/.exec(value);
  if (!match || Number(match[1]) > 65535) return false;
  try { const url = new URL(`http://${value}`); return url.hostname.length > 0 && url.pathname === '/' && !url.username && !url.password; }
  catch { return false; }
}

export function createNativeApi(options: NativeApiOptions): FastifyInstance {
  if (!options || !options.queue || typeof options.validateSubmission !== 'function' || typeof options.hasAttempt !== 'function' ||
    !Array.isArray(options.allowedHosts) || !options.allowedHosts.length || !options.allowedHosts.every(allowedHost)) {
    throw new Error('Native API requires a queue, parent validators and exact host:port allowlist');
  }
  const { queue, validateSubmission, hasAttempt } = options;
  const hosts = new Set(options.allowedHosts);
  const app = Fastify({ logger: false, trustProxy: false, bodyLimit: 1024 * 1024,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } } });
  // Do not accept forms or plain text as a route around the browser mutation guard.
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    if (!Buffer.isBuffer(body)) { done(new GpuQueueError('GPU_QUEUE_INPUT', 'Expected raw JSON bytes')); return; }
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body); }
    catch { done(new GpuQueueError('GPU_QUEUE_INPUT', 'Invalid UTF-8 JSON')); return; }
    // Retain Fastify's JSON syntax and prototype-poisoning rejection, while
    // refusing its default UTF-8 replacement-character coercion.
    parseJson(request, decoded, done);
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const host = request.raw.headers.host, origin = request.headers.origin;
    const rawHeaders = request.raw.rawHeaders;
    const hostCount = rawHeaders.filter((_v, i) => i % 2 === 0 && rawHeaders[i]!.toLowerCase() === 'host').length;
    if (typeof host !== 'string' || hostCount !== 1 || !hosts.has(host) ||
      (origin !== undefined && (typeof origin !== 'string' || origin !== new URL(`http://${host}`).origin))) {
      return reply.code(403).send({ error: 'Host or Origin is not permitted', code: 'NATIVE_API_ORIGIN' });
    }
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const site = request.headers['sec-fetch-site'];
    if (mutation && site !== undefined && !['same-origin', 'same-site', 'none'].includes(String(site))) {
      return reply.code(403).send({ error: 'Cross-site mutation is not permitted', code: 'NATIVE_API_ORIGIN' });
    }
    const contentType = request.headers['content-type'];
    if (mutation && contentType !== undefined &&
      !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) {
      return reply.code(415).send({ error: 'Only application/json is supported', code: 'NATIVE_API_MEDIA_TYPE' });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof GpuQueueError) {
      if (error.code === 'GPU_QUEUE_INPUT') return reply.code(400).send({ error: 'Invalid native call input', code: error.code });
      if (error.code === 'GPU_QUEUE_CONFLICT') return reply.code(409).send({ error: 'Call ID has different immutable inputs', code: error.code });
      if (error.code === 'GPU_QUEUE_CANCELLED') return reply.code(409).send({ error: 'Attempt is stopped for new submissions', code: error.code });
    }
    const code = (error as { code?: string }).code;
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: 'Body exceeds one MiB', code: 'NATIVE_API_BODY_LIMIT' });
    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: 'Only application/json is supported', code: 'NATIVE_API_MEDIA_TYPE' });
    if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      code === 'FST_ERR_CTP_INVALID_CONTENT_LENGTH' || code === 'FST_ERR_BAD_URL' || code === 'FST_ERR_VALIDATION') {
      return reply.code(400).send({ error: 'Invalid request', code: 'NATIVE_API_INPUT' });
    }
    return reply.code(500).send({ error: 'Internal server error', code: 'NATIVE_API_INTERNAL' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found', code: 'NATIVE_API_NOT_FOUND' }));
  app.get('/api/health', () => ({ status: 'ok', scope: 'native-call-coordinator' }));
  app.post('/api/internal/native-calls', async (request, reply) => {
    const input = captureInput(request.body);
    // Await also handles an inadvertently async validator safely. Give it a
    // separate copy so validation cannot rewrite the immutable submitted request.
    await validateSubmission(structuredClone(input));
    return reply.code(202).send(projection(queue.submit(input)));
  });
  app.get('/api/internal/native-calls', () => queue.list().map(projection));
  app.get<{ Params: { id: string } }>('/api/internal/native-calls/:id', (request, reply) => {
    identifier(request.params.id);
    const call = queue.get(request.params.id);
    return call ? projection(call) : reply.code(404).send({ error: 'Native call not found', code: 'NATIVE_API_NOT_FOUND' });
  });
  app.post<{ Params: { id: string } }>('/api/attempts/:id/cancel', async (request, reply) => {
    identifier(request.params.id);
    if (request.body !== undefined) inputError();
    if (hasAttempt(request.params.id) !== true) return reply.code(404).send({ error: 'Attempt not found', code: 'NATIVE_API_NOT_FOUND' });
    if (options.cancelAttempt) return reply.code(202).send(await options.cancelAttempt(request.params.id));
    queue.cancelAttempt(request.params.id);
    return reply.code(202).send({ attemptId: request.params.id, cancelRequested: true });
  });
  return app;
}
