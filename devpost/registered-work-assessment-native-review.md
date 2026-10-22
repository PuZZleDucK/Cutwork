---
doc: test-review
status: approved
---

# Native registered-work assessment — one-run review

The learner explicitly replied **“approved”**, authorising **one bounded native
attempt** under this plan, with fresh preflight/snapshot verification and no
automatic retry. This approval does not extend to model inference or GPU handoff.

23 October 2026. The learner accepted the synthetic assessment checkpoint with
“great, proceed”. It is committed as **`0356682` — Assess registered-work evidence
without authorizing dispatch**, after fresh typechecking and **446/446** default
tests. That acceptance authorises preparing this check, **not running it**.

## Scratchpad and purpose

We have proven the decision rules with synthetic reader inputs. The next question
is whether actual collector reports and the existing owned-process exit receipt
fit that contract without converting failed observations into invented success.

Extend the **same single native scenario**, not a second fixture or observer.
Use the existing live CPU-only Comfy service → owned teardown → post-exit
collection sequence. Add assessment calls and a negative control using the same
captured report. The production collector/assessor, native readers and CPU fixture
remain unchanged from the accepted checkpoint.

Refs: `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`,
`spec.md > Verification and Build Gates` (G4), and
[the approved assessment contract](registered-work-assessment-test-review.md).
No scope, provider capability or agent-authority change.

## Approved assertions

One scenario in `tests/evidence-native/registered-work.test.ts` retains the
previous native assertions and adds:

| Stage | Required evidence and result |
| --- | --- |
| Live idle service | Actual owned process appears in both successful censuses; both queues are empty; assessment is `activity-observed` with both registered-process findings and no retired service. |
| Independently recorded exit | Await the existing fixture's `close()`, then read its `service-receipt.json`. Verify captured owner, command, source revision, terminal state and cleanup identity. Require exactly one actual child exit code or signal—not just cleanup booleans or a signal-sent list. |
| Receipt ordering | Bind that receipt to this attempt/registration and a newly selected post-exit window. Timestamp receipt observation in this Vitest worker's monotonic clock before starting collection. This timestamp is not the exact native exit time. |
| Post-exit window | Successful census/GPU reads and settled failed service queues remain intact. The nominal result is `no-matching-activity-observed`, no unresolved conditions, and one retired service labelled `unavailable-after-confirmed-exit`. This is not global quiescence or GPU release. |
| Withheld-receipt control | Reassess **the same** native post-exit report with `exits: []`, without another native query. It must be `indeterminate`, include `service-exit-unverified`, and contain no retired service. |
| Every assessment | Original inputs unchanged; bound metadata preserved; all GPU rows and coverage limitations retained; `not-dispatch-authorization` present; no release/dispatch fields. |

**Strict nominal pass, not filtering:** PID reuse, a surviving remembered process,
ambiguous GPU correlation, incomplete census or query/cleanup failure can prevent
this scenario passing. Preserve the actual outcome and stop. Do not skip a PID,
delete an unmatched GPU row, quiet unrelated processes, change expectations or
retry automatically to obtain green evidence. This run need not pass merely
because fixture teardown succeeded.

**Non-atomic observations:** queue reads and census brackets are sequential;
within-window exits are not assumed simultaneous with either queue read. The
existing synthetic regression continues to cover that transition. This native
scenario deliberately establishes exit *before* the second window.

## Receipt provenance and retained artifacts

The existing fixture records its owned `ChildProcess.exitCode`/`signalCode`, then
saves the receipt before `close()` resolves. Its code and cleanup policy do not
change. The test maps those actual fields into the assessment input and records
the source file SHA-256; it does not import an old timestamp from another process
or server lifetime. This is trusted test-fixture provenance, not cryptographic
authentication of arbitrary user files.

Inside the new, private fixture directory retain the existing service log,
startup stats, service receipt and composed native reports, plus:

- `assessment-live.json`: exact input and live-service assessment.
- `assessment-exit-receipt.json`: original decoded fixture receipt, source file
  hash and the mapped, window-bound exit receipt.
- `assessment-after-exit.json`: exact input and confirmed-exit assessment.
- `assessment-after-exit-no-receipt.json`: identical capture with the receipt
  withheld and its assessment.

Write reports before asserting their nominal outcome. If an earlier collector,
identity or cleanup prerequisite fails, later artifacts may not exist; that is
an incomplete/failed attempt, not an omitted pass. Keep all files private under
the ignored evidence/runtime directories.

## Approved execution envelope

1. **Fresh preflight on Dundee.** Verify host, Node 24 runtime, pinned Comfy source
   and isolated Python environment, disk headroom and GPU UUID inventory. Check
   there is no conflicting owned studio run. Independently capture the personal
   Comfy identity/listener and current NVIDIA rows; do not reuse old PIDs or assume
   the last recorded host state is current. Do not stop unrelated work.
2. **Unique exact-source snapshot.** Create a new proof directory and manifest,
   recording `0356682` plus the reviewed native-test diff and hashes of every
   included source/config/fixture. Hash the archive and verify it after transfer.
   Never overwrite any earlier collector attempt or its logs. Use the pinned
   Node runtime and lockfile install; run typechecking and all **446** defaults in
   that snapshot before native launch. A mismatch or failure stops preparation.
3. **One bounded native run.** Use a unique user service with the existing
   `RuntimeMaxSec=600s`, `TimeoutStopSec=30s`, `KillMode=control-group`, umask 0077,
   and an exclusive launch marker. The existing Vitest config remains single
   worker, no parallel files, `retry: 0`, 240 s test/hook bounds. Record the exact
   command and exit status. No automatic second run.
4. **Explicit gates.** Require `STUDIO_CPU_COMFY=1`,
   `STUDIO_COMPOSED_EVIDENCE=1` **and the new `STUDIO_ASSESSMENT_EVIDENCE=1`**,
   the verified `STUDIO_DATA_ROOT` and freshly checked `STUDIO_GPU_UUIDS`.
   An old collector command therefore cannot silently run the new assertions.
   Environment flags alone do not replace the preflight/snapshot/outer-run audit.
5. **Unchanged owned teardown.** The fixture launches `--cpu` on a fresh loopback
   port other than 8188, with a private base and no model generation. Its existing
   identity-checked SIGINT → SIGTERM → SIGKILL escalation applies only to the owned
   group if needed. The scenario-wide termination latch covers both windows.
   An ownership mismatch or unresolved cleanup stops the attempt; do not guess.
6. **Independent outcome audit.** Recheck snapshot hashes; actual test/unit exit
   status and journal; saved source receipt hash/identity/outcome; ordering of
   receipt observation and post-exit capture; exact inputs and all three results;
   failed queue observations; retained raw NVIDIA rows. Check owned PID/group,
   listener and query children are gone, and compare the personal service's
   identity/listener and GPU observations with the fresh baseline. Do not treat
   an inactive or garbage-collected systemd unit's default status as proof of
   successful execution. Report any ambient changes rather than altering them.

The two windows use real `/proc`, owned HTTP and **read-only NVIDIA queries**.
No H3/YuE2 inference, GPU workload interruption, model unloading, release token,
shared lease, FIFO dispatch or formal model-cancellation suite is exercised.
This native CPU observation proof cannot close those G4 requirements.

## Safe preparation checks (no native execution)

```sh
npm run typecheck
node node_modules/vitest/vitest.mjs list --config vitest.evidence-native.config.ts --no-staticParse --json
```

At the draft checkpoint both passed: **one scenario collected**, no hooks or test
body executed. The accepted **446/446** default suite also passed freshly before
its commit. No SSH, fixture launch, native GPU query or service control was
performed before run approval.

Independent static review found no blocker: exit provenance/order, the
same-capture negative control, retained native assertions/cleanup and explicit
execution gates match the stated boundary. This is not native execution proof.
Local collection/typecheck transcripts and source hashes are retained under
`.local-evidence/slice-1/registered-work-assessment-native-review/` (ignored).

## Approved native attempt 1 — passed, 23 October 2026

Executed exactly once after the learner replied “approved”. No automatic retry,
test weakening, filtered census or extra generation occurred.

### Fresh preparation and source provenance

- The short hostname `dundee` did not resolve; no command ran there. The documented
  `dundee.local` resolved and was independently confirmed as Dundee. This was a
  connection lookup correction, not a failed/retried native test.
- Verified Ubuntu **26.04.1 LTS**, RTX **4060 Ti / 16380 MiB**, about **193 GiB**
  free, pinned **Node 24.22.0**, private product runtime, isolated Python and the
  pinned Comfy revision/critical source hashes. No conflicting studio unit ran.
- Unique proof directory:
  `/home/puzzleduck/.local/share/music-video-studio/proof-sources/registered-work-assessment.f46e77e6-0c9f-492b-a8e5-c84c01c65744`.
- Base commit `0356682`, plus the approved native-test extension. **108** hashed
  source/config/test files (including the tests README) matched after transfer
  and again after execution. No production/fixture implementation changed.
- Source archive SHA-256:
  `1b0b770a4f202cf5ae42c7f043ecd848df69e93e0ea41277c469fe5122a5e009`.
- Native test SHA-256:
  `de7e7058c625cee45fe0bf3dfa21850d5d48f242d928c4ea7c015b75d1a8e544`.
- Assessor SHA-256:
  `594bdab9ac2a57e930878bc3163155811a6651f40f87c8ea5f8bf3d8c1835874`.
- Fresh local checks: typechecking and **446/446**. Exact-source Dundee preparation:
  lockfile installation, typechecking and **446/446**, exit 0, **20.866 s** wall
  time, **326.3 M** peak memory, no swap.

Independent review identified a gap in the initial audit: agreement between two
derived summaries is not independent confirmation of the nominal quiet result.
A separately hashed `nominal-audit.py` was added **before native launch**, without
replacing the initial archive/audit. It independently requires all remembered
PIDs absent without reuse in both raw censuses, preserves earlier identity
history, and derives stable non-matching GPU correlations from raw census rows
and NVIDIA stdout. Focused review confirmed that correction before launch.

### Actual outcome

The bounded user unit was
`studio-registered-work-assessment-f46e77e6-0c9f-492b-a8e5-c84c01c65744.service`.
It passed **1/1 native scenario**, exit **0**, **19.201 s** wall time,
**692.1 M** peak memory, **0 swap**. The captured launch result and journal agree;
later inactive/not-found status is not substituted for the execution result.

| Evidence | Live service | After confirmed exit | Same report, receipt withheld |
| --- | --- | --- | --- |
| Assessment | `activity-observed` | `no-matching-activity-observed` | `indeterminate` |
| Findings | Two registered-process observations | None | None |
| Retired services | None | One, `unavailable-after-confirmed-exit` | None |
| Unresolved conditions | None | None | `service-exit-unverified` |
| Service queues | Both valid empty | Both settled failures | Same failures, unchanged |
| Raw GPU rows retained | One | One | Same row, no new query |

Live census counts were **344 / 344**, post-exit **343 / 343**. The two windows
took **573.436 ms** and **445.022 ms**. The collector's post-exit result correctly
remained `incomplete` because the dead-service queue reads failed; it was not
rewritten into a complete/empty-queue report. Both failures retained native
`COMFY_IDENTITY` → `ENOENT`, errno **-2**, opening `/proc/2402977/stat`.

The native service receipt recorded actual exit **0**, signal **null**. Its source
hash was verified against the saved file. This worker observed that receipt at
monotonic **18249.405422 ms**, before the post-exit window's **18250.312766 ms**
start. The withheld-receipt control used the exact same report and prior memory;
only its `exits` array changed.

### Cleanup and independent checks

- Fixture directory: `comfyui-cancellation.e1d2124f-14f5-42d1-a5ae-ad217e295de0`.
- Owned PID/group **2402977**, start ticks **88840108**, fresh port **35285**.
- **SIGINT only**, exit 0, identity-resolved cleanup. Independent postchecks found
  the owned PID/group/listener and all six NVIDIA query PIDs absent.
- Personal Comfy PID **1216557**, start ticks **41044381**, boot identity and
  port **8188** listener were unchanged. Before/after compute listing remained
  **234 MiB** for that process. Its row was retained, never declared owned by the
  attempt or removed from the assessment.
- Both the original and supplemental independent audits passed. The supplement
  established one remembered identity absent without reuse and one raw GPU row
  stable without any historical remembered-PID match. No studio unit remained
  running after the attempt.
- Native evidence archive SHA-256:
  `ee1e30c086effe185180d8d98918043f7cfa50cd3e9249f38836573e935d2ee0`.
- Supplemental audit SHA-256:
  `d2e0eb1d3af2cec91367c4a549bec63bda45f321d0230faa6bdca952c8120106`.

Evidence is retained separately under
`.local-evidence/slice-1/registered-work-assessment/attempt-1/`: source manifest/
archive and diff, preparation/native commands and exit statuses, before/after
observations, both audits and their hashes, unit journal/postcheck, original
native artifacts and local source rechecks. Earlier collector attempts remain
untouched. The independent reviewer rehashed all 108 source files and all 12
archived evidence files, recomputed raw census/GPU conditions, and corroborated
receipt provenance/order, the negative control, cleanup and the recorded outcome
without discrepancies. That review used local evidence only. Learner acceptance
of this native checkpoint is still pending.

**Boundary unchanged:** this proves the native CPU-service observation/assessment
composition and receipt dependence. It does **not** prove H3/YuE2 interruption,
GPU memory release, a held shared lease or dispatch safety. Slice 1/G4 remain open.
No second native attempt is authorised.

## Checklist

- [x] Commit the accepted implementation and preserve privacy boundaries.
- [x] Draft the native assertions, provenance mapping and one-run envelope.
- [x] Typecheck and collect only; do not execute the native test.
- [x] Focused independent review of assertions and execution boundary.
- [x] Learner approves this test/run plan, including one bounded native attempt.
- [x] Fresh exact-source preparation and native execution on Dundee.
- [x] Independent evidence/cleanup checks, including raw-record nominal audit.
- [x] Independent reviewer corroborates the retained outcome evidence.
- [x] Learner reviews the actual outcome before the native checkpoint commit — accepted with “great, looks good”, then switched to fast mode.

**Next decision:** learner acceptance of the result, then commit this native
checkpoint and prepare shared GPU lease/handoff tests. Continue toward the actual shared GPU
lease/handoff integration rather than adding another general observer framework.

## Acceptance and mode change

The learner accepted this result and requested fast mode with standing approval
for routine in-scope work on 23 October 2026. No further native assessment replay
is needed. Continue to actual shared GPU lease/handoff work, preserving the
evidence boundaries and stopping for genuine issues rather than routine approval.
