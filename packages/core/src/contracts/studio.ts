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
export interface ProjectSnapshot { project: StudioProject; songs: StudioSong[]; attempts: MusicAttempt[] }
export interface StudioOverview {
  projects: ProjectSummary[]; selectedProjectId: string | null;
  provider: ProviderStatus; tools: ToolStatus[]; warnings: string[];
}
export interface SetupJob {
  id: string; tool: ToolId; sequence: number; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'reconciling';
  createdAt: string; updatedAt: string; error: string | null;
}
