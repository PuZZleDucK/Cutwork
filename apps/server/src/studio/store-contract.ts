import type { MusicAttempt, MusicDraft, MusicInput, ProjectSnapshot, ProjectSummary, Provider, SetupJob,
  SongAnalysis, StudioProject, StudioSong, ToolId, ToolStatus, VideoAttempt, VideoInput, StudioClip, SongArrangement, StudioRender } from '../../../../packages/core/src/contracts/studio.ts';
export type AttemptPatch = Partial<Pick<MusicAttempt, 'state' | 'stage' | 'error' | 'details'>>;
export type SongInput = Omit<StudioSong, 'id' | 'projectId' | 'attemptId' | 'createdAt'> & { assetPath: string };
export interface RegisteredAssetInput { assetId: string; path: string; sha256: string }
export interface VideoOutputInput {
  title: string; video: RegisteredAssetInput;
  audio: (RegisteredAssetInput & { sampleCount: string; sampleRate: number; channels: number }) | null;
  frames: (RegisteredAssetInput & { index: number; pixelSha256: string; bytes: number })[];
  frameCount: number; width: number; height: number; fps: '24/1';
}
export interface PlacementInput { clipId: string; startFrame: number; sourceStartFrame?: number; frameCount?: number }
export interface RenderOutputInput extends RegisteredAssetInput { frameCount: number; planHash: string; receiptPath: string }
export interface StudioStore {
  close(): void;
  provider(): Provider;
  setProvider(provider: Provider): void;
  selectedProject(): string | null;
  selectProject(id: string): void;
  createProject(name: string): StudioProject;
  listProjects(): ProjectSummary[];
  project(id: string): ProjectSnapshot;
  saveDraft(id: string, revision: number, draft: MusicDraft): StudioProject;
  selectSong(projectId: string, songId: string, revision: number): StudioProject;
  submitMusic(projectId: string, idempotencyKey: string, input: MusicInput): MusicAttempt;
  attempts(): MusicAttempt[];
  attempt(id: string): MusicAttempt | null;
  patchAttempt(id: string, patch: AttemptPatch): MusicAttempt;
  finishMusic(id: string, song: SongInput, details: Record<string, unknown>): StudioSong;
  setAnalysis(songId: string, analysis: SongAnalysis): StudioSong;
  submitVideo(projectId: string, idempotencyKey: string, input: VideoInput): VideoAttempt;
  videoAttempts(): VideoAttempt[];
  videoAttempt(id: string): VideoAttempt | null;
  patchVideoAttempt(id: string, patch: AttemptPatch): VideoAttempt;
  finishVideo(id: string, output: VideoOutputInput, details: Record<string, unknown>): StudioClip;
  clip(id: string): StudioClip | null;
  arrangement(projectId: string, songId: string): SongArrangement;
  addPlacement(projectId: string, songId: string, revision: number, input: PlacementInput): SongArrangement;
  movePlacement(projectId: string, songId: string, revision: number, placementId: string, startFrame: number): SongArrangement;
  removePlacement(projectId: string, songId: string, revision: number, placementId: string): SongArrangement;
  enqueueRender(projectId: string, songId: string, revision: number, idempotencyKey: string): StudioRender;
  /** Invalidate cache eligibility only; the immutable successful record remains history. */
  invalidateRenderCache(id: string): void;
  renders(): StudioRender[];
  render(id: string): StudioRender | null;
  patchRender(id: string, patch: Partial<Pick<StudioRender, 'state' | 'stage' | 'error' | 'details'>>): StudioRender;
  finishRender(id: string, output: RenderOutputInput, details: Record<string, unknown>): StudioRender;
  asset(id: string): { projectId: string; path: string; sha256: string; mediaType: 'audio/wav' | 'video/mp4' | 'image/png' | 'audio/flac' } | null;
  tools(): ToolStatus[];
  tool(id: ToolId): ToolStatus;
  patchTool(id: ToolId, patch: Partial<Omit<ToolStatus, 'id' | 'label'>>): ToolStatus;
  enqueueSetup(tool: ToolId): SetupJob;
  setupJobs(): SetupJob[];
  patchSetup(id: string, state: SetupJob['state'], error?: string): SetupJob;
  /** Only on a real server startup: never replay already-started expensive work. */
  markInterrupted(): void;
}
