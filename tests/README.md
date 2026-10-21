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

The default suite includes only `contracts/`. Its fixtures are explicitly synthetic, apart from small real temporary-file snapshot checks. It cannot prove live model access, generation quality, GPU use, raw-frame origin or native stop latency.

The facade in `support/slice1-contract.ts` is bound directly to application modules through `support/slice1-driver.ts`; there is no separate fake implementation. **All 78 approved cases pass.** The eight implementation-review cases first reproduced failures, were approved by the learner, and then passed after fixes. No skips or expected-failure annotations hide them. The fixes preserve exact entered-duration intent, snapshot asynchronous metadata at entry, distinguish native queue state from application cancellation state, and match output identity/seeds to the recorded call.

The two assertions in `contracts/provider-runner-review.test.ts` were approved and now pass after fixes. They launch only harmless local Node fixtures, not Codex/Claude or native generators. A failed prompt delivery now produces an explicit failed application outcome while preserving the actual CLI exit code. SIGINT/SIGTERM handling performs bounded, identity-checked cleanup; unconfirmed termination stays `reconciling`. Fixture teardown uses independent ownership evidence and a self-expiry backstop. These local checks do not measure GPU stopping latency or certify unregistered native descendants.

## Additional H3 graph diagnostics

Additional graph diagnostics (not part of the 78 approved contract cases):

```sh
python3 -m unittest discover -s tests/diagnostics -p 'test_h3_workflow.py' -v
```

These seven cheap tests check H3 graph wiring, exact 64-bit seed serialization,
native frame-grid validation and the shared synthetic output branch. They load
no models and run no services. The separate opt-in CPU output probe is described
in [the H3 integration](../integrations/h3/README.md); its real Comfy outputs still
do not constitute H3 inference or a native live-suite pass.

## Separate provider capability probes

`scripts/provider-smoke.ts` runs a real, billed provider task, gated by `STUDIO_LIVE=1` and the Dundee hostname. It is not part of the default test suite. The successful Codex and Claude attempts are recorded in [slice 1 progress](../devpost/slice-1-progress.md), including how the pinned runtime was selected. Both created research, score and script artifacts; native session metadata was inspected separately for actual model/tool identity, and the scripts were independently rerun. Those two regressions are now approved and fixed; normal opt-in and pin checks still apply.

The probe itself checks launch/input success and nonempty output/files, **not** native model identity or musical quality. Do not treat that exit code alone as provider-contract completion. `runProvider` records the provider CLI's Linux process identity; it is not yet a durable scheduler, a cancellation API, or proof of ownership of arbitrary descendants. Provider cancellation/Debug and the native live suite remain outstanding.

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
