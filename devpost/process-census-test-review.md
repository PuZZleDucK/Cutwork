---
doc: test-review
status: approved
---

# Linux process census — implemented checkpoint

22 October 2026. **Learner approved the 39-case batch with “looks good” before
implementation. The reader now passes 41 cases and one native Dundee check;
the learner accepted the implementation with “all good”.**
Accepted checkpoint: **`cc699e4` — Verify bounded read-only Linux process census**.
The learner accepted the NVIDIA probe with “good to go”; it is committed as
**`119505c` — Verify bounded read-only NVIDIA compute observations**. Its accepted
suite was rechecked: **227/227**, plus typechecking. Slice 1/G4 remain open.

## Request and bounded next step

The NVIDIA probe reports compute PIDs, but a PID is not a process identity and
an exited parent does not tell us whether group members remain. The current
single-PID `observeProcess` helper does not enumerate remaining processes or
retain session/state information. We need that missing evidence before composing
resource-release observations for `handoffGpu`.

Implement **one read-only Linux process census**. It records the processes
visible through the server's `/proc`: PID, parent, group, session, exact start
ticks and state, bracketed by the expected boot identity. Do not yet infer
ownership, stop processes, compose a release verdict or connect it to dispatch.
This is the next native evidence input to `spec.md > C4 — Durable Jobs, GPU
Scheduler and Cancellation`, not a new product feature or architecture change.

The remaining sequence is explicit: process evidence → compose verified
ownership/queue/GPU observations → exercise those while holding the shared GPU
lease during real cancellation and bidirectional handoff. This batch alone does
not implement the latter two steps. Existing provider helpers remain unchanged.

## Scratchpad: assumptions and questions resolved

- **Use procfs, not another shell command.** The kernel documents the PID,
  parent/group/session and process-start fields in `/proc/PID/stat`, and explains
  that numeric PIDs can be reused. Read only the specific fields needed here;
  do not inspect command lines, environments, memory, credentials or other
  process content. [Linux kernel procfs documentation](https://docs.kernel.org/filesystems/proc.html#process-specific-subdirectories)
- **Retain evidence rather than decide ownership.** Keep all validated records,
  including other users' visible processes, leaderless group members, stopped
  tasks and zombies. Record start ticks as an exact decimal string. Do not turn
  a missing leader or a `Z` state into a resource-release claim.
- **A listed PID disappears while being read.** Reject this observation as
  uncertain, rather than silently skipping it. This is deliberately conservative:
  unrelated process churn can invalidate a scan. A later caller may request a
  fresh observation within its original deadline; this reader does not retry,
  cache an older success or return a partial list disguised as complete.
- **A visible census is not the entire host or an atomic snapshot.** Procfs
  visibility, namespaces, process creation/exits during the scan and unregistered
  escaped descendants remain limitations. Even a successful scan cannot certify
  that no invisible/unregistered worker exists. The later composed observer must
  verify its operating environment and registered-work coverage; no unverified
  `allHostProcesses: true` or caller Boolean solves that gate.
- **These are observer rules, not restrictions on creative agents.** No sandbox,
  tool denial, account scheme or response-format restriction is being added.

No product decision needs reopening before this bounded implementation. The
approved evidence and failure boundaries remain unchanged; no dispatch
integration is added.

### Manual compatibility evidence, not a product pass

A read-only standard-library Python check on Dundee enumerated **336** visible
numeric proc directories and read their stat records without errors in that one
scan. States observed were `S`, `I`, `R` and `Z`; the boot identity agreed before
and after. The check also independently extracted its own parent/group/session
and exact start ticks. It did not start a generator, signal a process, install a
package or modify a service. It is **not** an execution of the proposed module,
a native test pass, proof of stable future scans or host-namespace certification.
The ignored script/result are in
`.local-evidence/slice-1/process-census-review/inspect-proc.py` and
`dundee-manual-proc.json`. Existing zombies were observed, not cleaned up.

## Implemented API

Production module and types:
[`apps/server/src/jobs/linux-process-census.ts`](../apps/server/src/jobs/linux-process-census.ts).
Tests now import that module directly. The draft facade and review-only runner
configuration were removed on promotion into the default suite.

`readLinuxProcessCensus(config, signal, io?)` captures configuration and optional
test I/O callbacks before its first await. Configuration contains the expected
boot UUID from the trusted launch/host context, a whole-observation timeout,
maximum directory-entry count, and per-file byte limit. Paths are fixed under
`/proc`; they are not a browser-selected filesystem root.

Read in this order, one operation at a time:

1. `/proc/sys/kernel/random/boot_id`, matching the expected boot UUID.
2. Enumerate `/proc`; count **all** directory entries against the budget.
3. Read every canonical positive numeric PID's `/proc/PID/stat` in numeric order.
4. Read the boot ID again and verify it is unchanged.
5. Validate the final monotonic timestamp against the original deadline.

Recognised non-PID names such as `self`, `thread-self` and `sys` are not process
records. An empty PID inventory, duplicate numeric entry, zero/leading-zero PID
or unsafe numeric ID is an error, not permission to ignore a process. Every stat
record must agree with its directory PID and contain valid parent/group/session,
state and start fields. The supported modern Linux record must contain all
52 documented fields; extra numeric fields do not shift the selected values.
Parent/group/session zero is retained when present; PID
itself is positive. Unsupported/invalid state codes and incomplete or diagnostic
bytes fail. Signed ancillary values such as terminal group `-1`, negative
realtime priority and negative nice values remain valid rather than failing an
unsigned-only parser. [Linux stat field documentation](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)
Command-name bytes may include whitespace, parentheses or non-UTF8:
they must not shift or corrupt the identity fields, and are not returned.

Return only a tagged `linux-process-census`, `scope: 'visible-procfs'`, boot ID,
monotonic observation interval and sorted process records. Never return
`ownerKnown`, `resourcesReleased`, `gpuClear`, `allHostProcesses`, or a dispatch
verdict. The old `NativeOwner` and provider runner do not change in this batch.

Configuration, schema, filesystem, byte/count limit, abort, timeout and bad-clock
failures are explicit errors (`PROC_CENSUS_*`). Fail the complete observation on
missing/denied/failed reads; preserve failure as unknown at the later composition
boundary. Do not conflate an I/O failure with absence of owned work.

One original deadline covers enumeration, file reads and final validation.
Caller abort interrupts waiting and signals current I/O; a stalled callback
cannot hold the public promise forever. Late completion may not resume the scan
or publish success. This bounds waiting, not synchronous JavaScript execution or
the kernel's underlying read duration. Byte/count budgets reject oversized
results; they are not a promise about the peak allocation of a filesystem API.
There is no child-process cleanup or process signalling in this reader.

## Approved 39 cases plus two implementation guard cases

[`tests/contracts/linux-process-census.test.ts`](../tests/contracts/linux-process-census.test.ts)

| Group | Cases | Required evidence |
|---|---:|---|
| Valid and identity-preserving observations | 5 | Exact read-only path order; sorted complete records; robust command-name parsing/exact ticks; signed ancillary fields and non-running states; leaderless member and zombie retained; fresh PID-reuse identity rather than cache. |
| Directory validation | 5 | No PIDs, duplicate/zero/leading-zero/unsafe numeric PID cannot look like a complete census. |
| Stat validation | 9 | Wrong PID, delimiters, truncation, state, parent, group, session, start or trailing diagnostic invalidates the whole observation. |
| I/O and boot evidence | 9 | Listed-process ENOENT/EACCES/EIO, directory failure, both boot-read failures, malformed/wrong/changed boot all remain errors. |
| Configuration, limits and input capture | 5 | Invalid/pre-aborted requests read nothing; all directory names count; both file types are bounded; input/callback mutation cannot retarget an in-flight scan. |
| Lifetime and clock | 6 | Prompt abort before timeout, true remaining-time deadline with late-result rejection, final-read cost, exact final timestamp boundary, nonfinite/backward clock. |
| Canonical-input guards | 2 | A trailing newline cannot make an invalid configured boot ID valid or coerce a directory PID into a different path. |

## Fixture and verification boundary

All **41 cases now run in `npm test`** against the actual reader through synthetic
procfs bytes and controlled promises, not a fake product implementation.
Collection/typechecking alone still invokes no hooks or fixture reads. The
pre-implementation draft was collected separately; an absent module would have
been a prerequisite failure, not a meaningful behavioral red test.

These assertions do not use real PIDs for signalling, spawn descendants, query
NVIDIA, start a model, modify procfs or exercise actual kernel process races.
PID reuse, disappearing processes, permissions and zombies are explicit simulated
inputs, not claims of native fault injection. Fake timers discriminate an
original 100 ms deadline from a fresh phase timeout: 80 ms is already spent,
then a stalled stat read has only 20 ms left. The active abort/late-result checks
require settlement without advancing to the deadline and verify there is no
continuation afterward. A separate calibrated last-clock-read case reaches the
exact deadline at final validation/timestamp capture; it guards the edge missed
in the first NVIDIA implementation, without hardcoding an internal clock count.

## Executed verification — 22 October 2026

1. The approved **39/39** tests passed against the first implementation, with
   typechecking. Two added canonical-input guards passed unchanged, giving
   **41 cases**; they are coverage additions, **not** reproduced/repaired bugs.
   A suspected regex trailing-newline issue did not reproduce in the actual
   JavaScript runtime. No behavioral red result is claimed for this checkpoint.
2. The cases now join the default suite: **268/268** locally on development Node
   **24.1.0**, plus typechecking. No new census assertion runs a native kernel
   race, generator or NVIDIA query. No skips/expected failures hide a failure.
3. The exact production module ran **once** on Dundee under pinned **Node
   24.22.0**, using its default filesystem binding, not a fixture I/O callback.
   The fresh transient service had a 60 s outer runtime, 5 s stop budget and
   control-group cleanup. The census had a **5 s** whole-call budget,
   **10,000-entry** directory limit and **8,192-byte** per-file limit.
4. The actual reader returned **340 unique, sorted process identities** in
   **226.837 ms**: 241 `S`, 97 `I`, 2 `Z`. Independent standard-library Python
   procfs observations before and after contained 341 records each (including
   each temporary Python observer). All 340 stable identities were present and
   matched the reader; **zero returned identities were unmatched**. Process
   state was retained but not required to remain constant between observations.
5. The boot ID agreed throughout. Personal Comfy retained PID **1216557**, parent
   **1**, group/session **1216557**, start ticks **41044381** and its listener on
   **8188**. No workload was signalled or reconfigured; existing zombies were
   observed, not cleaned up. The proof unit exited **0**, reported **536 ms**
   runtime, **39.6 M** peak memory and **0 B** swap, and was independently observed
   inactive/not-found afterward.
6. Focused review found no remaining implementation blocker. Independent receipt
   review recomputed the 340 matches, checked source/harness hashes and confirmed
   the retained native result and 268-case test log. Typechecking has a separate
   retained exit-0 log as well as the combined local verification log.

This native check proves **one successful, non-atomic visible-procfs census**.
It does not fault-inject actual PID reuse, process disappearance, permissions,
abort or timeout. Those have synthetic evidence only. No GPU query/model work,
resource-release decision, shared leasing or live cancellation occurred here.
The 268-case suite ran locally, not on Dundee; Dundee ran the actual adapter
without Vitest. No product-level agent restrictions were introduced.

### Exact source and evidence

- Source SHA-256:
  `d1076059d03ee628561d3b72b814d2921d812338e7fa8053ba525929674c2837`.
- Dundee source snapshot:
  `~/.local/share/music-video-studio/proof-sources/process-census.19158480-0898-4dce-ae93-f02be966b1e2/`.
- Transient unit:
  `studio-process-census-19158480-0898-4dce-ae93-f02be966b1e2.service`.
- Ignored evidence: `.local-evidence/slice-1/process-census/`, including
  `first-run.txt`, `canonical-guard-pass.txt`, `current-tests.txt`,
  `contracts.txt`, `typecheck.txt`, `native-proof.mjs`, `independent-proc.py`,
  `native-receipt.json`, `run-metadata.json`, `native-exit-status.txt`,
  `dundee-preflight.txt`, `dundee-native.txt` and `dundee-postcheck.txt`.
- Uploaded module and both proof-script hashes were captured. The harness
  checked the module hash before calling the production reader. All native
  receipts and machine process inventories remain ignored, not public assets.
- Earlier `.local-evidence/slice-1/process-census-review/` is draft/manual
  compatibility evidence, not a substitute for the native adapter result.

## Learner implementation check

```bash
npm run typecheck
npm test -- tests/contracts/linux-process-census.test.ts
npm test
```

The focused test command supplies synthetic filesystem data; it does not scan
real procfs or signal processes. Read the `processRecord` parser first, then
`readLinuxProcessCensus` and its bounded `operation` helper. The key distinction
is a returned visible census versus a failed observation: neither independently
establishes ownership or permits dispatch. There is no browser change yet.

- [x] Commit accepted GPU probe as `119505c`; recheck 227/227 and typechecking.
- [x] Inspect existing contracts, kernel documentation and manual compatibility.
- [x] Draft/typecheck/collect 39 cases, then strengthen them after focused review.
- [x] Learner approves the 39-case batch with “looks good” before implementation.
- [x] Implement and pass 41 cases; promote and pass 268/268 plus typechecking.
- [x] Execute the actual read-only adapter on Dundee; independently review evidence.
- [x] Learner accepts the implementation with “all good”; committed as `cc699e4`.

Slice 1/G4 remain unchecked. Composed ownership/queue/GPU release observations,
shared leasing, real GPU cancellation/handoff and the formal 12-case live suite
are still unfinished. The census is evidence, not a release verdict.
