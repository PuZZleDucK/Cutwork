---
doc: test-review
status: approved
---

# Owned CPU Comfy cancellation — implementation checkpoint

22 October 2026. **Tests approved with “make it so”; implementation and native
CPU verification passed; learner accepted the implementation with “all good.”**
Accepted implementation checkpoint: **`6e1926e`**.
The preceding HTTP binding is committed as **`620458c`**. The default suite now
passes **189 cases**; the separate real-Comfy CPU suite passes **2/2** on Dundee.
Slice 1, native GPU cancellation and the complete live suite remain open.

## Request and bounded next step

Move from synthetic HTTP responses to the **real pinned Comfy server, prompt
validation, queue, executor and targeted cancellation route**, using a deliberately
simple cooperative CPU node instead of a model. The test must distinguish actual
interruption from a job merely finishing naturally or being killed at teardown.

This is existing C4/G4 evidence work. It does not add UI, models, an installer,
service discovery, a new provider, or constraints on creative agents. It cannot
prove H3/YuE2 GPU interruption latency, GPU resource release, shared leasing,
durable scheduling, or the full 12-case live suite.

## Scratchpad: resolved technical questions

- **How do we reliably observe queued/running jobs?** A fresh proof-only output
  node waits behind an explicit completion gate. No fixed-duration sleep may
  silently turn into successful completion. Each job has a fresh token so the
  execution cache cannot substitute an earlier result.
- **How do we prove stopping came from Comfy?** The running target's gate is never
  opened. Require the node's `interrupted` event, native `execution_interrupted`
  for that prompt, and cancelled history with `status_str: "error"` and
  `completed: false`. The controller's generic `native-stopped` is insufficient:
  a normal failure or watchdog expiry could also satisfy it.
- **How do we submit without a weaker second HTTP client?** Extract the existing
  owned socket/deadline exchange once into `comfy-http.ts`. Both the existing
  captured-job binding and proof harness use it. Keep all 58 existing binding
  tests and their behavior unchanged. No fetch fallback or in-process queue
  insertion that bypasses native `/prompt` validation.
- **What if submission succeeds but its response is lost?** The selected source
  accepts a canonical client-supplied prompt UUID. Save a fresh UUID and graph
  intent before exactly one POST. An ambiguous result fails/reconciles the
  attempt; never automatically submit the graph again.
- **What counts as unrelated work?** Other explicitly created jobs in this
  temporary service, never the user's personal Comfy jobs. Each survivor must
  actually execute and finish successfully after the target is cancelled.
- **What do the time limits mean?** A five-second cancellation diagnostic budget,
  ten-second observation waits, a 60-second test watchdog and a 90-second node
  backstop bound this experiment. They do not establish a product stop-time SLA.
  Startup/cleanup have separate finite budgets. Expiry is failure, never success.

No new product decision was needed. The learner approved these assertions and
their native execution boundary before implementation.

## Implemented boundary

1. **`apps/server/src/jobs/comfy-http.ts`** extracts the existing connection,
   ownership, deadline and complete-JSON exchange. Its internal
   `createOwnedComfyTransport` captures port/owner/configuration and offers a
   GET/POST request with a relative path, optional POST JSON object and decoder.
   Serialization occurs before the first await, so mutation cannot alter the
   submitted graph. UTF-8 byte length determines Content-Length. The decoder
   remains inside the original deadline. Absolute/authority/control-character
   paths and invalid method/body combinations are refused before connecting.
2. **`comfy-native.ts` stays the captured-job API.** Its existing `observe` and
   `post` restrictions, decoder, error distinctions and no-retry behavior remain.
   Its old socket matcher export can be re-exported without breaking callers.
3. **`tests/support/comfy-cpu-fixture.ts`** owns a temporary service lifecycle on
   Dundee. Verify the existing recipe/lock/source ownership markers, use its
   isolated Python, create a fresh run/base directory, stage only the proof node,
   and launch loopback-only `--cpu` with fresh user/input/output/temp directories.
   Select an unused unprivileged port, never 8188, and never adopt an existing
   listener. Exact socket ownership must precede HTTP, closing the bind race.
   Check native version, actual CPU device and exact launched argv. Record
   PID/group/start/boot identity, command, source/fixture hashes, logs and cleanup.
   Before launch, verify the five critical source-file hashes pinned in
   `tests/fixtures/comfy-cpu-source-hashes.json` and the staged fixture hash. The
   native tests independently repeat the byte comparisons and check observed
   argv against the fresh base/user directories; echoed metadata is insufficient.
   No native tool installation or modification of its packages/source is part
   of this proof.
   An active `source/extra_model_paths.yaml`, including a dangling symlink, is
   refused without changing it: the selected Comfy source otherwise loads it
   even when a fresh base directory is supplied. Development dependencies were
   installed only in the separate audited proof-source directory, not the tool.
4. **One proof-only node** is loaded solely from the fresh base's `custom_nodes`.
   The event directory is set by this fixture's process environment, not by a
   prompt-supplied filesystem path. The node calls Comfy's real cooperative
   interruption check, catches exactly `InterruptProcessingException` (a
   `BaseException`, not ordinary `Exception`), records interruption and re-raises.
   It never fabricates queue/history entries or resets flags itself. Normal gate
   release records `released` then `finished`; its backstop records `expired`
   and raises failure. Event snapshots are atomically replaced JSONL files so a
   test cannot read a partial line. Only the node writes execution events; the
   harness writes separate gate files. No model, tensor generation or GPU work.
5. **Tests own the scenario.** They persist intent, submit through `/prompt`,
   query `/queue`, `/system_stats` and exact `/api/jobs/{id}` routes through the
   extracted transport, and invoke the real binding/controller for cancellation.
   They read node events directly, rather than accepting a canned probe verdict.
   Raw responses, intents, cancellation timestamps and logs remain ignored
   runtime evidence. These diagnostic routes do not become a browser API.

Every scenario captures its own session/transport rather than reading a mutable
current-session global. A per-test AbortSignal is registered before startup,
passed through requests and waits, and aborted before cleanup. Late continuations
therefore cannot issue requests to a subsequent test's service.
The fixture also returns a combined lifetime signal. Parent SIGINT/SIGTERM
aborts scenario work and latches the run against later launches while allowing
owned cleanup to finish; `process.exitCode` alone would not stop continuations.

The fixture must clean up its own service even if startup fails. Teardown uses
bounded, identity-checked owned-child/group cleanup; unknown identity stays a
failure rather than authorizing an unrelated kill. It records cleanup separately
and cannot turn a failed cancellation assertion into a pass. After `close()`, the
test independently reads `/proc` to confirm the captured PID/start/boot identity
is gone; permission/read failures remain uncertainty, and changing a process
group is not exit. A passed scenario
proves the same service is still alive **before** teardown begins. No global
interrupt, queue clear, existing-service restart or GPU cleanup is permitted.

## Seven local extraction assertions

[`tests/contracts/comfy-http.test.ts`](../tests/contracts/comfy-http.test.ts)

1. A nonempty JSON graph arrives unchanged, including multibyte text, with correct
   UTF-8 Content-Length.
2. GET reads an owned native-service route without sending a body.
3. Mutation of request method/path/nested body or transport configuration after
   request entry cannot change what is sent.
4. Invalid paths and method/body combinations—including unserializable JSON—fail
   before connecting.
5. A dropped POST response causes an explicit transport error and no second POST.
6. A mismatched captured owner receives zero HTTP bytes, including graph content.
7. A pre-aborted submission opens no connection.

These are actual local sockets with **synthetic responses** when executed. The
existing 58 tests continue to prove identity, complete framing, limits, deadline,
abort, no-reconnect and captured-job restrictions after extraction. The seven
new cases alone are not a replacement for that regression suite.

Implementation review added **two transport regressions**, both observed failing
before repair: a JSON `toJSON()` hook can abort the caller during capture, or use
up part of the original request deadline. Recheck cancellation after listener
registration and schedule only the remaining budget. Both cases now pass with
zero connections/HTTP bytes. The extraction file therefore contains **nine**
cases. Five additional local guard cases cover missing/present/linked inherited
configuration and SIGINT/SIGTERM propagation plus the no-further-launch latch.
These five are synthetic safeguards, not a live parent-termination experiment.

## Two native CPU assertions

[`tests/cpu-native/comfy-cancellation.test.ts`](../tests/cpu-native/comfy-cancellation.test.ts)

### 1. Queued target, held blocker and unrelated survivor

- Start a held blocker and observe both its node-entered event and native running
  status. Submit the target and then a survivor; both must really be pending.
- Cancel only the target through the production binding/controller. Require a
  positive ACK and exact native absence, with no target execution events.
- Require the blocker still running and survivor still pending, with the exact
  whole queue contents preserved except for the target.
- Release the blocker and survivor in turn; require both native successes and
  normal node events. Drain the whole queue, then check the target is still
  absent and has never executed. Its completion gate must still be absent.
- Verify the same captured service is healthy before cleanup.

### 2. Running target, held unrelated successor

- Start the held target and observe its execution event and native running
  status. Queue an unrelated survivor. Never open the target's completion gate.
- Cancel through the real binding/controller. Require a positive ACK, native
  cancelled history, matching `execution_interrupted`, and exactly the node's
  `started → interrupted` events. No release, finish, expiry or ordinary error.
- Require the survivor to start without interruption. Release only its gate and
  require successful native completion and normal events. The whole queue is
  then empty; the target remains cancelled and its gate remains absent.
- Verify the same service is still healthy before its separate owned teardown.

The native assertion uses real Comfy execution but a **synthetic cooperative
workload**. It is not image/video/music inference. An interruption flag observed
between tiny CPU waits says nothing about how quickly a real GPU kernel yields.

## Execution gates and review commands

The extraction and guard assertions now run in default `npm test`. The CPU suite
remains separate from both default tests and the existing GPU live config.
Its loader requires explicit `STUDIO_CPU_COMFY=1`, the
Dundee hostname, Node 24 and an absolute reviewed `STUDIO_DATA_ROOT`, then requires
the real fixture module. Missing implementation is a prerequisite failure, not a
behavioral red test. No fallback fixture or simulated native pass is allowed.

Safe review/collection commands (no native startup):

```bash
npm run typecheck
npm run test:list
node node_modules/vitest/vitest.mjs list --config vitest.cpu.config.ts --no-staticParse --json
```

Local extraction assertions and all 58 binding assertions passed before native
execution. The native CPU command runs
**on Dundee with its pinned Node runtime**, not from this development host:

```bash
STUDIO_CPU_COMFY=1 STUDIO_DATA_ROOT="$HOME/.local/share/music-video-studio" \
  "$HOME/.local/share/music-video-studio/tools/runtime/node-v24.22.0-linux-x64/bin/node" \
  node_modules/vitest/vitest.mjs run --config vitest.cpu.config.ts --reporter=verbose
```

This command ran inside isolated transient user service
`studio-comfy-cpu-20261022-d559eb25`, with a 600-second outer backstop,
30-second stop timeout and `KillMode=control-group`. Its working directory was
the audited source snapshot, not the personal Comfy checkout. Its success did
not rely on that outer cleanup: each test proved service health before its own
teardown and independently checked exit afterward. No provider sign-in, billed
agent call or native model download was used.

## Review state

- [x] Commit accepted binding checkpoint as `620458c`; recheck 175/175 tests.
- [x] Inspect the selected native cancellation, prompt-ID and interruption code.
- [x] Draft seven extraction tests and two native CPU scenarios.
- [x] Typecheck and collect **7 + 2** cases without running their hooks.
- [x] Incorporate independent review: independent exit checks, pinned source/base
  verification, captured abortable test contexts and exact empty node-error checks.
  Draft re-review found no remaining substantive contradiction; startup cleanup
  and native execution were still unverified at that stage (executed below).
- [x] Learner approves this batch with “make it so” before implementation.
- [x] Implement; run local regression suite before any native service.
- [x] Execute and inspect owned CPU evidence on Dundee.
- [x] Learner accepts the implementation checkpoint with “all good” before committing it.

## Observed execution, 22 October 2026

| Check | Observed result |
|---|---|
| Local regression suite | **189/189** on development Node 24.1.0 and Dundee Node 24.22.0; typechecking passed on both. Includes the original 175 plus nine extraction and five proof-guard cases. |
| Direct Node smoke | Extracted production code loaded without Vitest and performed synthetic GET/POST/GET on Node 24.1.0. Not native execution evidence. |
| Native service execution | **2/2**, no retries; unit exited 0, **37.376 s** runtime, reported **1 G** peak memory and **0 B** swap. Real pinned Comfy 0.42.0, isolated Python 3.12.14, CPU device and exact argv verified. |
| Queued target | Native pending → targeted ACK → exact 404; no target events or gate before or after draining. Blocker and survivor both completed normally; final whole queue empty. |
| Running target | Native running → targeted ACK → cancelled/error/completed=false, matching `execution_interrupted`, and node events exactly `started → interrupted`. No gate, expiry, ordinary error or successful target completion. Survivor completed normally; final whole queue empty. |
| Separate teardown | Same captured service healthy at the end of each scenario. Owned SIGINT cleanup exited 0 for each; independent `/proc` and listener checks confirmed both services/groups/ports gone. |
| Personal service | Port 8188 retained PID 1216557 and the same start/boot/group identity. Before/after GPU compute listing showed only that PID at 234 MiB; no personal-service change was made. This is not continuous GPU-allocation monitoring. |

Observed controller request-to-stop intervals were **287.534 ms queued** and
**363.458 ms running**. These include HTTP/identity/polling overhead for one tiny
cooperative CPU workload; they are **not a product SLA or H3/GPU latency claim**.

Audited source snapshot on Dundee:
`proof-sources/comfy-cpu.d559eb25-827f-4486-98cc-376fc5c9f928`, relative to
`/home/puzzleduck/.local/share/music-video-studio/`. All **85** selected source,
configuration and lock files were hash-checked after transfer and after execution.
Private learner context, credentials, local agents/skills and media were excluded.
The official pinned source archive previously supplied the five critical source
hashes; both fixture and native tests independently compared installed bytes.
This is not a signature check or a complete installed-source-tree audit.

Native run directories under that runtime's `setup-jobs/`:

- Queued: `comfyui-cancellation.84ec4341-60e2-457a-b746-94ed99b3675c`
  (owned PID 1897262, port 39449).
- Running: `comfyui-cancellation.3c3b8414-179e-4d39-b123-9ef9a0cb2966`
  (owned PID 1897497, port 43179).

Ignored local evidence: `.local-evidence/slice-1/comfy-cpu/` retains the original
missing-module prerequisite result, extraction and capture-regression red/green
logs, local/Dundee suite logs, exact source archive/manifest, unit output/journal,
before/after checks and copies of both native directories. Native evidence
includes submitted intents, raw scenario HTTP observations, node-only events,
cancellation results, source observations, service logs and separate cleanup
receipts. A post-run read-only check initially had a shell-quoting error; the
corrected standalone verifier passed and did not require rerunning either job.
Independent post-run review corroborated both scenarios, the 85-file snapshot,
test counts, unit figures and cleanup evidence. Its nonblocking verifier-hardening
suggestion was applied: refuse Python optimization so assertions cannot be
silently disabled. The read-only post-check passed again; no native job rerun.

**Current boundary:** actual queued/running cancellation is proved only for this
cooperative CPU node. No H3/YuE2 model generation, GPU cancellation/release,
shared leasing, durable scheduling, browser integration or formal 12-case live
suite ran in this step. Successful startup/cleanup was observed; parent-signal
and failed-startup cleanup are not live fault-injection claims. No slice/G4 box
is ticked.

### Inspected pinned primary source

- [Single-job status and targeted cancellation](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/server.py#L1007-L1076).
- [Canonical client prompt ID and normal prompt validation](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/server.py#L1179-L1233).
- [Atomic running-job identity check](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/execution.py#L1377-L1398).
- [Native interruption exception and cooperative check](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/comfy/model_management.py#L2196-L2221).

Source inspection and test collection are not native execution evidence.

The original draft collected **7 + 2** before implementation. Focused implementation
review found the JSON-capture abort gap, inherited-config path and termination
signal gap; all were repaired before the first native launch. These historical
review checks do not replace the executed results above.

Follow-on: [read-only GPU observation implementation](gpu-observation-test-review.md).
Its native read-only check is verified; the learner accepted it with “good to go”.
It does not implement or prove resource release.
