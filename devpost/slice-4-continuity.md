# Slice 4 — Project, song and provider continuity

## Request and checkpoint

The learner accepted the integrated creative loop and timing-polish retry with
“perfect” on 23 October 2026. Continue the approved build in fast mode. This slice
makes context changes reliable; it does not add precision trim/audio/lifecycle
controls from later slices or launch new model generations solely to retest UI.

## Questions / interpretation

- Most backend capture and selection behavior already exists. Audit and exercise
  it rather than replace working architecture.
- Shared provider changes affect only requests accepted afterward. Captured
  project/song/provider/model/seed and existing workspaces must not be retargeted.
- Newly completed music selects its new song once; manual selection afterward
  must survive duplicate completion, refresh and restart. Other project views
  must not jump to the completed job's project.
- Unsent drafts and uncertain submissions must retain their own context across
  navigation/refresh; never turn a transport failure into a duplicate generation.
- Reconciliation is not resumable inference: uncertain external work stays
  visibly unresolved and is not blindly dispatched again.

## Checklist

- [x] Audit current storage/runtime/UI continuity and map existing evidence.
- [x] Write focused race/idempotency/isolation regression tests before fixes.
- [x] Implement only missing continuity behavior.
- [x] Full tests/typecheck/build plus isolated browser navigation/response-loss checks.
- [x] Verify real provider adapters and controlled interruption evidence without
      disturbing personal services or live creative projects.
- [x] Immutable Dundee deployment, data preservation audit, live UI check, commit.

## Implementation and review

- Added independently revisioned per-song clip drafts and schema-4 migration.
  Existing songs gain empty forms only; old creative records/history are retained.
- Added context-scoped uncertain music submission recovery and canonical video
  signatures. The browser test found a real JSON-key-order retry defect: reloading
  a saved timing draft changed property order and previously created a duplicate
  request. The failed fixture is retained; stable signatures and legacy signature
  recognition now preserve the original key. Fresh replay adds exactly one job.
- Fixed shared FIFO so a later completed capture cannot overtake an earlier
  accepted capture. Fixed startup/final-setup auth observations racing a newer
  provider selection or same-provider check.
- Native provider receipts now record observed/assigned/unavailable session
  provenance without requiring JSON responses or removing ordinary tools.
- Independent focused review repaired draft equality, incomplete-fraction recovery,
  failed-storage-write shadowing, late unmounted writes and recovery-response
  races. Ownership is claimed in a committed effect rather than a state
  initializer, so development StrictMode cannot steal the live writer token.

## Mechanical evidence

| Claim | Evidence | Boundary |
|---|---|---|
| Store isolation, immutable routing, once-only selection/completion, saved arrangements, revision conflicts and migration | `studio-continuity.test.ts`, `studio-clip-drafts.test.ts`, existing music/video/store suites | Real SQLite and transactions; synthetic output metadata |
| Running plus queued context, aggregate status, FIFO and provider races | `studio-runtime.test.ts` | Real task capture/persistence; injected executors and auth |
| Browser navigation/recovery | Private `.local-evidence/slice-4/browser-final-fixture.json`, browser screenshots and retained fixture DB | Actual built UI/API/SQLite; synthetic silence and no native generation |
| Both real provider adapters | Private `provider-proof/report.json`, `independent-audit.json`: **51/51** | Pinned normal CLI/model, distinct project/run paths, written and independently rerun timing scripts: 48 frames / 96,000 samples. Native session corroborated for each. No GPU/model work |
| Unexpected process interruption | Private `restart-report.json`: **15/15** | Actual isolated Node process killed/restarted; real runtime/SQLite/captured plans. External generation and lease ownership deliberately synthetic |
| Full regression | **996/996**, 56 suites locally and in the immutable Dundee candidate; typecheck/build | Default fixture suite, not the opt-in GPU suite |

Browser checks include project A→B→A, song changes, Config navigation, refresh,
a separate clean tab, exact typed timing, cross-tab conflict/keep-local recovery,
a delayed old acknowledgement after remount, and lost-after-acceptance music/video
responses. Existing A work retains its ID/input/seeds/Codex provider while new B
work uses Claude. Confirmed video acceptance clears its matching prompt/timing;
failed/uncertain acceptance retains them. The browser fixture's two pre-fix
duplicate attempts remain as failed-test evidence, not successful new behavior.

The isolated restart left the started attempt reconciling, the queued request
byte-for-byte unchanged, its synthetic lease retained and a visible warning. No
executor was redispatched. This does **not** claim a fresh running-GPU crash test
or successful recovery of unknown external work. Previous native registration,
cancellation and release evidence remains in the slice-1 map.

## Operational boundaries

No new native song/video was needed for this continuity pass. TTS and personal
ComfyUI remain outside application deployment. Existing provider configuration,
full-access launch flags and normal capabilities are retained. Per-tab recovery
cannot survive reload if the browser refuses storage writes. Upgrade helpers
require an idle/drained queue; captured plans from another immutable source are
rejected, not silently regenerated.


## Deployed verification

Immutable candidate: `slice4-20261023-032252-1283238`, port 9122. The application
was restarted only after a drained-queue check, private SQLite backups, source
verification and registered-file hashes. All five tools returned ready/idle.
The schema-3→4 preservation audit passed **43/43**: all **554 registered assets**,
seven songs, seven clips, old prompts/placements/history/native records and
acceptance sequences unchanged; seven empty revision-zero clip drafts were the
only new creative table contents at the migration audit.

The existing browser then loaded the new bundle. Its project, text inputs,
linked times and placement values matched the pre-reload DOM exactly. Legacy tab
draft recovery may subsequently create a real saved-draft event; it was not
counted as migration backfill. Screenshot: private
`.local-evidence/slice-4/dundee-continuity.png`. TTS and personal ComfyUI retained
exact before/after process/service identities. No user media was generated,
removed or edited during these checks.

Fast-mode slice complete; no additional routine learner approval requested.
Precision trim/dominance/audio, continuation, recovery controls and lifecycle
slices remain on the checklist. This is not final proof-of-concept approval.
