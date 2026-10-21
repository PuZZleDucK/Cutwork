# Slice 1 — tests for review

**Status: assertions approved by the learner ("looks good"), 21 October 2026.**

The following records the reviewed pre-implementation snapshot. Current implementation and verification results belong in `slice-1-progress.md`; historical "not run" statements below describe the review checkpoint, not later runs.

Learn mode is selected. This is the review checkpoint before feature implementation, not a completed slice. The [approved checklist](checklist.md) remains unchanged in scope and order; all nine slices remain unchecked.

## The purpose of this first slice

Before building an editor, prove that the intended Dundee installation can take a brief through a real frontier agent, YuE2 song generation, song-conditioned H3 generation, original-frame retention and a playable validation export. Verify the risky claims—actual tool/model access, isolated environments, media properties, seeds, GPU handoff and stopping—rather than making a polished interface around assumptions.

This is a concrete example of the planning layers working together:

- **PRD promise:** Retry preserves the failed generation's parameters and seed.
- **Spec decision:** Capture the resolved native call and copies/hashes of file-backed inputs, rather than asking the agent to reinterpret the prompt.
- **Test:** Change the original score, script, workflow and audio file after capture; replay must still use the captured bytes and original seeds. Missing or tampered captures must fail explicitly.

The test is where an ambiguous promise becomes an observable distinction. It does not decide the internal class/module structure for us.

## Review map

These counts are expanded cases collected by Vitest, including parameterised cases. **None of these product assertions has passed yet.**

| File | Cases | What the assertions require | Planning references |
|---|---:|---|---|
| [provider-environment.test.ts](../tests/contracts/provider-environment.test.ts) | 13 | Readiness checks must distinguish supported prerequisites from missing/broken ones. Three separate Python environments use their explicit interpreters. Provider/model/input snapshots and project working directories are stable; our launcher does not strip normal agent capabilities or interpolate creative text through a shell. | PRD: Frontier Agent Setup and Selection; Tool Setup and Failure Recovery. Spec: C3; Python isolation and installation ownership; gate G1/G2. |
| [video-plan.test.ts](../tests/contracts/video-plan.test.ts) | 13 | Fixed 24 fps, requested versus native frame counts, extra conditioning samples, partial/whole post-song silence, one-second requests, and advisory-only warnings above 15 seconds. | PRD: Music and Video Generation; Raw Frame Preservation. Spec: C6; ComfyUI / H3 contract; gate G3. |
| [seeds-and-replay.test.ts](../tests/contracts/seeds-and-replay.test.ts) | 12 | Fresh variations versus same-seed Retry/Restart, exact large-integer seed strings, invalid/unresolved seeds, real temporary-file snapshot checks and rejection of damaged/missing captures. | PRD: Generation Seeds and Variations. Spec: Data Model / Seed identity; C4/C6. |
| [media-evidence.test.ts](../tests/contracts/media-evidence.test.ts) | 14 | Independent observations take precedence over an agent's success message. Reject incomplete/reordered/corrupt frame evidence, wrong fps, lossy-derived frames, missing seeds or job ownership; retain native excess frames without extending the initial placement. Missing clip audio does not fabricate an audio option. | PRD: Raw Frame Preservation; Generation History; Clip Audio. Spec: C3/C6; gate G3. |
| [job-ownership.test.ts](../tests/contracts/job-ownership.test.ts) | 16 | Cancel only identified work; distinguish a cancellation request from observed stopping; handle unknown/reused identities and completed-success races; do not hand the GPU to the next tool until the previous work and resources are released. | PRD: Music and Video Generation. Spec: C4; gate G4. |
| [dundee-native.test.ts](../tests/live/dundee-native.test.ts) | 12 | Opt-in real provider tasks, actual audio/video decoding and metadata checks, all PNG bytes/hashes, export duration/format, native replay, queued/running cancellation for both generators and music→video→music handoff. | Spec: initial G1–G4 evidence; slice 1 mechanical verification. |

**Total: 68 local contract cases and 12 separately invoked live cases.**

### Three assertions worth reading closely

1. **Requested length is not native length.** In the deliberately fictional fixture, a two-second request needs 48 frames but the supplied native capability list requires 64. Keep all 64 originals; place only 48 frames. Condition the full native interval with available song audio, then silence if necessary. The number 64 is a test input, **not a discovered H3 frame-count rule**.
2. **Retry is not another creative attempt.** The file test really writes temporary files, captures them, changes their originals and reads the replay inputs. Its audio bytes are explicitly synthetic, not playable audio. A future integration test must also establish that the native command actually reads the captured files.
3. **Acknowledgement is not cancellation.** An accepted stop request must leave the attempt pending until stopping and resource release are observed. A queued Comfy prompt may already have been submitted without inference starting; those are different states. An unknown owner cannot justify interrupting an unrelated job.

## What is scaffold, and what is application code?

The only installed dependencies are the local TypeScript/Vitest test toolchain. There is no application server, UI, generator adapter, installer, provider invocation or production implementation yet.

[slice1-contract.ts](../tests/support/slice1-contract.ts) and [live-contract.ts](../tests/support/live-contract.ts) describe **test-only facades**. Their future bindings will call the real implementation; they must not implement a second copy of the behaviour just to satisfy assertions. These are not production API designs and are not response formats imposed on creative agents. Helper receipts can be structured while agents retain ordinary prose, tools, scripts, research and configuration.

The implementation bindings `tests/support/slice1-driver.ts` and `tests/support/slice1-live-driver.ts` are deliberately absent. There are no fake-success drivers, skipped placeholder tests or empty TODO bodies. Running the behavioural suites now would fail at the missing-binding check: that would be an **unimplemented test setup**, not meaningful evidence that a particular product behaviour is broken or correct.

Once the assertions are agreed, bind them to the implementation and demonstrate the relevant failing behaviour before correcting it. Review the bindings too: a test that merely compares invented observations with an invented result does not prove a native integration.

## Boundaries of the live assertions

The live suite is excluded from `npm test`. It requires an explicit opt-in, execution on Dundee, and a chosen runtime directory. These prevent accidentally spending credits or starting generators while reviewing tests; **they do not sandbox product agents**. It has no automatic retries of costly work.

FFprobe, FFmpeg, filesystem reads and hashing inspect the resulting files directly. Other observations—model identity, native ownership, GPU release and submitted replay inputs—depend on the future live binding querying real CLI/native state and preserving supporting evidence. Self-reported booleans from an agent are not acceptable substitutes.

Some proof cannot be reduced to the assertions in this first batch. The following are explicit slice-1 evidence requirements, not waived tests:

| Evidence procedure after test review | Required observation / failure boundary |
|---|---|
| Clean installation and version manifest | Install from versioned recipes without borrowing Artigas's generators or personal workflows. Record exact release/commit/model/node/interpreter pins, download integrity and applicable licence sources. Existing installed tools alone do not prove newcomer installation works. |
| Host Python preservation | Capture host executable/default/package observations before and after setup; account for separately authorised native prerequisites. Generator dependencies must land in their own environments. Verify environment prefixes, no inherited system site packages, imports and the Librosa analysis fixture. No host Python replacement or global pip. |
| Actual service environment | Run Node, FFmpeg/FFprobe, encode/decode/probe and isolated interpreter checks under the service's actual account/launch environment, not just SSH PATH. Verify bootstrap/service ownership and recovery separately from a successful interactive command. |
| Both provider contracts | Retain actual provider/model/session identity and normal tool-call logs. Inspect a real research/script-or-score task for each provider, project cwd/history and helper use. A created file or a nonempty log alone does not prove research, model access or normal tools. |
| Media input and provenance | Inspect the executed Comfy graph/log branch from VAE decode to full PNG saving before encoding; a manifest saying `pre-encode` is insufficient. Match actual seeds, conditioning WAV samples, graph/node/model versions, outputs and native job IDs. Exercise native count overshoot when the pinned workflow requires it. |
| Real replay and recovery | Cause a controlled failed owned call, retain its resolved inputs, and replay. Verify the submitted command/graph consumes the captured files. Same inputs/seeds are required; byte-identical generated outputs are not promised. |
| Ownership and cancellation | Independently observe queued/running native jobs before and after cancellation. Record monotonic elapsed stop latency and resource release; inspect evidence that unrelated work remains untouched. Report unregistered/detached work as a limitation, not as successfully stopped. Also check provider cancellation before native dispatch. |
| Resource feasibility | Measure peak VRAM/RAM, disk consumed and stage durations on the actual 16 GB target, including music→video→music transitions. Record methods and sampling limitations. Do not claim 16 GB feasibility from GPU enumeration or fixture tests. |
| Listening and viewing | Listen to the generated song and watch the validation export in VLC. Confirm recognisable song conditioning, useful visuals, timing and absence of obvious corruption. Machine-decodable content is not necessarily useful content. |

**Cancellation has an unresolved measurement criterion, not a silent new promise.** We agreed to stop immediately, but did not agree a numerical latency allowance. The tests record actual latency without inventing one. A passing eventual-stop assertion cannot close the immediate-stop requirement; review measured behaviour before closing slice 1.

Full UI setup/refresh, project/song switching, coverage and editing, continuation, archive/delete and Debug confirmation belong to later approved slices. This batch does not claim to cover all PRD criteria or complete every subcase of gates G1–G4. Add/review further concrete tests as installation recipes and native capabilities are pinned, **before implementing the associated behaviour**.

## Current read-only environment findings

Observed 21 October 2026 through SSH to Dundee; no installation or configuration changes were made there:

| Observation | Finding | What it does not prove |
|---|---|---|
| Host / OS | `dundee`, Ubuntu 26.04 | Clean installation success or service readiness. |
| GPU | RTX 4060 Ti; 16,380 MiB reported; driver 580.178.04 | That both generators fit or unload correctly. |
| Home filesystem | About 269 GB available; 93% used | Enough space for the pinned downloads, frames and exports; budget still needs calculation. |
| SSH Node | 22.1.0 | The planned Node 24 service runtime is not established by this check. |
| SSH Python | 3.12.3 through an asdf shim | Not the version of every system/managed interpreter; no compatibility claim. |
| Native media tools | `/usr/bin/ffmpeg` and `/usr/bin/ffprobe`, version 8.0.1-3ubuntu2 | Required codecs/filters and service-context fixtures have not run. |
| Agent executables | Neither `codex` nor `claude` found on that non-interactive shell's PATH | Not proof they are absent elsewhere, unauthenticated or unavailable to a future service. |

## Checks actually completed

- Local development runtime: Node 24.1.0. Installed only local test dependencies with `npm install --ignore-scripts --no-fund`: TypeScript 7.0.2, Vitest 5.0.5 and `@types/node` 24.19.2; exact transitive versions are in `package-lock.json`.
- `npm run typecheck`: **passed** for the tests and configuration, with no JavaScript emission. This is not application validation.
- `npm run test:list`: **collected 68 cases**. `npm run test:live:list`: **collected 12 cases**. These load definitions and expand parameterised cases; no test bodies or setup hooks run.
- Behavioural suites: **not run**; bindings absent. Live inference/provider calls/installations: **not run**. No slice completed or committed.
- Existing npm configuration emits a `globalignorefile` deprecation warning. It did not prevent these checks; global npm configuration was not changed.

See [tests/README.md](../tests/README.md) for repeatable commands. Vitest's [test API](https://vitest.dev/api/test) supplies the assertions/parameterised cases; TypeScript's [`noEmit`](https://www.typescriptlang.org/tsconfig/noEmit.html) checks types without generating application output. Native tools and model access remain separate evidence gates.

## Review checkpoint

Review expected results and counterexamples before internal naming/style. In particular: retained native excess frames versus initial placement, same-call replay versus a new variation, and when cancellation becomes a fact rather than a request.

**Do these assertions capture the behaviour you want to hold the implementation to, or would you change any before we write it?**
