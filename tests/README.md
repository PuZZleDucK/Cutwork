# Slice 1 tests

Start with [the original approved test review](../devpost/slice-1-test-review.md) and [current progress/regression evidence](../devpost/slice-1-progress.md). The first application modules exist; the slice is not complete.

## Safe review commands

From the repository root using Node 24:

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm run test:list
npm run test:live:list
```

`npm ci` installs local development dependencies from the lockfile. The other commands typecheck or collect test definitions; they do not run tests, setup hooks, agents or generators. Listing explicitly disables static parsing so parameterised cases expand. Keep test modules free of top-level native side effects.

## Local contract execution

```sh
npm test
```

The default suite includes only `contracts/`. Its payloads are synthetic; temporary-file, child-process and loopback HTTP fixtures exercise real local OS behavior. It cannot prove live model access, generation quality, GPU use, raw-frame origin or native stop latency.

The facade in `support/slice1-contract.ts` is bound directly to application modules through `support/slice1-driver.ts`; there is no separate fake implementation. **The original 78 approved cases pass.** The eight implementation-review cases first reproduced failures, were approved by the learner, and then passed after fixes. No skips or expected-failure annotations hide them. The fixes preserve exact entered-duration intent, snapshot asynchronous metadata at entry, distinguish native queue state from application cancellation state, and match output identity/seeds to the recorded call.

The two assertions in `contracts/provider-runner-review.test.ts` were approved and now pass after fixes. They launch only harmless local Node fixtures, not Codex/Claude or native generators. A failed prompt delivery now produces an explicit failed application outcome while preserving the actual CLI exit code. SIGINT/SIGTERM handling performs bounded, identity-checked cleanup; unconfirmed termination stays `reconciling`. Fixture teardown uses independent ownership evidence and a self-expiry backstop. These local checks do not measure GPU stopping latency or certify unregistered native descendants.

## Owned Comfy binding and CPU cancellation proof

The accepted CPU checkpoint passed **189 default cases**, including 39 cancellation/handoff
controller cases, 58 owned HTTP/decoder cases, nine shared-transport cases and
five CPU-proof safeguard cases. These use synthetic workloads/data, not native
Comfy or GPU inference. See the [binding review](../devpost/comfy-native-test-review.md)
and [CPU implementation/evidence review](../devpost/comfy-cpu-test-review.md).

The separate `cpu-native/` suite passed **2/2 on Dundee** with real pinned Comfy
and a deliberately cooperative gate-controlled CPU node. It proves queued/running
targeted cancellation while unrelated jobs survive; actual interruption is
checked separately from natural completion or teardown. It does not establish
GPU stop latency, GPU resource release or the formal 12-case live suite.

Collection is safe and does not start a service:

```sh
node node_modules/vitest/vitest.mjs list --config vitest.cpu.config.ts --no-staticParse --json
```

Native execution is explicit, on Dundee's pinned runtime from an audited source
snapshot, **inside an isolated transient user service** with a finite outer
runtime/stop budget and control-group cleanup:

```sh
STUDIO_CPU_COMFY=1 STUDIO_DATA_ROOT="$HOME/.local/share/music-video-studio" \
  "$HOME/.local/share/music-video-studio/tools/runtime/node-v24.22.0-linux-x64/bin/node" \
  node_modules/vitest/vitest.mjs run --config vitest.cpu.config.ts --reporter=verbose
```

Do not run against personal Comfy or change its configuration. The fixture uses
a fresh loopback port (never 8188), isolated base/custom-node/user directories,
verified source/recipe bytes and the existing isolated Python. It refuses an
inherited `extra_model_paths.yaml`. Native receipts retain inputs, observations,
node events and separate cleanup evidence. Success of cooperative CPU work is
not a substitute for any remaining model/GPU gate.

## Read-only NVIDIA compute observations

The [GPU observation implementation review](../devpost/gpu-observation-test-review.md)
records **38 cases** in `contracts/nvidia-query.test.ts`: 37 approved assertions
plus a meaningful red/green final-deadline regression. At the accepted GPU
checkpoint, the default suite passed **227/227 locally**, with typechecking. The review-only facade/configuration
were removed; tests import the actual product module directly.

Most cases supply synthetic output using harmless local Node subprocesses;
three use explicitly scripted child/stream events. They cover complete-output
validation, unknown/failure handling, original deadline, caller abort and bounded
query-child-only cleanup. None is a real GPU query or resource-release proof.

```sh
npm run typecheck
node --check tests/fixtures/nvidia-query-child.mjs
npm test -- tests/contracts/nvidia-query.test.ts
npm test
```

Separately, the actual production adapter ran directly on Dundee's pinned Node
24.22.0 in a bounded transient user service, without test I/O injection. Three
real NVIDIA queries succeeded in **105.791 ms**, agreeing with independent
before/after CLI output. Personal Comfy's identity/listener remained unchanged;
all query children exited and the proof unit finished successfully. This native
success does not prove native timeout recovery, model cancellation, total GPU
allocation, resource release or dispatch readiness. The full 227-case suite was
run locally, not on Dundee in this checkpoint. See the linked review for source
hashes, retained receipts and exact proof boundaries.

## Read-only Linux process census

The [process-census implementation review](../devpost/process-census-test-review.md)
records **41 cases** in `contracts/linux-process-census.test.ts`: the approved 39
plus two canonical-input guards that passed unchanged. They now import the actual
reader directly and join the default suite: **268/268 locally**, plus typechecking.
The draft facade and review-only runner configuration have been removed.

The fixtures supply synthetic procfs bytes and controlled promises. They verify
exact identity fields, leaderless members/zombies, complete-record validation,
unknown/error handling, original deadline, prompt abort and ignored late results.
These are not actual kernel race, PID-reuse or native cancellation experiments.

```sh
npm run typecheck
npm test -- tests/contracts/linux-process-census.test.ts
npm test
```

Separately, the exact adapter ran once under pinned Node 24.22.0 on Dundee, with
no I/O injection, inside a bounded transient user service. It returned **340
identities in 226.837 ms**; all matched independent surrounding observations.
The boot ID and personal Comfy identity/listener remained unchanged; the unit
exited 0 and was independently inactive/not-found afterward. No GPU operation
or workload signalling occurred. This is a non-atomic visible-procfs census,
not host-namespace coverage, ownership, release or dispatch proof. The complete
268-case suite ran locally, not on Dundee in this checkpoint. See the linked
review for retained source hashes, receipts and detailed boundaries.

## Whole Comfy queue reader

The [implemented queue review](../devpost/comfy-queue-test-review.md) records the
approved **48 cases** now in `contracts/comfy-queue.test.ts`. They passed first
implementation and import the real module directly; the draft loader/config
were removed. The default suite now passes **316/316** with typechecking on both
development Node **24.1.0** and Dundee's pinned **24.22.0**. No meaningful red or
reproduced defect is claimed for this checkpoint.

```sh
npm run typecheck
npm test -- tests/contracts/comfy-queue.test.ts
npm test
```

The focused tests use synthetic queue data and real local loopback/procfs
fixtures, not models or native Comfy. The reader always performs a fresh owned
GET `/queue`, retains every ID, rejects malformed/ambiguous responses and returns
no release/dispatch verdict. Empty queue is not a stopped or unloaded service.

Separately, the two existing real-Comfy CPU scenarios were extended and rerun
from a new audited **99-file** snapshot on Dundee: **2/2 passed**, with **six**
actual reader results matching raw observations before/after and intended IDs.
Unrelated jobs completed normally. Final empty queues and service health were
asserted before separate SIGINT-only exit-0 cleanup; independent checks found
both owned PIDs/groups/listeners gone. Personal Comfy on 8188 and its before/after
compute observation remained unchanged. The bounded unit exited 0 and was then
inactive/not-found. See the linked review for exact source/hashes/commands.

No GPU/model/provider work ran in this proof. Native queue/CPU success does not
close resource-release, lease, actual generator cancellation/handoff or any
remaining G4 gate. The older CPU checkpoint above remains historical evidence
for its original source; this is a fresh run of the extended scenarios.

## Additional H3 diagnostics

Additional development diagnostics (not part of the 78 approved contract cases):

```sh
python3 -m unittest discover -s tests/diagnostics -p 'test_h3_*.py' -v
```

All **34** pass: seven graph cases, 13 conditioning/metadata/audio-profile
cases, five Linux process-ownership cases and nine approved polling-regression
methods (with subcases). They check exact 64-bit seeds,
native frame-grid wiring, sample-exact audio intervals and post-song silence,
Comfy metadata fingerprints, native audio/mux length differences, and owned
group cleanup even when the leader exits first. A regression covers the
observed interval when `/proc` shows a zombie before its exit is waitable.
The polling fixtures reproduce transient history/final-queue failures, immutable
deadlines, late/invalid responses, stop/exit handling and no POST resubmission.
A separate owned Python child checks actual whole-body alarm interruption and
handler restoration; it has a five-second parent teardown backstop. See the
[approved regression review](../devpost/h3-polling-test-review.md).

These diagnostics require local FFmpeg/FFprobe and launch only their own
short-lived process fixtures. They load no models, call no providers and start
no Comfy service. Separate opt-in CPU probes are described in
[the H3 integration](../integrations/h3/README.md); their real Comfy outputs
still do not constitute H3 inference or a native live-suite pass.

## Separate provider capability probes

Additional local launcher diagnostics, separate from the 78 approved cases:

```sh
node --test tests/diagnostics/test_provider_media.mjs
```

All **five** pass. They check read-only planning, exact guidance snapshots and
64-bit seed strings, fresh attempt identity, ordinary full-access launch flags,
runtime-root precedence, opt-in gates, and retaining `reconciling` when process
exit is uncertain. They invoke harmless local Node subprocesses only. The
initial missing-module run was scaffolding evidence, not a behavioral failure.

`scripts/provider-smoke.ts` runs a real, billed provider task, gated by `STUDIO_LIVE=1` and the Dundee hostname. It is not part of the default test suite. The successful Codex and Claude attempts are recorded in [slice 1 progress](../devpost/slice-1-progress.md), including how the pinned runtime was selected. Both created research, score and script artifacts; native session metadata was inspected separately for actual model/tool identity, and the scripts were independently rerun. Those two regressions are now approved and fixed; normal opt-in and pin checks still apply.

The probe itself checks launch/input success and nonempty output/files, **not** native model identity or musical quality. Do not treat that exit code alone as provider-contract completion. `runProvider` records the provider CLI's Linux process identity; it is not yet a durable scheduler, a cancellation API, or proof of ownership of arbitrary descendants. Provider cancellation/Debug and the native live suite remain outstanding.

`scripts/provider-media-proof.ts` is the separate opt-in real-media task. It
captures a creative brief, exact guidance bytes/hashes, seeds and native attempt
IDs before invoking the ordinary provider runner. The agent authors native
requests, calls YuE2 and H3 sequentially, and writes a sparse FFmpeg export.
Its successful CLI result is deliberately only
`provider-exited-awaiting-independent-validation`: independently inspect the
session, native receipts, media and resource release. See the
[operator instructions](../integrations/knowledge/README.md) and
[observed results](../devpost/slice-1-progress.md). This script is not the
missing formal live-suite binding and must not run concurrently with other
studio GPU tasks; a durable cross-tool scheduler is still outstanding.

## Separately authorised live execution

Only after the tests, implementation and installation procedure are reviewed, on Dundee with the real service environment and a chosen project runtime:

```sh
STUDIO_LIVE=1 STUDIO_LIVE_RUNTIME=/absolute/path/to/chosen-runtime npm run test:live
```

Replace the example path deliberately. These tests do not perform setup, but the future binding will call real providers/native generators, consume credits and GPU time, and write media/evidence. Prepare prerequisites separately. There is no simulator fallback or automatic retry.

`support/slice1-live-driver.ts` is also absent. Its future methods must gather actual native observations, not agent self-reports. `closeOwnedWork` must stop only work this run owns, report failures and never perform global process cleanup. A timeout/failing test must not leave an unreported generator running; review this teardown contract when binding the implementation.

The live tests independently decode/probe generated media and read/hash every preserved PNG. Host preservation, clean install, evidence provenance, resource measurements, useful output and acceptable stopping remain additional checks listed in the review document. Merely making a suite green does not waive them.

## Reading order

1. `contracts/video-plan.test.ts`: a small timing example with concrete numbers.
2. `contracts/seeds-and-replay.test.ts`: variation versus faithful recovery.
3. `contracts/job-ownership.test.ts`: cancellation and GPU lifecycle.
4. `contracts/provider-environment.test.ts` and `media-evidence.test.ts`.
5. `live/dundee-native.test.ts`: where fixtures stop and real evidence begins.

Keep generated media and machine-specific logs out of Git (`/.runtime/` and `/.local-evidence/` are ignored). Commit only selected redacted evidence summaries after review; never credentials, provider stores or private learner context.

## Registered-work evidence composition — native scenario verified, G4 still open

The [implementation/evidence review](../devpost/registered-work-test-review.md)
records **54 cases** in `contracts/registered-work-evidence.test.ts`: 53 approved
assertions plus one reproduced/repaired final-classification deadline regression.
Tests import the production collector directly; the draft facade and review-only
runner were removed. The original **370/370** default cases passed; with the
27 diagnostic cases below, **397/397 and typechecking pass** locally and on the
exact-source Dundee snapshot. These collector cases inject all readers
and use a fake clock; they are not native release proof.

```sh
npm run typecheck
npm test
node node_modules/vitest/vitest.mjs list --config vitest.evidence-native.config.ts --no-staticParse --json
```

The separate native scenario has two failed, retained, separately authorised attempts on
Dundee with real owned CPU-only Comfy fixtures and actual read-only GPU queries.
**Both failed.** Attempt 1 stopped at an incomplete live-service census; its
post-exit window did not execute. Attempt 2 used identical source and passed the
live window, then failed its opening post-exit census on `/proc/2348632/stat`.
Later observations were retained; dead-service queue failures were never relabelled
as empty queues. Owned-service cleanup was independently verified for both runs;
personal Comfy was unchanged. Missing original errno prevents a firm cause claim.
After the approved diagnostic repair, the learner separately authorised attempt 3.
It **passed 1/1**: all four censuses succeeded, the live queue brackets were empty,
and the post-exit queue failures correctly remained failures. Those expected
`COMFY_IDENTITY` errors preserved native ENOENT/-2/open/path details. This proves
native cause propagation through the owned transport, not reproduction or
explanation of the earlier mid-census failures. Cleanup and unchanged personal
Comfy were independently verified, and focused review corroborated the evidence.

No automatic retry or relaxed assertion was used; no fourth run is authorised.
See the review before any new native execution: it requires a separately identified
audited snapshot, bounded user service and explicit opt-in. Local green tests do
not waive remaining G4 gates. Neither evidence collection nor a quiet result
authorizes handoff.

## Census-error diagnostics — approved repair

The [27-case diagnostic review](../devpost/census-error-diagnostics-test-review.md)
records learner approval, reproduced failure and repair. Tests now live in
`contracts/census-error-diagnostics.test.ts` and run in the default suite; the
temporary review config is removed. They use the actual census reader and
collector with synthetic filesystem/queue/GPU I/O. No native work is required
or authorised.

```sh
npm run typecheck
node node_modules/vitest/vitest.mjs run tests/contracts/census-error-diagnostics.test.ts --reporter=verbose
npm test
```

Before the repair, **21 failed on missing native cause fields; 6 controls passed**.
After the repair, **27/27** pass, and **397/397 default cases plus typechecking**
pass locally. Assertion bodies were not weakened during promotion. The collector
now keeps an optional shallow `Fault.cause`, without changing outer error priority,
cleanup metadata, deadlines or strict failure behaviour. This is diagnostic
propagation proof. The subsequent separately approved native pass is described
above; its post-exit transport errors exercised cause preservation, but no census
error occurred. No fourth native attempt is authorised.

## Registered-work reconciliation assessment

The accepted collector checkpoint is `3298874`. The approved
[test review](../devpost/registered-work-assessment-test-review.md) defines **45**
cases consuming actual collector output with synthetic readers/exit receipts;
implementation review adds **4** regressions, for **49** default-suite cases.
It is a descriptive reconciliation summary, not `ReleaseObservation`, a lease,
ownership certification or authorization to dispatch. A failed queue is never
relabeled empty; a service-retired summary additionally requires its independently
observed exact-identity exit receipt.

```sh
npm run typecheck
npm test -- tests/contracts/registered-work-assessment.test.ts
npm test
```

The suite now runs the production assessor. Its test-only facade retains the
independently approved type contract and compiler-checks the implementation; it
contains no behaviour. The temporary collect-only review configuration was
removed when the assertions moved into `tests/contracts/` unchanged. All **446**
default cases pass, including the existing 397. These are synthetic checks, not a
new native run or proof of actual GPU release. No further native run is authorised.

### Native assessment extension — one approved run passed

The implementation is committed as `0356682`. The
[one-run review](../devpost/registered-work-assessment-native-review.md) extends the
existing `tests/evidence-native/registered-work.test.ts` scenario with the live
assessment, actual fixture exit receipt and post-exit assessment, plus a negative
control withholding that receipt without another native read. The original
native checks and cleanup are retained. No production or fixture code changed.

Safe preparation only:

```sh
npm run typecheck
node node_modules/vitest/vitest.mjs list --config vitest.evidence-native.config.ts --no-staticParse --json
```

Both safe commands pass; one native definition is collected without running
hooks or bodies. Execution additionally requires `STUDIO_ASSESSMENT_EVIDENCE=1`;
old collector launch flags alone are insufficient. Separate learner run approval
and the documented fresh-source/host/cleanup audit remain required.

The learner explicitly approved one attempt. It passed **1/1**, exit 0, on Dundee
after fresh typechecking and **446/446** default cases locally and on the exact
snapshot. Live, confirmed-exit and withheld-receipt assessments matched the plan;
the latter two used the identical native report. Independent checks corroborated
receipt provenance/order, raw conditions, retained failed queues/GPU rows and
owned cleanup while personal Comfy was unchanged. The reviewer found no evidence
discrepancies. See the linked review for hashes, logs and limits. This is not
GPU release/handoff proof. The learner subsequently accepted this checkpoint and
selected fast mode with standing approval for necessary in-scope verification;
there is no reason to repeat this completed scenario without a new test purpose.

## Shared GPU lane checkpoint

`gpu-queue*.test.ts`, `gpu-worker*.test.ts` and `systemd-gpu.test.ts` add persisted
SQLite/worker contracts; separate real Node processes contend for the same lease.
Injected cleanup receipts are explicitly fixtures, never native release proof.

The opt-in `tests/evidence-native/gpu-lane.test.ts` launches bounded **CPU** payloads
inside actual owned systemd user units and reads actual NVIDIA compute listings.
It requires `STUDIO_GPU_LANE=1`, `STUDIO_GPU_UUID`, and an exclusive absolute
`STUDIO_GPU_LANE_OUTPUT` directory. It never invokes either model. Evidence and
exact Dundee invocation boundaries are in [the build record](../devpost/gpu-lane-build.md).

`tests/live/gpu-model-lane.test.ts` is the separate, prepared real-model lane
scenario. It requires explicit `STUDIO_LIVE=1`, `STUDIO_MODEL_LANE=1`,
`STUDIO_LIVE_RUNTIME`, `STUDIO_GPU_UUID` and a new `STUDIO_MODEL_LANE_OUTPUT`.
It is not the original 12-case integration suite. Two default proof-parser
regressions reject stale/completed sampler progress as running-cancellation
evidence; these bring the local suite to **486/486**. No real-model result is
claimed until the opt-in run and independent evidence review finish.

## Internal native coordinator

The Fastify/SQLite/client integration tests bind real loopback sockets but use
explicitly synthetic native adapters. They verify immutable inputs, no duplicate
submission, retained leases, disconnect-independent execution and bounded client
tracking. Independent shutdown/cancellation review regressions are included.
See [the implementation boundary](../devpost/native-coordinator-build.md). The
provider media proof now invokes this queue; only a new native run can establish
that updated agent-driven path.
