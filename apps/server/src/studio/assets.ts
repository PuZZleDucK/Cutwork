import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StudioStore } from './store-contract.ts';

function inside(root: string, file: string): boolean {
  const part = relative(root, file); return part.length > 0 && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}
function interval(header: string, size: number): [number, number] | null {
  if (header.length > 150 || size === 0) return null;
  const parts = /^bytes=(\d*)-(\d*)$/.exec(header); if (!parts || (!parts[1] && !parts[2])) return null;
  const length = BigInt(size);
  if (!parts[1]) {
    const suffix = BigInt(parts[2]!); if (suffix === 0n) return null;
    return [Number(suffix >= length ? 0n : length - suffix), size - 1];
  }
  const start = BigInt(parts[1]), end = parts[2] ? BigInt(parts[2]) : length - 1n;
  if (start >= length || end < start) return null;
  return [Number(start), Number(end >= length ? length - 1n : end)];
}

/** Only registered immutable asset IDs, never client-provided filenames. The
 * opened descriptor is rechecked on Linux before streaming that same descriptor,
 * rather than validating one path then reopening another in the HTTP library. */
export async function sendStudioAsset(request: FastifyRequest<{ Params: { assetId: string } }>, reply: FastifyReply,
  store: StudioStore, dataRoot: string) {
  const asset = store.asset(request.params.assetId);
  const unavailable = () => reply.code(404).send({ code: 'STUDIO_ASSET_NOT_FOUND', error: 'Asset not found' });
  if (!asset) return unavailable();
  const projectRoot = join(dataRoot, 'projects', asset.projectId);
  if (!isAbsolute(asset.path) || resolve(asset.path) !== asset.path || !inside(projectRoot, asset.path)) return unavailable();
  let handle: FileHandle | undefined;
  try {
    // Refuse linked managed ancestors as well as a linked final path. O_NONBLOCK
    // prevents a damaged registration pointing to a FIFO from hanging the server.
    if (await realpath(projectRoot) !== projectRoot || await realpath(asset.path) !== asset.path) return unavailable();
    handle = await open(asset.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const actual = await realpath(`/proc/self/fd/${handle.fd}`), info = await handle.stat();
    if (actual !== asset.path || !inside(projectRoot, actual) || !info.isFile() || !Number.isSafeInteger(info.size)) return unavailable();
    reply.header('x-content-type-options', 'nosniff').header('accept-ranges', 'bytes').type('audio/wav');
    const range = request.headers.range;
    let start = 0, end = info.size - 1;
    if (range !== undefined) {
      const selected = interval(range, info.size);
      if (!selected) return reply.code(416).header('content-range', `bytes */${info.size}`).type('application/json')
        .send({ code: 'STUDIO_ASSET_RANGE', error: 'Requested byte range is not satisfiable' });
      [start, end] = selected; reply.code(206).header('content-range', `bytes ${start}-${end}/${info.size}`);
    }
    reply.header('content-length', end - start + 1);
    if (request.method === 'HEAD' || info.size === 0) return reply.send();
    const stream = handle.createReadStream({ start, end, autoClose: true });
    handle = undefined; // The response stream now owns descriptor closure.
    const disconnect = () => { if (!reply.raw.writableFinished) stream.destroy(); };
    reply.raw.once('close', disconnect); stream.once('close', () => reply.raw.removeListener('close', disconnect));
    return reply.send(stream);
  } catch (error) {
    // Native path/permission errors are deliberately not sent to LAN clients.
    const code = (error as NodeJS.ErrnoException).code;
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM', 'EINVAL'].includes(code ?? '')) return unavailable();
    throw error;
  } finally { if (handle) await handle.close(); }
}
