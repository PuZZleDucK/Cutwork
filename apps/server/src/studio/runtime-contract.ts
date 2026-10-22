import type { MusicAttempt, MusicDraft, Provider, ProviderStatus, SetupJob, StudioOverview, ToolId } from '../../../../packages/core/src/contracts/studio.ts';
export interface StudioRuntime {
  overview(): StudioOverview;
  selectProvider(provider: Provider): Promise<ProviderStatus>;
  checkProvider(): Promise<ProviderStatus>;
  setup(tool: ToolId | 'all'): SetupJob[];
  submitMusic(projectId: string, idempotencyKey: string, input: MusicDraft): Promise<MusicAttempt>;
}
