# Slice 8 scratchpad — archive, restore and irreversible deletion

**Complete, verified and deployed.** This follows the recovery slice and
uses the already approved PRD/spec/checklist. No new product feature is proposed.

## Request and settled boundaries

- Archive hides media but retains it. Archiving a clip removes all its placements;
  restoring returns it unplaced, preserving trim/origin/audio settings and never
  displacing a newer clip. Archive is not cancellation of already accepted work.
- Archived songs retain arrangements, become unselected and return unselected on
  restore. Already submitted clips finish against their captured song/interval.
- Delete needs a named-artifact confirmation. Cancel changes nothing. Accepted
  deletion removes timeline use immediately, blocks further media reads/use and
  remains visibly **deleting** until the durable managed-file purge completes.
  Failure must not be labelled deleted or offer restoration of partial media.
- Keep generation history, actual prompts/settings/seeds, text logs and a small
  separate thumbnail; add a deletion event. Do not relabel the original result.
- Deleting a song does not delete independent generated clips. Deleting a source
  clip does not delete its independently generated continuations. Missing song
  context requires an explicit replacement, not silent current-song substitution.
- Queued/active/unresolved dependent work, pending analysis and renders prevent
  deletion. New input capture must not race past accepted deletion.

## Interpretation recorded before implementation

The current server MP4 is both preview and export cache. Deleting media invalidates
and purges affected **managed** caches, including old revisions. Already downloaded
or otherwise independently copied exports remain unchanged. This implements PRD
A3/A6 and spec C8/C9 without promising recall of external files or backup erasure.

Known registered/recorded media copies are covered. Arbitrary unregistered files
made elsewhere by fully capable agents are not discoverable with certainty; do
not hide that boundary by introducing an unrequested agent sandbox.

## Inventory that must not be missed

Original WAV/MP4/FLAC and every raw/native-tail PNG; recoverable YuE2 token/latent
arrays; copied full songs, cropped/padded conditioning audio and continuation
images in all native, Comfy and immutable retry inputs; known workspace/captured
copies; render outputs, partial files and decoded scratch audio. Keep execution
source, text scores/receipts/manifests and independent successor artifacts.

History currently references an original PNG. Before deletion promises a retained
thumbnail, create a small re-encoded, metadata-stripped image instead of retaining
that full-resolution original under another name.

## Tests before code

1. Archive A → place B → restore A: A is unplaced; B and coverage are unchanged.
2. Song archive/restore preserves its hidden arrangement and accepted completion.
3. Delete prepare/cancel/stale confirmation causes no destructive mutation;
   confirmed requests are idempotent and retain separate deletion provenance.
4. Delete/source-capture/render/analysis races produce an explicit dependency
   refusal, not new copies after acceptance. Cross-project access is rejected.
5. A disposable filesystem inventory includes all copy classes above. Purge
   removes only the target's known media/derivatives; unrelated originals and
   permitted provenance stay byte-identical. Asset routes refuse purged bytes.
6. Inject filesystem failure and restart; reconcile the durable operation without
   claiming premature success or silently restoring half-deleted media.
7. CPU-render and browser proof: uncovered black frames, restored-but-unplaced
   clips, missing-song retargeting, unavailable historical managed renders,
   thumbnail/history retention and independent previously copied export.

## Checklist

- [x] Audit approved semantics and actual storage/copy paths.
- [x] Add meaningful failing lifecycle/dependency/filesystem tests.
- [x] Implement store/runtime/API/UI and managed purge reconciliation.
- [x] Review and verify CPU rendering, browser controls and migration preservation.
- [x] Deploy and commit only after the required checks pass.

Evidence: [slice-8-evidence.md](slice-8-evidence.md). Slice 9 and final learner review remain pending.
