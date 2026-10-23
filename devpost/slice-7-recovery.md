# Slice 7 — Visible recovery and confirmed debugging

## Request and boundary

Continue the approved fast-mode build after slice 6 (`13555a8`). Finish the
existing cancellation/recovery and setup-debugging requirements, not a new
workflow engine. Ordinary creative agents retain their normal tools, full
permissions and project workspace. Debug uses the disclosed shared-tool working
directory and explicitly warns that changes may extend beyond it.

## Questions resolved from the approved specification

- Cancellation revokes further submissions immediately, then remains pending
  until both provider and registered native work are confirmed stopped/released.
  Unknown cleanup is reconciliation, not success. Committed success wins a race;
  accepted cancellation prevents later selection/placement.
- Retry/Restart creates linked attempts with the original seeds and resolved
  inputs, not a fresh AI interpretation. A pre-native failure has no invented
  native call. Missing verified snapshots make exact recovery unavailable.
- Restore/Reuse selects the original project/song context, saves editable inputs
  with revision guards and starts no work. Fresh Generate assigns fresh seeds.
  Failed/cancelled placeholders may be discarded without deleting history.
- Debug preparation is not permission to launch. Confirmation must match the
  exact unexpired prompt, command, provider and failure context. A repair report
  does not substitute for independent readiness checks.

## Tests before implementation

- Store transitions, cancellation/ingestion races, immutable child identity,
  stale draft revisions, continuation snapshots, no seed allocation on restore.
- Attempt-scoped provider stopping, native cancellation/release, delayed capture,
  replay byte identity, server shutdown and unresolved ownership.
- HTTP dispatch/membership/schema/idempotency, action visibility, persistent
  recovery request identities, late responses and preserved drafts/history.
- Immutable Debug disclosure, no launch on close/cancel, stale/expired/single-use
  confirmation, all-lane maintenance exclusion and independent readiness.
- Separate browser fixtures and bounded actual provider/native tests; reuse
  prior native-adapter evidence honestly, without calling it new UI proof.

## Checklist

- [x] Inspect actual gaps and record the approved behaviour/test boundaries.
- [x] Add meaningful failing lifecycle/runtime/Debug/UI tests, then implement.
- [x] Review integrated API/UI behaviour and run full local checks.
- [x] Verify browser controls and bounded real stopping/restart/repair paths.
- [x] Preserve/deploy, document evidence and commit after verification.

Detailed private execution evidence remains under `.local-evidence/slice-7/`.
The checkpoints below distinguish deployment, synthetic controls and real work.

## Integration checkpoint — not yet deployment evidence

The first full integration run passed 1,222 tests; the expanded review/regression
run passed **1,236 tests in 77 files**, with type checking and a production browser
build passing separately. These are local synthetic/CPU checks, not a claim of
new live model cancellation or autonomous repair.

Independent review found and corrected accepted-retry/lost-refresh duplication,
cancellation blocked by unrelated saves, dirty music-input replacement, and
cross-song restoration adopting unobserved remote revisions. Recovery identities
now remain journalled until an authoritative child/hidden-parent observation;
Cancel has its own per-attempt flight; Restore uses observed or its own accepted
save revisions and applies the mutation response before a follow-up read. Video
history uses the same real restoration path as the library.

Debug disclosures include the exact full prompt, command, working directory,
provider/model, expiry and full-access warning. Open repair reports keep their
setup panel present until dismissed, even when readiness becomes successful.
Provider process exit alone is not treated as proof that owned descendants have
stopped. Independent readiness and retained maintenance ownership remain separate
from agent prose.

New generation capture includes immutable execution helper files and input-media
copies for exact recovery. Slice 8's managed deletion inventory must include
these copies rather than leaving recoverable full media behind.

## Browser checkpoint

The built UI was exercised against an isolated, explicitly synthetic CPU fixture:
Cancel → Restart → Cancel, Restore → fresh Generate with a new seed, failed music
Retry, placeholder Discard, and refresh persistence. API evidence verified linked
attempts, retained history and seeds separately from visible browser state.
Debug Cancel produced no run directory/tool modification; stale disclosure refused
launch; a newly confirmed fake repair passed the independent CPU check. Its report
remained open after readiness became successful, then the setup panel retired on
close and the record remained accessible in Config. These are browser/orchestration
proofs, not a live provider or GPU-generation claim.

## Dundee deployment checkpoint

The frozen candidate passed the same **1,239 tests**, type checking and production
build under Dundee's pinned Node runtime. Schema 6 → 7 was then deployed after
idle backups. The independent preservation audit passed **50/50 checks**, retaining
all **789 registered assets** and all existing creative/native rows byte-for-byte;
only schema metadata and settled readiness fields changed. The new Debug database
was empty as expected. All five tool readiness checks passed. TTS and personal
ComfyUI identities were unchanged throughout deployment. Actual model stopping and
real-provider repair verification remain separate gates; see the next checkpoint.

## Real Debug repair checkpoint

One exact reviewed disclosure was confirmed against a disposable, loopback-only
CPU tool fixture using the real pinned Codex provider. Six checks passed:
unconfirmed cancellation made no tool change; changed failure context refused
stale confirmation; the executed command/prompt matched disclosure; the owned
provider stopped; a fixed independent checker verified the repair; and exactly
one repair ran with no native/GPU lease. The repair changed the deliberately
wrong factor from 3 to 2 without changing the original program/checker files.

The disposable service was stopped afterward. A separate read-only production
audit again passed all 50 checks, with all 789 pre-existing assets unchanged and
TTS/personal ComfyUI identities preserved. This proves a controlled real repair,
not arbitrary host repair or GPU capacity.

The browser connection was interrupted by the development-agent restart. The
same frozen bundle has the synthetic interactive proof described above; the learner reconnected it and a fresh tab subsequently verified real recovery,
refresh, project switching and preserved original inputs. Earlier fixture proof
remains distinguished from actual native/browser evidence.

## Completed recovery slice

Final local/Dundee checks pass **1,248 tests / 78 files**, type checking and build.
Real provider, queued YuE2/H3 and positive-sampling YuE2/H3 cancellation passed;
exact music/video replays completed without fresh agent interpretation. A genuine
H3 host-memory-pressure failure was retained and led to conservative owned-Comfy
launch flags. A fresh request plus exact replay then succeeded without changing
old snapshots. Real browser Restore/Generate/Restart/Discard and navigation were
verified. TTS is restored, personal ComfyUI unchanged, and the final original-data
preservation audit passed **137 checks**. See [slice-7-evidence.md](slice-7-evidence.md)
for failed attempts, counts, measurements and explicit proof boundaries.
