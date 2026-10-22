---
doc: test-review
status: approved
---

# Native cancellation and GPU handoff — first implementation test batch

22 October 2026. **Approved by the learner: “looks good, go for it.”**

The learner accepted the working analysis result with “looks good, move forward.”
That checkpoint is committed as **`b064372` — Verify isolated audio analysis on
Dundee**. Slice 1 remains incomplete. This is the next bounded part of its
existing C4/G4 cancellation and resource-release work, not a new product feature.

## What we have, and what is missing

- The existing 16 ownership/handoff contract cases test **pure decisions**. They
  do not send cancellation requests, observe workers or hold an actual GPU lease.
- The H3 runner already owns a temporary Comfy process and has real Linux
  process-group cleanup, including a child outliving its leader. Its five
  ownership diagnostics exercise local child processes, not model interruption.
- YuE2 records process identity and handles signals, but its native stop latency
  and complete resource release after cancellation have not been measured.
- The formal 12-case live suite already requires queued/running cancellation for
  both tools and music → video → music handoff. Its implementation binding is
  still absent. Earlier successful normal exits do not satisfy these gates.

The next TypeScript component turns observed state into bounded asynchronous
actions. It will use native observers/transport through explicit interfaces,
allowing deterministic tests before another GPU run. Native Python tools remain
in their existing isolated environments; the application stack is unchanged.

## Source discovery: use the pinned job-specific cancellation route

Our installed Comfy pin is `f5c611e3849ff7219dfb7d7b251092ab8a9b51dc`.
It exposes **`POST /api/jobs/{job_id}/cancel`** for a single queued/running job.
Its running-job path rechecks the job ID and signals under the queue mutex;
its queued path handles a job starting between observation and deletion.
This is preferable to composing separate older `/queue` and `/interrupt` calls.

The response's `cancelled` boolean means a cancellation action was dispatched,
**not that the native job has finished or CUDA memory has been released**.
Unknown/already-terminal IDs are also not distinguishable from that boolean
alone. Observe the named job and service identity before/after the request.
Never use global interrupt, queue clearing, batch cancellation or global free
as a substitute for a known job ID.

Primary source checked against local/installed source identity:
[pinned server routes](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/server.py#L1033-L1076),
[pinned cancellation classification](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/comfy_execution/jobs.py#L537-L582),
[pinned atomic interrupt](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/execution.py#L1377-L1394).
This is source evidence. The actual endpoint still needs an owned-service test.

## Three separate facts

1. **Request accepted:** the native API may have received our request.
2. **Native job stopped:** the captured job is no longer executing/queued, with
   terminal evidence where it was executing. A different service at the same
   address cannot supply that evidence.
3. **Resources released:** registered owned processes/descendants have stopped,
   no ownership is unresolved, the relevant native queue is empty and a
   successful GPU observation shows no registered owned allocation.

Only the third permits handing the lane to the next generator. Personal Comfy
or another unrelated GPU application may still exist; the machine does not need
to reach zero GPU usage. A failed GPU query is **unknown**, not an empty list.

The proposed native cancellation primitive deliberately returns `native-stopped`,
not the user-facing `cancelled` state. The existing application decision still
requires resource release and preserves success if success was already committed.
Likewise a late result does not authorize automatic placement after cancellation.

## Original approved assertions: 26 TypeScript cases

File, now promoted into the default suite:
[`tests/contracts/native-control.test.ts`](../tests/contracts/native-control.test.ts).
Implementation: [`apps/server/src/jobs/native-control.ts`](../apps/server/src/jobs/native-control.ts), exporting
`cancelComfyJob` and `handoffGpu`. The test interfaces are a thin wiring contract,
not a fake implementation of those functions.

### Seventeen cancellation cases

- Queued cancellation sends one request to the **exact job-specific path**;
  observations of another queued job survive. No resource-release claim follows.
- A positive acknowledgement while still running keeps observation active.
- A negative acknowledgement while still running cannot prove stopping. A
  separate case establishes stopping from subsequent terminal evidence despite
  that negative acknowledgement; neither case invents a successful cancellation.
- A queued-to-running transition keeps the same targeted route, never falling
  back to an unqualified interrupt.
- Already-terminal work needs no cancellation POST; it is not relabelled as a
  successful cancellation.
- Changed **PID**, **process group**, **start identity** or **boot identity** each
  prevents the request — four separate cases.
- Unknown job/missing owner is not a successful stop.
- A service replacement after acknowledgement invalidates its stop evidence.
- A POST transport timeout is recorded; no automatic second POST occurs.
  Later native observations may establish stopping without inventing an ACK.
- Persistent running work reaches the original deadline without a false stop
  or premature abandonment while observations continue to succeed.
- A response arriving after the original deadline cannot establish timely stop.
- A never-resolving observation is aborted and the controller returns uncertainty,
  rather than awaiting a promise indefinitely.
- A never-resolving cancellation POST is likewise aborted at the original
  deadline, without silently sending a second request.

### Nine handoff cases

- Wait for both the last owned child and its GPU allocation to disappear; then
  invoke the next-dispatch callback **once**, even with unrelated GPU use remaining.
- Unknown owner, unresolved descendant, failed GPU observation and nonempty native
  queue each prevent dispatch — four separate cases.
- An observer exception does not become an empty process/GPU list.
- A next-worker launch failure is retained, never automatically launched again.
- Release evidence received after the original deadline cannot dispatch work.
- A stuck release observation is aborted without dispatch.

The 2,000 ms budgets in these fixtures are **test clocks**, not a newly agreed
product latency guarantee or the eventual native escalation policy. Requests,
acknowledgements, native stopping and resource-release timestamps will be measured
separately on Dundee. Eventual stopping alone cannot prove “immediate” cancellation.

## Explicit limits of this batch

The observations/transport in these tests are injected and labelled fixtures.
`ownerKnown`, queue classifications and process lists must eventually be produced
by actual identity-checked observers; an agent saying “stopped” is not a source.
Passing these tests proves control flow, **not** that an actual GPU job stopped.

This component is **not** the persisted queue, shared GPU lock, attempt tombstone,
process launcher or browser cancellation API. Its precondition is that the caller
holds the shared GPU lease and prevents further registered submissions throughout
release observation and dispatch; `dispatchNext` must participate in that lease
protocol. These tests prove ordering in one invocation, not exclusive ownership
or race-free handoff between concurrent callers.
Those integration boundaries must be bound/tested before any claim of concurrent
exclusion, restart recovery or complete cancellation. No ad-hoc replacement
scheduler or second SQLite writer is introduced by this test batch.

The helpers still need to reject dispatch after an accepted cancellation and
carry uncertainty across helper death; a released OS file lock alone must not
authorize duplicate GPU work. Existing Linux cleanup must retain its captured
identity checks and descendant observations. Reuse those tested mechanisms where
appropriate; don't replace them with PID-only killing or application status flags.

Nothing here restricts creative agents' tools, filesystem, research or normal
provider configuration. Unregistered/detached work remains an explicit tracking
limitation, not proof that everything an unrestricted agent launched was stopped.

## Live proof sequence after implementation and binding review

1. **Owned CPU Comfy test:** verify the actual selected endpoint's queued/running
   behavior against controlled synthetic jobs, including another job that must
   survive. This is real service/API evidence, not H3 inference evidence.
2. **Queued YuE2:** observe a request waiting for admission; cancel it before a
   native worker starts. Prove it never launches later when the lane becomes free.
3. **Queued H3:** observe the real H3 graph pending behind a controlled owned
   blocker. Remove only its prompt; verify the blocker/other job can finish.
   A synthetic blocker is labelled, not presented as model inference.
4. **Running YuE2 and H3:** wait for actual native execution evidence, not merely
   service startup or a running status. Request cancellation and independently
   observe the identified worker/job and resource release. Record escalation,
   partial outputs and actual monotonic latency. Never stop personal Comfy.
5. **Bidirectional handoff:** complete music → video → music with independently
   recorded process/queue/GPU observations between dispatches. Returning the
   expected list of event names from a test adapter is insufficient evidence.
6. Preserve seeds/captured inputs for explicit Restart/Retry checks; no automatic
   expensive regeneration. Keep failed/cancelled receipts and do not rewrite them.

If native interruption is too slow or resources cannot be proved released, stop
the dependent handoff, keep the result uncertain and investigate owned-worker
termination or revisit the promise with the learner. Do not silently relax it.

## Current state and checklist

- [x] Commit the accepted analysis checkpoint (`b064372`).
- [x] Inspect existing ownership tests/runners and selected upstream cancel route.
- [x] Write concrete asynchronous control assertions with labelled I/O boundaries.
- [x] Independent draft review: add stalled-POST and negative-ACK coverage,
  require polling to reach its deadline, and state the lease precondition.
- [x] Learner reviews this batch before implementation.
- [x] Implement the bounded TypeScript control functions and run these cases.
- [ ] Add/review concrete native transport/observer/lease bindings where missing.
- [ ] Run the owned-service and GPU proof sequence with independent observations.
- [ ] Review measured cancellation latency with the learner before closing G4.

## Implemented checkpoint after approval

The learner approved the 26 assertions with “looks good, go for it.” The two
TypeScript functions now run against those assertions. The tests use a static
import and a checked interface assignment rather than a dynamic-import cast.
They are part of `npm test`; the temporary review-only config is removed.

The implementation captures the job, service identity and callbacks before the
first await; sends at most one job-specific POST; and checks matching service
identity on every stop observation. Already-terminal work remains distinct from
work we requested to cancel. Missing history for observed running work, conflicting
observations and unknown ownership cannot become stop evidence.

Each invocation has one original monotonic deadline, including I/O and polling.
Polling waits at most 250 ms between observations, capped by remaining budget;
this is an implementation interval, not an agreed native-cancellation SLA.
An AbortSignal plus a timer race bounds a promise that ignores cancellation.
Timers are cleared on completion. This cannot preempt synchronous JavaScript or
stop external work merely because HTTP was aborted. The caller supplies a
monotonic `now` (for example `performance.now`) and an ordinary asynchronous wait.

`requestedAtMs` records controller entry; `stoppedAtMs` and `releasedAtMs` record
when their evidence was observed, not invented exact native exit times. Handoff
remembers all observed registered/active/unresolved-owned PIDs for the invocation.
It still requires the caller-held lease and valid native observations described
above. A next-launch error or timeout is propagated without retry. A timeout
does **not** cancel a launch that might already have happened; its caller must
retain ownership and reconcile that attempt rather than resubmit it.

### Thirteen additional implementation regression cases

These strengthen the approved behavior, not new product features:

- Negative or missing ACK plus queued disappearance remains uncertain (two).
- Running disappearance without terminal evidence remains uncertain.
- Conflicting running/terminal observations cannot establish stop.
- Mutating the caller's inputs cannot retarget the captured request.
- Later snapshots cannot forget already registered GPU ownership.
- Previously observed active or unresolved-owned children remain accounted for
  while their allocations linger (two).
- A stalled next-launch acknowledgement cannot trigger another launch.
- A stalled poll wait is bounded too.
- Early completion leaves no deadline timers behind.
- Invalid timeout budgets fail before any observation or action.
- The module loads directly in Node, not just through Vitest's transformation.

### Findings reproduced and repaired

1. **Native Node loading:** Vitest passed, but direct Node 24.1.0 loading failed
   with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` for a constructor parameter property.
   The new child-process import regression also failed before the repair. An
   explicit field assignment fixes it without adding a loader or changing stack.
2. **Owned-child retention:** focused review found that retaining only explicit
   registration PIDs could forget a previously observed owned child. Both active
   and unresolved-owned regression cases failed with `dispatched` instead of
   `reconciling`. Retaining all three owned-PID sets fixes both. The reviewer
   confirmed the repair; no blocker remained in that focused review.

### Verification and learner check

On 22 October: TypeScript checking passes; **39/39 controller tests** and
**117/117 total default tests** pass (the original 78 plus these 39). No approved
assertion was weakened. A separate diagnostic with real Node monotonic clocks
and timers bounded three never-settling callbacks in **100.43–100.85 ms** for
a 100 ms diagnostic budget, aborted their signals, and performed no duplicate
POST or dispatch. These were synthetic callbacks, not HTTP/Comfy/GPU evidence.
Evidence logs are ignored under `.local-evidence/slice-1/native-control/`.

To review this working control-flow step locally:

```bash
npm run typecheck
node node_modules/vitest/vitest.mjs run tests/contracts/native-control.test.ts --reporter=verbose
npm test
```

Read `cancelComfyJob`, then `handoffGpu`, alongside their named tests. Notice that
neither a positive HTTP acknowledgement nor a missing process alone is enough
to admit the next generator. No new framework/dependency, agent restrictions,
provider/model change, real generator launch or process termination was added.
The concrete transports/observers/shared lease, live native proof and measured
generator stop latency remain unverified. Slice 1 and G4 remain incomplete.

The learner accepted the working implementation checkpoint with “looks good,
continue.” Save this verified partial step before the next native-binding tests;
this acceptance does not close the outstanding native gates.
