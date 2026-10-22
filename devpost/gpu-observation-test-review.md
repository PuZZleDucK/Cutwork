---
doc: test-review
status: approved
---

# NVIDIA compute-process observation — implemented checkpoint

22 October 2026. **Learner approved the 37-case batch with “looks good” before implementation.
The implemented probe now passes 38 cases and one real read-only Dundee check;
learner accepted the implementation with “good to go”.**
The learner accepted the preceding CPU cancellation implementation with “all
good.” It is committed as **`6e1926e` — Verify owned Comfy CPU cancellation on
Dundee**. Its default suite was rechecked: **189/189**, plus typechecking.
Slice 1 and G4 remain incomplete.

## Request and bounded next step

We can now demonstrate that real Comfy cancels queued/running cooperative CPU
work. That is different from knowing whether a native worker still holds GPU
resources. `handoffGpu` already requires a successful GPU-process observation;
its existing tests supply those observations. This new native input must not
convert a failed query into an empty process list.

Implement one **read-only compute-process probe**. Do not yet wire it into
dispatch or claim a complete release observer. No GPU model run, process-group
stopper, shared lease, durable queue, browser feature or agent restriction is
part of this batch. These tests describe a narrow binding used by the existing
`spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation` / G4 work.

## Scratchpad: decisions and evidence

- **Why this command?** Existing native proofs already use the installed
  `nvidia-smi`; no new Python/NVML dependency is necessary for this bounded
  binding. NVIDIA documents CSV selective queries for active compute processes,
  but does not promise stable CLI output across releases. Strict parsing and
  explicit host compatibility checks are therefore required, not silent format
  recovery. A future NVML binding remains possible, not part of this change.
  [NVIDIA SMI documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html)
- **What was inspected now?** Read-only Dundee commands found
  `/usr/bin/nvidia-smi`, driver/SMI **580.178.04**, one GPU UUID and personal
  Comfy PID **1216557** in the compute listing. The installed CLI's help confirms
  `gpu_uuid` and `pid`. This is manual command compatibility evidence, **not** a
  pass of the proposed adapter or a release check. No device configuration,
  service restart, install, model generation or process cleanup was performed.
- **What does the snapshot mean?** It lists compute contexts reported during a
  bounded observation interval. It is not total GPU memory, graphics/encoder
  usage, process ownership, or continuously clear capacity. Inventory checks
  before/after catch some device changes; the three calls are not atomic.
- **Why not filter to our processes/GPU?** Return every validated row across the
  inventory, including unrelated PIDs and the same PID on multiple GPUs. Future
  ownership reconciliation decides relevance. Never silently drop a malformed
  or unknown-GPU row that could hide relevant work.
- **What attribution is supported later?** Direct CUDA workers using host PID
  identity. MPS reports the server instead of individual client PIDs, so a
  naive owned-PID comparison could incorrectly treat that work as unrelated.
  [NVIDIA MPS tools reference](https://docs.nvidia.com/deploy/mps/latest/appendix-tools-and-interface-reference.html)
  This probe does not certify MPS/container PID translation/MIG/vGPU support or
  automatically detect every such environment. **Do not use it to authorize
  release in an unverified attribution environment.** That gate belongs in the
  later composed observer/integration proof; it is not solved by a caller's
  unverified Boolean. Encountered unsupported identifiers fail parsing now.

No product choice was reopened. The approved observation and failure boundaries
remain unchanged; the probe is not connected to dispatch.

## Implemented API and behavior

Production module and types: [`apps/server/src/jobs/nvidia-query.ts`](../apps/server/src/jobs/nvidia-query.ts).
Tests now import that module directly; the review-only type facade/configuration
were removed when the cases joined the default suite.

`readNvidiaComputeSnapshot(config, signal, io?)` captures at entry:

- trusted absolute `nvidia-smi` path and nonempty expected-GPU UUID list;
- whole-observation timeout, separate cleanup timeout and per-command combined
  stdout/stderr byte limit;
- the optional test-only launch callback.

Execute exactly three sequential, literal argument arrays with `shell: false`:

1. `--query-gpu=uuid --format=csv,noheader,nounits`
2. `--query-compute-apps=gpu_uuid,pid --format=csv,noheader,nounits`
3. Repeat the inventory query.

Do not use device indices, a GPU filter, shell concatenation, a looping query,
automatic retries, cached results, resets, unloading, or a fallback query whose
different semantics could make a failure look empty. An invalid configuration
or already-aborted signal starts nothing. Freeze configuration before awaiting;
later changes cannot retarget an in-flight query.

Success requires complete bounded stdout/stderr, valid UTF-8, exit 0 without a
signal, no stderr diagnostics, and closed output streams. A valid CSV prefix or
the child's `exit` event alone is insufficient. Nonempty valid inventories must
agree as sets, contain all expected GPUs and have no duplicate UUIDs. Every
process row must contain exactly one known GPU UUID and one positive safe
decimal PID; duplicate pairs, sentinels, missing/extra columns and diagnostics
are errors. The same PID on distinct GPUs remains represented. Empty/whitespace
compute output is valid only when all the surrounding checks pass.

Return a tagged `nvidia-compute-process-snapshot` with sorted UUIDs/process rows
and monotonic start/finish timestamps. It also retains each command's literal
arguments, PID, bounded raw output, zero exit status and start/finish timestamps,
so the native check can inspect actual evidence rather than only parsed rows.
Do **not** return `ownerKnown`,
`resourcesReleased`, `gpuClear` or a dispatch decision. Query failure rejects;
the later observer must preserve it as unknown, never substitute `[]`.

One original deadline covers all phases, including stalls. Caller abort stops
the current query and prevents further phases. On failure, terminate/reap only
the query child created by this probe, with bounded TERM→KILL escalation if
needed and explicit `cleanupConfirmed` evidence. Do not signal generators,
listed compute PIDs or process groups. Cleanup has its own finite budget; it may
not retroactively turn timed-out output into success. If cleanup cannot be
confirmed, return an explicit cleanup error with `cleanupConfirmed: false`.
The total waiting bound is observation budget plus cleanup budget (subject to
JavaScript event-loop scheduling), not a generator stop-time SLA.

## Approved 37 cases plus one implementation regression

[`tests/contracts/nvidia-query.test.ts`](../tests/contracts/nvidia-query.test.ts)

| Group | Cases | What must be demonstrated |
|---|---:|---|
| Valid observations | 2 | Exact sequential read-only commands; all GPU/PID pairs including unrelated work; canonical order/timing; verified empty compute list without a release claim. |
| Inventory validation | 6 | Empty, duplicate, missing expected or malformed GPUs; unsupported MIG identifier; changed final inventory. |
| Compute-row validation | 11 | Unknown GPU, duplicate pair, unavailable/zero/negative/fractional/exponent/unsafe PID, wrong columns or trailing diagnostic cannot disappear through filtering. |
| Native command outcome | 5 | Nonzero/signal exit, stderr diagnostic, invalid UTF-8 or output overflow cannot supply valid evidence. |
| Configuration and spawn | 4 | Invalid/pre-aborted requests launch nothing; synchronous launch failure; actual asynchronous ENOENT error/close without a PID; entry capture resists mutation. |
| Lifetime and deadline | 7 | Abort between phases; earlier work consumes the original budget; stalled phase two has only the remaining budget; hang, trickle and TERM-resistant query fixtures stop; active abort reaps only its query child. |
| Pipe completion and uncertainty | 2 | Delayed data after exit still participates in validation; unconfirmed cleanup remains bounded failure. |
| Final deadline regression | 1 | Synchronous final comparison work cannot return an expired successful snapshot after all native queries have closed. |

## Fixture and verification boundaries

All **38 cases now run in `npm test`**. Collection/typechecking still executes no
hooks or fixture processes. The original missing-module run was only a
prerequisite failure, not a behavioral red test. There is no fake product
implementation or fallback returning a successful GPU snapshot.

Most executed cases launch a real harmless Node child via the test seam,
not `nvidia-smi`. The fixture writes configured synthetic bytes/status, cannot
spawn descendants or use the network/GPU, and has a five-second failure-only
watchdog. A test observes mode entry before accepting hang/trickle/escalation
evidence. Cleanup is registered before the first launch, aborts before awaiting,
refuses late launches, and independently checks captured process identity before
emergency termination. Tests check normal probe cleanup **before** that emergency
cleanup; watchdog exit cannot pass.

Three assertions explicitly use scripted child/stream events, not real OS
processes: delayed inherited-pipe-style data, phase-two remaining-time behavior
with a controlled clock, and unresolved cleanup. No fake PID or actual OS signal
is involved. The delayed-stream assertion must remain unsettled after exit,
then reject specifically for malformed output. The remaining-time assertion
must expire at the original deadline, not just reject eventually after resetting
a phase timer. These are focused event/deadline models, not evidence of native
descendant cleanup or GPU timing.

## Executed verification — 22 October 2026

1. Original approved **37/37** passed against the first implementation.
2. Implementation review independently found a final-deadline defect: queries
   could close within budget, but the final comparison/timestamp could pass the
   deadline without rejection. A retained red case returned an expired snapshot.
   `check()` now returns the timestamp it has validated, and the final snapshot
   takes that timestamp **after** comparison. The new case turns green. A separate
   scripted exact-equality check (100 ms timestamp, 100 ms budget) also rejects.
3. All **38 probe cases + 189 existing cases = 227/227** pass in the default
   local suite under development Node **24.1.0**, with typechecking and fixture
   syntax checking. No skips or expected-failure markers hide failures.
4. The exact production module ran directly under **Node 24.22.0 on Dundee**,
   without a test I/O seam. It used `/usr/bin/nvidia-smi` **580.178.04** in a fresh
   transient user service: 60 s outer runtime, 5 s stop budget, control-group
   cleanup, no generators started. The observation itself had a 5 s budget,
   separate 1 s query-child cleanup budget, and 65,536-byte per-command cap.
5. Three actual queries returned valid complete output in **105.791 ms**; each
   exited 0 with blank stderr. The compute row was the existing personal Comfy
   process, PID **1216557**, on
   `GPU-7cdb763f-95cd-67e2-8665-37792d511434`. Independent read-only CLI queries
   before/after matched the inventory and process list. This agreement is not
   evidence of an atomic or continuously stable snapshot.
6. Query PIDs **1949438, 1949440, 1949442** were absent afterward. Personal
   Comfy retained its PID/start-ticks/boot/group/session identity and listener on
   8188. No personal service or device setting was changed. The proof service
   exited 0 (reported 512 ms runtime, 49.8 M peak memory, 0 B swap) and was
   independently observed inactive/not-found afterward.
7. Focused independent review inspected the fix and retained source/receipts:
   no remaining blocker or unsupported completion claim was found.

The successful native invocation does **not** fault-inject native failure,
abort or escalation. Those paths have synthetic local evidence, not a native
GPU-failure recovery or latency claim. The full 227-case suite ran locally in
this checkpoint, not on Dundee; Dundee executed the real adapter directly.

### Source and retained evidence

- Source SHA-256:
  `e8c93b2d17a3bab073620778dd3346f6fc7db857b5fd48a9a3a05336685fe8a0`.
- Dundee source snapshot:
  `~/.local/share/music-video-studio/proof-sources/gpu-observation.9872019c-277e-4483-a998-b72ee609d6e7/`.
- Transient unit:
  `studio-gpu-observation-9872019c-277e-4483-a998-b72ee609d6e7.service`.
- Ignored local evidence: `.local-evidence/slice-1/gpu-observation/`, including
  `first-run.txt`, `final-deadline-red.txt`, `final-deadline-green.txt`,
  `typecheck.txt`, `contracts.txt`, `native-proof.mjs`, `native-receipt.json`,
  `run-metadata.json`, `dundee-preflight.txt`, `dundee-native.txt`, and
  `dundee-postcheck.txt`. Both uploaded source and harness hashes were retained;
  the harness also checked source bytes before invoking the adapter.
- Earlier manual command compatibility evidence remains in
  `.local-evidence/slice-1/gpu-observation-review/`; it is not substituted for
  the native adapter result above.

### Learner implementation check

```bash
npm run typecheck
node --check tests/fixtures/nvidia-query-child.mjs
npm test -- tests/contracts/nvidia-query.test.ts
npm test
```

These executions use harmless local fixtures, **not NVIDIA or a GPU model**.
Read the parser at the top of `nvidia-query.ts`, then the query lifecycle and
three-step observation at the bottom. In particular, compare a validated empty
compute list with a failed query: only the former is a snapshot, and even it is
not a release decision. No browser UI was added in this step.

- [x] Commit accepted CPU checkpoint as `6e1926e`; recheck 189/189.
- [x] Inspect installed read-only CLI/version/field support and primary docs.
- [x] Draft, typecheck and collect the 37 cases before implementation.
- [x] Learner approves the batch with “looks good.”
- [x] Implement; reproduce/fix final-deadline regression; promote and pass 227/227.
- [x] Run the actual read-only adapter on Dundee and independently review evidence.
- [x] Learner accepts the implementation with “good to go”; commit the verified checkpoint.

Slice 1/G4 remain unchecked. Shared leasing, stopped-process identity/descendant
observation, native queues, unsupported-attribution handling, actual GPU model
cancellation/handoff and the formal 12-case suite remain separate work. No
`resourcesReleased` or dispatch verdict is added by this probe.
