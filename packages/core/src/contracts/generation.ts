/** Application-owned request and native-observation types. Agents reply normally. */
export type Provider = 'codex' | 'claude';
export type SeedMap = Record<string, string>;

export interface Intent {
  projectId: string;
  attemptId: string;
  songId: string;
  provider: Provider;
  model: string;
  musicPrompt: string;
  lyrics: string;
  style: string;
  clipPrompt: string;
  startFrame: number;
  endFrame: number;
  seeds: SeedMap;
}

export interface HostObservations {
  os: string;
  nodeMajor: number;
  gpuMiB: number;
  ffmpegFound: boolean;
  ffprobeFound: boolean;
  mediaFixturePassed: boolean;
}

export interface PythonEnvironment {
  prefix: string;
  python: string;
  pipArgv: string[];
  systemSitePackages: boolean;
}

export interface VideoRequest {
  startFrame: number;
  endFrame: number;
  songSamples: number;
  sampleRate: number;
  supportedFrameCounts: number[];
  /** Exact entered intent; omit only when the request was entered in frames. */
  requestedIntervalSeconds?: { start: string; end: string };
}

export interface VideoPlan {
  fps: '24/1';
  requestedFrames: number;
  nativeFrames: number;
  placement: { startFrame: number; endFrame: number };
  conditioning: {
    startSample: number;
    availableSamples: number;
    silenceSamples: number;
    totalSamples: number;
  };
  durationWarning: boolean;
}

export interface CapturedCall {
  id: string;
  attemptId: string;
  argv: string[];
  seeds: SeedMap;
  files: Record<string, { snapshotPath: string; sha256: string }>;
}

export interface ClipEvidence {
  requestedFrames: number;
  nativeFrames: number;
  fps: string;
  decodes: boolean;
  rawOrigin: 'pre-encode' | 'decoded-video';
  frames: Array<{ index: number; path: string; sha256: string }>;
  observedFrames: Array<{ index: number; path: string; sha256: string }>;
  audioPresent: boolean;
  actualSeeds: SeedMap;
  nativeJobId: string | null;
  /** Persisted expected call identity, not fields inferred from the output. */
  expectedCall: { nativeJobId: string; seeds: SeedMap };
  agentSaysSuccess: boolean;
}

export type NativeOwner =
  | { kind: 'not-submitted'; attemptId: string }
  | { kind: 'comfy'; promptId: string }
  | { kind: 'process'; pid: number; group: number; start: string; boot: string };

export interface CancelInput {
  phase: 'queued' | 'running' | 'cancel_requested' | 'succeeded';
  /** Independent queue observation. Required before issuing a Comfy action. */
  nativePhase?: 'queued' | 'running' | 'unknown';
  owner: NativeOwner;
  observedOwner: NativeOwner | null;
  stopped: boolean;
  resourcesReleased: boolean;
  successCommitted: boolean;
}

export type CancelAction =
  | { type: 'delete-queued-comfy'; promptId: string }
  | { type: 'interrupt-comfy'; promptId: string }
  | { type: 'stop-owned-process-group'; group: number };
