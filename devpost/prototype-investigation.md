# Prototype Investigation — Evidence for the Technical Specification

Inspected 21 October 2026. This is a research record, **not an approved specification or an implementation change**.

## Purpose and Evidence Boundary

The learner supplied `http://artigas.local:9121/#`, identified the completed Cardogs/funk and Nells Well/nursery-rhyme examples, and pointed to Pi's generation skills. They want the new product to supply its own generator knowledge to Codex and Claude rather than depend on a personally configured Pi installation.

Read-only SSH located the listening application's working directory at `/home/puzzleduck/music-studio` on Artigas. The running command was Ruby `server.rb`. Inspected application source, targeted project metadata, saved generation receipts, music request/score filenames, and the two relevant Pi skills. Used FFprobe on existing recordings, representative clips, and completed exports. Opened both examples and their existing exports in the browser.

No generation, export, installation, test suite, service restart, queue mutation, project edit, or credential inspection was performed. Screenshots and this record were saved in the learning workspace only. Browser media loaded and displayed decoded first frames; this was **not full playback, listening evaluation, or a fresh end-to-end generation test**.

The UI uses musical descriptions rather than the learner's short names. The funk/car example and nursery/chalkboard example below match the supplied descriptions. Other projects were not used as completion evidence.

## Completed Examples

| Evidence | Funk / Cardogs example | Nursery / Nells Well example |
|---|---|---|
| Song ID | `bfaf17e1-c458-468d-bd00-3ad20338625a` | `e10f201d-d4f9-47bd-896f-eaaeaa56d90b` |
| Selected recording | Neon Circuit — Short Mix 3 | Wind the Key — Take 1 |
| Recording ID | `97e4d478-3bda-40d9-b0c1-acda6932c143` | `8314a0fa-f3ac-4b66-bce4-69baf0cc05aa` |
| Original audio, FFprobe | FLAC, 48 kHz stereo, 54.958667 s | FLAC, 48 kHz stereo, 119.958667 s |
| Current active library | 8 clips; 26 archived | 18 clips; 37 archived |
| Latest saved export | `c4bc4723-a8e9-45bf-bb41-48c92974c946-final.mp4` | `d1fc9678-1338-4fa8-854a-a6bd1b6f496b-final.mp4` |
| Export, FFprobe | 54.958333 s; 1,319 video frames | 122.583333 s; 2,942 video frames |
| Export streams | H.264, 960×720, 24 fps; AAC, 48 kHz stereo | H.264, 960×720, 24 fps; AAC, 48 kHz stereo |

Exports live under `/home/puzzleduck/music-studio/data/media/` on Artigas. The nursery export extending beyond its song is direct artifact evidence for an outro. It does not establish every new PRD boundary or perfect audiovisual synchronization.

Browser captures:

- [Funk export](../screen-caps/prototype-funk-export-2026-10-21.jpg)
- [Nursery export](../screen-caps/prototype-nursery-export-2026-10-21.jpg)

An initial accessibility snapshot reported media unavailable while the project was loading. Subsequent media-element inspection showed loaded media with no error; both final exports displayed first frames. Do not record the initial transient state as a diagnosed application fault.

## Actual Execution Path

### Application, persistence, and Pi

Source: `lib/store.rb`, `lib/worker.rb`, `lib/media.rb`, `scripts/analyze.py`, and `README.md`, relative to the remote application root.

1. Ruby/WEBrick serves a vanilla-browser UI; an atomic JSON file stores songs, versions, clips, arrangements, jobs, and configuration.
2. The application captures job settings at submission and processes jobs with one sequential worker (`lib/worker.rb:9–23`).
3. Music work uses a continuing Pi conversation; each clip has its own session. The wrapper supplies structured creative inputs, a specific skill path, an output directory, and a result-manifest contract (`lib/worker.rb:70–129`).
4. Pi is invoked in print mode with explicitly selected tools and most automatic discovery disabled. Despite `--no-skills`, its task explicitly tells it to read the assigned skill. This is supplied context, not knowledge intrinsic to the frontier model.
5. The application validates actual output files and ingests them. It performs waveform/beat analysis and export itself rather than accepting an agent's completion claim as sufficient.
6. The current topology is distributed: music skill instructions target Dundee; the video wrapper targets ComfyUI on Dundee or Kunlun. Those hostname and filesystem assumptions must not become dependencies of the approved single-server v1.

The accepted new stack remains React/TypeScript + Vite and Node/TypeScript + Fastify. Finding Ruby and JSON in the prototype does **not** change that choice or select JSON persistence for the new application.

### Music generation knowledge

Resources on Artigas:

- `/home/puzzleduck/pi/skills/music-generation/SKILL.md`
- `/home/puzzleduck/pi/skills/music-generation/references/options.md`

The local references identify YuE2 0.1.6 and document a historical installed revision, Python API, CLI, separate style/lyrics, explicit seeds, staged ABC planning, synthesis, retained originals, and low-memory settings. Their installation/performance claims were **not re-tested** on the generator machine.

The completed examples contain actual proposed/approved ABC files, review notes, and requests with explicit seeds:

- Original funk music job: `549f3fee-ca3f-4e75-a8b5-5625fbbe72b3`.
- Short-mix music job: `0bb3f21a-7501-4b8e-8ff4-6c34024ad75c`; manifest lists three recordings with distinct requests/seeds.
- Nursery music job: `9e70744d-6c9c-42eb-864e-14d7f4ff1d77`; planning and synthesis requests plus score artifacts are present.

This demonstrates useful provenance beyond a single final prompt. It does not mean the new prototype must expose a score editor, generate batches, perform mastering, or add another user approval between Generate and the result.

The current [upstream YuE2 skill](https://github.com/multimodal-art-projection/YuE/blob/main/skills/yue2-music/SKILL.md) also describes staged music workflows and an instrumental-specific path. It names a 24 GB baseline; the local skill's 16 GB recipe is separate historical evidence. The new 16 GB support target therefore still needs a pinned, measured compatibility test. Upstream material distinguishes skill/helper licensing from model-weight terms; do not treat all of these as one license.

### Video generation knowledge

Resources on Artigas:

- `/home/puzzleduck/pi/skills/video-generation/SKILL.md`
- `/home/puzzleduck/pi/skills/video-generation/scripts/video_generation.rb`
- `/home/puzzleduck/pi/skills/video-generation/references/minimax_h3_prompt_enhancer_system.txt`

The inspected wrapper constructs ComfyUI graphs, uploads inputs, submits a prompt, records the returned job ID and graph, and starts a separate output-recovery process. It is not a synchronous renderer whose successful process exit alone proves media completion.

The representative successful receipts identify an H3 FL2VA-derived checkpoint, `H3/h3ErosMax_beta5_fp8.safetensors`, alongside text-encoder and audio/video VAE dependencies. This is evidence of the existing setup, **not selection or redistribution approval of that checkpoint for v1**. No NSFW LoRA was enabled in the two sampled successful receipts.

The prompt reference supplies modality-aware structure, shot timing, reference-image roles, soundscape, and music instructions. Its optional OpenRouter prompt enhancer is separate from Pi and is not a required dependency for the new Codex/Claude product. We can supply equivalent documented guidance through the selected provider.

Audio conditioning is real graph wiring: `LoadAudio → MiniMaxH3AddGuide → BasicGuider`, then the sampler. The server checks source hashes, original-speed audio, and the expected connections (`lib/media.rb:148–166`). A textual claim that a clip used the song is not enough.

Representative receipts:

- Funk clip job `27081574-01cd-42e1-9b1d-132a82c44215`: about 6.966 s requested, 175 native frames / 7.291667 s generated, audio fitting disabled.
- Nursery clip job `5dac138e-8187-41f1-8bb7-60e7a130cc33`: about 8.707483 s requested, 209 frames / 8.708333 s generated, audio fitting disabled.

Both live source files were verified as H.264 at 24 fps with native 32 kHz stereo AAC. The receipts support historical submitted settings, not a new execution or a guarantee of motion landing on every beat.

## Consequential Gaps Against Our PRD

### 1. Native frame rate versus the project's frame rate

The inspected wrapper encodes at 24 fps and rounds generated lengths onto `17k+5` frames (`video_generation.rb:69–76, 394–410`). [MiniMax's published specifications](https://www.minimax.io/news/minimax-h3-open-source) independently identify 24 fps output. The existing examples also probe as 24 fps.

At initial inspection, the approved PRD specified a 30 fps default and reasonable configurable project rates. These are not the same as a generator's native sampling rate. A project can have a different output rate, but then we must specify source-to-timeline frame mapping, duration preservation, trimming/continuation semantics, and preview/export parity.

A possible conversion is frame duplication/drop without changing playback speed; [FFmpeg's `fps` filter](https://ffmpeg.org/ffmpeg-filters.html#fps) supports that operation. It does not create additional genuinely generated moments. Interpolation would be a separate, unapproved processing choice.

**Resolved in the 21 October follow-up:** the learner explicitly selected exactly 24 fps globally, with no frame-rate selector or conversion in v1. Scope and PRD have been amended with that decision; this supersedes the configurable 30 fps default. Whole-frame quantisation and generator frame-count constraints remain to be specified.

### 2. Full lossless frames are not currently retained

The inspected graph saves **one** pre-encode PNG using `ImageFromBatch → SaveImage`; the full decoded sequence goes to lossy MP4. `--retain-native` means retaining the complete encoded output rather than cutting it, not retaining all lossless frames.

Further, the studio's frame-enrichment and trimmed-continuation code decodes images from the stored video (`lib/media.rb:34–49, 131–145`). This does not meet our stronger requirement to source the last retained frame from pre-lossy frame data.

Proposed adaptation, not tested: add a complete pre-encode image-sequence or suitable lossless-master output, plus ordered frame metadata, and derive trimming/continuation from it. Verify bit depth, color conversion, disk use, indexing, and cleanup before claiming compliance. A final-frame-only PNG is insufficient once arbitrary end trimming is supported.

### 3. Stopping the agent is not stopping the generator

The worker terminates the Pi process group; its own timeout message warns that remote work may continue (`lib/worker.rb:125–156`). The video wrapper separately submits ComfyUI jobs and launches recovery.

Our Cancel requirement needs application-owned tool job IDs and tool-specific cancellation/reconciliation, not merely killing Codex/Claude or hiding a placeholder. A future local ComfyUI service still has its own queue even on the same machine. No live interruption was attempted.

### 4. Duration limits affect eight-beat defaults

The inspected numeric wrapper accepts 0.5–15 seconds and rounds onto its model grid. The public model specification gives a narrower ordinary duration range than every value accepted by this wrapper. Existing short clips establish some historical shorter generations, not universal quality/support.

Eight beats at a sufficiently slow tempo can exceed 15 seconds, and a very short remaining gap can be below the wrapper minimum. The spec must address these cases explicitly without silently stretching song audio, overlapping a reserved interval, or pretending any arbitrary request is natively supported.

**Subsequent learner decisions, 21 October:** do not impose a blanket four-second minimum; requests above 15 seconds receive a non-blocking warning suggesting multiple manually requested generations, not a hard block or automatic split. All beat-based generation presets share one adaptive count: begin with eight at 50 BPM or above, otherwise four, then halve to two or one if the proposed duration exceeds 15 seconds. Stop reducing at one and warn if it is still overlong. This explicitly includes gap filling, Continue From End and post-song presets; large gaps are not filled with a single overlong preset. For steady BPM the additional thresholds are 16 and 8, with a one-beat warning below 4 BPM. The learner reports successful 1–2 second clips and has seen others generate single images with H3; these are reports, not fresh tests of our new installation or a new image-generation feature. The continuation interaction is resolved and scope/PRD are reconciled; see `spec-scratchpad.md`.

Do not import the inspected wrapper's 0.5–15-second guards as product limits. The owned integration must distinguish a convenience validator from an actual model/input/resource constraint. No minimum-padding/automatic-trimming workaround was approved merely to meet the published ordinary range. Exact native frame-count handling and actual successful durations on the target machine still require verification; warning-only UI behaviour is not a guarantee of successful long generations.

### 5. Old defaults and features are not our requirements

Do not copy these prototype behaviours into the new spec:

- Native clip audio defaults on; our PRD defaults to the original song.
- Archive restoration can reselect a clip; our PRD restores it unplaced.
- Overlap is rejected; our PRD retains overlapping clips with one dominant.
- Only eight outro beats are exposed; our PRD permits continued post-song generation.
- Source-end-only trimming is not our inclusive start/end-frame trimming.
- The prototype's special score-review, batch, mastering, remote-host, and provider-catalogue features do not automatically expand v1.

No old project/media migration has been requested or assumed.

## Proposed Product-Owned Knowledge Boundary

The requirement is accepted: new users must not need personal Pi skills installed. The following organization is a **proposal for the technical blueprint**, not yet a complete approved architecture:

1. **Versioned generator guidance:** prompting conventions, examples, music/lyrics/score handling, timing caveats, and documented supported inputs, bundled with the application and supplied to either provider.
2. **Deterministic tool adapters:** validated request schemas, actual installed paths, model/workflow identifiers, explicit seeds, job IDs, output manifests, progress, cancellation, and media checks. Do not rely solely on prose to enforce invariants.
3. **Provider adapters:** supply the same task/generator knowledge to Codex or Claude through their separately verified interfaces. Pi is reference material, not an additional runtime dependency.
4. **Generation provenance:** retain the user inputs, agent-produced tool inputs, actual execution settings, seed, workflow/tool versions, and knowledge-package revision used for that attempt.
5. **Installation recipes:** explicit versioned setup/check steps separate from creative guidance. Avoid copying hardcoded LAN names, personal model paths, or operational scripts with historical PIDs.

The creative agent can still exercise judgment; exact timing, seed reuse, file ownership, and whether computation has stopped should not depend on its narrative assurances.

## Remaining Investigation Before Spec Approval

- Verify native frame-count handling and actual duration/resource support against the accepted all-preset adaptive 8/4/2/1-beat policy, no blanket four-second minimum, and warning-only above 15 seconds. The continuation interaction is resolved and scope/PRD reconciled. Project/native FPS handling is resolved as globally fixed 24 fps.
- Verify exact Codex/Claude terminal contracts and requested model identities; Pi's provider configuration is not proof of either.
- Select persistence and supervision; specify the accepted single shared GPU-generation queue and verify exclusive execution/model unloading on the target host. The learner accepted this scheduling approach on 21 October, not an existing implementation or benchmark.
- Verify generator installation on Ubuntu 26.04 / 16 GB, including RAM/disk/offload requirements and coexistence.
- Verify complete lossless frame retention and actual tool cancellation.
- Pin distributable tool/model/skill sources, revisions, dependencies, and license notices. [YuE2's repository](https://github.com/multimodal-art-projection/YuE) separates code and model licensing; [Comfy's H3 model card](https://huggingface.co/Comfy-Org/MiniMax-H3) identifies a specific community license. Neither is blanket evidence that every checkpoint and output has unrestricted use.
- The H3-specific ComfyUI node source was not retrieved in the initial browsing attempt. The follow-up below successfully retrieved current upstream server and image-saving source. This does not establish H3-node or installed-version parity with the inspected local wrapper.

## Follow-up: Decoded Frames and Targeted Cancellation — 21 October 2026

The learner proposed a product-owned ComfyUI workflow branching the decoded image batch into a frame saver and the video encoder, plus wrappers recording actual process/job IDs and provenance. This is accepted design direction, not a tested implementation or approval of the entire technical architecture.

Read-only HTTPS inspection retrieved ComfyUI `server.py` and `nodes.py` at revision **`b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c`**, the upstream `master` revision reported during this check. This pins the evidence, **not the product's installation version**. No generation, workflow submission, queue deletion, interruption, installation, or live service mutation was performed.

### Full-frame saving

[SaveImage at this revision](https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L1669-L1728) iterates every image in an `IMAGE` batch, writes numbered PNG files, and returns an ordered file list. With metadata enabled it can include the submitted prompt and extra PNG information. This supports the proposed decoded-batch branch rather than retaining only the final image.

The implementation quantises/clamps decoded pixels to 8-bit before saving. PNG is lossless for those saved pixels, **not a bit-exact float-tensor archive**. It avoids lossy-video encoding degradation in later frame references. The spec must name the retained representation honestly and verify colour/bit-depth handling, complete sequence count/order, and source-index agreement with the encoded viewing copy. Saving the sequence remains additional disk work/storage; no capacity or performance claim was tested.

### Cancellation and receipts

The [documented server routes](https://docs.comfy.org/development/comfyui-server/comms_routes) expose submission, queue, interruption, history, and progress interfaces. The [pinned implementation](https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1242-L1286) is more specific:

- `POST /queue` with a delete list removes matching queued prompt IDs. Do not clear the whole queue to cancel one product job.
- `POST /interrupt` with `prompt_id` only invokes interruption when that ID matches a currently running prompt. Omitting the ID invokes global interruption.
- A non-running/non-matching ID is skipped but still receives HTTP 200. An HTTP acknowledgement therefore does not prove compute stopped. Verify the pinned installed API and reconcile queue/running/terminal state, including completion and cancellation races.
- Tool-owned process groups are relevant to directly launched workers; the shared ComfyUI service must not be killed indiscriminately. Ending Codex/Claude is not sufficient if it already submitted an independent generator job. A cancelled attempt also needs a fence against later submissions.

Persist the attempt and intended inputs before launching work, then append actual tool IDs, resolved seeds/settings, workflow/checkpoint references, outputs, and outcome. PNG metadata/output receipts can corroborate history but cannot be its only source: cancelled or failed runs may never reach an output node. Do not label intended calls as executed, or invent an output/seed when the tool never ran.

No immediate GPU-stop guarantee or fresh end-to-end frame-retention proof follows from this source inspection. Test queued cancellation, active cancellation, cancellation during submission, completion races, and restart/seed preservation during the build. The actual installation revision remains open. In the subsequent 21 October exchange, the learner accepted one shared GPU-heavy generation queue with explicit unloading between tools; its implementation and resource-release verification remain future work.

Evidence SHA-256:

- `server.py`: `6e3614c753c95b037e57e25dfc2de979de70136baad2a3abb5d2d32aaf05281e`
- `nodes.py`: `a6db3d4ea52220db85bf92a01e27a3e8b17545f7d1c6d2fc6c929f1eb27b111e`

## Source Fingerprints

SHA-256 recorded from the remote files during inspection. Paths below are on Artigas; these hashes describe this snapshot, not perpetual current state.

| File | SHA-256 |
|---|---|
| `music-studio/README.md` | `9759566bc9e07cd4d96f4be37ab1c79e62e0162dd845c0b4ed70ad59598cee1d` |
| `music-studio/server.rb` | `daf96a2b43f974c8f3c18d94213815c0313fb1d71e1f50441dc23383b50e9e9e` |
| `music-studio/lib/worker.rb` | `b717c740c67e68af53f5b0ca5fe2c578daa6117d80bcbc6f709f79993b5c58ff` |
| `music-studio/lib/media.rb` | `947903da61413058ab8fceaf38da4e553010664c727e249d5ccfa303083fc1b2` |
| `music-studio/lib/store.rb` | `428d39f4b5d400d79bf7e49a7b0230083f99ed6d00a2b4e205e9e575c2dd2ce9` |
| `music-studio/lib/mix.rb` | `101c69ae71fed8900b5af44675126189069eaedcb5dc9ded54633da7b902a78b` |
| `music-studio/scripts/analyze.py` | `8edcf156d295c944f01965b2be81b0b9fd7810498d3a8f4d62fc62f086d75814` |
| `pi/skills/music-generation/SKILL.md` | `8d16d6e6342600afd1be999444ce2a23e3d2634359f42e5fbcab0aefa7fdc310` |
| `pi/skills/music-generation/references/options.md` | `1b9f9694f7d63b1e73410d02574d089a7b57aeb46946cc9052152af5e005ae75` |
| `pi/skills/video-generation/SKILL.md` | `2ddc364d3e7beb45ac2703c23e9884cddadad48d09f496ea86112736b2289455` |
| `pi/skills/video-generation/scripts/video_generation.rb` | `1f562b8093d5bbaa268a401f58981e4281f8e0e420de4efe5bbc0fac1dbd3b3b` |
| `pi/skills/video-generation/references/minimax_h3_prompt_enhancer_system.txt` | `270567d015af8e09ebbd4e0b6d8f8f327cbdabc6eb14864e303b799cb79b1a71` |
