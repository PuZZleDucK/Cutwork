import type { AttemptState, MusicDraft, MusicInput, ToolStatus, MusicAttempt, StudioSong } from '../../../packages/core/src/contracts/studio.ts';
export const emptyDraft: MusicDraft = { musicPrompt: '', lyrics: '', style: '' };
export const draftEqual = (a: MusicDraft, b: MusicDraft) => a.musicPrompt === b.musicPrompt && a.lyrics === b.lyrics && a.style === b.style;
export function mergeSavedDraft(current: MusicDraft, submitted: MusicDraft, saved: MusicDraft): {draft: MusicDraft; dirty: boolean} {
  return draftEqual(current, submitted) ? { draft: saved, dirty: false } : { draft: current, dirty: true };
}
export function createRequestId(cryptoSource: { getRandomValues: (value: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBufferLike> } | null | undefined = globalThis.crypto): string {
  if (!cryptoSource?.getRandomValues) throw new Error('Browser cryptography is unavailable. Use a current browser to generate a request.');
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function waveformEnvelope(peaks: number[], width = 240): number[] {
  if (!peaks.length || width < 1) return [];
  const count = Math.min(Math.floor(width), peaks.length);
  return Array.from({ length: count }, (_, i) => {
    let peak = 0;
    for (let j = Math.floor(i * peaks.length / count); j < Math.floor((i + 1) * peaks.length / count); j++) {
      const value = peaks[j]!;
      if (Number.isFinite(value)) peak = Math.max(peak, Math.min(1, Math.abs(value)));
    }
    return peak;
  });
}
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
export const attemptIsActive = (state: AttemptState) => ['queued', 'preparing', 'waiting_gpu', 'running', 'validating'].includes(state);
export const stateLabel = (state: string) => ({waiting_gpu: 'Waiting for GPU', preparing: 'Preparing', validating: 'Validating audio', reconciling: 'Needs attention', succeeded: 'Complete', failed: 'Failed', queued: 'Queued', running: 'Generating', installing: 'Installing', checking: 'Checking', ready: 'Ready', missing: 'Not installed', error: 'Setup failed'}[state] ?? state);

/** Activity is the shared agent tool's observed work, not an inferred auth/model status. */
export function agentActivity(tools: Pick<ToolStatus, 'id' | 'active' | 'queued'>[]): string | null {
  const agent = tools.find(tool => tool.id === 'agent');
  return agent ? `${agent.active ? 'Active' : 'Idle'}${agent.queued > 0 ? ` · ${agent.queued} queued` : ''}` : null;
}
export function historySong<T extends Pick<StudioSong, 'id' | 'projectId' | 'attemptId'>>(
  attempt: Pick<MusicAttempt, 'id' | 'projectId' | 'state' | 'songId'>, songs: T[],
): T | undefined {
  if (attempt.state !== 'succeeded' || !attempt.songId) return undefined;
  return songs.find(song => song.id === attempt.songId && song.projectId === attempt.projectId && song.attemptId === attempt.id);
}

/** A project visual style must never leak into a music-agent task. */
export const musicInputFromDraft = (draft: MusicDraft): MusicInput => ({ musicPrompt: draft.musicPrompt, lyrics: draft.lyrics });

/** Older records remain truthful; this value is display-only, never reused for music. */
export function legacyMusicVisualStyle(input: MusicInput): string | null {
  return 'style' in input && typeof input.style === 'string' && input.style ? input.style : null;
}
