import type { Provider } from './generation.ts';
export type { Provider };
export type ToolId = 'agent' | 'yue2' | 'comfyui' | 'h3' | 'analysis';
export type ToolState = 'missing' | 'checking' | 'queued' | 'installing' | 'ready' | 'error' | 'reconciling';
export interface ToolStatus {
  id: ToolId; label: string; state: ToolState; installed: boolean;
  detail: string; log: string; checkedAt: string | null; jobId: string | null;
  active: boolean; queued: number;
}
export interface ProviderStatus {
  provider: Provider; model: string; installed: boolean;
  auth: 'unknown' | 'signed-in' | 'sign-in-required';
  detail: string; signInCommand: string;
}
export interface MusicInput { musicPrompt: string; lyrics: string }
/** Style is persistent visual direction for video, never part of new music input. */
export interface MusicDraft extends MusicInput { style: string }
export interface StudioProject {
  id: string; name: string; createdAt: string; revision: number;
  draft: MusicDraft; selectedSongId: string | null;
}
export interface ProjectSummary extends StudioProject { songCount: number; activeAttempts: number; coveragePercent: number | null }
export type AttemptState = 'queued' | 'preparing' | 'waiting_gpu' | 'running' | 'validating' | 'succeeded' | 'failed' | 'reconciling';
export interface MusicAttempt {
  id: string; nativeCallId: string; projectId: string; sequence: number;
  createdAt: string; updatedAt: string; state: AttemptState;
  provider: Provider; model: string; input: MusicInput; seeds: Record<string, string>;
  stage: string; error: string | null; songId: string | null;
  details: Record<string, unknown>;
}
export interface SongAnalysis {
  state: 'pending' | 'available' | 'partial' | 'failed'; estimatedBpm: number | null;
  sampleIndices: string[]; waveformBucketSamples: number; peaks: number[];
  error: string | null; version: string | null;
}
export interface StudioSong {
  id: string; projectId: string; attemptId: string; createdAt: string; title: string;
  assetId: string; sha256: string; sampleCount: string; sampleRate: number; channels: number;
  durationSeconds: number; truncated: boolean; analysis: SongAnalysis;
}
export interface ProjectSnapshot {
  project: StudioProject; songs: StudioSong[]; attempts: MusicAttempt[]; videoAttempts: VideoAttempt[];
  clips: StudioClip[]; arrangements: SongArrangement[]; reservations: VideoReservation[]; renders: StudioRender[];
}
export interface StudioOverview {
  projects: ProjectSummary[]; selectedProjectId: string | null;
  provider: ProviderStatus; tools: ToolStatus[]; warnings: string[];
}
export interface SetupJob {
  id: string; tool: ToolId; sequence: number; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'reconciling';
  createdAt: string; updatedAt: string; error: string | null;
}

/** Captured exact intent is immutable; execution uses zero-based half-open 24 fps frames. */
export interface VideoInput {
  songId: string; clipPrompt: string; style: string; startFrame: number; endFrame: number;
  requestedIntervalSeconds?: { start: string; end: string };
}
export interface VideoAttempt {
  id: string; nativeCallId: string; projectId: string; sequence: number;
  createdAt: string; updatedAt: string; state: AttemptState;
  provider: Provider; model: string; input: VideoInput; seeds: { h3: string };
  song: Pick<StudioSong, 'id' | 'assetId' | 'sha256' | 'sampleCount' | 'sampleRate' | 'channels'>;
  stage: string; error: string | null; clipId: string | null; details: Record<string, unknown>;
}
export interface RawClipFrame { index: number; assetId: string; sha256: string; pixelSha256: string; bytes: number }
export interface StudioClip {
  id: string; projectId: string; attemptId: string; songId: string; songSha256: string; createdAt: string; title: string;
  assetId: string; sha256: string; audioAssetId: string | null;
  fps: '24/1'; width: number; height: number; nativeFrames: number; requestedFrames: number; rawFrames: RawClipFrame[];
}
export interface ClipPlacement {
  id: string; clipId: string; startFrame: number; endFrame: number; sourceStartFrame: number; priority: number;
}
export interface SongArrangement { projectId: string; songId: string; revision: number; placements: ClipPlacement[] }
export interface VideoReservation { attemptId: string; songId: string; startFrame: number; endFrame: number }
export interface RenderSnapshot { song: StudioSong; arrangement: SongArrangement; clips: StudioClip[] }
export type RenderState = 'queued' | 'running' | 'succeeded' | 'failed' | 'reconciling';
export interface StudioRender {
  id: string; projectId: string; songId: string; revision: number; createdAt: string; updatedAt: string;
  state: RenderState; stage: string; error: string | null; snapshot: RenderSnapshot; snapshotHash: string;
  assetId: string | null; sha256: string | null; frameCount: number | null; planHash: string | null; details: Record<string, unknown>;
}
