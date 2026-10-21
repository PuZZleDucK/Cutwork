/** Prepare a fresh two-second feasibility request; never starts a generator. */
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { seeds } from '../apps/server/src/generation/seeds.ts';
import { planVideo } from '../packages/core/src/time/video-plan.ts';

const [songArg, promptArg, outputArg] = process.argv.slice(2);
if (!songArg || !promptArg || !outputArg || process.argv.length !== 5) {
  throw new Error('Usage: node scripts/h3-proof-request.ts <song.wav> <prompt.txt> <new-request.json>');
}
const songPath = resolve(songArg);
const { stdout } = await promisify(execFile)('/usr/bin/ffprobe', [
  '-v', 'error', '-show_streams', '-of', 'json', songPath,
]);
const streams = (JSON.parse(stdout) as { streams: Array<{
  codec_type: string; sample_rate: string; channels: number;
  duration_ts: number | string; time_base: string;
}> }).streams.filter(s => s.codec_type === 'audio');
const audio = streams[0];
if (streams.length !== 1 || !audio || audio.sample_rate !== '48000' || audio.channels !== 2) {
  throw new Error('This proof request requires the native 48 kHz stereo song profile');
}
const [numerator, denominator] = audio.time_base.split('/').map(BigInt);
if (numerator === undefined || denominator === undefined || denominator <= 0n) throw new Error('Invalid audio time base');
const scaled = BigInt(audio.duration_ts) * numerator * 48000n;
if (scaled < 0n || scaled % denominator !== 0n || scaled / denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
  throw new Error('No safe exact song sample count');
}
const songSamples = Number(scaled / denominator);
const plan = planVideo({ startFrame: 0, endFrame: 48, songSamples, sampleRate: 48000,
  supportedFrameCounts: [5, 22, 39, 56], requestedIntervalSeconds: { start: '0', end: '2' } });
const seed = seeds({ mode: 'fresh', stages: ['h3'], previous: {},
  domains: { h3: { min: '0', max: '18446744073709551615' } } }).h3;
const request = { schemaVersion: 1, attemptId: randomUUID(), projectId: 'native-h3-proof',
  song: { path: songPath, sha256: createHash('sha256').update(await readFile(songPath)).digest('hex') },
  plan, seed, prompt: await readFile(resolve(promptArg), 'utf8') };
await writeFile(resolve(outputArg), `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Request saved: ${resolve(outputArg)}. No generation started. Seed: ${seed}`);
