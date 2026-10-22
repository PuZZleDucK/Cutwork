---
doc: test-review
status: approved
---

# Registered-work evidence — composition test review

22 October 2026; evidence updated 23 October. **Learner approved the 53 local cases
and native scenario with “yep”. Implementation and local verification are complete.
Two separately authorised native attempts failed and remain preserved. After the
approved diagnostic repair, the learner authorised one further attempt; it
passed 1/1, including the complete post-exit scenario. The collector checkpoint
was accepted by the learner with “looks good, go for it”; this is not a claim that
slice 1/G4 is complete. No automatic
retry was made, and no fourth run is authorised.**

Accepted checkpoint committed as **`3298874` — Collect registered-work evidence
with native diagnostics** after a fresh 397/397 default run and typecheck. The
next [reconciliation assessment batch](registered-work-assessment-test-review.md)
is tests-first and does not authorize handoff.

The learner accepted the whole-queue implementation with “looks great, go for
it”. It is committed as **`b45c6d2` — Verify complete owned Comfy queue
observations**. Before committing, typechecking and **316/316 existing default
tests** passed again. Slice 1/G4 remains open.

## Request and scope

Combine the accepted process census, whole-Comfy-queue binding and NVIDIA
compute-process reader into **one bounded, read-only evidence collector and
assessment** for `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`.
This is the next integration step, not another standalone prerequisite reader.

The output answers “what was observed for these registrations?” It does **not**
answer “may the next generation start?” It is deliberately incompatible with
`native-control.ts`'s caller-supplied `ReleaseObservation`. No `ownerKnown`,
`gpuClear`, `resourcesReleased`, dispatch callback, cancellation request, model
unload or shared-lease integration is added here. Normal agent capabilities,
project workspaces and response formats are unchanged.

## Scratchpad — explicit assumptions and resolved questions

### What is captured

- A server-owned attempt/registration revision, boot identity, exact registered
  process identities and captured process-group/session metadata. Process
  identity is **boot + PID + exact decimal start ticks**, not group membership.
- Every registered Comfy service's existing owned-transport configuration.
  Each must match a process registration; arbitrary endpoints are not introduced.
- Unresolved launch intents remain explicit even if every read succeeds.
- A serializable remembered-identity ledger from the same attempt and boot.
  A later registry revision cannot silently forget an earlier observed child.
- All input values and reader callbacks are captured before awaiting. Successful
  reader results are copied before another callback can alter them.

No database or browser input API is built in this batch. These are internal,
trusted-server inputs; their identity/association/budget invariants are validated
before I/O. Reader test seams supply typed synthetic snapshots. Production uses
the actual accepted readers by default, not a second implementation of them.

### One non-atomic observation window

```text
process census before
→ each registered queue before (registration order)
→ NVIDIA compute snapshot
→ each registered queue after (same order)
→ process census after
```

All calls are sequential, fresh and bracketed with collector timestamps from
the same `performance.now()` clock. The two existing timestamped readers must
return intervals inside their collector brackets. Queue changes compare the
full running/pending arrays, retaining wire order without calling it FIFO.

A normal reader failure is retained in its phase and remaining phases are still
attempted within the original budget; a second planned bracket is not an
automatic retry. Wrong boot, incompatible/backwards clock, memory overflow,
caller abort or the original deadline stops further collection. The actual
census reports changed/malformed boot data as `PROC_CENSUS_SCHEMA`, not a separate
boot code: census schema/clock errors are terminal too, preserving their native
code rather than parsing message prose. Ordinary `PROC_CENSUS_IO` can still be
followed by other observations. Missing phases are explicitly `not-started`;
failed phases never receive fabricated empty data.

### Presence is not ownership or exit proof

For each remembered identity, each census yields `present`, `not-observed`,
`pid-reused`, or `unavailable`. An unchanged identity remains present after
reparenting, group/session changes, or becoming a zombie/stopped task.

New ancestry relationships are **discovery hints**, not automatic authorization
to kill or release. Parent links store the parent identity and whether that
identity was actually observed in the same non-atomic census. A missing/reused
parent allows only a `numeric-parent-only` hint. Matching numeric process groups
or sessions likewise creates a weak candidate, never verified ownership.
Descendants can be discovered transitively regardless of row order; discovery
must terminate even if input relationships contain a cycle.

The ledger preserves the **first discovery provenance** for each exact identity,
not a growing copy of every repeated relationship. Prefer an observed-parent
chain over a PID-only parent hint, then group, then session; ties follow captured
registry/ledger order. Resolve this precedence across the entire first observation
phase before freezing its discovery record; later phases/windows preserve that
first provenance. Raw censuses retain the full records for later inspection.
Old identities and candidates are never evicted because they disappeared.

`maxRememberedIdentities` bounds the ledger. Overflow stops the window, retains
existing entries and the successful raw census containing additional discoveries,
and marks `memory.complete = false`. Such a ledger is rejected as input to a
later window rather than silently losing knowledge. Recovery can inspect the
retained raw evidence and explicitly re-run with a sufficient bound; there is
no automatic retry or truncation presented as complete memory.

### GPU correlation remains provisional

Keep **every** GPU row, including unknown/unrelated PIDs. Correlate its number
against both censuses and all remembered identities sharing that PID. Classify
the two census matches as `same-identity`, `pid-reused`, `one-sided`, or `unseen`.
Several historical identities can share a number; none is silently replaced.
An absent child with a lingering NVIDIA PID remains visible in the report.

Even `same-identity` means only that the two censuses observed that identity.
It does not prove no intermediate reuse, host namespace visibility, GPU ownership,
MPS/client attribution, or complete allocation coverage. Every report retains
the non-atomic/procfs/compute-only/unverified-attribution/unregistered-work/no-lease
limitations. No unchecked `environmentVerified: true` shortcut is accepted.

### A deadline is not query-child cleanup

Each native reader receives the smaller of its configured timeout and the
remaining **original** window budget. On abort/deadline, abort the active reader
and start no new observation. Allow a separate bounded `drainTimeoutMs` only for
that already-started callback to settle. This never extends admissible evidence
freshness: a late success is still a failed observation.

Preserve a native error's `cleanupConfirmed` and `queryPid`, including an error
received during draining. If the callback still has not settled, report
`settlement: pending`; do not imply that its child exited. The upper wait is the
window budget plus this drain allowance, subject to ordinary JS scheduling.
Late settlement cannot mutate returned evidence, memory, or start another phase.
The collector never guesses a PID to kill; the accepted NVIDIA reader continues
to own its own query-child cleanup. Future integration must reconcile pending
cleanup rather than releasing a lease on callback timeout.

## Implemented API and approved assertions

Production module and exported types:
[`apps/server/src/jobs/registered-work-evidence.ts`](../apps/server/src/jobs/registered-work-evidence.ts).
Local and native assertions import it directly. The review-only facade/loader
and runner configuration were removed when the cases joined the default suite.

```ts
collectRegisteredWorkEvidence(config, signal, io?): Promise<RegisteredWorkEvidence>
// kind: 'registered-work-evidence'
// captured registration + ordered phase evidence + presence/correlation assessment
// updated memory + explicit collection errors/limitations
```

`collection: complete` means every planned observation was collected and the
ledger fit. It does not mean all work is registered, stopped, released or safe.
`stopReason` distinguishes early termination from individual reader failures.
Malformed configuration rejects before I/O; operational failures return an
incomplete evidence report so prior successful observations are not discarded.

**53 learner-approved local cases**, now in
[`tests/contracts/registered-work-evidence.test.ts`](../tests/contracts/registered-work-evidence.test.ts):

- Exact call order, multiple services, unrelated jobs, changing queues, idle
  queues with living processes/GPU rows, failed/replaced services and unresolved
  launch intents. Even a quiet window has no authorization flags.
- PID reuse, exact large start ticks, changed groups/sessions, zombie/stopped
  processes, transitive children, detached children across registry revisions,
  closing-census discoveries, leaderless group/session/parent hints, reused-parent
  ambiguity, precedence despite reverse row order, reachable cycles, retained
  discoveries after failure, wrong boot/native census schema failure and bounded-ledger overflow.
- Unknown/unrelated GPU rows, bracketed PID reuse, several historical identities
  at one PID, a vanished child with a remaining GPU row, and a failed closing scan.
- Captured inputs/callbacks/results, ten invalid-input variants, pre-abort,
  remaining-budget propagation, exact-deadline final completion, active abort,
  cleanup grace, native cleanup
  uncertainty, a never-settling callback/late completion, incompatible reader
  clocks and a backwards collector clock.

Fixtures are explicitly synthetic, use a fake monotonic clock and inject all
three readers. **No procfs read, subprocess, HTTP, provider, model or LAN call.**
Before approval, only typechecking and definition collection ran. After approval,
all 53 passed first implementation. No missing-module “red” result is claimed.
A meaningful supplemental regression is recorded below.

## Approved native scenario — two real windows

[`tests/evidence-native/registered-work.test.ts`](../tests/evidence-native/registered-work.test.ts)
uses the existing isolated, checksum-pinned Comfy **CPU-only** fixture on Dundee:

1. Capture its actual PID/start/boot/group/session. Read an idle live service
   through the composed collector **without injected reader I/O**. Verify both
   empty queue snapshots between independent raw `/queue` reads, exact service
   presence in both censuses, and every native NVIDIA row against an independent
   projection of the retained query stdout. Keep unrelated GPU rows.
2. Separately tear down only this owned fixture using its existing guarded
   lifecycle. Observe again with the same remembered identity. Its absent/reused
   PID is process evidence; failed queue reads must remain failures, **not empty
   queue data or a release verdict**. Preserve both reports and cleanup receipts.

This adds a real composition check, not more models or another generation.
Native GPU queries are read-only; personal Comfy is never an HTTP or signal
target. The proof must run in an audited finite transient user service, with
before/after personal-service observations and independent cleanup/source checks,
as in the preceding checkpoints. A scenario-wide SIGINT/SIGTERM latch spans
both windows: live operations also use the fixture signal, while the deliberate
post-exit window keeps the scenario signal. Thus deliberate close does not cancel
window two, but parent termination prevents further observation in either window.
No automatic retry if a non-atomic census fails because an unrelated listed
process exits; retain that failed attempt.

This does **not** natively induce PID reuse, escape/reparenting, MPS/container
translation, cleanup failure or allocation persistence. Those remain synthetic
here. No H3/YuE2 inference, GPU cancellation latency, model unloading, resource
release, held shared lease, FIFO dispatch or formal 12-case-suite completion is
claimed. Actual handoff integration and the remaining slice-1 gates follow.

## Focused draft review

Independent review found three gaps before implementation: scenario termination
did not span deliberate teardown; provenance assertions did not discriminate
reused parents, precedence and cycles; and asynchronous timeout tests did not
cover exact-deadline final completion. The native test now uses the existing
latched guard across both windows, and four additional local assertions cover
the missing cases. Earlier self-review added the actual census schema-error
code and a backwards collector-clock check. These are draft corrections, **not
reproduced production defects or executed regression passes**.
The focused reviewer rechecked these changes and found no remaining blocker;
that was static review only, not execution or learner approval.

## Implementation review — finalization deadline regression

The first implementation passed all 53 approved cases. Focused review then
reproduced a narrower deadline error: the collector checked time before building
and classifying its final observation list. Synthetic cost during that final
classification could reach the original deadline while still returning
`collection: complete` and an outdated final timestamp.

The permanent assertion **“the final data-sized collection classification must
also fit the original deadline”** failed against that implementation, then passed
after moving data-sized classification before the last deadline-validating check.
The existing closing-census deadline assertion tests an earlier boundary; both
are retained. The focused reviewer confirmed the repair and found no remaining
blocker. These are injected-clock tests, not a native timeout or GPU latency
measurement.

Final local verification: **54/54 collector cases**, **370/370 default cases**,
TypeScript checking and direct Node 24.1.0 import passed. Dundee's exact proof
snapshot also passed typechecking and **370/370 default cases** on pinned Node
24.22.0 after a fresh lockfile install. No test is hidden behind an expected
failure; the single-test red diagnostic filtered unrelated cases, while the
complete green runs execute all of them.

Retained ignored evidence: `.local-evidence/slice-1/registered-work/`, including
`first-run.txt`, `finalization-red.txt`, `finalization-green.txt`, `typecheck.txt`,
`contracts.txt`, `direct-node-import.json`, source hashes and Dundee preparation.

## Native attempt 1 — retained failure, not a completed proof

Exact proof/source directory on Dundee:
`/home/puzzleduck/.local/share/music-video-studio/proof-sources/registered-work.c7f47a21-2dae-49fe-852b-00b9856a11c8`

- Base commit: `b45c6d2d95011363c2074bf5a45b6b69f6aeb622` plus the captured changes.
- **103 source files**, archive SHA-256:
  `a795638abda81c3b542902290cb7279891ccc984825351726eb088a22a9da480`.
- Collector SHA-256:
  `a8f780e366e004feb3503850517555306ea32426d640512c23303d026c44c440`.
- Unit: `studio-registered-work-c7f47a21-2dae-49fe-852b-00b9856a11c8.service`.
  Outer bounds: 600 s runtime, 30 s stop, control-group cleanup, umask 0077.
- Preparation unit (`-prepare`) exited 0: **20.345 s**, 321.8 M peak memory,
  zero swap; fresh lockfile install, typechecking and 370 default tests passed.
- Native unit **exited 1**, one scenario failed: **18.717 s** wall time,
  697.3 M peak memory, zero swap. Both units were later inactive/not-found,
  with no running studio unit. The default `Result=success` property of a
  subsequently absent unit is **not** the recorded native execution result.

The live-service observation took **545.943 ms** and returned `incomplete`,
not a release claim:

| Observation | Actual result |
|---|---|
| Opening census | `PROC_CENSUS_IO`: `Could not read /proc/2163576/stat`. No successful partial census was substituted. |
| Both queue snapshots | Valid empty queues from the same owned service, matching independent raw before/after responses. |
| NVIDIA snapshot | Three successful native queries; personal GPU row retained without filtering. |
| Closing census | Successful scan of **345** processes, including the exact owned CPU service. |
| Registered service presence | `unavailable` before, `present` after. |
| Personal GPU correlation | `one-sided`, preserving the failed first scan rather than inventing identity continuity. |
| Post-exit window | **Not executed**: the live-window completeness assertion failed first. |

PID 2163576 was absent at the later audit. This is consistent with process churn
between listing and reading, but the collector fault did not retain the nested
native errno; **we cannot assert the original failure was definitely ENOENT**.
The strict reader behaved conservatively, as designed. No unreadable PID was
skipped, no failed observation was changed to empty, and no automatic retry or
quiet-host manipulation was used to obtain green evidence.

The fixture was separately cleaned up after the failed assertion:

- Directory: `comfyui-cancellation.4ec6093c-a334-4e93-96ec-2f234d2376d8`.
- Owned PID/group **2163378**, start ticks **86543706**, fresh port **45921**.
- SIGINT only, actual service exit **0**, identity-resolved cleanup. Independent
  postchecks found its PID, group and listener absent; query PIDs were absent too.
- Personal Comfy PID **1216557**, start ticks **41044381**, boot identity,
  listener on 8188 and before/after **234 MiB** compute observations were unchanged.

Evidence: `snapshot.json`, `snapshot-files.json`, `source.tar.gz`, command files,
`dundee-prepare.txt`, `native-run.txt`, recorded exit statuses, `before.json`,
`failed-after.json`, `native-failure-audit.txt`, unit postcheck/journal, and the
retained native directory under `.local-evidence/slice-1/registered-work/`.
The normal success audit was not relabelled as passed: `failure-audit.py` records
only this actual failed-window outcome and cleanup. The focused reviewer
independently corroborated source hashes, retained native data and these limits.

**Decision after attempt 1:** the learner said “proceed” to one fresh, separately
identified attempt with the strict census contract unchanged. Its result follows;
the first failed evidence remains intact.

## Native attempt 2 — live window passed; post-exit census failed

Executed once on 23 October 2026, with no production or test changes:

- Proof directory: `/home/puzzleduck/.local/share/music-video-studio/proof-sources/registered-work.a043956c-f25d-4dfc-b18f-9667e5de0367`.
- All **103 source hashes** and the archive match attempt 1 exactly. Local and
  remote post-run source checks agree; archive/collector hashes above are unchanged.
- Unit: `studio-registered-work-a043956c-f25d-4dfc-b18f-9667e5de0367.service`.
  Same 600 s runtime/30 s stop bounds, control-group cleanup and umask 0077.
- Fresh preparation exited 0: **19.898 s**, **314 M** peak, no swap; lockfile
  install, typechecking and **370/370** default cases passed. Local typechecking
  and all 370 cases also freshly passed.
- Native execution **exited 1**, one failed scenario: **18.389 s**, **688.8 M**
  peak, no swap. Journal confirms the failure. Both units were later inactive/
  not-found; no studio unit was running. Absent-unit `Result=success` is not the
  execution result.

| Observation | Live-service window | Post-exit window |
|---|---|---|
| Collection | Complete, **557.276 ms** | Incomplete, **412.326 ms** |
| Opening census | Successful, **344** processes | `PROC_CENSUS_IO`: `Could not read /proc/2348632/stat` |
| Closing census | Successful, **344** processes | Successful, **343** processes |
| Registered service presence | Present / present | Unavailable / not-observed |
| Queue observations | Both valid empty; independent raw brackets agree | Both `COMFY_IDENTITY` failures, no invented empty values |
| NVIDIA snapshot | Three successful native queries; all rows retained | Three successful native queries; all rows retained |
| Personal GPU correlation | Same-identity | One-sided |

All live-window assertions passed. The scenario failed at the post-exit census
assertion (native test line 121), **not** because of the expected dead-service
queue failures. Retained data confirms those queue failures even though the test
did not complete its remaining assertions. The ledger's `complete` field concerns
remembered identities, not overall collection success or resource release.

The missing-read PID was absent at later audit. As with attempt 1, the collector
fault lacks the original nested errno: this supports considering process churn,
but does **not** prove ENOENT, identify the process, or establish its ownership.
No skipped PID, weakened check, quiet-host manipulation or further retry occurred.

Cleanup and independent postchecks:

- Fixture directory: `comfyui-cancellation.736c4de1-d485-4510-8622-ff5d7f35b3f1`.
- Owned PID/group **2348409**, start ticks **88335128**, port **37619**.
- SIGINT only, actual exit **0**, identity-resolved receipt. Its PID, process
  group and listener were absent; all captured NVIDIA query PIDs were absent.
- Personal Comfy **1216557**, start ticks **41044381**, boot identity, port 8188
  listener and **234 MiB** compute observation were unchanged.

Separate ignored evidence:
`.local-evidence/slice-1/registered-work/attempt-2/`, including `snapshot.json`,
`snapshot-files.json`, unchanged `source.tar.gz`, `local-source-recheck.json`,
local/Dundee test logs, both commands and exit statuses, `before.json`,
`failed-after.json`, `native-failure-audit.txt`, `unit-postcheck.txt`,
`unit-journal.txt` and the extracted `native-evidence/` bundle. The separate
`observed-failure-audit.py` records the actual failed outcome without altering
the original success audit. Focused independent review corroborated all 103
hashes, both windows, failed overall result and cleanup, with no discrepancy.

**Decision after attempt 2:** the learner authorised preparing the
[diagnostic test batch](census-error-diagnostics-test-review.md), then approved its
27 cases with “looks good”. The repaired collector preserves immediate native
cause fields; **27/27 diagnostic and 397/397 default tests plus typechecking pass
locally**. Focused review found no issue. No third native run was authorised.

The enhancement preserves future filesystem error details for diagnosis; it
cannot reconstruct the missing historical errno. No retry, skipped unreadable
process or promotion of incomplete evidence to a release claim was added.
The implementation remains uncommitted; slice 1/G4, real GPU cancellation/handoff
and the formal 12 live cases remain open.

## Native attempt 3 — complete scenario passed after diagnostic repair

The learner accepted the diagnostic repair and explicitly approved one fresh
attempt with “yes”. Executed once on 23 October 2026, with the strict native
assertions unchanged and an exclusive launch marker to prevent accidental reuse.

- Proof directory: `/home/puzzleduck/.local/share/music-video-studio/proof-sources/registered-work.6004ece3-71c5-4ca9-ba89-0cfdccbbe626`.
- **104 source files**: the only change among attempt 2's 103 files is the approved
  collector diagnostic repair; the added file is the 27-case diagnostic test.
- Archive SHA-256: `4dafb8e765da424026d551a133bdd1942b187e51289200fb4a777a67bb790c5c`.
- Collector SHA-256: `4849316e960b1c8ebaaccbb8a8285fbf128e4a446b36648ef42f0904b3fa722c`.
- Success audit unchanged: `bd7cb780a67dd2103cded283999f1aab754600b226f4ed70b6ad124c9e1666b1`.
- Unit: `studio-registered-work-6004ece3-71c5-4ca9-ba89-0cfdccbbe626.service`.
  Same 600 s runtime/30 s stop bounds, control-group cleanup and umask 0077.
- Fresh preparation **exited 0**, **20.693 s**, **316 M** peak, no swap. Pinned
  Node 24.22.0, lockfile install, typechecking and **397/397 default cases** passed.
  Local Node 24.1.0 also freshly passed typechecking and all 397 cases.
- Native scenario **passed 1/1, exit 0**, **18.580 s**, **689.2 M** peak, no swap.
  Unit journal agrees; later inactive/not-found status is not used as a substitute
  for the captured execution result. No studio unit was running after cleanup.

| Observation | Live-service window | Post-exit window |
|---|---|---|
| Collection | Complete, **544.513 ms** | Intentionally incomplete, **487.103 ms** |
| Census brackets | Successful, **343 / 343** processes | Successful, **342 / 342** processes |
| Registered service | Present / present | Not-observed / not-observed |
| Queue observations | Both valid empty, matching independent raw brackets | Both `COMFY_IDENTITY` failures, settled, no invented empty queues |
| NVIDIA observations | Three successful queries; all rows retained | Three successful queries; all rows retained |
| Personal GPU correlation | Same-identity | Same-identity |

The complete post-exit scenario passes **because** queue failure is not presented
as empty-queue evidence. No collector result authorises release or another job.
This does not weaken the original all-or-nothing census contract: all four scans
actually succeeded on this attempt.

Both post-exit queue errors preserve native cause fields:
`code: ENOENT`, `errno: -2`, `syscall: open`, `path: /proc/2366077/stat`, plus
the native error name/message. These originate from verifying our deliberately
exited service, not from a listed PID disappearing during census. This is native
evidence of cause propagation through the owned transport. The census-specific
error path remains covered synthetically; neither historical errno is recovered
or inferred from this separate failure.

Cleanup and preservation:

- Fixture: `comfyui-cancellation.95ca9e97-847b-43cd-af2a-4b91fa30a44d`.
- Owned PID/group **2366077**, start ticks **88495773**, fresh port **32863**.
- SIGINT only, actual service exit **0**, identity-resolved cleanup. Independent
  postchecks found its PID, group, listener and all six query PIDs absent.
- Personal Comfy **1216557**, start ticks **41044381**, boot identity, port 8188
  listener and before/after **234 MiB** compute listing were unchanged.
- The unchanged success audit passed. All 104 source hashes and the archive
  were rechecked; original native reports, outputs and logs are preserved.
- Focused independent review corroborated the hashes, both windows, native cause
  fields, cleanup and limits, with no discrepancy; ready for learner acceptance
  of this collector checkpoint, not completion of G4.

Separate ignored evidence:
`.local-evidence/slice-1/registered-work/attempt-3/`, including source snapshot/
archive, preparation/native commands and exit statuses, `before.json`, `after.json`,
`native-success-audit.txt`, `local-source-recheck.json`, unit journal/postcheck,
and the extracted `native-evidence/` bundle. The first two attempt directories
remain unchanged; no failed result was overwritten or reclassified.

**Learner check completed:** the learner accepted the evidence with “looks good,
go for it”, approving the collector checkpoint commit and preparation of the next
integration tests before implementation. The retained proof distinguishes live
empty queues from failed queue reads after service exit.
Shared GPU leasing/release decisions, model cancellation/handoff and the formal
12 live cases remain outstanding. No fourth native attempt is authorised.

## Review checklist and safe commands

- [x] Record request, assumptions, evidence boundaries and unresolved integration.
- [x] Draft executable local assertions and opt-in native scenario.
- [x] Typecheck and collect definitions without running hooks or native work.
- [x] Learner approved this test batch with “yep”.
- [x] Implement the collector; run local assertions and review defects.
- [x] Execute and audit the first exact-source native attempt; retain its failure.
- [x] Execute the one separately approved second attempt; retain and audit its failure.
- [x] Complete the native live-service and post-exit scenario without waiving uncertainty: attempt 3 passed.
- [x] Present results for learner feedback; accepted with “looks good, go for it”.
- [x] Save the accepted collector checkpoint with `Collect registered-work evidence with native diagnostics`.

```sh
npm run typecheck
npm run test:list
node node_modules/vitest/vitest.mjs list --config vitest.evidence-native.config.ts --no-staticParse --json
```

Collection does not execute test bodies or native hooks. The 54 collector cases
are now included in `npm test`; the native scenario remains a separate explicit
run requiring `STUDIO_COMPOSED_EVIDENCE=1`, `STUDIO_CPU_COMFY=1`, the verified
`STUDIO_DATA_ROOT` and independently checked `STUDIO_GPU_UUIDS`. Those flags alone
are not a substitute for the outer service/snapshot audit.
