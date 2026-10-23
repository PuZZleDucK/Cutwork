import type { StudioClip, VideoAttempt, ClipPlacement } from '../../../packages/core/src/contracts/studio.ts';

type LibraryEntry = { id: string; startFrame: number | null } & (
 { kind: 'clip'; clip: StudioClip } | { kind: 'attempt'; attempt: VideoAttempt }
);

/** Presentation order only. Never reorder/mutate arrangement priorities or saved history. */
export function orderedClipLibrary(clips: readonly StudioClip[], attempts: readonly VideoAttempt[], placements: readonly ClipPlacement[]): LibraryEntry[] {
 const originals = new Map(attempts.map(a => [a.id, a.input.startFrame]));
 const placed = new Map<string, number>();
 for (const p of placements) placed.set(p.clipId, Math.min(placed.get(p.clipId) ?? Infinity, p.startFrame));
 const entries: LibraryEntry[] = [
  ...clips.map(clip => ({kind:'clip' as const, id:`clip:${clip.id}`, clip, startFrame:placed.get(clip.id) ?? originals.get(clip.attemptId) ?? null})),
  ...attempts.filter(a => a.state !== 'succeeded'&&!a.placeholderDiscardedAt).map(attempt => ({kind:'attempt' as const, id:`attempt:${attempt.id}`, attempt, startFrame:attempt.input.startFrame})),
 ];
 // Stable ties retain input order, including missing origins; null is not frame zero.
 return entries.sort((a,b) => (a.startFrame ?? Infinity) - (b.startFrame ?? Infinity));
}
