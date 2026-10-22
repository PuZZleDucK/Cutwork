/** Independent post-run file/queue/FFmpeg validation. No provider/generator is
 * launched and a provider's natural-language report is never a success flag. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { mediaProofPlan } from './provider-media-proof.ts';

const exec = promisify(execFile);
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
interface Stream { codec_type: string; codec_name: string; r_frame_rate: string; width: number; height: number;
  nb_read_frames: string; duration_ts: number | string; time_base: string; sample_rate: string; channels: number }
async function probe(path: string): Promise<{ streams: Stream[] }> {
  const r = await exec('/usr/bin/ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', path], { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(r.stdout);
}
async function decode(path: string) {
  await exec('/usr/bin/ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
}

export async function verifyMediaProof(planPath: string, database: string) {
  const plan = await json(planPath) as Awaited<ReturnType<typeof mediaProofPlan>>;
  const provider = await json(join(plan.paths.requestDirectory, 'provider-outcome.json'));
  assert.equal(provider.state, 'provider-exited-awaiting-independent-validation');
  assert.equal(provider.succeeded, true);
  const music = await json(plan.paths.musicReceipt), video = await json(plan.paths.videoReceipt);
  assert.equal(music.state, 'succeeded'); assert.equal(video.state, 'succeeded'); assert.equal(video.synthetic, false);
  assert.equal(music.attemptId, plan.native.musicAttemptId);
  assert.equal(video.attemptId, plan.native.h3AttemptId); assert.equal(video.projectId, plan.intent.projectId);
  assert.deepEqual(video.actualSeeds, { h3: plan.intent.seeds.h3 });
  for (const [stage, value] of Object.entries(music.assignedSeeds)) assert.equal(value, plan.intent.seeds[stage]);
  assert.ok(Object.keys(music.assignedSeeds).length >= 2);

  const db = new Database(database, { readonly: true, fileMustExist: true });
  const nativeCalls = [];
  try {
    for (const [tool, id, receipt] of [['yue2', plan.native.musicAttemptId, music], ['h3', plan.native.h3AttemptId, video]] as const) {
      const row = db.prepare('SELECT * FROM gpu_calls WHERE id = ?').get(id) as {
        id: string; tool: string; attempt_id: string; project_id: string; state: string; request_json: string;
        launch_json: string; owner_json: string; result_json: string; release_json: string;
      } | undefined;
      assert.ok(row); assert.equal(row.state, 'succeeded'); assert.equal(row.tool, tool);
      assert.equal(row.attempt_id, plan.intent.attemptId); assert.equal(row.project_id, plan.intent.projectId);
      const launch = JSON.parse(row.launch_json), owner = JSON.parse(row.owner_json), release = JSON.parse(row.release_json);
      const requestIndex = launch.command.args.indexOf('--request'); assert.ok(requestIndex >= 0);
      const captured = launch.command.args[requestIndex + 1]; assert.equal(await hash(captured), receipt.requestSha256);
      assert.deepEqual(await json(captured), JSON.parse(row.request_json));
      assert.deepEqual(owner, release.owner); assert.equal(release.cgroupEmptyBeforeAndAfterGpu, true);
      assert.equal(release.gpuSettling.state, 'released');
      assert.equal(release.gpu.processes.some((p: { pid: number }) => release.rememberedPids.includes(p.pid)), false);
      assert.equal((await json(join(owner.directory, 'exit.json'))).code, 0);
      assert.deepEqual(await json(join(owner.directory, 'release.json')), release);
      nativeCalls.push({ id, tool, state: row.state, owner, releasePath: join(owner.directory, 'release.json') });
    }
    const held = db.prepare('SELECT count(*) AS n FROM gpu_lease WHERE call_id IN (?,?)')
      .get(plan.native.musicAttemptId, plan.native.h3AttemptId) as { n: number };
    assert.equal(held.n, 0);
  } finally { db.close(); }

  const songPath = music.audio.path as string, clipPath = video.outputs.video.path as string;
  assert.equal(await hash(songPath), video.conditioning.songSha256);
  assert.equal(await hash(video.conditioning.sourceSnapshot), video.conditioning.songSha256);
  assert.equal(await hash(clipPath), video.outputs.video.sha256);
  const song = (await probe(songPath)).streams.find(s => s.codec_type === 'audio')!;
  assert.equal(song.sample_rate, '48000'); assert.equal(song.channels, 2); await decode(songPath);
  const clip = (await probe(clipPath)).streams.find(s => s.codec_type === 'video')!;
  assert.equal(clip.r_frame_rate, '24/1'); assert.equal(clip.width, 640); assert.equal(clip.height, 480);
  assert.equal(Number(clip.nb_read_frames), video.outputs.nativeFrames); await decode(clipPath);
  assert.equal(video.plan.requestedFrames, 48); assert.equal(video.plan.placement.startFrame, 0); assert.equal(video.plan.placement.endFrame, 48);

  const manifestPath = video.outputs.frameManifestPath as string, manifest = await json(manifestPath);
  assert.equal(manifest.origin, 'pre-encode'); assert.equal(manifest.frames.length, video.outputs.nativeFrames);
  const graph = await json(join(dirname(plan.paths.videoReceipt), 'workflow-api.json'));
  assert.equal(graph['15'].class_type, 'SaveImage'); assert.equal(graph['16'].class_type, 'CreateVideo');
  assert.deepEqual(graph['15'].inputs.images, graph['16'].inputs.images);
  assert.deepEqual(graph['15'].inputs.images, ['13', 0]); assert.equal(graph['13'].class_type, 'VAEDecode');
  assert.deepEqual(graph['13'].inputs.samples, ['12', 0]); assert.equal(graph['12'].class_type, 'SamplerCustomAdvanced');
  const paths = new Set<string>();
  for (const [i, frame] of manifest.frames.entries()) {
    assert.equal(frame.index, i + 1); assert.equal(paths.has(frame.path), false); paths.add(frame.path);
    const bytes = await readFile(frame.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.sha256);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 640); assert.equal(bytes.readUInt32BE(20), 480);
    await decode(frame.path);
  }
  const output = await probe(plan.paths.exportPath), finalVideo = output.streams.find(s => s.codec_type === 'video')!;
  const finalAudio = output.streams.find(s => s.codec_type === 'audio')!;
  const [num, den] = song.time_base.split('/').map(BigInt);
  const songFrames = Number((BigInt(song.duration_ts) * num! * 24n + den! - 1n) / den!);
  assert.equal(finalVideo.codec_name, 'h264'); assert.equal(finalVideo.r_frame_rate, '24/1');
  assert.equal(finalVideo.width, 640); assert.equal(finalVideo.height, 480);
  assert.equal(Number(finalVideo.nb_read_frames), Math.max(songFrames, 48));
  assert.equal(finalAudio.codec_name, 'aac'); assert.equal(finalAudio.sample_rate, '48000'); assert.equal(finalAudio.channels, 2);
  await decode(plan.paths.exportPath);
  return { state: 'verified-file-and-native-release-evidence', planPath, database, nativeCalls,
    songPath, clipPath, exportPath: plan.paths.exportPath, frameManifestPath: manifestPath,
    nativeFrames: video.outputs.nativeFrames, requestedFrames: 48, placementStartFrame: 0, placementEndFrame: 48,
    songFrames, musicTruncated: music.truncated, exportSha256: await hash(plan.paths.exportPath),
    boundary: 'Revalidation of recorded run/media bytes, not a new generation. Does not establish listening quality or native provider session/model identity.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [plan, database, ...extra] = process.argv.slice(2);
  if (!plan || !database || extra.length) throw new Error('Usage: node scripts/verify-media-proof.ts <captured-plan.json> <gpu-queue.sqlite>');
  console.log(JSON.stringify(await verifyMediaProof(resolve(plan), resolve(database)), null, 2));
}
