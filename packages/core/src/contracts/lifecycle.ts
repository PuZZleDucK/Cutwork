/** Mutable lifecycle is separate from immutable generation/provenance records. */
export interface ArtifactRef { kind: 'song' | 'clip'; id: string }
export interface ArtifactLifecycle extends ArtifactRef {
  projectId: string; state: 'active' | 'archived' | 'deleting' | 'deleted'; revision: number;
  thumbnailAssetId: string | null; deletionId: string | null; updatedAt: string | null;
}
export interface ArtifactBlocker { kind: 'attempt' | 'render' | 'analysis' | 'reservation'; id: string; state: string; detail: string }
export interface DeletionContext {
  lifecycle: ArtifactLifecycle; digest: string; blockers: ArtifactBlocker[]; assetIds: string[]; renderIds: string[];
}
export interface ManagedMediaEntry {
  id: string; path: string; role: string; sha256: string | null; bytes: number | null;
  identity: { dev: string; ino: string; mtimeNs: string; size: string } | null;
}
export interface ManagedMediaInventory {
  version: 1; projectId: string; artifact: ArtifactRef; entries: ManagedMediaEntry[];
  affectedAssetIds: string[]; affectedRenderIds: string[]; digest: string;
}
export interface RetainedThumbnail {
  assetId: string; path: string; sha256: string; bytes: number; width: number; height: number;
}
export interface AcceptDeletionInput {
  contextDigest: string; idempotencyKey: string; inventory: ManagedMediaInventory; thumbnail?: RetainedThumbnail;
  confirmation?: { planId: string; digest: string };
}
export interface PurgeRecord {
  id: string; projectId: string; artifact: ArtifactRef; createdAt: string; updatedAt: string;
  state: 'pending' | 'purging' | 'failed' | 'succeeded'; inventory: ManagedMediaInventory;
  completedEntryIds: string[]; error: string | null; thumbnailAssetId: string | null;
  retainedThumbnail?: RetainedThumbnail;
  confirmation?: { planId: string; digest: string };
}
export interface ArtifactUseReservation {
  id: string; projectId: string; artifact: ArtifactRef; ownerId: string; detail: string; createdAt: string;
}
export interface ArtifactDeletePlan {
  id: string; projectId: string; ref: ArtifactRef; title: string; digest: string; expiresAt: string;
  fileCount: number; bytes: number; retains: string[]; limitations: string[]; blockers: ArtifactBlocker[];
}
