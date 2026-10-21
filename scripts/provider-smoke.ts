/** Developer-facing slice-1 proof, not a simulated generation endpoint. */
import { hostname, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { providerLaunch, providerModels } from '../apps/server/src/providers/launch.ts';
import { runProvider } from '../apps/server/src/providers/run.ts';
import { sha256 } from '../apps/server/src/generation/capture.ts';
import type { Provider } from '../packages/core/src/contracts/generation.ts';

if (process.env.STUDIO_LIVE !== '1' || hostname().split('.')[0] !== 'dundee') {
  throw new Error('Explicit STUDIO_LIVE=1 on Dundee is required; this task uses real provider credits.');
}
const provider = process.argv[2] as Provider;
if (provider !== 'codex' && provider !== 'claude') throw new Error('Choose codex or claude');
const root = resolve(process.env.STUDIO_DATA_ROOT ?? join(homedir(), '.local/share/music-video-studio'));
const attemptId = randomUUID();
const projectId = `provider-proof-${provider}`;
const launch = providerLaunch(root, {
  projectId, attemptId, songId: 'provider-proof-no-song-yet', provider, model: providerModels[provider],
  musicPrompt: 'A playful four-bar electronic motif about programming.', lyrics: '', style: '', clipPrompt: '',
  startFrame: 0, endFrame: 48, seeds: {},
});
const scriptPath = join(launch.runDirectory, 'timing-proof.py');
const scorePath = join(launch.runDirectory, 'motif.abc');
const researchPath = join(launch.runDirectory, 'research.md');
// This is the task brief, not a tool/permission policy: normal creative tools remain available.
launch.stdin = [
  'This is the studio provider capability check, before native media installation.',
  'Use your normal research and file/shell tools. This task only needs a score and a small script; no model downloads or generation are needed.',
  `Project workspace: ${launch.cwd}. Save this attempt's work under ${launch.runDirectory}.`,
  'Fetch and read the official YuE2 repository README at https://github.com/multimodal-art-projection/YuE using a tool of your choice.',
  `Write ${researchPath} containing the source URL, what you actually inspected and a brief paraphrase of how editable scores relate to YuE2 generation. If fetching fails, report the failure honestly.`,
  `Compose an original playful four-bar motif as ABC notation and save it to ${scorePath}.`,
  `Write a Python-standard-library script at ${scriptPath} that prints the frame count and sample count for two seconds at 24 fps and 48000 Hz. Run it and retain its output in this attempt directory.`,
  'Finish with a short ordinary-language summary of the tool work and files created. Do not claim music/audio generation took place. No JSON answer schema is required.',
].join('\n\n');
const outcome = await runProvider(launch);
const artifactPaths = [scriptPath, scorePath, researchPath];
const artifacts = [];
for (const path of artifactPaths) {
  try { artifacts.push({ path, bytes: (await stat(path)).size, sha256: await sha256(path) }); }
  catch { artifacts.push({ path, missing: true }); }
}
const response = await readFile(outcome.stdoutPath, 'utf8');
console.log(JSON.stringify({ provider, requestedModel: providerModels[provider], projectId, attemptId,
  ...outcome, artifacts, nonemptyResponse: response.trim().length > 0,
  boundary: 'Launch/input outcome and file existence only; inspect native session/model/tool evidence separately.' }, null, 2));
if (!outcome.succeeded || artifacts.some(a => 'missing' in a || a.bytes === 0) || !response.trim()) {
  process.exitCode ||= 1; // preserve the launcher's signal-specific nonzero status
}
