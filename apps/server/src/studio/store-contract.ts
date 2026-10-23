import type { AcceptDeletionInput, ArtifactRef, ArtifactLifecycle, ArtifactUseReservation, DeletionContext, PurgeRecord } from '../../../../packages/core/src/contracts/lifecycle.ts';
import type { ClipDraft, ClipEditContext, ContinuationReference, MusicAttempt, MusicDraft, MusicInput, ProjectSnapshot, ProjectSummary, Provider, SetupJob,
  SongAnalysis, StudioAttempt, StudioProject, StudioSong, ToolId, ToolStatus, VideoAttempt, VideoInput, StudioClip, SongArrangement, StudioRender } from '../../../../packages/core/src/contracts/studio.ts';
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
export interface ClipEditPatch {
  sourceStartFrame?: number; sourceEndFrame?: number; trimIntent?: ClipEditContext['trimIntent'];
  startFrame?: number; placementIntent?: ClipEditContext['placementIntent']; audioSource?: 'song' | 'clip';
}
export interface ClipEditResult { context: ClipEditContext; arrangement: SongArrangement }
export interface ClipDraftInput extends Pick<ClipDraft, 'clipPrompt' | 'timingIntent'> { continuation?: ContinuationReference | null }
export interface RenderOutputInput extends RegisteredAssetInput { frameCount: number; planHash: string; receiptPath: string }
export interface RestoreAttemptInput { projectRevision: number; clipDraftRevision?: number }
export interface RestoreAttemptResult { project: StudioProject; draft: ClipDraft | null; attempt: StudioAttempt }
export interface StudioStore {
  close(): void;
  lifecycle(projectId: string, artifact: ArtifactRef): ArtifactLifecycle;
  assertArtifactAvailable(projectId: string, artifact: ArtifactRef, options?: { allowArchived?: boolean }): void;
  archiveArtifact(projectId: string, artifact: ArtifactRef, revision: number): ArtifactLifecycle;
  restoreArtifact(projectId: string, artifact: ArtifactRef, revision: number): ArtifactLifecycle;
  deletionContext(projectId: string, artifact: ArtifactRef): DeletionContext;
  acceptDeletion(projectId: string, artifact: ArtifactRef, input: AcceptDeletionInput): PurgeRecord;
  deletions(projectId?: string): PurgeRecord[];
  deletion(id: string): PurgeRecord | null;
  deletionForKey(projectId: string, idempotencyKey: string): PurgeRecord | null;
  patchDeletion(id: string, patch: { completedEntryIds?: string[]; error?: string | null }): PurgeRecord;
  finishDeletion(id: string): PurgeRecord;
  retargetClipContext(projectId: string, contextId: string, revision: number, songId: string): ClipEditContext;
  /** Durable reservations cover native use and cache checks not yet represented by queued work. */
  reserveArtifactUse(projectId: string, artifact: ArtifactRef, ownerId: string, detail: string, allowArchived?: boolean): ArtifactUseReservation;
  releaseArtifactUse(id: string): void;
  artifactUses(projectId?: string): ArtifactUseReservation[];
  /** Trusted inventory access; asset() is the public availability-filtered view. */
  rawAsset(id: string): ReturnType<StudioStore['asset']>;
  assets(projectId: string): (NonNullable<ReturnType<StudioStore['asset']>> & { id: string })[];
  provider(): Provider;
  setProvider(provider: Provider): void;
  selectedProject(): string | null;
  selectProject(id: string): void;
  createProject(name: string): StudioProject;
  listProjects(): ProjectSummary[];
  project(id: string): ProjectSnapshot;
  saveDraft(id: string, revision: number, draft: MusicDraft): StudioProject;
  saveClipDraft(projectId: string, songId: string, revision: number, draft: ClipDraftInput): ClipDraft;
  prepareContinuation(projectId: string, contextId: string, revision: number, draftRevision: number): { draft: ClipDraft; presetBeatCount: number | null };
  selectSong(projectId: string, songId: string, revision: number): StudioProject;
  submitMusic(projectId: string, idempotencyKey: string, input: MusicInput): MusicAttempt;
  requestCancel(attemptId: string): StudioAttempt;
  /** Runtime calls only after owned provider/native stop and release are proven. */
  finishCancellation(attemptId: string, details: Record<string, unknown>): StudioAttempt;
  recoverAttempt(attemptId: string, action: 'retry' | 'restart', idempotencyKey: string): StudioAttempt;
  discardAttempt(attemptId: string): StudioAttempt;
  restoreAttempt(attemptId: string, revisions: RestoreAttemptInput): RestoreAttemptResult;
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
  editClipContext(projectId: string, contextId: string, revision: number, arrangementRevision: number, edit: ClipEditPatch): ClipEditResult;
  setContextPlacement(projectId: string, contextId: string, revision: number, arrangementRevision: number, placed: boolean): ClipEditResult;
  swapPlacementPriority(projectId: string, songId: string, revision: number, firstPlacementId: string, secondPlacementId: string): SongArrangement;
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
