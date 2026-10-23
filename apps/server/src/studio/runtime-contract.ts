import type { MusicAttempt, MusicInput, Provider, ProviderStatus, SetupJob, StudioOverview, ToolId, VideoInput, VideoAttempt, StudioRender } from '../../../../packages/core/src/contracts/studio.ts';
export interface StudioRuntime {
  overview(): StudioOverview;
  selectProvider(provider: Provider): Promise<ProviderStatus>;
  checkProvider(): Promise<ProviderStatus>;
  setup(tool: ToolId | 'all'): SetupJob[];
  submitMusic(projectId: string, idempotencyKey: string, input: MusicInput): Promise<MusicAttempt>;
  submitVideo(projectId: string, idempotencyKey: string, input: VideoInput): Promise<VideoAttempt>;
  render(projectId: string, songId: string, revision: number, idempotencyKey: string): Promise<StudioRender>;
}
