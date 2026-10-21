import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadLiveDriver } from '../support/live-contract.ts';
import type { LiveChain, LiveDriver } from '../support/live-contract.ts';

const exec = promisify(execFile);
interface Stream {
  codec_type: string; codec_name: string; r_frame_rate?: string; nb_read_frames?: string;
  width?: number; height?: number; sample_rate?: string; channels?: number;
  duration_ts?: number | string; time_base?: string;
}
async function probe(path: string): Promise<{ streams: Stream[] }> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', path,
  ], { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}
async function decode(path: string): Promise<void> {
  await exec('ffmpeg', ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], {
    maxBuffer: 8 * 1024 * 1024,
  });
}
async function hash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

let driver: LiveDriver;
let readiness: Awaited<ReturnType<LiveDriver['readiness']>>;
let chainPromise: Promise<LiveChain> | undefined;
const chain = () => chainPromise ??= driver.generateChain({ clipSeconds: '2', provider: 'codex' });

beforeAll(async () => {
  driver = await loadLiveDriver();
  readiness = await driver.readiness();
  // Stop before costly work if prerequisites fail. No provider/model fallback.
  expect(readiness.os).toBe('26.04');
  expect(readiness.nodeMajor).toBe(24);
  expect(readiness.providerModels).toEqual({ codex: 'gpt-6.1-sol', claude: 'claude-opus-5-5' });
  expect(readiness.mediaSmokePassed).toBe(true);
  for (const env of Object.values(readiness.environments)) {
    expect(env.prefix).not.toBe(env.basePrefix);
    expect(env.systemSitePackages).toBe(false);
    expect(env.importSmokePassed).toBe(true);
  }
});
afterAll(async () => { if (driver) await driver.closeOwnedWork(); });

describe('S1-LIVE: actual Dundee native integration, never included in the default suite', () => {
  test('uses three distinct installed Python environments', () => {
    expect(new Set(Object.values(readiness.environments).map(e => e.prefix)).size).toBe(3);
  });

  test.each(['codex', 'claude'] as const)('%s really uses tools to leave a script and a score in its project', async provider => {
    const result = await driver.providerTask(provider);
    expect(result.reportedModel).toBe(readiness.providerModels[provider]);
    expect(result.cwd).toMatch(/\/projects\/[^/]+\/workspace$/);
    expect(result.responseText.trim().length).toBeGreaterThan(0);
    expect(result.sessionId.length).toBeGreaterThan(0);
    // Ordinary prose is accepted. Neither parsing JSON nor banning it proves autonomy.
    for (const path of [result.scriptPath, result.scorePath, result.toolLogPath]) {
      expect((await stat(path)).size).toBeGreaterThan(0);
    }
  });

  test('produces decodable original audio and a native 24 fps two-second-request clip', async () => {
    const result = await chain();
    const audio = (await probe(result.songPath)).streams.find(s => s.codec_type === 'audio');
    const video = (await probe(result.clipPath)).streams.find(s => s.codec_type === 'video');
    expect(audio).toBeDefined();
    expect(Number(audio!.sample_rate)).toBeGreaterThan(0);
    expect(video?.r_frame_rate).toBe('24/1');
    expect(video?.width).toBe(640); expect(video?.height).toBe(480);
    expect(Number(video?.nb_read_frames)).toBe(result.nativeFrames);
    expect(result.requestedFrames).toBe(48);
    expect(result.nativeFrames).toBeGreaterThanOrEqual(48);
    expect(result.placementEndFrame - result.placementStartFrame).toBe(48);
    await decode(result.songPath); await decode(result.clipPath);
  });

  test('keeps every original PNG in order with matching actual bytes and provenance', async () => {
    const result = await chain();
    const manifest = JSON.parse(await readFile(result.frameManifestPath, 'utf8')) as {
      origin: string; frames: Array<{ index: number; path: string; sha256: string }>;
    };
    expect(manifest.origin).toBe('pre-encode');
    expect(manifest.frames.length).toBe(result.nativeFrames);
    expect(new Set(manifest.frames.map(f => f.path)).size).toBe(result.nativeFrames);
    for (const [i, frame] of manifest.frames.entries()) {
      expect(frame.index).toBe(i + 1);
      expect(await hash(frame.path)).toBe(frame.sha256);
      const bytes = await readFile(frame.path);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(640);
      expect(bytes.readUInt32BE(20)).toBe(480);
      await decode(frame.path);
    }
    // The graph/log branch must also be reviewed: a manifest label alone cannot
    // prove images were saved before encoding rather than reconstructed afterward.
  });

  test('exports the full song/placement duration at the approved playback format', async () => {
    const result = await chain();
    const song = (await probe(result.songPath)).streams.find(s => s.codec_type === 'audio')!;
    expect(song.duration_ts).toBeDefined(); expect(song.time_base).toBeDefined();
    const [numerator, denominator] = song.time_base!.split('/').map(BigInt);
    const scaled = BigInt(song.duration_ts!) * numerator! * 24n;
    const songFrames = Number((scaled + denominator! - 1n) / denominator!);
    const output = await probe(result.exportPath);
    const video = output.streams.find(s => s.codec_type === 'video')!;
    const audio = output.streams.find(s => s.codec_type === 'audio')!;
    expect(video.codec_name).toBe('h264'); expect(video.r_frame_rate).toBe('24/1');
    expect(video.width).toBe(640); expect(video.height).toBe(480);
    expect(Number(video.nb_read_frames)).toBe(Math.max(songFrames, result.placementEndFrame));
    expect(audio.codec_name).toBe('aac'); expect(audio.sample_rate).toBe('48000');
    expect(audio.channels).toBe(2);
    await decode(result.exportPath);
    expect((await stat(result.receiptPath)).size).toBeGreaterThan(0);
  });

  test('failed-call replay uses the same actual seeds, settings and captured inputs', async () => {
    const result = await driver.replayProbe();
    expect(result.retryCallId).not.toBe(result.originalCallId);
    expect(Object.keys(result.originalSeeds).length).toBeGreaterThan(0);
    expect(result.retrySeeds).toEqual(result.originalSeeds);
    expect(Object.keys(result.originalInputHashes).length).toBeGreaterThan(0);
    expect(result.retryInputHashes).toEqual(result.originalInputHashes);
    expect(result.retryParameters).toEqual(result.originalParameters);
    // Reproducibility of inputs is required; byte-identical generated output is not.
  });

  test.each([
    ['yue2', 'queued'], ['yue2', 'running'], ['h3', 'queued'], ['h3', 'running'],
  ] as const)('records %s %s cancellation and native stop observations', async (tool, phase) => {
    const result = await driver.cancellationProbe(tool, phase);
    // A queued Comfy prompt has been submitted, but inference has not started.
    expect(result.inferenceStarted).toBe(phase === 'running');
    expect(result.observedRunningBeforeCancel).toBe(phase === 'running');
    expect(result.stillRunning).toBe(false);
    expect(result.resourcesReleased).toBe(true);
    expect(result.unrelatedWorkTouched).toBe(false);
    expect(Number.isFinite(result.requestMonotonicMs)).toBe(true);
    expect(Number.isFinite(result.confirmedStopMonotonicMs)).toBe(true);
    expect(result.confirmedStopMonotonicMs).toBeGreaterThanOrEqual(result.requestMonotonicMs);
    expect((await stat(result.measurementPath)).size).toBeGreaterThan(0);
    // A numeric latency budget is not agreed. Record the real measurement and
    // review it; these assertions do NOT certify the PRD's immediate-stop promise.
  });

  test('hands the GPU music → video → music only after verified release', async () => {
    expect(await driver.handoffProbe()).toEqual([
      { tool: 'yue2', action: 'dispatch' },
      { tool: 'yue2', action: 'stopped' },
      { tool: 'yue2', action: 'resources-released' },
      { tool: 'h3', action: 'dispatch' },
      { tool: 'h3', action: 'stopped' },
      { tool: 'h3', action: 'resources-released' },
      { tool: 'yue2', action: 'dispatch' },
      { tool: 'yue2', action: 'stopped' },
      { tool: 'yue2', action: 'resources-released' },
    ]);
  });
});
