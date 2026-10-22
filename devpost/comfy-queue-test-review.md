---
doc: test-review
status: approved
---

# Whole Comfy queue — implemented checkpoint

22 October 2026. **Learner approved the 48-case batch and two extended native CPU
scenarios with “looks good” before implementation. All 48 cases and both native
scenarios now pass; the learner accepted the implementation with “looks great,
go for it”. Committed as `b45c6d2`; acceptance rechecks passed typechecking and
316/316 default tests.**
The learner accepted the Linux process census with “all good”; it is committed
as **`cc699e4` — Verify bounded read-only Linux process census**. The accepted
suite was rechecked: **268/268 locally**, plus typechecking. Slice 1/G4 remain open.

## Request and bounded next step

We are preparing the combined process/queue/GPU observer in `spec.md > C4 — Durable
Jobs, GPU Scheduler and Cancellation`. Inspection found a concrete missing input:
`comfy-native.ts` deliberately reports **one captured job**, not the entire queue.
Its empty arrays cannot establish that another job is not running or waiting.
The CPU proof's existing raw `/queue` projection is diagnostic code, not a typed
production reader.

Implemented **one read-only whole-queue decoder and binding**, reusing the accepted owned
HTTP transport. This completes the missing queue input before composition; it
is not another scheduler or a change to the product. No release decision, process
termination, model unloading, shared lease or dispatch is implemented in this
batch. Existing single-job cancellation semantics remain unchanged.

## Scratchpad — assumptions and ambiguities resolved

- **Whole service, not one attempt:** return every observed job ID, including
  unrelated/unknown jobs; do not filter by the selected attempt or project.
  Observing an ID is not permission to cancel it.
- **Empty versus unavailable:** only complete, valid HTTP 200 data from the
  captured service can contain an empty queue. 404, disconnection, schema failure,
  wrong identity, timeout or abort remain errors. Never manufacture `[]`, reuse
  an old empty snapshot, automatically retry, or switch endpoints.
- **Pinned native shape:** GET `/queue` supplies both lists with five-field rows.
  Submission priorities can be negative/fractional; IDs are canonical UUIDs,
  without a v4-only restriction. The sixth internal field is stripped upstream.
  Our returned projection retains only IDs, not graphs/metadata.
  [Pinned server source](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/server.py#L1153-L1227)
- **Wire order is not FIFO:** upstream copies the pending heap storage and running
  list under one mutex. Preserve wire order without presenting it as execution
  order; it says nothing about an atomic process/GPU observation.
  [Pinned queue source](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/execution.py#L1362-L1375)
- **Duplicate IDs are ambiguous:** reject the entire observation if an ID repeats
  within either list or appears in both. No filtering/deduplication may conceal
  work. Ancillary graph/metadata structures are validated at their top level,
  not revalidated as executable workflows by this reader.
- **Freshness is a future collector's responsibility:** this binding always
  performs a new request. It returns point-in-request evidence, no timestamp or
  durable “clear” state. The combined observer must bracket fresh calls within
  its original deadline, account for PID reuse/remembered descendants, verify
  attribution and visibility, and operate under the real held lease.
- **Queue emptiness is not release:** an idle Comfy process can retain its model.
  A dead service or inaccessible endpoint is not an empty queue. Independently
  verified service exit and registered-work reconciliation need a separate path;
  they are not faked here with a successful queue response.
- **No new agent restrictions:** this narrows the application's observer API,
  not the tools, filesystem, network or response formats available to agents.

Focused boundary review agreed this prerequisite is smaller and more useful than
introducing an unverifiable `environmentVerified: true` flag or a premature
composed release verdict. No learner product choice needs reopening.

### Source/compatibility evidence, not implementation proof

Freshly downloaded pinned `server.py` and `execution.py` match the corresponding
bytes in the retained previously verified source archive:

- `server.py`: `6e3614c753c95b037e57e25dfc2de979de70136baad2a3abb5d2d32aaf05281e`
- `execution.py`: `bf61eed32e9db0fe87ab8c108ea21adeb948e0596242c9cc55334de4a6e451a1`

Retained prior CPU native responses include full running/pending five-field rows
and empty lists. They support fixture compatibility, **not execution of the new
reader**. Draft source/collection logs remain ignored under
`.local-evidence/slice-1/comfy-queue-review/`. No native operation was performed
during that test review; fresh implementation evidence is recorded below.

## Implemented API

Production module and types:
[`apps/server/src/jobs/comfy-queue.ts`](../apps/server/src/jobs/comfy-queue.ts).
Both local and native tests now import it directly. The draft type/loader facade
and review-only runner configuration were removed when the tests were promoted.

```ts
decodeComfyQueue(httpStatus, body): { running: string[]; queued: string[] }
createComfyQueueBinding(config, io?): {
  observe(signal): Promise<{
    kind: 'comfy-whole-queue';
    service: ProcessOwner;
    running: string[];
    queued: string[];
  }>;
}
```

Use existing `OwnedTransportConfig`/`OwnedTransportIo` and error categories.
Capture configuration/owner at binding construction. Expose `observe` only,
performing exactly one GET `/queue` per call over the captured owner's verified
connection. Identity failure before HTTP sends no HTTP bytes. Response completion,
identity recheck, byte limit, abort and original request deadline remain the
existing transport's responsibility, not a second custom HTTP implementation.

The decoder requires exactly the two named array fields. Each row has five
entries: a finite numeric priority, canonical lowercase hyphenated UUID, graph
object, metadata object, and an array of string output-node IDs. Objects cannot
be null/arrays. Priority need not be integer/positive/unique. Do not normalize an
invalid ID or silently discard invalid/duplicate rows. Unknown top-level fields
fail the pinned schema instead of hiding a diagnostic/partial response.

Return fresh ID arrays and a fresh service-identity copy; caller edits cannot
retarget future observations. Return no prompt/metadata payload, `terminal`,
`ownerKnown`, `nativeQueueEmpty`, `gpuClear`, `resourcesReleased` or dispatch flag.
A whole-queue result deliberately does not satisfy `ReleaseObservation`.

## Approved local cases — 48

[`tests/contracts/comfy-queue.test.ts`](../tests/contracts/comfy-queue.test.ts)

| Group | Cases | Assertions |
|---|---:|---|
| Valid decoder output | 3 | Explicit empty; all unrelated IDs and wire order; independent arrays/no payload leakage; negative/fractional/repeated priorities and non-v4 UUIDs. |
| Invalid envelope | 8 | Null/array/single-job projection, either missing list, either non-array list, diagnostic envelope. |
| Invalid rows | 15 | Wrong row kind/length, string/NaN/infinite priority, empty/non-string/noncanonical/non-hex/uppercase ID, invalid graph/metadata/output shapes. Each is tried in both arrays after a valid row. |
| Duplicate identity | 3 | Within running, within pending, or across both. |
| Invalid HTTP status | 4 | 204/302/404/500 cannot certify an empty queue. |
| Read-only owned HTTP binding | 15 | GET-only/tag/service identity; fresh observations; config/result independence; identity before/after response; error propagation; complete schema/JSON; disconnection; byte cap; pre/active abort; stalled-body timeout; no cached success after a failed read. |

The 33 decoder cases are synthetic values. The 15 binding cases use real loopback HTTP and the test process's own procfs/socket
identity, with synthetic queue responses. The identity-after-response case uses
the existing identity fault seam. They start no subprocess, Comfy, model, provider
or LAN service and never signal a workload. Socket cleanup affects only test
clients; the fixture listener stays up until explicit test teardown.

Fixture teardown aborts every outstanding caller before closing its servers. A
separate 1.5 s request-entry guard retires the active-abort call if the endpoint
is never reached; it does not change the production request budget.

The active-abort case uses a 10 s request deadline but the default 5 s test
watchdog: waiting for timeout cannot satisfy it. The stalled-body case requires
one complete-request timeout and exactly one GET, not a successful prefix or
retry. These test inherited binding behavior; unchanged transport regressions
continue covering its deeper socket/remaining-budget boundaries.

## Executed native assertions — two existing CPU scenarios extended

[`tests/cpu-native/comfy-cancellation.test.ts`](../tests/cpu-native/comfy-cancellation.test.ts)

Keep both existing queued/running cancellation scenarios and their independent
node events, terminal status and owned cleanup assertions. At every stable queue
checkpoint, while gates are held and no submit/release/cancel is occurring:

1. Record a direct owned raw `/queue` response.
2. Invoke the **actual new binding once**, with no fault-injected identity.
3. Retain its tagged normalized result in the ignored native evidence directory.
4. Record another direct raw `/queue` response; require before/after agreement.
5. Require the new result to name the same captured service and match every ID.
   Existing scenario assertions also require the intended blocker/target/survivor
   IDs, independently of the raw decoder. Reject drift instead of averaging it.

The successful native proof covers busy (running + queued), surviving unrelated jobs,
and a drained queue **while the same service is still healthy**, before teardown.
It remains real pinned Comfy plus a synthetic cooperative CPU node—not H3/YuE2,
GPU release, cancellation latency certification or the formal 12-case live suite.
The old two-case native pass remains historical evidence for its old source.
These extended assertions ran separately from a new audited source snapshot.

Reuse the accepted opt-in Dundee fixture: isolated base/user/custom-node paths,
`--cpu`, no models, fresh loopback port never 8188, pinned Python/Comfy/source,
finite outer transient user-service runtime and independently checked teardown.
Personal Comfy remained untouched. The unit was independently inactive/not-found
afterward; successful job-stop/queue assertions preceded each fixture teardown.

## Executed verification — 22 October 2026

| Check | Observed result |
|---|---|
| Initial implementation | **48/48** approved tests and typechecking passed immediately. No reproduced/repaired defect or meaningful red result is claimed for this checkpoint. |
| Promoted default suite | **316/316**, 14 files, plus typechecking on development Node **24.1.0** and Dundee's pinned Node **24.22.0**. Existing 268 regressions unchanged. No skips/expected failures conceal failures. |
| Direct Node load | Actual module imported and decoded an empty fixture without Vitest on development Node 24.1.0. This is a synthetic decoder smoke, not native proof. |
| Real pinned Comfy | **2/2 extended CPU scenarios**, no retries, in a finite transient user service. Native unit exited **0**, runtime **38.314 s**, reported **683.3 M** peak memory and **0 B** swap. |
| New reader observations | **Six** actual binding calls matched both surrounding raw queue responses and intended IDs. Four busy/intermediate states retained unrelated jobs; two final queues were empty while their same services were still healthy. |
| Queued/running targets | Queued target never started before or after drain. Running target recorded `started → interrupted`, matching native cancelled/error/completed=false history; its gate stayed closed. All three unrelated fixture jobs completed normally. |
| Separate teardown | Both owned services exited **0** after their own **SIGINT**, with no escalation. Independent procfs/listener checks found each captured PID/group/listener gone. The proof and preparation units were inactive/dead/not-found afterward. |
| Personal service | PID **1216557**, group/session **1216557**, start ticks **41044381**, boot and port **8188** identity unchanged. Read-only compute listings before/after remained that PID at **234 MiB**; this is not continuous allocation monitoring. |

CPU request-to-observed-stop diagnostics were **286.197 ms queued** and
**366.001 ms running**. These are cooperative CPU fixture measurements, not an
H3/YuE2 stopping guarantee or product SLA.

Focused implementation review found no blocker. Independent evidence review
recomputed all 99 source hashes, all six queue comparisons/intended IDs, node
events, terminal history and final service-health responses. It agreed with the
local/native counts, cleanup and proof boundaries. The standalone post-run audit
checks queues/events/identity/source/cleanup; the native tests and separate
receipt review additionally check terminal history and final `/system_stats`.
Do not treat the standalone audit as an independent execution of every assertion.

### Exact source and retained evidence

- Reader SHA-256: `82f1ad26221343c1f9ed6eb361aefcbcb6c9c9abd3eacd82c915588e3b5a4425`.
- Audited **99-file** source snapshot on Dundee:
  `~/.local/share/music-video-studio/proof-sources/comfy-queue.9d492be1-7ccc-4923-ab2f-934b1734ece2/`.
- Source archive SHA-256:
  `3de4531025f19cf9bd061017686ade728d113324534c96ae010cd0da5bb5c5ce`.
- Native unit:
  `studio-comfy-queue-9d492be1-7ccc-4923-ab2f-934b1734ece2.service`.
  Outer runtime **600 s**, stop budget **30 s**, `KillMode=control-group`, private
  umask. A separate bounded `-prepare.service` installed the lockfile's test
  dependencies in the fresh snapshot and passed typecheck/default tests first.
- Queued fixture: `comfyui-cancellation.09a8714a-4c02-418c-9f64-8dab39371f52`,
  owned PID **2042325**, port **35157**.
- Running fixture: `comfyui-cancellation.f54a8e1f-a046-49a1-8ac1-475da070ae40`,
  owned PID **2042445**, port **33701**.
- Ignored `.local-evidence/slice-1/comfy-queue/` retains initial/final local logs,
  direct-Node result, source archive/hash manifest, before/after observations,
  exact preparation/native commands and exit statuses, unit logs/status,
  audit script and the two native evidence directories. Native records include
  raw responses, six normalized snapshots, intents, events, cancellation results,
  startup/source observations and separate service-cleanup receipts.

All selected source files were hash-checked before and after execution; installed
critical Comfy files were checked separately against the pinned official archive.
Private context, credentials, local skills and media were excluded from the source
snapshot. No existing Python installation or personal Comfy configuration was
modified. No provider call, model download or model/GPU inference occurred.

This closes only the **whole-queue input**. It does not establish resource
release, all-process visibility, MPS/translated PID attribution, shared leasing,
native model cancellation or bidirectional handoff. Synthetic malformed/HTTP/
identity/timeout cases are not live fault injection against native Comfy. Slice
1/G4 and the formal 12-case live suite remain open.

## Learner implementation check

```bash
npm run typecheck
npm test -- tests/contracts/comfy-queue.test.ts
npm test
```

The focused command uses synthetic payloads and local loopback fixtures, not
Comfy, a model or a GPU. Read `decodeComfyQueue` for the complete-data contract,
then `createComfyQueueBinding` for the fixed read-only route and fresh service
identity copy. The already-verified transport still owns socket identity,
response limits, abort and request lifetime; we did not write a second HTTP
client. There is no browser change yet.

## Review checklist

- [x] Commit accepted census as `cc699e4`; recheck 268/268 and typechecking.
- [x] Inspect missing whole-queue input and verify pinned source/retained examples.
- [x] Draft/typecheck/collect 48 local cases plus two extended native scenarios.
- [x] Complete focused static review; added discriminating UUID counterexamples
  and teardown-owned caller retirement/bounded request-entry wait. Reviewer
  confirmed both findings closed; no tests or native fixtures ran during review.
- [x] Learner approves this batch with “looks good” before implementation.
- [x] Implement; pass 48 cases and 316/316 plus typechecking on both hosts.
- [x] Execute 2/2 extended native CPU scenarios and independently review evidence.
- [x] Learner accepts the implementation with “looks great, go for it”; commit
  the verified working step before the next tests-first batch.

Slice 1/G4 stay unchecked. Next after this prerequisite: verified composition of
owned identities/remembered descendants, full queues or independently established
service exit, and GPU observations; shared leasing and actual GPU cancellation/
bidirectional handoff. No browser/slice-2 advancement or new product scope.
