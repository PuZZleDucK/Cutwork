---
doc: test-review
status: approved
---

# Registered-work reconciliation — assessment test review

The learner approved this contract and its 45 cases with “looks good” on
23 October 2026. Implementation and synthetic verification are now authorised;
native execution remains a separate approval boundary.

23 October 2026. The learner accepted the composed collector checkpoint with
“looks good, go for it”. It is committed as **`3298874` — Collect registered-work
evidence with native diagnostics** after rechecking typechecking and **397/397**
default cases. The one approved native scenario passed; its two earlier failures
remain preserved. No further native execution is authorised.

## Scratchpad — next useful integration

We now collect process, queue and GPU facts together. We still cannot explain
which registered work needs attention without manually interpreting the report.
The existing `handoffGpu()` accepts caller-provided `ReleaseObservation` booleans;
feeding it a quiet-looking report would bypass the unresolved ownership, visibility
and real shared-lease requirements.

The next small integration consumes the **actual collector report** plus captured
registration/memory and independent owned-process exit evidence. It produces an
explanation for reconciliation, not a new observer, scheduler or release token.
Refs: `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`,
`spec.md > Verification and Build Gates` (G4), and the approved collector review's
presence/ownership and attribution limitations. No scope or agent-authority change.

## Approved contract

`assessRegisteredWork(input)` is synchronous and performs **no I/O**. Inputs:

- The collector's `RegisteredWorkEvidence`.
- The independently captured expected `Registration` and input `ProcessMemory`.
  Compare the full registration, not just its revision number. A missing historical
  identity or changed discovery provenance cannot disappear from consideration.
- Zero or more **owned-child exit receipts**: receipt/attempt/registration IDs,
  exact boot/PID/start/group owner, actual exit code or termination signal, the
  intended window ID and monotonic time at which exit was observed.

Exit receipts are trusted internal launcher evidence, **not user/agent assertions**.
The producer must have observed its registered ChildProcess exit, not merely sent
a signal or failed to find a PID. The receipt and report belong to the same
in-memory monotonic-clock run; this is not an importer for persisted reports from
another server lifetime. The existing owned CPU fixture already records owner,
exitCode/signalCode and identity-resolved cleanup; the later native test can map
that receipt after awaiting `close()`, timestamp it, then collect the bound window.
That mapping must not use the two cleanup booleans alone as proof.

Output is window-bound and deliberately incompatible with `ReleaseObservation`:

- `activity-observed`: a registered/associated process, queue item or historically
  matching GPU PID was seen. This includes zombies/stopped tasks; it is not a
  claim that a process is making progress or that a discovered candidate is owned.
- `indeterminate`: no positive matching finding, but incomplete/conflicting or
  insufficiently associated observations remain.
- `no-matching-activity-observed`: no matches within this recorded window and
  captured identities/direct-PID view. **Not** global quiescence, resources released,
  current freshness, ownership certification or permission to dispatch.

Keep positive findings **and** unresolved conditions. Positive evidence takes
precedence in the summary when both exist, except a mismatched report binding
cannot be attributed to the expected attempt: return `indeterminate` with no
attributed findings or retired services, even if the foreign report is busy.
Include process identity/provenance,
queue phase or GPU-row references, copied process/GPU summaries and all original
coverage limitations plus `not-dispatch-authorization`. No `ownerKnown`,
`nativeQueueEmpty`, `gpuClear`, `resourcesReleased`, `maySubmit` or dispatch callback.

### Missing service is not a proved exit

- Failed queue observations always remain failures in the source report.
- Only a matching, preceding native exit receipt **and** successful census
  brackets showing the exact service absent permit a `service-retired` summary.
  Its queue is labelled `unavailable-after-confirmed-exit`, never empty.
  Preceding means `observedAtMs <= startedAtMs`; a receipt observed during the
  window is too late, not just one observed after its end.
- No receipt, wrong owner/attempt/window, missing terminal outcome, late receipt,
  PID reuse, conflicting live service/queue evidence, pending observation or
  unresolved cleanup keeps that service unresolved.
- A service exit does not resolve its remembered descendants or lingering GPU
  entries. They are assessed independently.
- No equality check against `collection === complete` substitutes for reading the
  observations: the verified post-exit report intentionally says incomplete due
  to the expected unavailable queue.

### Association and uncertainty rules

- Exact remembered identities remain visible through reparenting, group changes,
  zombies and stopped states. Discovery hints are not promoted into ownership.
  A present non-registration candidate adds an unresolved association finding.
- Compare every GPU PID against **all historical identities**. A stable new
  process sharing an old PID does not explain away an allocation. Preserve all
  GPU rows, including unmatched rows, without declaring those rows unrelated.
- Failed/missing census or GPU observations, aborted/stopped collection,
  incomplete memory, unresolved launches, pending readers, failed query cleanup,
  one-sided/unseen GPU correlations and PID reuse prevent a quiet summary.
- An unmatched GPU row seen under a stable identity in both scans can coexist
  with `no-matching-activity-observed`, but remains explicitly unverified in the
  output. This does not solve MPS, namespace visibility or allocation attribution.
- No polling, retry, kill, unload, durable-state mutation, lease acquisition or
  connection to the old boolean handoff function in this batch. After this thin
  reconciliation result, proceed toward the **actual shared lease/handoff path**;
  do not expand it into a general rules framework.

## Executable contract and verification boundary

`tests/contracts/registered-work-assessment.test.ts` builds reports through the
production collector using synthetic readers, then calls the production assessor.
The independent test-only contract declares the approved signature; its loader
now statically imports the production assessor so TypeScript checks compatibility.
It contains no assessment logic. Before approval, the draft was collected and
typechecked only; a missing module was not claimed as behavioural red evidence.

After implementation the cases moved from `tests/review/` into the default
contract suite, and the temporary `vitest.review.config.ts` was removed.
The original 45 fixture/assertion bodies were verified unchanged against the
approved snapshot. Existing 397 default cases remain unchanged; none is skipped.

### The 45 approved cases

Numbers refer to collection order, including expanded parameterised cases.

| Cases | What the assertions protect |
| --- | --- |
| 1–6 | Confirmed exit versus mere absence; idle/live and busy services; a second service cannot disappear behind a retired first service. |
| 7–11 | Zombies, stopped tasks, changed parent/group/session, surviving children and weak discovery hints remain visible without ownership promotion. |
| 12–20 | Failed censuses/GPU reads, cleanup uncertainty, pending readers, unresolved launches, memory overflow and lost identity/provenance cannot become a quiet result. |
| 21–24 | Full expected registration binding; foreign positive evidence cannot be attributed to the expected attempt. |
| 25–29 | Historical GPU PID matches, PID reuse, one-sided and unseen GPU rows retain their ambiguity. |
| 30–40 | Exact exit receipt binding, terminal outcomes and ordering; an exit inside the window is too late; conflicting live/queue observations prevent retirement. |
| 41–45 | Missing derived process/queue/GPU entries, pending queue work and later input mutation cannot silently erase or rewrite the evidence. |

Every assessment also checks unchanged inputs, window/registration metadata,
preserved limitations and absence of release/dispatch fields. The final case
checks that retained output summaries are detached from later input mutation.

### Pre-implementation verification and focused review (historical)

- `npm run typecheck` — passed.
- `node node_modules/vitest/vitest.mjs list --config vitest.review.config.ts --no-staticParse --json`
  — **45 definitions collected**, no test bodies or assessor import executed.
- The unchanged default suite passed **397/397** this turn. No default test was
  moved, skipped or weakened to accommodate the draft.
- Independent static review identified the nonzero-window ordering and foreign
  busy-report precedence gaps. Both assertions were added; the focused recheck
  found no remaining blocker. This is review evidence, not behavioural execution.
- At that review checkpoint production and accepted test source remained
  unchanged from `3298874`; the assessor module did not yet exist.
- Local transcripts, collection list and source hashes are recorded under
  `.local-evidence/slice-1/registered-work-assessment-review/` (ignored by Git).

### Implementation checkpoint — 23 October 2026

Implemented `apps/server/src/jobs/registered-work-assessment.ts`: a synchronous
function with no I/O, timers, native controls or dispatcher connection. It checks
registration/history binding, compares derived summaries with raw observations,
retains historical PID associations and copies the resulting explanation.
Malformed/missing derived rows cannot erase raw observations or prior identities.
It remains a trusted in-memory integration, not an arbitrary JSON importer.

The initial implementation passed all 45 approved cases. Self-review and an
independent bounded review then found two gaps; both were reproduced as failing
assertions before repair. A follow-up review caught an overly strict repair:

| Added case | Regression protected |
| --- | --- |
| 46 | Empty successful queues plus absence in both process brackets cannot become quiet merely because there is no exit receipt. |
| 47–48 | A report inconsistency in either service order prevents retired-service summaries; an earlier service cannot evade a later inconsistency. |
| 49 | A service may answer queues then exit before the closing census; the non-atomic window must not be misclassified as inconsistent or invalidate another service's legitimate retirement. |

Final verification:

- `npm run typecheck` — passed.
- `npm test -- tests/contracts/registered-work-assessment.test.ts` — **49/49**.
- `npm test` — **446/446**, including the unchanged prior 397 and these 49.
- Independent focused recheck confirmed all identified defects closed, with no
  remaining blocker in that review. No claim of exhaustive correctness.
- The raw collector, native readers and accepted native scenario are unchanged.
  No native/model run, service stop, GPU handoff or provider restriction was added.
- Red/green transcripts, approved test snapshots and final source hashes live in
  `.local-evidence/slice-1/registered-work-assessment-implementation/` (ignored).

**Learner check completed:** the learner accepted this implementation checkpoint
with “great, proceed”, authorising its commit and preparation of the native
verification step. This accepts the presented evidence, not a claim that the
learner separately ran commands. The code explains the captured window, not
resource release. Native execution still requires separate approval.

The planned follow-on native check is the existing live CPU service → awaited
owned teardown → post-exit observation sequence, adding assessment of each actual
report with the actual exit receipt. Live idle must not look retired; post-exit
must retain failed queues and the unrelated-but-unverified personal GPU row.
Exact-source checks, owned cleanup, independent audit and explicit separate run
approval remain required. No model inference or GPU stop-latency claim is added.

## Checklist

- [x] Record commit, next integration purpose and ambiguity around absent services.
- [x] Draft executable cases and typecheck/collect them without implementation.
- [x] Focused review of semantics and assertions; address findings.
- [x] Learner approves the contract and tests before implementation.
- [x] Implement, run synthetic integration checks and review.
- [x] Learner checks the implementation checkpoint before commit.
- [ ] Separately approve and execute the native assessment extension.

The accepted product/spec boundary is unchanged: this **descriptive, window-bound
reconciliation result** is a bridge before real shared-lease integration, not
permission to run the next generator. Slice 1/G4 remain open.
