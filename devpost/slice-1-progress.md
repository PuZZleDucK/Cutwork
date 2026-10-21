# Slice 1 — implementation checkpoint

21 October 2026. **Incomplete; learner-requested partial checkpoint, not slice completion. Do not advance to slice 2.**

The learner approved the original test batch and then the eight implementation-review regressions, and completed provider authentication. Those eight fixes now pass. Real tasks through both requested provider/model pairings also succeeded. A subsequent launcher review found two failure paths. The learner approved their local-process assertions; both fixes now pass. No native music/video generator has run through this build.

## What is implemented

- Application-owned request/evidence types under `packages/core/src/contracts/`.
- [Provider launch planning](../apps/server/src/providers/launch.ts): captured context, fixed provider/model, per-project cwd, stdin prompt and ordinary autonomous CLI flags.
- [Provider execution](../apps/server/src/providers/run.ts): creates a unique attempt directory, saves the prompt/receipt, starts the CLI, records its Linux PID/group/start/boot identity and retains private stdout/stderr. It inherits normal configuration/tools; no forced agent response schema. Handled SIGINT/SIGTERM now initiate bounded identity-checked cleanup; input delivery contributes to explicit task success. This is not a durable scheduler or native descendant registration/cancellation implementation.
- [Environment planning/readiness decisions](../apps/server/src/setup/readiness.ts): distinct Python paths and observed prerequisite checks, not an actual Python installer.
- [Frame/sample planning](../packages/core/src/time/video-plan.ts): requested/native counts, sample intervals and post-song silence. Exact decimal intent uses rational arithmetic for duration warnings; covering frames do not redefine requested duration.
- [Seeds](../apps/server/src/generation/seeds.ts) and [input capture/replay](../apps/server/src/generation/capture.ts): native-domain integer strings, metadata copied before asynchronous I/O, and checksummed file snapshots. Native replay execution is not implemented.
- [Media-evidence decisions](../apps/server/src/media/validate-clip.ts) compare expected job/seed stages to observed evidence. [Cancellation/GPU decisions](../packages/core/src/jobs/cancellation.ts) distinguish application state from observed native queue state. These functions do not themselves observe native files, kill processes, maintain a durable scheduler or enforce a live GPU lease.
- [Runtime preparation](../scripts/prepare-runtime.sh): explicitly invoked, version-pinned, user-owned Node/provider installation, **not** the complete release bootstrap, application service or generator setup.

The [test adapter](../tests/support/slice1-driver.ts) contains imports/wiring only. Production code does not import test fixtures or implement an alternate fake driver.

## Verification results

| Check | Observed result |
|---|---|
| TypeScript check | Passed, including the new provider-runner assertions. |
| Approved contract suite | **78 passed**, including all eight earlier regressions and both provider-runner assertions. Local decision/file-snapshot checks, not GPU evidence. |
| Provider-runner regression proof | Original red run: 76 passed / 2 failed. After approval and fixes: **78/78 passed**. Actual native exit code is retained; input-delivery failure cannot be successful. A handled probe signal stops its verified CLI group and records uncertainty if exit is not confirmed. |
| Native/live suite | **Not run.** No native generation binding or verified model/generation recipe exists. Provider probes and the YuE2 dependency proof are separate evidence, not a passing 12-case live suite. |
| Runtime recipe | Installed/verified Node **24.22.0**, Codex **0.163.0**, Claude Code **2.1.306** on Dundee. A second invocation verified existing pins without reinstalling. Node archive checksum checked; npm lockfile supplies package integrity. |
| Existing runtime defaults | After runtime preparation, Dundee's shell still selected Node **22.1.0** and Python **3.12.3**. No shell profiles or system defaults changed. |
| Host Python observations | Observations matched around runtime/CLI preparation and all three YuE2 dependency attempts (one checksum rejection, corrected installation, repeat). Same defaults and visible system package metadata; not a byte-for-byte host audit. |
| User-service media check | A transient user-systemd task encoded, decoded and probed a **synthetic** 0.5-second test pattern/tone: H.264, 640×480, 24/1 fps, 12 frames; AAC, 48 kHz, stereo. Absolute pinned Node worked in that context. This does not prove the not-yet-built application service. |
| Provider authentication | After the learner's sign-in, both pinned CLI authentication-status commands exited **0**. Credential contents were not inspected or copied. |
| Provider capability | Both real CLI tasks exited **0**, used the requested models, left research/score/script files in the correct project and returned natural-language responses. Native session/tool metadata was inspected separately; timing scripts were inspected and independently rerun. |
| YuE2 dependencies | Corrected installation and repeat invocation passed; identical built-wheel hashes, `pip check` and imports. Transient user-service imports also passed. No model load/generation/GPU memory proof. |

Raw evidence is under ignored `.local-evidence/slice-1/`. No credentials, generated music/video, private learner context or machine logs were staged. The learner explicitly requested a partial checkpoint commit of the planning, code, tests and setup progress. Course scaffolding and local screenshots are left outside that checkpoint. This does not certify the unfinished native media path.

## Approved regressions — fixed

The eight cases in [slice1-refinements.test.ts](../tests/contracts/slice1-refinements.test.ts) first reproduced failures, were approved, and now pass without weakening their expectations.

| Prior gap | Correction |
|---|---|
| Cancellation lifecycle is not native queue state (2 cases) | Independent observed `nativePhase` selects targeted queue deletion versus running interruption. Verified never-submitted work remains cancellable after entering `cancel_requested`. |
| Exact intent is not covering-frame duration (1 case) | **0.01–15.01 seconds** is exactly 15 seconds and does not warn, although covering frames `[0,361)` span longer. Exact rational duration and interval coverage are checked separately. |
| An `await` permits caller mutation (2 cases) | Capture/replay deep-copy submitted metadata at entry. This does not claim an atomic snapshot of externally rewritten files. |
| Plausible output may belong to another call (3 cases) | Reject changed native job identity, changed seed or a missing required seed stage before accepting/placing media. Actual evidence still needs an independent native reader. |

A read-only follow-up review found these fixes consistent with their tests. Evidence: `contracts-with-review-regressions.txt` (original red run) and `contracts-refinements-fixed.txt` (76 green).

## Approved provider failure paths — fixed

Read [provider-runner-review.test.ts](../tests/contracts/provider-runner-review.test.ts). These tests execute **only disposable local Node fixtures**, never Codex, Claude, YuE2 or ComfyUI. They use no provider credits/network. Teardown checks PID/start/boot identity before stopping its own deliberately leaked fixture; no unrelated process is targeted.

The learner approved these expectations with "yeah, looks good". The original failures and now-implemented corrections are retained below.

| Case | Original failure | Implemented correction |
|---|---|---|
| Prompt delivery fails but the CLI exits zero | A fixture closes stdin. The parent observes `EPIPE`, but writes receipt state `exited` and returns code 0 as if that were sufficient. | Preserve the actual native exit code, but mark the application outcome failed and expose that outcome to the probe. A successful process exit cannot erase failed prompt delivery. |
| The probe receives SIGTERM | The launcher exits while its detached provider fixture continues running. The test then stops that exact fixture in cleanup. | A handled probe interruption stops and waits for the registered provider process before leaving. Use identity-checked bounded cleanup and report uncertainty/failure; do not claim arbitrary native descendants were stopped. |

The two-second wait is a local harmless-fixture test budget, **not** an agreed GPU cancellation SLA. SIGKILL/power loss cannot be handled this way and still require durable ownership/reconciliation. Review also identified a need for bounded cleanup when bookkeeping fails before prompt dispatch, instead of leaving a waiting CLI indefinitely.

Evidence: `provider-runner-review-red.txt` retains the original **76 passed / 2 failed** run. `provider-runner-fixed.txt` records **78/78 passed**, after a passing typecheck. No tests were weakened/skipped. Fixture processes were cleaned up. A read-only source review found no blocker; it did not independently execute providers.

The receipt preserves `code`/`signal` and separately records `succeeded`/`inputDelivered`. SIGINT/SIGTERM handlers initiate bounded cleanup of the identity-verified provider process group, revalidating before escalation. Missing ownership or unconfirmed exit produces `reconciling`, not a stopped claim. Bookkeeping failures also trigger bounded cleanup. Ordinary environment/tools remain inherited. This still is not durable crash recovery or proof all unregistered native work stopped.

No additional approval of these assertions is needed. Next is the separate native setup/media evidence.

## Real provider capability evidence

[provider-smoke.ts](../scripts/provider-smoke.ts) gave each provider the same small task: research the official YuE2 README using normal tools, write an original ABC motif, create/run a standard-library timing script, then reply naturally. No generator installation/audio rendering was requested.

| Provider | Observed native model | Observed work |
|---|---|---|
| Codex 0.163.0 | `gpt-6.1-sol` | Native session recorded two `exec` calls. Retained research, ABC score, Python script and calculation output. |
| Claude Code 2.1.306 | `claude-opus-5-5` | Native session recorded `ToolSearch`, `WebFetch` and `Bash`. Retained research, ABC score, Python script and calculation output. |

- Both ran in `projects/provider-proof-<provider>/workspace/`, with separate UUID attempt directories under `runs/`. The launcher inherited normal user configuration/tools and used the approved autonomous flags.
- The remote invocation used product-owned Node 24.22.0 and prepended pinned Node/provider executable directories to PATH. The launcher currently uses executable names; it does **not** resolve/verify manifest pins itself. An arbitrary shell PATH does not guarantee the same versions.
- Native model/session/tool metadata was inspected rather than trusting model names in generated prose. Only selected metadata was extracted; full session logs/auth stores are not public evidence.
- Independently inspected/rerun scripts both calculated **48 frames** and **96,000 samples per channel** for two seconds at 24 fps / 48 kHz. This proves a simple script task, not generated audio, musical quality or full score correctness.
- Claude explicitly reported reading a WebFetch summary rather than raw README bytes. Research artifacts are agent-produced notes, not authoritative specifications.
- Both provider processes exited normally; their recorded PIDs were subsequently absent. This does not prove ownership/cancellation of all possible unregistered descendants.
- The probe's automated result verifies launch/input outcome, file existence and nonempty response only. Model/tool evidence and script inspection were additional checks. G2 remains incomplete: cancellation, confirmed Debug and later media-helper use need proof.

Ignored evidence: `provider-codex-smoke.json`, `provider-claude-smoke.json`, `provider-native-observations.json`, `provider-tools-verified.json`; full attempt artifacts remain on Dundee. These successful controlled runs did not encounter either reproduced failure path.

## Native setup — YuE2 dependencies/imports verified

The [YuE2 dependency recipe](../integrations/yue2/README.md) completed successfully on Dundee using a product-owned standalone **Python 3.10.19** and distinct `tools/yue2/venv/`. Verified imports: **YuE2 0.1.6**, **torch 2.10.0+cu128**, **transformers 4.57.6**, **NumPy 2.2.6**, **SoundFile 0.13.1**. `pip check` passed. The script validates the environment/base interpreter paths and disabled system-site-packages. Before/after host-Python observations matched. This is not a fresh OS test, model load, CUDA computation or 16 GB generation proof.

The recipe uses pinned/checksummed official archives, hashed public dependency distributions and a locally built source wheel. Installer-only pip configuration suppression prevents host/site pip settings from redirecting installs; creative agent configuration is untouched. Marked partial environments can be repaired without deleting unowned directories. Existing personal generators remain untouched.

**Failure retained, not hidden:** the first attempt rejected Triton 3.6.0 because the lock retained hashes from an earlier PyTorch-index resolution while the recipe installed it from PyPI. Those indexes publish different wheels under that version. Regenerating into a fresh output produced a lock matching official PyPI metadata for all 50 PyPI dependencies; torch remained pinned to its official direct URL/hash. No hash check was disabled. The failed attempt/environment was retained under its setup-job folder, and a fresh product-owned environment succeeded with the corrected lock. Its own host-Python before/after observations also matched.

Observed footprint after successful installation: about **7.1 GiB** for the YuE2 tool environment, **3.9 GiB** download cache, **91 MiB** managed interpreter, excluding future models. These are disk observations, not peak RAM/VRAM measurements. The local first failure and corrected logs are `yue2-dependency-install.txt` and `yue2-dependency-install-corrected.txt`; the all-package hash audit is `yue2-lock-metadata-audit.json`.

Repeat invocation completed successfully, producing the same source-wheel SHA256 and unchanged host-Python observations. A transient user-systemd import check also succeeded with the exact environment and versions (3.650 s, 265 MiB service-reported peak memory; this is import memory, not inference memory). A direct-URL torch requirement currently makes pip fetch its large wheel again, so this recipe is not a cheap status-only check. Model downloads, actual per-stage seeds, native cancellation, music/video generation, GPU handoff and separate Comfy/audio-analysis environments remain outstanding.

## Changes made on Dundee

Product installation files and retained smoke artifacts are under `~/.local/share/music-video-studio/`:

- `tools/runtime/node-v24.22.0-linux-x64/`
- `tools/provider-cli/codex-0.163.0_claude-2.1.306/`
- `tools/runtime/cpython-3.10.19-20260211-linux-x86_64/`, `tools/yue2/venv/` and managed `downloads/`
- `setup-jobs/yue2-dependencies.*/` holding failed/successful receipts, logs, host observations and the retained failed bootstrap environment
- `bootstrap-source/` containing prerequisite scripts/manifest/provider locks and selected TypeScript provider/core files needed for the probes
- `setup-jobs/synthetic-media-smoke-*/` containing the labelled test pattern/tone and receipt
- `projects/provider-proof-codex/` and `projects/provider-proof-claude/` containing prompts, receipts, logs and actual agent-created artifacts

npm uses normal per-user cache/log locations. The learner's logins and real tasks also create normal provider authentication/session/diagnostic state outside the studio root; no credentials were copied into the repository/chat. The YuE2 recipe installed its product-owned interpreter/environment and pinned packages, and the repeat invocation and transient service-context imports passed. No host-Python package installation, APT packages, NVIDIA driver changes, production service, login persistence policy or generator models are part of this step. No existing process was stopped or existing user work deleted. Local failure-test cleanup affected only its disposable Node fixtures.

The partial [tool manifest](../integrations/tool-manifest.json) records actual runtime/CLI pins while marking native recipes unverified. It is not a blanket licence/readiness certification. [Node's release manifest](https://nodejs.org/dist/index.json) and [checksum list](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt) support the runtime pin; [Claude's npm setup documentation](https://code.claude.com/docs/en/setup#install-with-npm) explains its native optional dependency/postinstall mechanism. Only that inspected pinned postinstall was executed after otherwise script-disabled npm installation. Authentication remains ordinary provider login; see [Codex authentication](https://learn.chatgpt.com/docs/auth) and [Claude Code authentication](https://code.claude.com/docs/en/authentication). Never paste tokens/codes into the project conversation.

## Resume point

All 78 approved local tests and typechecking pass. Provider-runner fixes are implemented and deployed in the probe source on Dundee; no further paid provider task was needed for the fixes. Local success/missing-executable sanity checks also passed. The YuE2 environment/dependency proof is complete at its stated boundary. Evidence includes `yue2-install-summary.json`, `yue2-service-imports.json`, `yue2-service-imports.stderr`, `yue2-dependency-recheck.txt` and `provider-local-sanity.json`. No install or probe remains running.

Continue slice 1 with model assets and actual receipt-producing YuE2 generation, then Comfy/H3/audio-analysis integration and the remaining live gates. Do not mark G1/G2/G3/G4 or slice 1 complete from these partial checks. The real song/video learner check and final slice commit are still outstanding; the requested partial checkpoint does not replace either.
