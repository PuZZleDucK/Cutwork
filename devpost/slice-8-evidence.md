# Slice 8 — media lifecycle and retained provenance

## Implemented behavior

- Archive removes a clip from every arrangement, preserving its unplaced trim,
  timing and audio context. Restore never recreates placements or displaces a
  replacement clip. Archived songs keep their arrangements and restore unselected.
- Permanent deletion requires a named, expiring disclosure and exact confirmation.
  The confirmation survives lost acknowledgements and server restarts; a missing
  disclosure file cannot turn an already accepted operation into a false rejection.
- Accepted deletion removes timeline use and denies new full-media reads immediately.
  A durable, resumable purge removes known managed originals, raw/native-tail frames,
  native/replay input copies, attributable recovery intermediates, declared workspace
  copies and affected assembled preview/export caches. Failure stays **deleting**,
  with an error and retry, rather than falsely reporting completion.
- Original generation records, inputs, settings, seeds, text logs and independent
  generated successor artifacts remain. A separate bounded, re-encoded thumbnail
  is verified before acceptance and around the purge; it is not a renamed raw frame.
- Pending analysis, dependent accepted work/renders, cache-read reservations and
  uncertain native ownership prevent deletion. New source capture/use cannot pass
  the transactional deletion barrier. Asset HTTP rechecks after asynchronous opens.
- Surviving clips whose song was deleted require an explicit replacement song;
  retargeting retains trim/origin/audio and creates no placement.

## Verification

**Final frozen source: 269 files. Local and Dundee checks: 1,322/1,322 tests in
85 files, typecheck and production build pass.** Deployment helper tests separately
pass 60/60; these are not counted as application tests.

Meaningful failing regressions preceded store lifecycle, HTTP routes, filesystem
inventory/purge, UI helpers, asynchronous asset/cache races, disclosure-loss replay
and focus-return fixes. Additional review tests cover same-project startup purge
serialization and missing thumbnail rejection. Existing migration tests still
compare original creative rows/schema bytewise; only their current version target
changed from 7 to 8.

Independent focused review found and repaired three orchestration gaps before
freeze: startup purges sharing a project, retained-thumbnail revalidation, and
accepted-key lookup before disclosure loading. The browser found a fourth issue:
Cancel left focus on the page body; Cancel/Escape now return it to the original
Delete trigger without scrolling.

### Actual CPU / HTTP proof — not model generation

A fresh, explicitly synthetic `/tmp` runtime exercised the real store, HTTP API,
filesystem manager and FFmpeg renderer. All **11 proof stages** passed:

1. Rendered a synthetic 192-frame film and copied an independent export.
2. Archived A: its first 80 output frames independently decoded as black.
3. Restored A unplaced: a separate render decoded to identical picture and audio;
   B's metadata and every media hash remained unchanged.
4. A returned only after explicit placement.
5. Song archive/restore retained its arrangement and left it unselected.
6. Preparing and dismissing a deletion disclosure changed no creative state/media.
7. HTTP-confirmed deletion removed A's inventoried originals, frames, recorded WAV
   derivative, copies and affected historical managed render.
8. Deleted media GET/HEAD/range returned 404; thumbnail returned 200; original
   generation and separate deletion events survived; downloaded export stayed exact.
9. The new current export showed black in A's uncovered interval.
10. Deleting the original song preserved an independent equal-byte replacement and
    B's generated video/audio/raw frames.
11. Missing-song Continue was rejected; explicit unplaced retarget preserved trim,
    source origin and audio choice.

A second filesystem audit did not trust the purge manifest's claims: A's directory
was empty; B still had exactly 80 PNGs plus WAV/FLAC/MP4; four affected render
folders contained only plan/receipt JSON; original song was absent; external export
hash remained exact. Three private harness failures were retained (required API
callback, grayscale observer rounding, strict song-input shape), corrected and
rerun. They were not product failures or hidden successful runs.

### Interactive browser proof

Actual Chrome checks on an isolated synthetic runtime covered Archive A → move B
into the vacated range → Restore A. A was visibly unplaced; B and 41.7% coverage
were unchanged. Song restore remained unselected, then explicit selection restored
its inputs and saved arrangement. The irreversible disclosure showed real file
counts and retained/external-copy boundaries. Cancel and Escape kept the media;
both focus-return paths passed after repair.

The independently purged CPU fixture was then opened read-only: deleted records,
small thumbnail, original video inputs, seeds/provider disclosures and full-media
unavailability were visible. No browser permanent-delete click was performed;
destructive acceptance was exercised through the real HTTP API on disposable data.

## Evidence locations and boundaries

Public tests are under `tests/contracts/studio-lifecycle-*.test.ts`,
`studio-media-purge.test.ts`, the extended asset/runtime/recovery/migration suites,
and `apps/web/src/*lifecycle*` / `ArtifactControls.test.ts`.

Private run evidence is under `.local-evidence/slice-8/`: final test/typecheck/build
logs; `proof/cpu-api-proof.json`, `proof/post-purge-audit.json`; browser proof notes
and screenshots; frozen deployment manifests, backups and preservation audit.
Private evidence contains real runtime paths and is intentionally not published.

These checks do not promise secure disk erasure, recall of previous downloads or
backups, discovery of arbitrary unregistered copies made by unrestricted agents,
audio separation from independent generated clips, new GPU/media-quality evidence,
or human listening. No unrelated service or personal ComfyUI was stopped for this
slice. Slice 9 and the final learner review/wrap-up remain separate work.

## Deployment

**Complete and deployed** at `http://dundee.local:9122/` from immutable source
`slice8-20261023-075454-2009099`. All five readiness checks settled ready/idle.
The final **53/53 preservation checks passed**, including all **831**
registered assets, every pre-existing creative/native/Debug row and schema object,
selected project/drafts, TTS and personal ComfyUI identities. Only schema7→8 and
three empty lifecycle tables were added. The first audit ran too early while
readiness held its maintenance lease; that non-pass is retained separately, not
relabeled. The audit was rerun only after actual readiness settled.

The deployed LAN browser showed new Archive/Delete controls and the unchanged
original project, description, visual style, start255/end362 and four clip previews.
No production artifact was archived or deleted. The studio is PID3099461,
invocation `ab909c6a6cde46b4ab07f45163401411`; TTS remains its original active
PID3065826, and personal ComfyUI is unchanged. These are verification-time identities,
not permanent configuration values.
