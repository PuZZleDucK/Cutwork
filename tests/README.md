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
