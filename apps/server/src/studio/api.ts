import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { isAbsolute, resolve } from 'node:path';
import { StudioStoreError } from './store.ts';
import { sendStudioAsset } from './assets.ts';
import type { PlacementInput, StudioStore } from './store-contract.ts';
import type { StudioRuntime } from './runtime-contract.ts';
import type { ClipDraft, MusicDraft, MusicInput, Provider, ToolId, VideoInput } from '../../../../packages/core/src/contracts/studio.ts';

interface StudioApiOptions { store: StudioStore; runtime: StudioRuntime; dataRoot: string; webRoot: string | null }
const uuid = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' };
const revision = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const plain = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const empty = plain({});
const draft = plain({ musicPrompt: { type: 'string', maxLength: 16000 }, lyrics: { type: 'string', maxLength: 32000 }, style: { type: 'string', maxLength: 16000 } });
const musicInput = plain({ musicPrompt: draft.properties.musicPrompt, lyrics: draft.properties.lyrics });
const projectParams = plain({ id: uuid });
interface SongParams { id: string; songId: string }
interface PlacementParams extends SongParams { placementId: string }
const songParams = plain({ id: uuid, songId: uuid });
const placementParams = plain({ id: uuid, songId: uuid, placementId: uuid });
const timingValue = { oneOf: [
  plain({ unit: { type: 'string', enum: ['frames', 'beats', 'seconds'] }, value: { type: 'string', minLength: 1, maxLength: 1000 } }),
  plain({ unit: { const: 'rational' }, value: plain({ numerator: { type: 'string', pattern: '^(0|[1-9][0-9]*)$', maxLength: 1000 }, denominator: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 1000 } }) }),
] };
// Drafts intentionally permit unfinished text and invalid intervals, unlike requests.
const draftTimingText = { type: 'string', maxLength: 1000 };
const draftTimingValue = { oneOf: [
  plain({ unit: { type: 'string', enum: ['frames', 'beats', 'seconds'] }, value: draftTimingText }),
  plain({ unit: { const: 'rational' }, value: plain({ numerator: draftTimingText, denominator: draftTimingText }) }),
] };
const clipDraft = plain({ revision, clipPrompt: { type: 'string', maxLength: 16000 },
  timingIntent: { anyOf: [{ type: 'null' }, plain({ start: draftTimingValue, end: draftTimingValue })] } });
const videoInput = { ...plain({ songId: uuid, clipPrompt: { type: 'string', maxLength: 16000, minLength: 1 }, style: draft.properties.style,
  startFrame: revision, endFrame: { ...revision, minimum: 1 } }), properties: {
    songId: uuid, clipPrompt: { type: 'string', maxLength: 16000, minLength: 1 }, style: draft.properties.style,
    startFrame: revision, endFrame: { ...revision, minimum: 1 },
    requestedIntervalSeconds: plain({ start: { type: 'string', maxLength: 1000 }, end: { type: 'string', maxLength: 1000 } }),
    timingIntent: plain({ start: timingValue, end: timingValue }),
  } };
function lossless(value: unknown, depth = 0): void {
  if (depth > 64 || (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))))) {
    throw new StudioStoreError(400, 'STUDIO_INPUT', 'Request contains an invalid numeric value or excessive nesting');
  }
  if (value !== null && typeof value === 'object') for (const child of Object.values(value)) lossless(child, depth + 1);
}

/** Registered onto the existing native API so its Host/Origin, strict JSON and
 * private unexpected-error protections remain in force. No listener starts here. */
export async function registerStudioApi(app: FastifyInstance, { store, runtime, dataRoot, webRoot }: StudioApiOptions): Promise<void> {
  if (!isAbsolute(dataRoot) || (webRoot !== null && !isAbsolute(webRoot))) throw new Error('Studio paths must be absolute');
  const root = resolve(dataRoot);
  app.register(async function studioRoutes(api) {
    api.addHook('preValidation', async request => { lossless(request.body); });
    api.addHook('onRequest', async (_request, reply) => { reply.header('x-content-type-options', 'nosniff'); });
    api.setErrorHandler((error, _request, reply) => {
      if (error instanceof StudioStoreError) return reply.code(error.statusCode).send({ code: error.code, error: error.message });
      throw error; // Delegate unexpected/storage/parser/schema failures to the parent.
    });
    api.get('/api/studio', { schema: { querystring: empty } }, () => runtime.overview());
    api.post<{ Body: { name: string } }>('/api/projects', { schema: { body: plain({ name: { type: 'string', minLength: 1, maxLength: 120 } }), querystring: empty } },
      (request, reply) => reply.code(201).send(store.createProject(request.body.name)));
    api.get<{ Params: { id: string } }>('/api/projects/:id', { schema: { params: projectParams, querystring: empty } }, request => store.project(request.params.id));
    api.post<{ Params: { id: string } }>('/api/projects/:id/select', { schema: { params: projectParams, body: empty, querystring: empty } }, request => {
      store.selectProject(request.params.id); return store.project(request.params.id).project;
    });
    api.put<{ Params: { id: string }; Body: { revision: number; draft: MusicDraft } }>('/api/projects/:id/draft',
      { schema: { params: projectParams, body: plain({ revision, draft }), querystring: empty } }, request => store.saveDraft(request.params.id, request.body.revision, request.body.draft));
    api.post<{ Params: { id: string; songId: string }; Body: { revision: number } }>('/api/projects/:id/songs/:songId/select',
      { schema: { params: plain({ id: uuid, songId: uuid }), body: plain({ revision }), querystring: empty } },
      request => store.selectSong(request.params.id, request.params.songId, request.body.revision));
    api.put<{ Params: SongParams; Body: Pick<ClipDraft, 'revision' | 'clipPrompt' | 'timingIntent'> }>('/api/projects/:id/songs/:songId/clip-draft',
      { schema: { params: songParams, body: clipDraft, querystring: empty } }, request => {
        const { revision, ...draft } = request.body;
        return store.saveClipDraft(request.params.id, request.params.songId, revision, draft);
      });
    api.post<{ Body: { provider: Provider } }>('/api/provider',
      { schema: { body: plain({ provider: { type: 'string', enum: ['codex', 'claude'] } }), querystring: empty } }, request => runtime.selectProvider(request.body.provider));
    api.post('/api/provider/check', { schema: { body: empty, querystring: empty } }, () => runtime.checkProvider());
    api.post<{ Params: { tool: ToolId | 'all' } }>('/api/setup/:tool',
      { schema: { params: plain({ tool: { type: 'string', enum: ['all', 'agent', 'yue2', 'comfyui', 'h3', 'analysis'] } }), body: empty, querystring: empty } },
      (request, reply) => reply.code(202).send(runtime.setup(request.params.tool)));
    api.post<{ Params: { id: string }; Body: { idempotencyKey: string; input: MusicInput } }>('/api/projects/:id/music',
      { schema: { params: projectParams, body: plain({ idempotencyKey: uuid, input: musicInput }), querystring: empty } }, async (request, reply) =>
        reply.code(202).send(await runtime.submitMusic(request.params.id, request.body.idempotencyKey, request.body.input)));
    api.post<{ Params: { id: string }; Body: { idempotencyKey: string; input: VideoInput } }>('/api/projects/:id/video',
      { schema: { params: projectParams, body: plain({ idempotencyKey: uuid, input: videoInput }), querystring: empty } }, async (request, reply) =>
        reply.code(202).send(await runtime.submitVideo(request.params.id, request.body.idempotencyKey, request.body.input)));
    api.get<{ Params: SongParams }>('/api/projects/:id/songs/:songId/arrangement',
      { schema: { params: songParams, querystring: empty } }, request => store.arrangement(request.params.id, request.params.songId));
    api.post<{ Params: SongParams; Body: PlacementInput & { revision: number } }>('/api/projects/:id/songs/:songId/placements',
      { schema: { params: songParams, body: { ...plain({ revision, clipId: uuid, startFrame: revision }), properties: { revision, clipId: uuid, startFrame: revision,
        sourceStartFrame: revision, frameCount: { ...revision, minimum: 1 } } }, querystring: empty } }, request => {
        const { revision, ...input } = request.body; return store.addPlacement(request.params.id, request.params.songId, revision, input);
      });
    api.put<{ Params: PlacementParams; Body: { revision: number; startFrame: number } }>('/api/projects/:id/songs/:songId/placements/:placementId',
      { schema: { params: placementParams, body: plain({ revision, startFrame: revision }), querystring: empty } }, request =>
        store.movePlacement(request.params.id, request.params.songId, request.body.revision, request.params.placementId, request.body.startFrame));
    api.delete<{ Params: PlacementParams; Body: { revision: number } }>('/api/projects/:id/songs/:songId/placements/:placementId',
      { schema: { params: placementParams, body: plain({ revision }), querystring: empty } }, request =>
        store.removePlacement(request.params.id, request.params.songId, request.body.revision, request.params.placementId));
    api.post<{ Params: SongParams; Body: { revision: number; idempotencyKey: string } }>('/api/projects/:id/songs/:songId/renders',
      { schema: { params: songParams, body: plain({ revision, idempotencyKey: uuid }), querystring: empty } }, async (request, reply) =>
        reply.code(202).send(await runtime.render(request.params.id, request.params.songId, request.body.revision, request.body.idempotencyKey)));
    const projectRender = (projectId: string, renderId: string) => {
      const render = store.render(renderId);
      if (!render || render.projectId !== projectId.toLowerCase()) throw new StudioStoreError(404, 'STUDIO_NOT_FOUND', 'Render not found in this project');
      return render;
    };
    api.get<{ Params: { id: string; renderId: string } }>('/api/projects/:id/renders/:renderId',
      { schema: { params: plain({ id: uuid, renderId: uuid }), querystring: empty } }, request => projectRender(request.params.id, request.params.renderId));
    api.route<{ Params: { id: string; renderId: string } }>({ method: ['GET', 'HEAD'], url: '/api/projects/:id/renders/:renderId/download', exposeHeadRoute: false,
      schema: { params: plain({ id: uuid, renderId: uuid }), querystring: empty }, handler: (request, reply) => {
        const render = projectRender(request.params.id, request.params.renderId);
        if (render.state !== 'succeeded' || !render.assetId) throw new StudioStoreError(409, 'STUDIO_CONFLICT', 'Render is not ready to download');
        if (store.arrangement(render.projectId, render.songId).revision !== render.revision) throw new StudioStoreError(409, 'STUDIO_CONFLICT', 'Render is stale; preview the current arrangement before downloading');
        reply.header('content-disposition', `attachment; filename="music-video-${render.id}.mp4"`);
        return sendStudioAsset(request, reply, store, root, render.assetId, true);
      } });
    api.route<{ Params: { assetId: string } }>({ method: ['GET', 'HEAD'], url: '/api/assets/:assetId', exposeHeadRoute: false,
      schema: { params: plain({ assetId: uuid }), querystring: empty }, handler: (request, reply) => sendStudioAsset(request, reply, store, root) });
    if (webRoot !== null) await api.register(fastifyStatic, { root: resolve(webRoot), prefix: '/', index: ['index.html'], dotfiles: 'deny',
      wildcard: true, redirect: false, cacheControl: false, etag: false, lastModified: false });
  });
}
