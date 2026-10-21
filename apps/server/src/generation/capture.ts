import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, copyFile, writeFile, constants } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { CapturedCall, SeedMap } from '../../../../packages/core/src/contracts/generation.ts';
import { decimalSeed, identifier } from '../../../../packages/core/src/contracts/validation.ts';

export async function sha256(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

/** Capture before dispatch. Never overwrite an existing call's immutable inputs. */
export async function captureCall(input: {
  id: string; attemptId: string; argv: string[]; seeds: SeedMap;
  sourceFiles: Record<string, string>; snapshotDirectory: string;
}): Promise<CapturedCall> {
  input = structuredClone(input); // freeze caller-owned metadata before any await
  identifier(input.id, 'callId'); identifier(input.attemptId, 'attemptId');
  if (!isAbsolute(input.snapshotDirectory)) throw new Error('Snapshot directory must be absolute');
  if (!input.argv.length) throw new Error('Native command is missing');
  for (const [name, value] of Object.entries(input.seeds)) decimalSeed(value, name);
  await mkdir(input.snapshotDirectory, { recursive: true, mode: 0o700 });
  const directory = join(input.snapshotDirectory, input.id);
  await mkdir(directory, { mode: 0o700 }); // existing/partial capture needs explicit investigation
  const files: CapturedCall['files'] = {};
  for (const [name, source] of Object.entries(input.sourceFiles)) {
    const path = join(directory, identifier(name, 'input label'));
    await copyFile(source, path, constants.COPYFILE_EXCL);
    files[name] = { snapshotPath: path, sha256: await sha256(path) };
  }
  const call: CapturedCall = {
    id: input.id, attemptId: input.attemptId, argv: [...input.argv], seeds: { ...input.seeds }, files,
  };
  // No completed manifest is written until every input has been captured.
  await writeFile(join(directory, 'call.json'), JSON.stringify(call, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return call;
}

/** Validated replay material; the native executor must consume these paths. */
export async function replayCall(call: CapturedCall) {
  call = structuredClone(call); // validation and return must use the same snapshot
  const files: Record<string, string> = {};
  for (const [name, captured] of Object.entries(call.files)) {
    if (await sha256(captured.snapshotPath) !== captured.sha256) throw new Error(`Captured input changed: ${name}`);
    files[name] = captured.snapshotPath;
  }
  for (const [name, value] of Object.entries(call.seeds)) decimalSeed(value, name);
  return { argv: [...call.argv], seeds: { ...call.seeds }, files };
}
