import type { MusicAttempt, MusicDraft, ProjectSnapshot, ProjectSummary, Provider, SetupJob,
  SongAnalysis, StudioProject, StudioSong, ToolId, ToolStatus } from '../../../../packages/core/src/contracts/studio.ts';
export type AttemptPatch = Partial<Pick<MusicAttempt, 'state' | 'stage' | 'error' | 'details'>>;
export type SongInput = Omit<StudioSong, 'id' | 'projectId' | 'attemptId' | 'createdAt'> & { assetPath: string };
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
  submitMusic(projectId: string, idempotencyKey: string, input: MusicDraft): MusicAttempt;
  attempts(): MusicAttempt[];
  attempt(id: string): MusicAttempt | null;
  patchAttempt(id: string, patch: AttemptPatch): MusicAttempt;
  finishMusic(id: string, song: SongInput, details: Record<string, unknown>): StudioSong;
  setAnalysis(songId: string, analysis: SongAnalysis): StudioSong;
  asset(id: string): { projectId: string; path: string; sha256: string } | null;
  tools(): ToolStatus[];
  tool(id: ToolId): ToolStatus;
  patchTool(id: ToolId, patch: Partial<Omit<ToolStatus, 'id' | 'label'>>): ToolStatus;
  enqueueSetup(tool: ToolId): SetupJob;
  setupJobs(): SetupJob[];
  patchSetup(id: string, state: SetupJob['state'], error?: string): SetupJob;
  /** Only on a real server startup: never replay already-started expensive work. */
  markInterrupted(): void;
}
