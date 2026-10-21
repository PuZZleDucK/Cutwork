import type { ClipEvidence, HostObservations, Intent, VideoRequest } from './slice1-contract.ts';

// Entirely synthetic observations. They do not describe a real completed run.
export const intent = (): Intent => ({
  projectId: 'project-a', attemptId: 'attempt-1', songId: 'song-a',
  provider: 'codex', model: 'gpt-6.1-sol',
  musicPrompt: 'French electronica with dubstep beats about programming',
  lyrics: 'Compile the morning / Debug the night',
  style: 'Industrial amber lights', clipPrompt: 'A clockwork dancer',
  startFrame: 24, endFrame: 72,
  seeds: { music: '1001', video: '1002' },
});

export const host = (): HostObservations => ({
  os: '26.04', nodeMajor: 24, gpuMiB: 16380,
  ffmpegFound: true, ffprobeFound: true, mediaFixturePassed: true,
});

export const video = (): VideoRequest => ({
  startFrame: 24, endFrame: 72, songSamples: 480_000, sampleRate: 48_000,
  // Deliberately fictional capabilities: NOT a guessed H3 frame-count rule.
  supportedFrameCounts: [32, 64, 96, 128, 384, 512],
});

export function evidence(): ClipEvidence {
  const frames = Array.from({ length: 64 }, (_, i) => ({
    index: i + 1, path: `synthetic/frame-${i + 1}.png`,
    sha256: (i + 1).toString(16).padStart(64, '0'),
  }));
  return {
    requestedFrames: 48, nativeFrames: 64, fps: '24/1', decodes: true,
    rawOrigin: 'pre-encode', frames,
    observedFrames: structuredClone(frames),
    audioPresent: true, actualSeeds: { video: '1002' },
    nativeJobId: 'owned-prompt-1', agentSaysSuccess: true,
    expectedCall: { nativeJobId: 'owned-prompt-1', seeds: { video: '1002' } },
  };
}
