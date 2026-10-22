---
doc: test-review
status: approved
---

# Comfy native binding — tests before implementation

22 October 2026. **Tests approved; verified implementation accepted with “proceed.”** The learner accepted the 53-case
contract with “looks good.” The accepted control-function checkpoint is committed as **`70a40af` — Verify bounded native cancellation and
GPU handoff control**. Its 117 tests pass; slice 1 is still incomplete.

## Request and next bounded step

Continue from the approved cancellation controller to its real local Comfy
observation/HTTP binding. Previously, the controller's callbacks supplied
observations directly. This step must establish where those observations came
from and ensure a cancel request goes only to the captured owned service/job.

Implemented module: [`apps/server/src/jobs/comfy-native.ts`](../apps/server/src/jobs/comfy-native.ts).
Assertions: [`tests/contracts/comfy-native.test.ts`](../tests/contracts/comfy-native.test.ts).
The approved 53 cases plus five implementation counterexamples now run in the
normal suite: **58 binding cases, 175 default tests**. No generator has run in
this step.
The separate-PID wire fixture is
[`tests/fixtures/comfy-http-child.mjs`](../tests/fixtures/comfy-http-child.mjs).

This is still the agreed C4 native-ownership work, not a new product feature,
service-discovery implementation, authentication UI or agent sandbox. It adds no
package, HTTP framework, generator or Python environment. The existing helper's
local owned-service launch/version check remains the origin of the captured
process identity, selected pin and native prompt ID.

## Approved binding contract

`createComfyNativeBinding({ port, owner, promptId, requestTimeoutMs, maxResponseBytes })`
returns `observe(signal)` and `post(path, body, signal)` compatible with the
verified `cancelComfyJob` controller. Capture configuration at construction;
mutating a caller object must not retarget an in-flight operation.

- Use the v1 server-local **IPv4 loopback** service, not a browser-supplied URL,
  proxy, DNS lookup or discovered host. Distributed services remain deferred.
- `observe` reads `GET /api/jobs/{captured-id}`. Its result projects **that job
  only** into the controller's running/queued/terminal fields. Empty arrays here
  do **not** mean the whole native queue is empty and cannot feed GPU handoff.
- `post` accepts only the captured job's `/api/jobs/{id}/cancel` path and `{}`.
  It returns only a validated HTTP 200 Boolean acknowledgement. It does not
  return a cancelled application state, release a lease or automatically retry.
- Typed helper failures distinguish identity, targeting, HTTP status, malformed
  response, byte limit, transport, abort and timeout errors. Uncertainty reaches
  the existing controller instead of becoming a manufactured empty observation.
- A narrow optional identity-reader dependency permits explicitly labelled
  failure injection. Normal calls use real Linux identity observations; the
  socket-ownership check is not replaced by that dependency.

These are rules for this helper's own requests, not restrictions on creative
agents' shell, research, scripts, filesystem, providers or other tools.

## Native-source findings that change what must be tested

### A status label is not enough

The selected Comfy pin's single-job endpoint exposes `id`, `status` and, for
history entries, `execution_status`. Its normalizer defaults some incomplete
history to a `completed` label. We must not infer verified completion from that
label alone. Require consistent explicit native status fields and reject
conflicting terminal events or events naming another prompt.

Successful work has native `status_str: "success"` and `completed: true`.
Failed or interrupted work normally has `status_str: "error"` and
**`completed: false`**; that flag describes generation success, not whether the
worker is still executing. An interruption event distinguishes cancelled history
from ordinary failed history. The decoder must not reject every legitimate
terminal failure by demanding `completed: true`.

An exact `404 {"error":"Job not found"}` means the captured job is absent from
that verified service. It does not prove the service stopped or GPU memory was
released. A generic missing route, malformed response or HTTP 500 is an error,
not absence. The controller still applies its existing ACK/history rules.

Inspected primary source at the selected pin:
[single-job route](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/server.py#L1007-L1031),
[history normalization](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/comfy_execution/jobs.py#L205-L269),
[native completion fields](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/main.py#L382-L388).
These are source findings, not a newly executed Comfy test.

### A live PID and open port are not enough

Before sending HTTP bytes, match the **server side of the actual established
TCP connection** against the captured process's socket file descriptors, and
check PID, group, start and boot identity. Matching the port or the namespace-wide
TCP table alone is insufficient; the client-side connection must not be mistaken
for the server-side one. Recheck process identity after reading the full response.

Use the same verified connection for the request: no automatic reconnect or
redirect to a replacement service at the same address. If the server has not
accepted the connection yet, any ownership wait belongs inside the original
request deadline and emits no HTTP bytes. Read only the relevant Linux process
and socket metadata; no network scanning or system configuration changes.

The first binding is specific to the agreed Linux/IPv4 local server. `/proc`
TCP tables are documented but deprecated in favor of `tcp_diag`; they are a
bounded dependency to verify on Dundee, not a general cross-platform networking
library. File-descriptor ownership must be checked separately from those tables.
This protects against accidental retargeting; it is not isolation against hostile
code running with the same full-access OS account.
[Kernel TCP-table format](https://docs.kernel.org/networking/proc_net_tcp.html),
[process metadata and descriptors](https://docs.kernel.org/filesystems/proc.html).

Node's HTTP custom-connection facility provides the wiring point. Local Node
24.1.0 source inspection found `agent: false` creates an Agent rather than using
the custom connection path; implementation must not accidentally bypass the
ownership gate that way. Tests must prove the behavior, not merely assert an
option object. [Node HTTP request API](https://nodejs.org/docs/latest-v24.x/api/http.html#httprequestoptions-callback).

## Original approved assertions: 53 cases

### 17 native decoding cases

- Five valid states: pending, running, successful, failed and interrupted.
- Exact native job-not-found response conveys absence only.
- Ten invalid/contradictory cases cover missing status evidence, wrong IDs,
  unknown states, inconsistent success flags and foreign/conflicting events.
- Unexpected HTTP statuses and generic missing-route responses are rejected.

### Five exact socket-matching cases

Accept only the matching server-side established connection with a matching
owner FD. Reject listener-only evidence, the reversed/client-side connection,
an inode absent from the owner's FDs, and another client's connection.

These use explicit proc-text fixtures; they are not kernel observation proof.

### 31 local HTTP/process cases

- Read the captured job and send exactly one targeted POST with either Boolean ACK.
- Reject each changed process-identity field before transmitting HTTP bytes.
- Reject both ownership confusions: another live process claiming this server,
  and the client process claiming a separate child server. Accept the actual
  child owner, so rejecting all cross-process connections cannot pass.
- Freeze configuration, reject unrelated/global paths or nonempty bodies,
  reject invalid input and avoid connecting for a pre-aborted request.
- Bound stalled headers, body and trickling body by a complete-request deadline.
  Caller abort closes unfinished work; timing limits in fixtures are diagnostic
  budgets, not a promised native generation-stop latency.
- Require complete HTTP framing: a valid terminal JSON prefix is insufficient.
  Enforce a cumulative byte limit, including delayed bytes after valid JSON.
  A response cap is an explicit observation failure, not a clip-duration limit
  or permission to truncate output into apparent success.
- Never follow a redirect or resend after malformed JSON, non-Boolean ACK,
  HTTP failure or a dropped POST response.
- Inject identity drift and stalled initial/final identity reads. A two-phase
  delayed response plus identity check must share **one** deadline rather than
  receive a fresh budget for each phase.
- Connect the real controller to synthetic queued → ACK → absent wire responses
  without claiming GPU release. Every fixture cleanup is attempted even if
  another cleanup fails.

The executed loopback HTTP fixtures and child use real local processes/sockets;
their Comfy-shaped data is **synthetic**. They use ephemeral loopback ports,
not personal Comfy or the owned GPU instance. The fixture child performs no
generation and is the only subprocess the fixture may stop during cleanup.

## Explicit remaining gaps

- No real Comfy route/runtime proof yet; the next owned CPU-service proof must
  exercise actual queued/running targeted cancellation and preserve another job.
- No native process/GPU-release observer, cross-process shared lease, durable
  queue, crash reconciliation or attempt tombstone is added by this batch.
- No YuE2 interruption or H3 GPU cancellation latency has been measured.
- No native observer may equate missing permissions, failed GPU queries or lost
  identity with resource release. Native binding failures keep dependent work
  blocked until reconciled.
- The formal 12-case live suite and complete bidirectional handoff still remain.

## Current state and review checklist

- [x] Commit the accepted controller checkpoint (`70a40af`).
- [x] Inspect selected Comfy status fields and local Node connection behavior.
- [x] Draft concrete decoder, socket and loopback transport assertions.
- [x] Incorporate focused review: separate-PID ownership checks, shared-deadline
  discrimination, complete HTTP framing/cumulative limits and cleanup reliability.
- [x] Learner approves the 53-case batch before implementation: “looks good.”
- [x] Implement the binding and execute the original assertions unchanged.
- [x] Address implementation review with meaningful failing/passing regressions.
- [x] Move approved tests into the normal contract suite; remove unused draft config.
- [x] Learner accepts the working implementation with “proceed” before its partial checkpoint commit.
- [x] Review/run a real owned CPU Comfy proof before claiming native behavior; see the separate CPU review for its limited cooperative-workload result.
- [ ] Continue lease/release/GPU cancellation gates after their concrete bindings.

## Implementation review and five supplemental cases

The first implementation passed all 53 approved cases. Focused review then
identified an actual JavaScript coercion defect: converting `status` with
`String(...)` allowed arrays such as `["failed"]` to pass the status whitelist.
Later strict comparisons could turn such malformed payloads into cancelled
history. Three added cases exercise array-wrapped terminal labels, with ordinary
and empty event lists. The failed/cancelled counterexamples failed against the
old decoder; checking the actual string type fixed them. All three now pass.
This enforces the existing malformed-response contract, not a new product rule.

Two more cases strengthen the existing lifecycle contract:

- Replace the original TCP listener with another server on the same port after
  ownership verification, keeping the accepted original connection alive. The
  request must succeed on the original socket, with **zero replacement connections**.
  A deliberately altered **copy** using `agent: false` fails this test; production
  source was never changed for that mutation check. This tests actual socket use,
  not merely the contents of a request-options object.
- Resolve an initially stalled identity read after its request has timed out.
  The late continuation must open **zero connections** and send zero HTTP bytes.

The resulting breakdown is **20 decoder + five socket matcher + 33 local
HTTP/process cases = 58**. The focused reviewer found no remaining implementation
blocker and reviewed the extra fixture cleanup. No assertion was weakened to
obtain a passing run.

## Verification and runnable learner check

```bash
npm run typecheck
node --check tests/fixtures/comfy-http-child.mjs
node node_modules/vitest/vitest.mjs run tests/contracts/comfy-native.test.ts --reporter=verbose
npm test
```

Observed on the development machine, **not Dundee**:

| Check | Result and boundary |
|---|---|
| Before implementation | Suite setup correctly refused the absent module; all 53 cases skipped. This was not a behavioural failure proof. |
| First approved batch | 53/53 passed with actual local HTTP/process fixtures and synthetic Comfy data. |
| Decoder defect | Two meaningful red counterexamples before repair; three supplemental label-type cases now pass. |
| Same-socket mutation check | Deliberately reconnecting copy fails the listener-replacement assertion; unchanged production passes. |
| Final binding suite | 58/58 passed; promoted to `tests/contracts/` with real typed imports. |
| Full suite | **175/175 passed on three consecutive runs**, including the prior 117 tests. |
| TypeScript / fixture syntax | Passed. No package/dependency changes. |
| Direct Node execution | Node **24.1.0**, without Vitest transformation, imported the production TypeScript and completed synthetic queued → ACK → absent via GET/POST/GET. This is runtime/HTTP proof, not native job cancellation. |

Ignored evidence is retained under `.local-evidence/slice-1/comfy-native/`:
`approved-red.txt`, `first-run.txt`, `status-type-red.txt`, `status-type-green.txt`,
`supplemental-green.txt`, `socket-mutation-red.txt`, `full-suite-{1,2,3}.txt`,
`typecheck.txt`, `node-version.txt`, `node-smoke.mjs`, `node-smoke.json` and
`source-sha256.txt`. The deliberately incorrect copy remains clearly named
`socket-mutation/` and is outside the application and default test suite.

Read `decodeComfyJob` for the distinction between native facts and labels, then
`createComfyNativeBinding` for the captured identity, pre-HTTP socket check and
one request deadline. Unknown identity is an error, not absence. An unverified
server-side socket at the deadline is `COMFY_IDENTITY`; other request deadline
expiry is `COMFY_TIMEOUT`. Neither claims a stopped service or released GPU.

**No native Comfy/H3/YuE2 job, remote deployment, GPU workload, shared lease,
resource-release observer, durable scheduler or browser UI was added or exercised.**
The 12-case live suite, actual interruption latency and full slice 1 remain
incomplete. The next proof uses a separately owned CPU Comfy service before any
GPU cancellation/handoff claim. It must preserve unrelated queued/running work.

The learner accepted the implementation checkpoint with “proceed.” This saves the
verified binding separately from the next owned CPU Comfy proof; it does not
close slice 1 or any remaining native/GPU gate.

Accepted checkpoint commit: **`620458c`**. The separate
[owned CPU cancellation checkpoint](comfy-cpu-test-review.md) now records an
approved, implemented and executed 2/2 CPU proof. That result was observed on
Dundee, not inferred from this earlier synthetic binding evidence. It does not
close the GPU/lease/live-suite gates.
