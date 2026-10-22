/** Real Fastify HTTP boundary and SQLite; fake runtime never launches agents. */
import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { registerStudioApi } from '../../apps/server/src/studio/api.ts';
import type { StudioRuntime } from '../../apps/server/src/studio/runtime-contract.ts';
import type { Provider, MusicDraft, ProviderStatus, StudioProject } from '../../packages/core/src/contracts/studio.ts';

const host = 'studio.local:9122';
const draft: MusicDraft = { musicPrompt: 'A test idea', lyrics: '', style: 'Minimal' };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const operation of cleanup.splice(0).reverse()) await operation(); });
async function fixture(withWeb = false) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-api-')), dataRoot = join(directory, 'data'), webRoot = join(directory, 'web');
  await mkdir(dataRoot); await mkdir(webRoot); await writeFile(join(webRoot, 'index.html'), '<html>Built UI fixture</html>');
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const store = openStudioStore(join(directory, 'studio.sqlite')), queue = openGpuQueue(join(directory, 'gpu.sqlite'));
  cleanup.push(async () => { store.close(); queue.close(); });
  const status = (): ProviderStatus => ({ provider: store.provider(), model: store.provider() === 'codex' ? 'gpt-6.1-sol' : 'claude-opus-5-5', installed: true, auth: 'signed-in', detail: 'FAKE test runtime', signInCommand: 'FAKE' });
  const runtime: StudioRuntime = {
    overview: vi.fn(() => ({ projects: store.listProjects(), selectedProjectId: store.selectedProject(), provider: status(), tools: store.tools(), warnings: ['FAKE test runtime'] })),
    selectProvider: vi.fn(async (provider: Provider) => { store.setProvider(provider); return status(); }),
    checkProvider: vi.fn(async () => status()),
    setup: vi.fn(tool => (tool === 'all' ? ['agent', 'yue2', 'comfyui', 'h3', 'analysis'] as const : [tool]).map(id => store.enqueueSetup(id))),
    submitMusic: vi.fn(async (id, key, input) => store.submitMusic(id, key, input)),
  };
  const app = createNativeApi({ queue, allowedHosts: [host], validateSubmission() {}, hasAttempt: () => false });
  cleanup.push(() => app.close());
  await registerStudioApi(app, { store, runtime, dataRoot, webRoot: withWeb ? webRoot : null });
  const request = (method: 'GET' | 'HEAD' | 'POST' | 'PUT', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { host, ...headers }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload), headers: { host, 'content-type': 'application/json', ...headers } }) });
  async function asset(path?: string) {
    const p = store.createProject('Asset fixture'), attempt = store.submitMusic(p.id, randomUUID(), draft);
    const projectPath = join(dataRoot, 'projects', p.id); await mkdir(projectPath, { recursive: true });
    const assetPath = path ?? join(projectPath, 'audio.wav');
    const bytes = Buffer.alloc(60); bytes.write('RIFF'); bytes.writeUInt32LE(52, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8, 24);
    bytes.writeUInt32LE(16, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(16, 40);
    for (let i = 44; i < bytes.length; i++) bytes[i] = i;
    if (!path) await writeFile(assetPath, bytes);
    const song = store.finishMusic(attempt.id, { title: 'Synthetic byte fixture', assetId: randomUUID(), assetPath, sha256: 'a'.repeat(64),
      sampleCount: '8', sampleRate: 8, channels: 1, durationSeconds: 1, truncated: false,
      analysis: { state: 'pending', estimatedBpm: null, sampleIndices: [], waveformBucketSamples: 0, peaks: [], error: null, version: null } }, {});
    return { song, project: p, assetPath, projectPath, bytes };
  }
  return { app, store, runtime, dataRoot, directory, request, asset };
}

test('studio overview and project create/select/draft readback persist with revision conflict', async () => {
  const { store, request } = await fixture();
  expect((await request('GET', '/api/studio')).json().projects).toEqual([]);
  const created = await request('POST', '/api/projects', { name: '  New video  ' });
  expect(created.statusCode).toBe(201); const p = created.json<StudioProject>(); expect(p.name).toBe('New video');
  expect((await request('POST', `/api/projects/${p.id}/select`, {})).statusCode).toBe(200);
  expect(store.selectedProject()).toBe(p.id);
  const saved = await request('PUT', `/api/projects/${p.id}/draft`, { revision: p.revision, draft });
  expect(saved.statusCode).toBe(200); expect(saved.json().draft).toEqual(draft);
  expect((await request('GET', `/api/projects/${p.id}`)).json().project).toEqual(saved.json());
  const stale = await request('PUT', `/api/projects/${p.id}/draft`, { revision: p.revision, draft });
  expect(stale.statusCode).toBe(409); expect(stale.json().code).toBe('STUDIO_CONFLICT');
});
test('provider checks/switches and global setup delegate to runtime, including all tools', async () => {
  const { request, runtime } = await fixture();
  expect((await request('POST', '/api/provider', { provider: 'claude' })).json().provider).toBe('claude');
  expect(runtime.selectProvider).toHaveBeenCalledWith('claude');
  expect((await request('POST', '/api/provider/check', {})).statusCode).toBe(200); expect(runtime.checkProvider).toHaveBeenCalledOnce();
  const all = await request('POST', '/api/setup/all', {}); expect(all.statusCode).toBe(202); expect(all.json()).toHaveLength(5);
  expect((await request('POST', '/api/setup/yue2', {})).statusCode).toBe(202); expect(runtime.setup).toHaveBeenCalledWith('yue2');
});
test('music request is idempotent, project-bound and captures provider in accepted attempt', async () => {
  const { request, store, runtime } = await fixture(), p = store.createProject('Music'), body = { idempotencyKey: randomUUID(), input: draft };
  const a = await request('POST', `/api/projects/${p.id}/music`, body); expect(a.statusCode).toBe(202);
  await request('POST', '/api/provider', { provider: 'claude' });
  expect((await request('POST', `/api/projects/${p.id}/music`, body)).json()).toEqual(a.json());
  expect(runtime.submitMusic).toHaveBeenCalledWith(p.id, body.idempotencyKey, draft);
  expect((await request('POST', `/api/projects/${p.id}/music`, { ...body, input: { ...draft, lyrics: 'different' } })).statusCode).toBe(409);
  expect((await request('POST', `/api/projects/${randomUUID()}/music`, body)).statusCode).toBe(404);
});
test('song selection enforces project membership and revision', async () => {
  const f = await fixture(), a = await f.asset(), b = f.store.createProject('Other');
  const p = f.store.project(a.project.id).project;
  expect((await f.request('POST', `/api/projects/${p.id}/songs/${a.song.id}/select`, { revision: p.revision })).statusCode).toBe(200);
  expect((await f.request('POST', `/api/projects/${b.id}/songs/${a.song.id}/select`, { revision: b.revision })).statusCode).toBe(404);
  expect((await f.request('POST', `/api/projects/${p.id}/songs/${a.song.id}/select`, { revision: p.revision })).statusCode).toBe(409);
});
test('exact JSON shapes, UUIDs, enums and numeric types reject before runtime work', async () => {
  const { request, store, runtime } = await fixture(), p = store.createProject('Validation');
  for (const [url, body] of [ ['/api/projects', { name: 'Name', command: 'bad' }], ['/api/projects', { name: 2 }],
    ['/api/provider', { provider: 'other' }], ['/api/provider/check', { force: true }], ['/api/setup/all', null], ['/api/setup/unknown', {}],
    [`/api/projects/${p.id}/music`, { idempotencyKey: randomUUID(), input: { ...draft, unexpected: true } }],
    [`/api/projects/${p.id}/music`, { idempotencyKey: 'bad', input: draft }], ['/api/projects/not-a-uuid/select', {}],
    [`/api/projects/${p.id}/songs/${randomUUID()}/select`, { revision: '0' }],
  ] as const) expect((await request('POST', url, body)).statusCode, url).toBe(400);
  expect((await request('PUT', `/api/projects/${p.id}/draft`, { revision: 9007199254740992, draft })).statusCode).toBe(400);
  expect(runtime.selectProvider).not.toHaveBeenCalled(); expect(runtime.checkProvider).not.toHaveBeenCalled();
  expect(runtime.setup).not.toHaveBeenCalled(); expect(runtime.submitMusic).not.toHaveBeenCalled();
});
test('inherited Host/Origin/media-type/poison protections apply to studio routes', async () => {
  const { request, app, store } = await fixture();
  expect((await request('GET', '/api/studio', undefined, { host: 'evil.test:9122' })).statusCode).toBe(403);
  expect((await request('POST', '/api/projects', { name: 'No' }, { origin: 'http://evil.test' })).statusCode).toBe(403);
  expect((await request('POST', '/api/projects', { name: 'No' }, { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
  expect((await app.inject({ method: 'POST', url: '/api/projects', headers: { host, 'content-type': 'text/plain' }, payload: '{"name":"No"}' })).statusCode).toBe(415);
  expect((await app.inject({ method: 'POST', url: '/api/projects', headers: { host, 'content-type': 'application/json' }, payload: '{"name":"No","__proto__":{"bad":true}}' })).statusCode).toBe(400);
  expect(store.listProjects()).toEqual([]);
});
test('unexpected runtime failures remain private through the existing error handler', async () => {
  const { request, runtime } = await fixture(); vi.mocked(runtime.overview).mockImplementation(() => { throw new Error('/private/password secret'); });
  const r = await request('GET', '/api/studio'); expect(r.statusCode).toBe(500); expect(r.body).not.toMatch(/password|secret|private/);
});
test('registered WAV asset GET/HEAD streams exact bytes with nosniff, range and no server paths', async () => {
  const f = await fixture(), a = await f.asset(), url = `/api/assets/${a.song.assetId}`;
  const full = await f.request('GET', url); expect(full.statusCode).toBe(200); expect(full.rawPayload).toEqual(a.bytes);
  expect(full.headers['content-type']).toBe('audio/wav'); expect(full.headers['x-content-type-options']).toBe('nosniff');
  expect(full.headers['accept-ranges']).toBe('bytes'); expect(full.headers['content-length']).toBe('60');
  const head = await f.request('HEAD', url); expect(head.statusCode).toBe(200); expect(head.body).toBe(''); expect(head.headers['content-length']).toBe('60');
  for (const [range, start, end] of [['bytes=0-3', 0, 4], ['bytes=44-', 44, 60], ['bytes=-5', 55, 60], ['bytes=50-999', 50, 60]] as const) {
    const part = await f.request('GET', url, undefined, { range }); expect(part.statusCode).toBe(206);
    expect(part.rawPayload).toEqual(a.bytes.subarray(start, end)); expect(part.headers['content-range']).toBe(`bytes ${start}-${end - 1}/60`);
  }
  const rangedHead = await f.request('HEAD', url, undefined, { range: 'bytes=0-3' }); expect(rangedHead.statusCode).toBe(206); expect(rangedHead.body).toBe('');
  expect(JSON.stringify(full.headers)).not.toContain(a.assetPath);
});
test('invalid/multiple/unsatisfiable byte ranges return 416 without file content', async () => {
  const f = await fixture(), a = await f.asset();
  for (const range of ['bytes=60-', 'bytes=-0', 'bytes=4-2', 'bytes=0-1,3-5', 'items=0-1', 'bytes=-', 'bytes=999999999999999999999999999999-']) {
    const r = await f.request('GET', `/api/assets/${a.song.assetId}`, undefined, { range });
    expect(r.statusCode, range).toBe(416); expect(r.headers['content-range']).toBe('bytes */60'); expect(r.body).not.toContain('RIFF');
  }
});
test('unknown/missing assets and user-supplied paths cannot expose files', async () => {
  const f = await fixture(), a = await f.asset(); await rm(a.assetPath);
  expect((await f.request('GET', `/api/assets/${randomUUID()}`)).statusCode).toBe(404);
  expect((await f.request('GET', `/api/assets/${a.song.assetId}`)).statusCode).toBe(404);
  expect((await f.request('GET', '/api/assets/etc%2Fpasswd')).statusCode).toBe(400);
  expect((await f.request('GET', `/api/assets/${a.song.assetId}?path=/etc/passwd`)).statusCode).toBe(400);
});
test('even registered outside-project paths and symlinked assets or parents are refused', async () => {
  const f = await fixture(); const outside = join(f.directory, 'private.wav'); await writeFile(outside, 'SECRET FILE');
  const a = await f.asset(outside); expect((await f.request('GET', `/api/assets/${a.song.assetId}`)).statusCode).toBe(404);
  const b = await f.asset(); await rm(b.assetPath); await symlink(outside, b.assetPath);
  expect((await f.request('GET', `/api/assets/${b.song.assetId}`)).statusCode).toBe(404);
  const c = await f.asset(), moved = join(f.directory, 'moved'); await mkdir(moved); await writeFile(join(moved, 'audio.wav'), 'SECRET FILE');
  await rm(c.projectPath, { recursive: true }); await symlink(moved, c.projectPath);
  expect((await f.request('GET', `/api/assets/${c.song.assetId}`)).statusCode).toBe(404);
});
test('same-project symlinks and assets registered under another project are also refused', async () => {
  const f = await fixture(), original = await f.asset();
  const alternate = join(original.projectPath, 'real-audio.wav'); await writeFile(alternate, original.bytes);
  await rm(original.assetPath); await symlink(alternate, original.assetPath);
  expect((await f.request('GET', `/api/assets/${original.song.assetId}`)).statusCode).toBe(404);
  const other = await f.asset();
  const foreign = await f.asset(join(other.projectPath, 'copy.wav')); await writeFile(foreign.assetPath, other.bytes);
  expect((await f.request('GET', `/api/assets/${foreign.song.assetId}`)).statusCode).toBe(404);
});
test('lossy numeric syntax and missing JSON bodies cannot mutate projects', async () => {
  const f = await fixture(), p = f.store.createProject('Lossless');
  for (const token of ['-0', '1e999', '9007199254740993']) {
    const result = await f.app.inject({ method: 'PUT', url: `/api/projects/${p.id}/draft`, headers: { host, 'content-type': 'application/json' },
      payload: `{"revision":${token},"draft":${JSON.stringify(draft)}}` });
    expect(result.statusCode, token).toBe(400);
  }
  expect((await f.request('POST', `/api/projects/${p.id}/select`)).statusCode).toBe(400);
  expect(f.store.project(p.id).project.revision).toBe(0);
});
test('static UI is served only from configured build root and does not swallow API 404s', async () => {
  const f = await fixture(true);
  expect((await f.request('GET', '/')).body).toContain('Built UI fixture');
  expect((await f.request('GET', '/api/not-present')).statusCode).toBe(404);
  expect((await f.request('GET', '/%2e%2e/studio.sqlite')).statusCode).toBe(404);
  const without = await fixture(); expect((await without.request('GET', '/')).statusCode).toBe(404);
});
