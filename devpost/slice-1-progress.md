# Slice 1 — implementation checkpoint

## Current continuation — read-only GPU observation verified, 22 October 2026

The learner approved the **37-case** [GPU observation batch](gpu-observation-test-review.md)
with “looks good” before implementation. `apps/server/src/jobs/nvidia-query.ts`
now captures immutable input, performs inventory → compute-process → inventory
queries, validates complete bounded output, and applies one observation deadline
with separate query-child cleanup. It returns evidence, not a release verdict.

All 37 cases passed; implementation review then reproduced a final-deadline
false-success. A new regression failed before the fix and passed afterward.
Final timestamps now come from the same check that enforces the deadline.
The cases have joined the default suite: **227/227** locally on Node 24.1.0,
with typechecking. No GPU work is performed by these local fixture tests.

The exact adapter ran read-only on Dundee's pinned Node 24.22.0 without a test
I/O seam, in a finite transient user service. Three real NVIDIA queries completed
in **105.791 ms**, all exit 0/blank stderr, and matched independent before/after
CLI observations. Personal Comfy remained on 8188 with the same process identity;
only the query children exited. The proof unit exited 0 and was later inactive/
not-found. Source hashes, query inputs/outputs, timing and independent post-checks
are retained under `.local-evidence/slice-1/gpu-observation/`; the linked review
records the exact source/unit IDs. Focused review found no remaining blocker.

**The learner accepted this implementation with “good to go”; save it as a partial checkpoint.** This is one successful
native compute-context observation, not native failure-recovery, GPU cancellation,
resource release, shared leasing or dispatch readiness. Slice 1/G4 remain open;
no browser/slice-2 advancement or model/provider launch occurred in this step.

## Previous continuation — real CPU cancellation verified, 22 October 2026

The learner approved the **7 + 2** [CPU cancellation test batch](comfy-cpu-test-review.md)
with “make it so” before implementation. Extracted the shared owned HTTP transport
and implemented a proof-only gate-controlled CPU node plus separate owned Comfy
service fixtures. Nine extraction cases and five local guard cases now join the
prior 175: **189/189** tests and typechecking pass on both the development machine
and Dundee's pinned Node 24.22.0. The existing 58 binding cases are unchanged.

Two real pinned-Comfy CPU scenarios passed on Dundee in transient user unit
`studio-comfy-cpu-20261022-d559eb25` (exit 0, **37.376 s**, reported **1 G** peak
memory, **0 B** swap):

- Queued target never started, remained absent after queue drain, and did not
  disturb the held blocker or survivor; both completed normally.
- Running target produced native `execution_interrupted` plus cancelled/error/
  completed=false history and exactly the node's `started → interrupted` events.
  Its completion gate stayed closed; the unrelated survivor completed normally.

Both final queues were empty, with the same service still healthy **before**
owned teardown. Each then exited 0 after its own SIGINT; independent checks found
both captured process identities/groups and listeners gone. Personal Comfy on
8188 retained the same identity and before/after GPU compute allocation. No
model/provider work or personal-service change occurred. CPU request-to-observed-
stop intervals of **287.534 ms** and **363.458 ms** are diagnostics, not a GPU or
product latency guarantee.

Review repaired JSON-capture cancellation/deadline gaps, inherited custom-node
configuration and termination-signal propagation before native execution. The
JSON regressions have retained meaningful red/green results. Parent-termination
and failed-startup paths were not live fault-injected; successful startup/cleanup
was observed. Exact runnable source bytes and native evidence are retained under
`.local-evidence/slice-1/comfy-cpu/`; the linked review gives IDs and commands.

The learner accepted this implementation with “all good”; it is committed as
**`6e1926e`**. Slice 1/G4 remain unchecked;
shared GPU lease/resource-release observers, actual model cancellation and
bidirectional handoff, music replay, clean provider-chain/Claude evidence and the
formal 12 native cases remain open. Do not advance to the browser/slice 2.

## Previous continuation — native binding verified locally, 22 October 2026

The learner approved the 53-case [native-binding test contract](comfy-native-test-review.md)
with “looks good.” `apps/server/src/jobs/comfy-native.ts` now connects the accepted
controller to a captured local service/job: exact process/socket identity before
HTTP bytes, complete typed native response validation, targeted cancellation,
one whole-request deadline, and client-only cleanup without retries or redirects.
No global interrupt, process termination or agent restriction was introduced.

All original assertions pass. Focused review found a status-coercion defect;
meaningful red tests preceded its repair. Five supplemental cases cover that
counterexample, same-socket reuse across listener replacement and late identity
resolution after timeout. A deliberately reconnecting copy fails the socket test.
The final **58 binding tests** are in the normal suite: **175/175 passed on three
consecutive runs**, with typechecking and a direct Node **24.1.0** synthetic
GET/POST/GET controller smoke. The focused reviewer found no remaining blocker.

These checks ran on the development machine, **not Dundee**, using real local
HTTP/process fixtures with **synthetic Comfy data**. No native Comfy/H3/YuE2 job,
GPU work, remote service deployment or resource-release/lease implementation
occurred. The detailed test-review record links the retained ignored evidence
and runnable commands. The learner accepted this implementation with “proceed”; it is committed as
**`620458c`**. Slice 1/G4 and the 12-case live suite remain
incomplete; continue with an owned CPU Comfy proof, then the outstanding native
release/lease/cancellation gates, not slice 2.

## Previous continuation — native-control functions verified locally, 22 October 2026

After accepting analysis checkpoint `b064372`, the learner approved the next
26 cancellation/handoff assertions with “looks good, go for it.” The TypeScript
functions now pass those plus 13 implementation regressions: **39/39** controller
cases, **117/117** default tests, and typechecking. Direct Node loading and
owned-child retention bugs were reproduced and fixed. This is control-flow
evidence with injected I/O, **not** live native cancellation or GPU handoff.
The detailed continuation below and [test-review record](native-control-test-review.md)
give the proof boundary. The learner accepted this working step with “looks good,
continue.” The partial checkpoint is committed as **`70a40af`**; slice 1 remains
unchecked. The subsequent [native-binding test review](comfy-native-test-review.md)
contained 53 assertions (17 decoder, five socket-matching and 31 local HTTP/process
cases). It was collected/reviewed without implementation or fixture execution;
the learner then approved it before the implementation recorded above.

## Previous continuation — isolated analysis verified, 22 October 2026

The provider-media/polling checkpoint below is committed as `91a8db9`. Following
the learner's request to continue and approval of the [analysis tests](analysis-test-review.md),
the separate CPU environment/helper now pass **23 methods: 9 pure, 4 setup and
10 actual native analysis cases**. A real Dundee install and two completed repeats
passed in transient user services with unchanged host-Python observations.
Independent decoding of the retained song matches all 3,079 waveform peaks and
its original 1,576,256 samples/channel. Its 65 detected anchors and approximately
119.68 BPM are estimates, not a musical-accuracy guarantee. Detailed evidence is
at the end. The learner accepted this result with “looks good, move forward.” It is
committed as partial checkpoint **`b064372`**; no slice completion, browser integration or formal
12-case native-suite pass is claimed.

21 October 2026 historical baseline. **Incomplete; learner-requested partial checkpoint, not slice completion. Do not advance to slice 2.**

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
Commit **`49dac9b`**, `Checkpoint native media setup and verified Comfy output branch`,
saves the YuE2 native helper/model preparation, isolated Comfy recipe, pinned
H3 downloader/graph, synthetic output proof and associated documentation/tests.
It is a partial recovery point, not the slice-1 completion commit. Course assets,
screenshots, private learner context, runtime media and raw execution logs are
excluded. At the pre-commit check (21:27 AEDT), H3's first weight was still
downloading (9,607,716,864 partial bytes); no H3 inference had run.

### Owned runner and real-song conditioning — 21 October 2026

Continuation after `49dac9b` is implemented and verified at the boundary below,
but **not yet committed**. Slice 1 remains unchecked. No product scope, agent
capabilities or licence decision changed.

- **Request preparation:** `scripts/h3-proof-request.ts` calls the existing
  TypeScript timing planner and fresh-seed allocator. The first two-second
  placement is [0,48) at 24 fps, with 56 native frames. It captures a real
  prior YuE2 source hash and prompt; it does not start generation. Its prompt
  was developer-authored, not a provider-authored chain. The seed remains an
  exact decimal string (`3132518588584125900` for this test request).
- **Conditioning:** `integrations/h3/media.py` captures and verifies the source
  PCM WAV, cuts exact samples and pads only beyond the song. It separately
  handles wholly post-song silence. Tests cover normal intervals, native
  overshoot, partial/whole silence, changed input hashes, invalid plans and
  unsupported compressed input. The current proof accepts 48 kHz stereo PCM
  WAV only; broader import conversion is not implemented.
- **Execution:** `integrations/h3/generate.py` owns a temporary loopback Comfy
  service, saves PID/group/start/boot identity and exact argv, records prompt
  ID before polling, preserves the native graph/history and validates all
  output branches. It observes resources and stops only its own service
  group. The `--fixture` CPU mode is explicit and never a model-failure
  fallback. Native mode also rehashes all six model files/notices, but has
  not been executed. Neither this helper nor its lock is the durable GPU
  scheduler or the full cancellation API.
- **First real failure retained:** attempt
  `3e2f313b-d6d4-4219-acd0-40c5ba77bdcb` completed its CPU workflow but strict
  PNG graph comparison failed: Comfy adds a captured-audio `is_changed`
  fingerprint to saved prompt metadata. The validator now verifies that
  fingerprint against the conditioning WAV and still requires exact semantic
  inputs. The owned service exited; its failed receipt was not rewritten.
- **Second failure retained:** attempt
  `f9dc6379-2f3c-44f4-8b03-ce7e4dce8b6a` validated media but reported
  `reconciling` during cleanup. `/proc` showed the Comfy leader as a zombie
  before `waitid` could collect its exit. A regression reproduced this gap;
  cleanup now waits boundedly while preserving the unreaped process-group
  anchor. Independent reconciliation found the old PID/group and GPU process
  absent and port 8198 available, with matching boot identity. No process
  was killed in that reconciliation. Its marker and observation were archived
  alongside the original failed receipt, not erased from history.
- **Successful run:** attempt **`ed38cdf6-5b3f-4d4e-b450-41c8be60138f`**, prompt
  **`f52f85cf-9dac-4f53-a18d-9324a55e59b5`**, ended `succeeded`. It used the
  actual prior YuE2 audio and synthetic coloured visuals. The conditioning WAV
  contains **112,000 samples/channel**, with no padding for this interval.
  Independent local float32 decoding matched the source prefix bit-for-bit.
  Its SHA-256 is
  `0cc19c554465b8f5e4a4fa2b8fbb4ac3eae02e6c9cb219518fbddee77b682a0e`.
  All 56 ordered original RGB PNGs, metadata and file hashes checked, as did
  640×480 H.264/yuv420p at exact 24/1 fps and the full stereo FLAC. MP4 hash:
  `65941212d6a035608f8b34476879abf8fefe4757264ff52be0f56f65e03d49b8`;
  FLAC hash:
  `50d1f8f8b551516896988aaba69ba5dea1d27057f33e86e8da52975b3cd5fef3`.
  The synthetic receipt correctly records no actual H3 seed execution.
- **Native-audio distinction:** pinned H3 source produces 32 kHz audio on an
  800-sample grid: 56 frames imply 74,400 samples (2.325 s). Comfy may crop
  only the mux input to video duration while retaining the full FLAC. The
  validator now distinguishes those counts and bounded AAC padding; a
  22-frame regression covers a case where the crop matters. These are
  source-checked expectations, not observed H3 decode results. No mastering,
  loudness change or final 48 kHz export resampling was added.
- **Elapsed time and resources:** Comfy reported 2.93 s for the synthetic
  workflow; complete helper execution took **127.62 s**. During this run a
  read-only observation saw FFprobe waiting on disk IO while the background
  model download continued. It completed without restart or unrelated
  cleanup. Synthetic cached image-batch nodes used approximately 6.72 GiB
  RSS; this is **not an H3 RAM/VRAM measurement**.
- **Owned exit:** service PID/group 1191986 exited 0 after SIGINT; the observer
  exited and the owned GPU PID was absent. The receipt's final group snapshot
  can contain the leader's zombie immediately before reaping; an independent
  subsequent observation found the PID absent. The personal Comfy PID
  1216557 remained at 234 MiB and continued listening on 8188. Port 8198 was
  closed and no unresolved proof marker remained.
- **Checks/review:** **78/78 approved contract cases**, typechecking and
  **25 additional H3 diagnostics** passed (7 graph, 13 conditioning/metadata/
  audio-profile, 5 Linux ownership). Focused independent review closed the
  metadata, audio-count/mux-crop, descendant cleanup and zombie/wait race
  findings. Final executed source hashes match local source: runner
  `a80ff88e22c291de05cc586f3a64c4a1e3fd19862bd9b15f72f81e700253e18a`,
  media `3bc133064af13e21e9af78010f6411ffb76b575f919f683377fda8643e06273a`,
  workflow `1ad58c03b204c51cd933c879b319bc17d0ea438fce08b83e33f421ca66023d1b`.
- **Evidence locations:** native evidence is under Dundee's
  `projects/native-h3-proof/runs/<attempt>/`. The successful and reconciled
  attempts are copied to ignored `.local-evidence/slice-1/h3/runner/`; the
  successful folder includes `independent-local-check.json`. Earlier failures
  and logs are retained. No runtime media or private context is staged.
- **Latest host/download observation, 21:54:38 AEDT:** all three owned probe
  PIDs were absent. The original model-download unit remained active/running.
  The model card and **15,983,746,636-byte diffusion weight** were verified;
  the text encoder had **3,031,715,840 partial bytes**. Remaining files were
  pending. This is not a completed model installation. No H3 inference is
  queued to start automatically.

**Resume:** inspect the existing download unit/receipt and require all six
verified files plus completed repeat verification before native inference.
Then use the reviewed runner without `--fixture` for the real song-conditioned
H3 attempt, retaining actual seeds, frames, resource observations and owned
exit. Provider-authored generation, the analysis environment, same-seed
replay, queued/running cancellation, music→H3→music handoff, final export,
the 12 formal live cases and learner media review are still outstanding.

Final download-only recheck at **21:59:56 AEDT**: the same unit and receipt
remain running, with the same two verified files and **4,987,559,936 partial
bytes** of the text encoder. No native H3 run was started.

### Completed H3 assets and first native attempt — 22 October 2026

At 07:42 AEDT the overnight model-download receipt was `succeeded`, with all
six files (35,087,235,076 bytes) verified; its user unit was inactive/dead with
success. The full initial download/verification took 6,015.15 seconds. A
separate completed-install check in `setup-jobs/h3-models.nwq38bci/` passed in
238.36 seconds, rehashing all six existing files without a new download.
Installer/manifest/helper hashes match the reviewed local files. Copies of
both receipts are in ignored `.local-evidence/slice-1/h3/native/models/`.

All 78 contract tests, typechecking and 25 H3 development diagnostics passed
again before native execution. A focused native-only source review found no
concrete wiring/path/frame-count blocker. It noted that the RTX 4060 Ti uses
the pinned Comfy implementation's dequantized computation for the NVFP4 text
encoder rather than native FP4 matmul. This is supported source behavior,
not a model substitution, and leaves actual memory/speed to live measurement.

The explicit user-service attempt `4ee70e27-3649-4749-8572-2f8197b9fae4`
started at 07:46 AEDT with fresh seed `13039281409138935984`, the prior real
YuE2 audio, 48 requested/56 native frames, 640×480, 24 fps and the reviewed
20-step graph. Unit: `studio-h3-native-4ee70e27-3649-4749-8572-2f8197b9fae4`.
Request: `setup-jobs/h3-native-request.NlFJPnqz/request.json`. Evidence goes to
`projects/native-h3-proof/runs/4ee70e27-3649-4749-8572-2f8197b9fae4/`.
This is a direct native probe, not provider orchestration or a full live-suite
pass. Initial observation showed 330 MiB total GPU usage, personal Comfy at
234 MiB on port 8188, no listener on 8198 and approximately 12 GiB available
host RAM. No personal service or host-Python configuration was modified.
The outcome and independent post-run checks are recorded below when observed.

#### Native outcome and independent verification

The attempt **succeeded**. Comfy prompt ID
`973c23ff-2b3f-43f4-b1c8-387346878cca` completed normally; its native history and
all saved PNG prompt metadata contain exact seed `13039281409138935984`.
All six model hashes were checked again by the runner before service startup.

- **Inputs:** conditioning is exactly 112,000 samples/channel at 48 kHz and
  independently matches the captured prior YuE2 source prefix after float32
  decoding. No silence was required for this interval. This song was the
  earlier token-truncated sample; the new video does not make it a complete
  composition or an agent-authored song.
- **Original images:** all **56** original 640×480 RGB PNGs decode, match file
  and pixel hashes, and appear in the recorded native order. Both SaveImage
  and CreateVideo consume the same VAE IMAGE output. They are pre-encode
  8-bit originals, not a floating-point tensor dump. The intended placement
  remains [0,48); no extra frames have been placed into a product timeline.
- **Encoded media:** independent FFprobe/FFmpeg confirms H.264/yuv420p,
  **24/1 fps**, **56 frames**, duration **56/24 seconds**, plus stereo AAC.
  Video SHA-256:
  `8cf19c96e5322104388fcbcf01ff04d6d48eec0c8e786f94170f1c2f754c1496`.
  The full separate FLAC contains **74,400 samples/channel at 32 kHz**,
  matching the source-checked native audio grid. Its decoded values are finite
  and nonzero; absolute peak is approximately 0.638153. FLAC SHA-256:
  `eda98cb284c89e60ec2d3c9de3457ec8e263588e8bbf14ac27d3e3bdc0b64db1`.
  The native audio is **1/120 second shorter** than the native video; no hidden
  retiming, normalization or mastering was applied.
- **Timing:** native history records **189.455 seconds** of prompt execution
  (service log rounds to 189.49). Complete helper time was **341.65 seconds**,
  including model hashing, service startup, validation and owned shutdown.
  These are different measurements, not conflicting generation-speed claims.
- **Resource observations:** 109 samples with no observer errors. Owned-process
  GPU peak sampled at **15,354 MiB**, RSS peak sampled at **12,044,056 KiB**,
  process high-water RSS **12,126,436 KiB**, process swap peak sampled at
  **2,386,196 KiB** (about 2.28 GiB). The host had approximately 22 GiB RAM
  and 207 GiB configured swap. The log confirms dynamic VRAM loading, CPU
  offloading and emulated NVFP4. Sampling can miss peaks; these numbers prove
  neither VRAM-only inference nor a minimum host RAM/swap requirement. The
  retained attempt occupied approximately 34 MiB on disk.
- **Owned exit:** Comfy PID/group 1564180 exited 0 following its SIGINT; the
  helper's observer exited and its post-check found no owned GPU process.
  At **07:52:55 AEDT**, independent observation found helper PID 1562769 and
  Comfy PID 1564180 absent, unit inactive/dead with success/exit 0, port 8198
  closed and no unresolved marker. GPU usage returned to **330 MiB / 0%**,
  including the same untouched personal Comfy PID 1216557 at **234 MiB** on
  port 8188. No model installer or native proof remains running.
- **Inspection/review:** first/middle/final frames were actually viewed and
  show the requested friendly robot at a synthesizer. This is not a playback,
  listening or audio-sync-quality review. An independent reviewer rechecked
  all PNG hashes/pixels/order, graph provenance, native seed, fresh media
  probes/decoding, conditioning equality and resource calculations; no
  contradictory success evidence was found.
- **Retained evidence:** complete local copy at ignored
  `.local-evidence/slice-1/h3/native/4ee70e27-3649-4749-8572-2f8197b9fae4/`.
  `independent-local-check.json` and `independent-*-probe.json` accompany the
  original receipt/history/frames/media/resource logs. The post-run observation
  is `native/post-run-observation.txt`. Original media remains on Dundee at
  the identical run-relative paths.

**Provider-path preparation:** added versioned, product-owned references under
`integrations/knowledge/` for music, video and evidence/resource coordination.
They are not injected or live-tested yet. Their purpose is to communicate the
native tool knowledge while preserving ordinary agent tools, scripts, research
and natural-language responses. The references explicitly identify current
helper layout differences, unimplemented scheduler/cancellation, captured seeds,
native versus placed length, song conditioning and truncation/quality limits.
Pinned upstream music-generation and H3 base-prompting documentation was read;
no personal Pi installation or skill was copied into the product.

**Next:** exercise that knowledge through the real provider path and finish the
isolated analysis setup, native replay/cancellation/handoff, validation export,
12-case live binding and learner playback/listening check. Slice 1 is still
open. Changes after `49dac9b` are uncommitted; no completed-slice commit or UI
readiness is claimed.

### First real provider-driven media task — 22 October 2026

**Outcome: useful recovered media, not a clean pipeline pass.** The learner
approved proceeding with the ordinary creative agent. A new supervised launcher,
`scripts/provider-media-proof.ts`, captured the brief, four exact seed strings,
separate native IDs and complete product-guidance bytes/hashes before launching
Codex in the project workspace. It uses the existing full-access provider runner,
not a JSON-response requirement, tool allowlist, sandbox or replacement agent
configuration. Default invocation is plan-only; live use requires explicit
`--run`, `STUDIO_LIVE=1`, Dundee and Node 24. The experiment is not the durable
scheduler or the missing formal live-suite binding.

Five local launcher diagnostics pass, separate from the 78 approved cases.
Review found and corrected two issues before live use: uncertain provider exit
must remain `reconciling`, and runtime-root selection must honor the native
helpers' XDG precedence and absolute-path rule. The initial missing-module run
was not a meaningful behavioral red test. All 78 approved tests, typechecking,
25 H3 diagnostics and the five launcher diagnostics passed before execution
and again during this task. They did not cover the polling failure below.

#### Captured identity and creative work

- Project `provider-media-codex`; outer attempt
  `4888eb4f-f116-4a55-86e6-3789af081de6`; unit
  `studio-provider-media-33ab9c81-e9ce-4c30-9348-b2d0d50edf78.service`.
  Started **08:17:30 AEDT**, provider exited **08:29:18 AEDT**.
- Actual native Codex session `01a16053-8fd6-71c3-b426-99d89e65aa91`,
  CLI 0.163.0, model **gpt-6.1-sol**, ordinary `danger-full-access`, approval
  `never`, cwd `projects/provider-media-codex/workspace`. Native session
  metadata and CLI trace were inspected; this is not inferred from requested
  flags alone. Only Codex has exercised this media path so far; the earlier
  Claude capability probe is not equivalent evidence.
- Launcher SHA-256
  `2a332df3dc176529a8da5c5c761fad25560b2796e55c9c0015d742cf0fd749b5`.
  Captured guidance SHA-256: README
  `8f9b2232682ac801382da0b24255be21153306158d5139b81bd87ad969999353`,
  music `39d65543cf3da591b34e1a46b4db0cd054b2509962b520dacc10bbd3156f8d6f`,
  video `be21c27b214c682be7d064d3c7b74fbb94c597a8b26eb5782f117e0c51f0f05b`.
  Those exact snapshots remain unchanged. The source guidance README was
  subsequently updated to describe this result; its current hash differs.
- Codex wrote original programming lyrics, detailed musical styling/sampling
  inputs, a miniature robot-workshop H3 prompt using native modality fields,
  and its own preparation/export/recovery scripts. There was one new YuE2
  request and one native H3 submission; no automatic generation retry or
  synthetic/model fallback. The agent retained natural-language reporting.

#### Music and H3 outcomes

YuE2 attempt `46f3bba9-abda-4b4e-ad02-2d0791f77457` succeeded in **126.26 s**
(helper measurement). Its 48 kHz stereo float WAV contains **1,576,256
samples/channel = 32.8386667 s**. This exceeds the requested approximate
15–25 seconds; prompt duration is not an exact output constraint. Both ABC
and semantic truncation flags are false, unlike the earlier short probe.
This is not listening approval or a claim that every requested musical detail
was realized. Every captured artifact hash and stage seed was independently
checked. Seeds: ABC `8441299191990296173`, semantic `7089773537548395557`,
NAR `5723634299345447891`. Source WAV SHA-256:
`fedb8b6fe88d996e27f3182691ddd7ad055246ca39dc546f08c5fe792c0255ac`.

H3 attempt `381d3ae2-1c5d-44ee-9401-5f1e2425da6c`, prompt
`e89a16e2-de2e-4711-bef6-987bef40fb6c`, seed `11187851132846900587`, used
**640×480, 24 fps, 20 steps**, 48 requested/56 native frames. Its conditioning
independently matches the new song's first **112,000 samples/channel** exactly.
The native service logged completion in **240.66 s** and wrote 56 original
PNGs, a 56-frame H.264/AAC MP4 and a 74,400-sample/channel 32 kHz stereo FLAC.

However, the helper failed with **`TimeoutError: timed out`**, elapsed
**422.50 s**. It did not save final native history or its normal frame manifest.
The receipt remains **failed**, with no invented history or `actualSeeds`
completion field. Source inspection and the submitted-but-uncollected state
identify the unhandled ten-second completion GET as the failure path. The
overall job deadline had not elapsed. Memory pressure was observed, but is
not proof of the HTTP delay's cause. Cleanup sent SIGINT then SIGTERM; the
owned service exited **-15** and released its GPU allocation. This was failure
cleanup, not a measured user-cancellation test or a normal exit-0 success.

Codex noticed the existing outputs and independently used the product PNG
inspector to recover them **without regenerating**. Its separate recovery
manifest/receipt expressly retain the failed native state and missing history.
Independent post-run inspection then checked every PNG byte/pixel hash,
unique sequential filenames, full semantic graph, exact seed and LoadAudio
fingerprint. All 56 decoded native video frames corroborate that filename
sequence within expected H.264 loss (maximum RGB MSE 12.9121). This tolerance
does not uniquely establish order between near-identical frames. Native history
order remains unavailable; recovered order is not misrepresented as a saved
history response. First and 48th original stills were actually viewed and show
the robot operating the lit music machine. No motion/listening judgment is made.

#### Recovered validation export and resource evidence

The agent's FFmpeg export is **789 frames / 32.875 s**, H.264/yuv420p,
640×480 at 24 fps, AAC 48 kHz stereo. All frames were independently decoded:
frames 1–48 agree with their original PNGs; all remaining **741 frames are
black** (decoded RGB maximum zero). The extra eight native H3 frames were
retained but not placed. Original song audio is preserved through AAC encoding,
with **1,744 samples** of silence padding to the final video frame boundary.
An independently executed reference encode from the unchanged song with only
that padding matched **all 1,543 encoded AAC packet hashes**. Thus the claim is
stronger than correlation alone; no hidden fade, leveling, H3 audio replacement
or mastering was needed. Export SHA-256:
`ccd4078b3cbe2e3920ce2bfba8ec8f941d596ce505f6b0c24522fbaff2bb0433`.
This intentionally sparse file is not a complete music video.

An outside observer captured **329** resource samples, with no reported
observation errors and maximum sample spacing 4.62 s. Sampled process GPU
peaks: music **7,776 MiB**, H3 **15,314 MiB**. H3 high-water RSS observed was
11,998,728 KiB and sampled process swap peak 2,413,264 KiB. The complete unit's
cgroup peak was 12,828,090,368 bytes with swap peak 2,646,831,104 bytes. These
are different measurement scopes, not hardware minimums. The same 22 GiB RAM /
207 GiB configured-swap host used CPU offloading; this does not certify 8 GB
hardware or VRAM-only operation.

There was no sampled music/H3 process overlap; **72** independent between-stage
observations found the music process absent and GPU at the personal-service
baseline before the H3 service began. This is one sequential music→video
handoff, not the required bidirectional scheduler/cancellation proof.
At **08:29:50 AEDT**, the outer unit was inactive/dead, provider/helper/native
PIDs absent, port 8198 closed, no unresolved-work marker, total GPU use back to
**330 MiB / 0%**. The same personal Comfy PID 1216557 remained untouched at
234 MiB on 8188. The outside observer exited without signaling anything.

Complete evidence/media is copied into ignored
`.local-evidence/slice-1/provider-media/`. `project/` preserves the runtime
layout; `verify-recovered.py`, `independent-recovered-media-check.json`,
`audio-reference/`, `independent-resources.json` and `post-run-observation.txt`
contain the separate audit. The ordinary clean-success verifier is not used
to turn this failure into a pass. Local convenience links `validation-export.mp4`
and `song.wav` point at the retained originals. No credentials or runtime
media are tracked/staged.

**Next, in learn mode:** learner playback/listening feedback and review of the
five proposed [completion-polling regressions](h3-polling-test-review.md), then
repair and independently verify before advancing. Those new regression tests
and the correction are not implemented yet. Analysis setup, same-seed replay,
queued/running cancellation, full music→video→music handoff, Claude's media
path and the 12 formal live cases remain outstanding. Slice 1 stays unchecked;
no UI, completed-slice commit or clean provider-chain pass is claimed.

A focused independent final review found no blocker to this limited recovery
audit, corroborated all AAC packet hashes/timing/skip metadata and resource
figures, and agreed with the bounded polling regression proposal. It explicitly
retained the missing-history, lossy-order and sampled-resource limitations.

### Approved polling repair and native replay — 22 October 2026

The learner replied “perfect, video looks great too”: polling-regression review
approved and recovered-video playback feedback recorded. Slice 1 remains open;
this does not invent separate lyric/audio critiques or approve unfinished gates.

Nine polling regression methods now exercise the actual runner with deterministic
native/transport/clock fixtures and one bounded local alarm subprocess. The
initial seven methods ran before the fix: the no-POST-retry guard passed, while
six methods produced eight failing subassertions. The behavior failures included
single-read abort, absent bounded retry, accepting a late success and missing
internal history-ID validation. Some stop/empty-poll failures concerned diagnostic
wording, not previously demonstrated duplicate generation. The fix preserves the
one submission and original deadline, records transient read failures and retries
only GETs. Status/graph/media validation remains independent of agent prose.

Focused review caught a further issue: socket inactivity timeout is not a whole
response deadline. A slow-body fixture failed before the additional correction;
an owned main-thread Linux alarm now bounds opening/reading/decoding the response.
It restores its handler, refuses another active timer, and never wraps POST. A
separate Python child verifies real interruption/restoration with a five-second
parent backstop. The reviewer closed that finding before deployment.

All **78 approved contract tests**, typechecking, **34 H3 diagnostics** and
**five launcher diagnostics** pass. Tests/implementation are in
`tests/diagnostics/test_h3_polling.py` and `integrations/h3/generate.py`. Before/after
logs and the preserved pre-repair helper are under ignored
`.local-evidence/slice-1/h3/polling/`. No provider/GPU runs occur in those tests.

At **08:46:39 AEDT**, a supervised live replay was explicitly started on Dundee:
attempt `f8e01f65-ece6-4812-b220-204001a3fb9a`, unit
`studio-h3-polling-f8e01f65-ece6-4812-b220-204001a3fb9a.service`. Only the attempt
ID differs from failed request `381d3ae2-1c5d-44ee-9401-5f1e2425da6c`: same song,
prompt, seed `11187851132846900587`, native graph, 48 requested/56 native frames,
640×480, 24 fps and 20 steps. No new song or agent reinterpretation is involved.
The failed request/receipt/media remain untouched. This is a direct native replay
to isolate the helper repair, not a rerun of the complete provider task.

Deployed helper SHA-256:
`7bf75e52d1ff62e189722ebd2cc0a948544f13f7b508b818e6b9cffd74191619`.
Replay request SHA-256:
`137dbb3d5f45479952eadf746caf11714c426b1e4c736a24a17b23c400c42dab`.
Preflight found no running studio units or unresolved-work marker, port 8198
free, 330 MiB total GPU baseline, personal Comfy unchanged on 8188, about
13 GiB available host memory and 195 GiB disk available. A separate read-only
observer monitors the attempt. Its outcome is recorded below after verification.

#### Replay outcome and independent verification

The replay **succeeded**, with prompt ID
`f57699a4-a03f-4a3a-9a39-2247b030bb15`. Final native history, prompt identity,
graph, seed, output order and an empty final queue are captured. Independent
verification checked every original PNG file/pixel hash and full prompt/audio
fingerprint, sample-exact conditioning, media decoding and actual rate/counts.
All **56 PNG files and their pixels, the native MP4 and the full FLAC are
byte-identical to the failed attempt's retained media**. This is narrow evidence
of reproducibility for this request/environment, not a universal determinism
promise. The new successful history does not rewrite the old missing history.
The old receipt is still failed and its SHA-256 remains
`362d8be890087415b4f0afb08d141845a21c9903898b062f209177aa7ab3b898`.

Native execution took **187.671 s** (service rounds to 187.70); total helper
elapsed **369.289 s**. No transient read error occurred during this live replay.
Thus this proves normal native operation with the repair installed; the
transient-error recovery itself is verified by the explicit fault fixtures,
not misrepresented as observed native fault recovery.

The native observer recorded 109 samples without errors: GPU sampled peak
**15,314 MiB**, process high-water RSS **12,320,620 KiB**, sampled process swap
peak **2,221,424 KiB**. CPU offloading/host RAM/swap still matter; no VRAM-only
or minimum-hardware guarantee is inferred. An outside observer recorded 170
samples without errors, ending with an inactive/dead unit, empty cgroup and
only the personal Comfy GPU allocation. Both observers finished.

At **08:53:32 AEDT**, independent checks confirmed service exit 0, owned Comfy
PID 1607421 absent, no listener on 8198, no unresolved-work marker, GPU back to
**330 MiB / 0%**, and unchanged personal Comfy PID 1216557 at 234 MiB on 8188.
This is normal exit/resource release, not user-cancellation latency proof.

Complete local evidence is in ignored `.local-evidence/slice-1/h3/polling/`:
`native/`, `job/`, `verify-replay.py`, `independent-replay-check.json`, independent
media probes and `post-run-observation.txt`. A focused independent reviewer
corroborated identity, file/pixel/audio equality, native/history timings, empty
queue and release, and found no blocker to this limited native-replay result.
No provider was launched for this replay, and the previous export remains the
learner-reviewed output rather than an unnecessary new edit.

**Checkpoint boundary:** the provider-media tooling/guidance, independently
verified recovered export, approved polling repair and successful H3 replay
form a working partial checkpoint. Slice 1 remains unchecked. Next are the
isolated analysis setup, remaining music replay/cancellation and bidirectional
handoff, clean provider-chain/Claude media checks and formal 12-case live
binding. No running generation, finished UI or completed-slice claim remains.

## Isolated analysis setup and retained-song proof — 22 October 2026

The learner approved the analysis test batch with “looks good.” Implementation:

- `integrations/analysis/analyze.py`: captured-byte hash/decode, native sample
  rate/count/channels, exact rational duration, all-channel peak buckets, derived
  mono Librosa tracking, explicit unavailable-map diagnostics and exclusive
  new receipts. Source audio and earlier receipts are never rewritten.
- `integrations/analysis/recipe.json` / `requirements.lock`: managed Python
  **3.12.14**, Librosa **0.11.0** and **30** exact checksum-pinned packages.
  The base interpreter was already installed for Comfy; the new analysis venv
  and its packages are separate. No host pip/APT, driver or GPU changes.
- `scripts/prepare-analysis.sh`: plan-only default, explicit owned installation,
  actual readiness/repeat checks and host-Python before/after evidence.
- `integrations/analysis/probe.py`: real isolated imports/pins/`pip check`, shared
  native FFmpeg/FFprobe and synthetic media/beat fixtures. The probe refuses
  optimized Python, which would disable its assertions.
- Music guidance revision 2 explains the analysis tool, provenance, units and
  partial results without changing normal creative-agent capabilities.

### Actual outcomes

| Check | Observed result |
|---|---|
| Initial isolated install | Exit 0 in transient user service `studio-analysis-setup-20261022a`, **09:20:54–09:22:19 AEDT**; 85.702 s wall clock, reported 1.2 G service memory peak. New analysis venv is about 514 MiB. |
| Repeat checks | Units `20261022b` and `20261022c` passed in **10.981 s** and **11.898 s**. Matching pins avoided package reinstall/download; imports and real fixtures ran again. The final repeat used the final installer source. |
| Host/service proof | All three host-Python snapshots matched before/after. Actual user-service imports came from the dedicated venv with system-site packages disabled. Shared `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` **8.0.1-3ubuntu2**, native package ownership, required codec/filter inventory and 12-frame synthetic H.264/AAC encode/decode/probe passed. This rechecked an existing package, not a fresh APT install or production application service. |
| Analysis tests | **23 passed**: 9 pure beat-result cases, 4 setup/readiness cases and 10 actual native Librosa/environment cases. The native suite took **86.851 s** in a transient user service. No GPU/provider was used. |
| Review regressions | Before correction, the owned stale-ready-marker and optimized-probe tests failed; both now pass. The missing-dependency test is explicitly intercepted preflight, not a natural host failure. |
| Negative setup observations | Actual installer refused a prepared unowned directory, different recipe and corrupt cached Python archive; protected bytes remained, no venv/ready marker appeared. Failed evidence retained. No network outage was induced or claimed. |
| Existing checks | **78/78** Vitest contracts, TypeScript, **34** H3 diagnostics and **5** provider-launcher diagnostics passed. The formal 12 native-generation cases remain unrun. |

The synthetic 120 BPM fixture produced **22** detected anchors and estimated
**120.185319… BPM** on its native 44.1 kHz grid. Its first anchor was sample
44,544, after the one-second lead-in. All anchors met the reviewed 60 ms
onset tolerance. These are real detector observations on synthetic audio, not
proof of exact musical beats on generated songs.

### Retained real song

Analysis attempt **`f0aec922-e164-43a6-a7ff-16dfcf4ac499`** used the existing
Codex/YuE2 song under project `provider-media-codex`; no new generation occurred.
The user-service run took **7.950 s**, with a reported 327.9 M memory peak.

- Original SHA-256 still
  `fedb8b6fe88d996e27f3182691ddd7ad055246ca39dc546f08c5fe792c0255ac`.
- **1,576,256 samples/channel**, **48,000 Hz**, **stereo float WAV**; duration
  exactly **24,629/750 seconds** (approximately 32.8386667 seconds).
- **3,079** waveform buckets; independent FFmpeg decoding plus a standard-library
  computation reproduced **every peak exactly**, including the shorter last bucket.
- **65 estimated anchors**, approximately **119.680851 BPM**. First sample
  **3,072** (0.064 s); last **1,528,832** (31.8506667 s). No time-zero beat or
  trailing musical content was invented. These estimates still need musical
  judgement; the independent verifier did not run a second beat detector.
- Independent decoded-PCM SHA-256:
  `4821519f5fab5c82f30425c8cbb7e40c859f904af2953a18f0b8a7d4e40569e8`.

Receipt on Dundee:
`projects/provider-media-codex/workspace/analysis/f0aec922-e164-43a6-a7ff-16dfcf4ac499/receipt.json`
relative to `/home/puzzleduck/.local/share/music-video-studio/`.

Evidence is retained, ignored by Git, under `.local-evidence/slice-1/analysis/`:
`first/`, `repeat/`, `final-repeat/`, service logs, native/local test logs,
negative setup inputs/results, `real-song/receipt.json` and independent waveform
verification. A focused reviewer independently corroborated isolation, versions,
test counts, original PCM hash and every waveform peak; no remaining blocker
was found for this bounded result.

At **09:26:41 AEDT**, no studio unit remained running. GPU baseline was unchanged
at **330 MiB / 0%**, with the same personal Comfy PID **1216557** at 234 MiB on
8188 and no listener on 8198. About 194 GiB disk space remained. This step did
not start/stop GPU services or run providers.

**Boundary and next step:** the isolated analysis gate is mechanically verified;
the learner accepted this working step with “looks good, move forward.” The
partial checkpoint is now committed as **`b064372`**. No browser
setup/analysis UI, exact editor beat-map arithmetic, persistence/reanalysis
selection or formal native-generation-suite completion is claimed. Slice 1
remains unchecked; next are its remaining music replay/cancellation, bidirectional
GPU handoff and clean provider-chain/Claude media/live-suite gates.

## 22 October continuation — approved native-control implementation

The learner approved the 26 proposed asynchronous assertions with “looks good,
go for it.” Implemented `apps/server/src/jobs/native-control.ts` and promoted
its assertions to `tests/contracts/native-control.test.ts` in the normal suite.
`cancelComfyJob` uses captured identity, one targeted request and independently
supplied stop observations. `handoffGpu` waits for owned processes, descendants,
queue and allocations, then invokes dispatch once under its caller-held-lease
precondition. Both bound observations/polling by one original monotonic deadline;
no HTTP acknowledgement is promoted into native stop or resource-release proof.

Thirteen supplemental implementation regressions cover evidence ambiguity,
mutable inputs, retained child ownership, timeouts, timer cleanup and direct Node
loading. Two concrete defects were found before this checkpoint:

- Vitest accepted a constructor parameter property that Node 24.1.0's direct
  TypeScript loader rejected. A child-process import test reproduced the failure;
  explicit field assignment repaired it without a new loader or stack change.
- Independent review found an observed owned child could be forgotten after its
  process disappeared while its GPU allocation lingered. Active/unresolved-owned
  fixtures both failed with premature `dispatched`. Remembering all observed
  owned PIDs repaired both; the focused reviewer confirmed the repair.

Verification: **39/39 native-control cases**, **117/117 default cases**, TypeScript
checking and `git diff --check` pass. A separate real-clock Node diagnostic held
three synthetic never-settling callbacks to a 100 ms budget (observed
**100.43–100.85 ms**), aborted their signals and made no duplicate POST/dispatch.
It made no network request and is not a native stopping-latency measurement.
Local ignored evidence: `.local-evidence/slice-1/native-control/` contains the
owned-child failing/passing logs and real-clock diagnostic output. See the test
review for runnable commands and the exact remaining gates.

No generator, provider, remote service or process termination was invoked in
this step. No browser/API integration, durable lease, native observer/transport
or formal 12-case live-suite pass is claimed. The new functions deliberately
accept validated native observations; they do not derive them from agent text.
If dispatch acknowledgement times out, the launched work may still exist: retain
ownership and reconcile rather than automatically retry. Concrete native
bindings/shared-lease testing and the planned owned-service/GPU proof sequence
remain next. Slice 1 and G4 remain incomplete.
