# Slice 1 — implementation checkpoint

21 October 2026. **Incomplete; learner-requested partial checkpoint, not slice completion. Do not advance to slice 2.**

The learner approved the original test batch and then the eight implementation-review regressions, and completed provider authentication. Those eight fixes now pass. Real tasks through both requested provider/model pairings also succeeded. A subsequent launcher review found two failure paths. The learner approved their local-process assertions; both fixes now pass. A subsequent direct YuE2 probe generated real audio on Dundee; H3 and the complete agent-driven media path remain unverified (continuation below).

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
| Native/live suite | **Not run.** No complete native-suite binding exists. Provider probes, dependency/model checks and the direct YuE2 audio probe are separate evidence, not a passing 12-case live suite. |
| Runtime recipe | Installed/verified Node **24.22.0**, Codex **0.163.0**, Claude Code **2.1.306** on Dundee. A second invocation verified existing pins without reinstalling. Node archive checksum checked; npm lockfile supplies package integrity. |
| Existing runtime defaults | After runtime preparation, Dundee's shell still selected Node **22.1.0** and Python **3.12.3**. No shell profiles or system defaults changed. |
| Host Python observations | Observations matched around runtime/CLI preparation and all three YuE2 dependency attempts (one checksum rejection, corrected installation, repeat). Same defaults and visible system package metadata; not a byte-for-byte host audit. |
| User-service media check | A transient user-systemd task encoded, decoded and probed a **synthetic** 0.5-second test pattern/tone: H.264, 640×480, 24/1 fps, 12 frames; AAC, 48 kHz, stereo. Absolute pinned Node worked in that context. This does not prove the not-yet-built application service. |
| Provider authentication | After the learner's sign-in, both pinned CLI authentication-status commands exited **0**. Credential contents were not inspected or copied. |
| Provider capability | Both real CLI tasks exited **0**, used the requested models, left research/score/script files in the correct project and returned natural-language responses. Native session/tool metadata was inspected separately; timing scripts were inspected and independently rerun. |
| YuE2 dependencies | Corrected installation and repeat invocation passed; identical built-wheel hashes, `pip check` and imports. Transient user-service imports also passed. |
| YuE2 models and direct generation | All 21 pinned assets and a no-download repeat check passed. A real 19.9986667-second stereo/48 kHz WAV passed independent decode/hash/seed checks on Dundee; semantic output hit the probe token ceiling. Full native suite and musical-quality approval remain outstanding. |

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

Repeat invocation completed successfully, producing the same source-wheel SHA256 and unchanged host-Python observations. A transient user-systemd import check also succeeded with the exact environment and versions (3.650 s, 265 MiB service-reported peak memory; this is import memory, not inference memory). A direct-URL torch requirement currently makes pip fetch its large wheel again, so this recipe is not a cheap status-only check. At that dependency-only checkpoint, model downloads, actual per-stage seeds, native generation and GPU checks remained outstanding; the subsequent model/music proof is recorded below. H3, cancellation, handoff and Comfy/audio-analysis environments still remain outstanding.

## Changes made on Dundee — dependency/provider checkpoint

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

All 78 approved local tests and typechecking pass. Provider-runner fixes are implemented and deployed in the probe source on Dundee; no further paid provider task was needed for the fixes. Local success/missing-executable sanity checks also passed. The YuE2 environment/dependency proof is complete at its stated boundary. Evidence includes `yue2-install-summary.json`, `yue2-service-imports.json`, `yue2-service-imports.stderr`, `yue2-dependency-recheck.txt` and `provider-local-sanity.json`. That earlier dependency/probe batch completed. See the continuation checkpoint below for current work.

Continue slice 1 from the direct native music proof below: Comfy/H3/audio-analysis integration, provider-authored generation, replay/cancellation and the remaining live gates. Do not mark G1/G2/G3/G4 or slice 1 complete from these partial checks. The real song/video learner check and final slice commit are still outstanding; the requested partial checkpoint does not replace either.


## Partial commit and model continuation — 21 October 2026

The learner requested "commit our progress so far and continue". Commit **`b698afe`** saves the approved planning, application modules, 78 passing tests and isolated runtime/YuE2 dependency preparation. The commit excludes learner-private context, auth/runtime/evidence/media, course scaffolding and screenshots. Typechecking and 78/78 tests were rerun immediately before it. This is a partial recovery checkpoint, not the final slice-1 commit or learner media check.

Subsequent work (not in that commit): a model manifest pins 21 public files totaling 7,794,656,016 bytes, including licence notices; model-weight hashes are from pinned upstream LFS metadata and 19 small files additionally match upstream Git blob IDs. A separate downloader records checksummed, resumable owned installations without Python/package/service changes. Source review found three retry/path/accounting issues; fixes passed explicitly synthetic local diagnostics (no network/GPU).

The first model download completed in `setup-jobs/yue2-models.x2k5i4q4`; local log: `.local-evidence/slice-1/yue2-model-install.txt`. All 21 files passed size/hash checks. The reviewed downloader refinements were then copied to Dundee; repeat job `yue2-models.nm22_krm` verified the installed bytes without another download. Both receipts are retained locally. The existing personal Comfy process was observed at approximately 234 MiB of GPU memory and was not stopped or modified.

The staged YuE2 helper is implemented against pinned upstream APIs. It passes separate recorded seeds through copied native requests rather than claiming three labels for one native seed; saves score/tokens/latents; and writes floating-point original audio without mastering. Synthetic helper diagnostics exercise stage handoff, provided-score behavior, semantic failure, cleanup failure and metrics failure without skipping cleanup. Receipt writes use exclusively created unique temporary files and preserve unrelated fixed-name temporary files. These are not GPU/model proof, and the helper is not yet bound to the full native suite or durable scheduler. The first direct-native probe used a fresh seed map from the existing application allocator. It is not an agent-authored request. Its verified execution is described below.


### First real YuE2 audio — direct native probe verified

Attempt `11c1be95-7114-4009-b67d-73b7fff2f126` ran as an explicitly launched transient user service on Dundee, in `projects/native-yue2-proof/workspace/`, with inputs/results under that project's `runs/<attempt>/`. No existing service was stopped or modified. The exact executed helper source hash matches the local file. The service exited 0 and was collected; its process was independently observed absent.

- **Output:** original floating-point WAV, stereo, **48,000 Hz**, **959,936 samples/channel**, **19.9986666667 seconds**. FFprobe and error-on-decode FFmpeg checks passed. Independent SoundFile inspection found finite, nonzero samples. All recorded artifact sizes/hashes matched, including the local review copy.
- **Important limitation:** score planning completed, but `semantic.truncated = true`: the explicit probe setting was 450–500 semantic tokens and generation reached that ceiling. This is an integration sample, not a completed musical composition or exact-duration contract. No fade, normalization, splice or mastering was added to disguise the cutoff. Upstream VAE decoding clamps samples; measured absolute peak was 1.0. No listening/quality approval is claimed.
- **Actual supplied seeds:** ABC `3868803824620091392`, semantic `8134981109389014333`, NAR `7544413225409237019`. These were checked against each saved native request and stage receipt. The original score text/IDs/prefix were identical across copied plans, and the earlier request retained its own seed. Decode/load correctly have no stochastic seed.
- **Timing:** helper **116.99 s** including integrity verification/load; stage measurements: load/verify 44.71 s, score 22.52 s, semantic 8.73 s, NAR 10.38 s, decode 6.28 s. Remaining time includes imports, outer model verification, saving and cleanup. Service wall runtime was 2 min 0.465 s.
- **Memory:** sampled process GPU maximum **7,756 MiB** over 85 samples (sampling can miss brief peaks); Torch peak allocated **7,781,069,824 bytes**, reserved **7,958,691,840 bytes** (Torch counters exclude some CUDA overhead). Process high-water RSS **9,970,488 KiB**; systemd reported memory peak `9.4G`, service swap `0B`. These prove this short request, not every duration/model or 8 GB compatibility.
- **Release/host checks:** after normal exit, total GPU memory returned to the observed **330 MiB** baseline, with the same unrelated personal Comfy process at **234 MiB**. This is normal completion/release evidence, not cancellation or the required music→H3→music handoff test. Host-Python observations matched before/after.
- **Review copy:** ignored `.local-evidence/slice-1/yue2-native/audio.wav`. The folder also retains receipt/request, independent summary, FFprobe result, service report, resource samples, process-exit observation and logs. Original score/tokens/latents and all stage inputs remain on Dundee under the attempt's `receipt-artifacts/`.

Current state: no model installer, native probe or resource observer remains running. All 78 approved local tests/typechecking still pass; synthetic diagnostics are additional development observations, not new approved-suite cases. H3/Comfy and analysis environments, provider-authored generation through the helper, same-call replay, queued/running cancellation, raw video frames, export and the full native suite/learner check remain to be built and proved. Slice 1 remains unchecked; continuation changes after `b698afe` are not yet committed.


### H3 investigation — decision needed before installation

Read [H3 feasibility review](h3-feasibility-review.md). Pinned ComfyUI source and model metadata were inspected; an initial four-file H3 candidate totals 35,087,209,179 bytes before dependencies or outputs. It remains a candidate, not a verified 16 GB recipe. The upstream licence review raised an issue requiring the learner's product decision. H3-specific installation/downloads are paused, with no substitute selected and no unrequested restrictions added.

The investigation changed documentation only (plus ignored local research/source). No H3 model download, new native service or generation was started; the read-only Dundee version check exited normally. Existing work and the prior YuE2 audio are unchanged. The next conversation is the licence/backend decision recorded in that review, not a repeated scope interview or a claim that the application code cannot be open source.


### H3 proceed decision — 21 October 2026

The learner explicitly approved continuing with H3 and the planned licensing-information page. The earlier decision pause is resolved; see `h3-feasibility-review.md` for rationale and the remaining public-release review boundary. Resume the separate ComfyUI environment and required-node validation. No model substitution or new agent restrictions were requested.


### Isolated ComfyUI dependency and node proof — 21 October 2026

The approved H3 proceed decision has been acted on. `integrations/comfyui/` now pins the full upstream source/dependency recipe; `scripts/prepare-comfyui.sh` installs it without touching host Python, YuE2's environment, driver/APT setup, provider configuration or personal services. This is not an agent sandbox. The recipe itself stays immutable; verified status lives in the tool manifest and this log.

- **Pins:** ComfyUI 0.42.0 at `f5c611e3849ff7219dfb7d7b251092ab8a9b51dc`; managed CPython 3.12.14/build 20260929; torch 2.13.0+cu130 and torchvision 0.28.0+cu130; Transformers 4.57.6. All 92 resolved package versions are locked. The 90 PyPI hash sets matched official release metadata; the two direct GPU-wheel hashes matched the official index. Source archive checksums are pins, not upstream signatures.
- **Fresh installation:** transient user unit `studio-comfy-deps-8f055170-87b3-437d-8604-8e4efadc5dae` completed with exit 0. Receipt directory: `setup-jobs/comfyui-dependencies.peKCyh`. Downloads/unpacking were genuinely performed on Dundee, not copied from a personal install. The managed venv reports the intended interpreter/base prefix; all locked versions, `pip check` and dependency imports pass. Before/after host-Python observations match.
- **Completed repeat:** `setup-jobs/comfyui-dependencies.CxjQFd` also exited 0, verifying the pins, venv/source ownership, package consistency and imports without re-downloading wheels. Host observations match again. Fresh/interrupted installs still conservatively require 35 GiB free; completed rechecks do not. That partial-install space-accounting limitation is documented, not claimed solved.
- **First real startup:** `comfyui-nodes.5ca42a18-c11e-4694-b7ac-ab64ff7b2ee4` correctly failed when Comfy prestartup tried to list a missing empty `custom_nodes` directory under the unique probe base. No model or workflow ran; the child exited 1. The combined repeat/probe unit remains failed as truthful historical evidence even though its dependency step passed. The helper now creates the complete base-directory layout rather than disabling custom nodes.
- **Corrected real startup:** `comfyui-nodes.39591609-5d4f-4123-af68-a23a9c1e8ac3` passed in **14.97 seconds**, with a fresh loopback-only CPU service on port 8198. `/system_stats` matched the exact launched arguments, version and CPU device. `/object_info` contained **996 registered nodes**; all **20 required nodes** were present, including H3 keyframe/audio-guide inputs, MiniMax text-encoder selection, sampler/decode and raw-image/video save nodes. Response and executed-helper hashes match the local evidence/source.
- **Cleanup:** the probe sent SIGINT only to its owned process group; Comfy exited 0. PID 1142516 was independently observed absent and port 8198 no longer listened. The personal Comfy endpoint remained on 8188; no stop/restart/configuration action was taken against it. Post-check GPU use was 330 MiB total, personal Comfy 234 MiB, utilization 0%; available disk was approximately 227 GiB. This is CPU startup/exit proof, **not** GPU execution, quantization compatibility, model loading or native generation cancellation.
- **Review and diagnostics:** focused source review led to pre-write lock/cache ownership checks, completed-install recheck logic, explicit non-`assert` proof checks and signal-safe bounded probe cleanup. Three synthetic installer-path cases and six synthetic service cases pass. The latter run the probe with `PYTHONOPTIMIZE=1` and cover correct registration, missing nodes, foreign endpoint identity, startup failure, occupied port and SIGTERM followed by SIGINT during observed cleanup. These are additional development diagnostics, not extra approved native-suite passes. Typechecking and all **78/78 approved local tests** still pass.
- **Evidence:** ignored `.local-evidence/slice-1/comfyui/dundee/` retains fresh/repeat install evidence, the failed startup, corrected receipt/log and API snapshots. `post-probe-observation.txt`, the recipe hash audit and synthetic diagnostics are also retained under ignored evidence directories. Native logs/credentials/media are not staged.

Current state: no product installer, Comfy probe or observation command remains running. No persistent product Comfy service is enabled; startup above was temporary. No H3 model weights have been downloaded and no video generated. Next are pinned model assets, the real audio-conditioned H3 workflow and raw-frame branch, measured GPU/offloading behavior, then the remaining agent/media-chain, replay, cancellation, handoff and learner checks. Slice 1 stays unchecked; these continuation changes are not yet a completed-slice commit.


### Pinned H3 download and synthetic output proof — 21 October 2026

The learner asked to proceed. No licence decision, model substitution, agent restriction or product scope was changed.

- **Pinned assets:** `integrations/h3/models.json` lists four weights and two notices, totalling **35,087,235,076 bytes**. Weight revision `e5eb578a89295337b8ff433a035929ce0279e0b6` selects the official pruned fl2va w6a8, nvfp4 text encoder, int8 video VAE and fp32 audio VAE. The licence is separately pinned at upstream revision `42ed227ee7df40d41602854ae760620d6eb651fe`. Fresh upstream metadata matched all large-file LFS hashes; both small files were downloaded locally and verified against upstream Git blob IDs. This is asset provenance, not model-load or legal-clearance evidence.
- **Installer:** `scripts/prepare-h3-models.py` prints a plan by default. Explicit installation locks the owned model root, checks space remaining after partial downloads, resumes only pinned public URLs, checks size/SHA-256 before promotion and writes per-file receipts. Bad completed partials are retained; changed installed bytes and linked managed paths are refused. The existing YuE2 installer was not refactored. Five synthetic cases pass: fresh/repeat, remaining-space accounting, corrupt-part quarantine, linked-path refusal and SIGTERM cleanup of the owned download subprocess. A focused source review found no blocker. These tests do not stand in for a completed real download.
- **Download actually started:** Dundee user unit **`studio-h3-models-3c59286e-3d8a-47df-8fdc-604b6922d1bf.service`** runs the pinned helper from `bootstrap-source/`. Receipt/log directory: **`setup-jobs/h3-models.5gy2pbr1/`**, under `~/.local/share/music-video-studio`. The unit's outer log is in `setup-jobs/studio-h3-models-3c59286e-3d8a-47df-8fdc-604b6922d1bf.log`. Installer hash `4a115fcf0ee1dacb04f0739c75f2535abdbe070a5fc687eb7ebcb98941e1d943`, manifest hash `fc4e05c3cc0ff4d347ad3279180c0eed895d60c9a93ed0c7876bfe64633a9138`.
- **Observed download state at 21:12:15 AEDT:** unit active/running, PID 1160259; receipt `state: running`. Model card is verified; first weight has **4,346,253,312 partial bytes** of 15,983,746,636. Other weights and licence are still pending. Disk available: 239,178,899,456 bytes. The unit's `Result=success` while active is **not** a completed install result. Do not start inference from partial bytes or claim model preparation has passed; recheck the receipt and perform the completed repeat verification first.
- **Authored graph:** `integrations/h3/workflow.py` connects the song audio guide to conditioning and the original joint latent to the sampler. Native frame count comes from the existing TypeScript planner; this graph does not independently translate beats. Exact seed strings become Python JSON integers without JS-number rounding. It branches the original decoded IMAGE batch to both PNG saving and video creation, with separate FLAC output. The H3 sampler/decoders have **not run**. Expected native audio is 32 kHz per pinned VAE source; later 48 kHz render resampling must be recorded, not presented as mastering.
- **First synthetic run:** `comfyui-nodes.842bc183-156a-40b0-a5aa-f6116ced4005` ran the shared output branch with distinct synthetic frames and a 48 kHz stereo fixture. Original PNG and audio checks passed. Review found a weakness in the encoded-order assertion: neighbouring colours were closer than the lossy-decode tolerance, so adjacent swaps could falsely pass. This run is retained as weaker historical evidence, not the final encoded-order proof.
- **Corrected real output run:** **`comfyui-nodes.b4a21eff-2372-4514-b042-bc8111ff01a5`**, prompt **`cd2d89b6-0afc-4b35-b6b2-17acf090838d`**, passed in **19.70 seconds** total. It uses 56 unique solid colours separated by 64 levels, versus a 5-level codec tolerance; an added pairwise-separation diagnostic guards against the earlier false positive. Comfy executed the workflow; submitted graph matched history, prompt ID was recorded before polling, and the completed ID left the queue.
- **Actual media checks:** every pixel of all **56 original 640×480 RGB PNGs** matched the expected order; encoded and pixel hashes were retained. Independent FFprobe/FFmpeg verified **H.264/yuv420p, exact 24/1 fps, 56 frames, duration 56/24 seconds**, and decoded-video colour order. This fixture's AAC stream was 48 kHz stereo. The separately saved FLAC decoded to the exact **112,000 PCM samples/channel** supplied in the fixture. This proves the output branch with synthetic images/audio, not H3 VAE output, native audio count, inference, artistic quality or the complete export path. Video SHA-256: `c7ea25b1ce89fc956f23f8c509353e128c583fd7923fc91893bd1485cb7713cb`.
- **Cleanup and boundaries:** temporary CPU service PID/group 1167899 exited 0 after its owned SIGINT; independent observation found that PID absent and port 8198 closed. Personal Comfy still listened on 8188; GPU remained at 330 MiB / 0% utilization. No product GPU model was loaded, and no persistent product Comfy service was enabled. The download unit is the one deliberate ongoing operation.
- **Checks and evidence:** 78/78 approved local tests and typechecking pass; seven additional graph diagnostics and six rerun synthetic service/cleanup diagnostics pass. The final output/helper/workflow hashes match the copied evidence under ignored `.local-evidence/slice-1/h3/dundee/comfyui-nodes.b4a21eff-2372-4514-b042-bc8111ff01a5/`. Raw logs, metadata, fixtures, original PNGs and MP4 remain ignored. No credentials or learner-private context were staged.
- **Final review/observation:** the independent reviewer rechecked the revised palette, pairwise diagnostic, exact 7/3-second FFprobe duration and source hashes, and closed the false-order finding. At **21:15:39 AEDT**, the model download was still active/running with **5,535,748,096 partial bytes** of the first weight; no inference is queued to start automatically. The recorded unit continues the download independently of this terminal session.

**Continuation point:** inspect the active download unit/receipt before further work. Require all six verified files and a completed repeat check, then execute the real two-second song-conditioned H3 request (56 native frames), with owned job identity, exact seed capture and resource observations. The normal agent-driven chain, analysis environment, seed replay, native queued/running cancellation, music→H3→music handoff, final export, full 12-case live suite and learner media review remain outstanding. Slice 1 stays unchecked; changes after `b698afe` remain uncommitted, not a completed-slice checkpoint.

### Requested partial checkpoint — 21 October 2026

The learner approved the progress and explicitly requested “commit and proceed”.
The `Checkpoint native media setup and verified Comfy output branch` commit
saves the YuE2 native helper/model preparation, isolated Comfy recipe, pinned
H3 downloader/graph, synthetic output proof and associated documentation/tests.
It is a partial recovery point, not the slice-1 completion commit. Course assets,
screenshots, private learner context, runtime media and raw execution logs are
excluded. At the pre-commit check (21:27 AEDT), H3's first weight was still
downloading (9,607,716,864 partial bytes); no H3 inference had run.
