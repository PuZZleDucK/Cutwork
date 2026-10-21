# Technical Specification — Working Scratchpad

Started 20 October 2026 when the learner invoked `4-spec`.

This is an interview/investigation record, **not the technical specification or an approved architecture**. `scope.md`, `prd.md` and `spec.md` are approved. The learner approved the revised technical blueprint, including P9, on 21 October 2026 ("perfect, all sounds great"); `spec.html` is the approved visual companion. Historical draft/recommendation notes below are superseded by this approval. Keep consequential technical choices learner-owned and separate recommendations from accepted decisions.

## Request and Approach

Turn the approved product requirements into a technical blueprint, with explicit component responsibilities, data ownership, integration contracts, failure handling, and verification. Preserve the learner's deliberate, one-question-at-a-time pace and HTML review preference.

The learning goal is to understand the distinction between scope, requirements, and specification, using this project's actual decisions. Do not start application implementation or install tools as an incidental part of planning.

## Constraints Already Established

- Ubuntu 26.04 and a 16 GB NVIDIA GPU are the support target, not verified compatibility.
- Use a LAN-accessible web interface with all application services, agent CLIs, generation/media tools, and project/media storage on one Ubuntu GPU host for v1. Other LAN devices run only the browser interface. Anyone who can reach the interface can use it: no application login, user accounts, roles, or per-user restrictions in the prototype. Packaging and startup mechanisms are not yet selected.
- Beginners receive product-managed setup. The shared provider choice is Codex/Claude with the requested fixed model pairings; exact identities and supported integration interfaces require verification.
- Jobs continue through browser refresh/project changes. Submitted requests retain their provider, project, song, timing, inputs, and seeds as defined in the PRD.
- Preserve project isolation, per-song arrangements, generation provenance, original frames, and the approved seed/recovery rules.
- Keep the agreed timing, trimming, continuation, coverage, dominance, and soundtrack behaviour. A tool constraint must be raised explicitly rather than silently weakening a requirement.
- The demonstration remains a short song and roughly three clips with independent VLC playback. A public repository and demo video are required; public hosting is optional.
- The learner wants more experience working with TypeScript and initially had no particular frontend/backend framework preference. They have now accepted the proposed React/TypeScript + Vite UI and Node.js/TypeScript + Fastify backend. This selects the application stack, not the entire technical blueprint.
- The existing personal prototype at `/home/puzzleduck/music-studio` on Artigas has now been inspected read-only, including its completed funk/car and nursery/chalkboard examples and Pi generation skills. See `prototype-investigation.md`. It is evidence, not an automatically selected architecture or a commitment to copy its code.
- The product must provide its own generator knowledge to Codex and Claude. It must not assume the user's personal Pi skills are present; Pi is a reference resource, not a new v1 runtime dependency.
- On 21 October the learner explicitly replaced configurable/default-30-fps projects with **exactly 24 fps globally**: no rate selector or frame-rate conversion in v1. Scope and PRD retain approved status with a dated amendment. Preserve arbitrary-precision timing intent and whole-frame realised boundaries.
- The learner supports a product-owned ComfyUI workflow saving the complete decoded frame batch before video encoding, and tool wrappers capturing process/job IDs and execution details. These establish design direction, not proof of tested cancellation or an approved complete architecture.
- On 21 October the learner accepted one shared queue for GPU-heavy music/video generation across all projects, with one such generation executing at a time and explicit model unloading/resource handoff between tools. Editing and non-GPU prompt preparation can continue while requests wait.
- The subsequent duration decision rejects a blanket four-second minimum and a hard 15-second product cap: short clips remain allowed and requests over 15 seconds receive a non-blocking warning with a suggestion to split manually. The learner then applied one adaptive 8/4/2/1-beat duration rule to every beat-based generation preset, including gap filling, Continue From End, and post-song presets. This is now reconciled into scope/PRD and their HTML companions.

## Historical First-Draft Checkpoint (superseded by approval)

The learner accepted the offer to draft the blueprint with "i think thats good, go ahead". The substantive first `spec.md` is now `status: draft`; `spec.html` supplies an offline architecture map, interactive journey and all canonical content. This instruction authorised drafting, not approval of choices first presented in that draft. Await the learner's review; do not start application implementation or silently treat the eight proposals as agreed.

The draft labels accepted foundations, proposed implementation choices and unverified gates separately. Proposals cover SQLite/filesystem persistence, agent planning versus owned execution, bootstrap/service delivery, precise timing representation, native frame granularity, media dependencies/song lifecycle, renderer/profile, and library placement context. Any proposed product-boundary change needs the learner's agreement and corresponding PRD reconciliation before build handoff. Six live gates preserve the real uncertainty around clean 16 GB setup, provider access, native media contracts, cancellation/resource ownership, edit/output parity and the end-to-end demonstration.

The skill-requested independent read-only review identified queued-input deletion races, unplaced/multiple-use continuation context, native-length audio conditioning, installed-versus-authenticated provider states, successful-result parameter reuse and explicit trim validation. These were corrected in the draft or made explicit learner-owned proposals. All 18 PRD feature headings and 160 acceptance criteria have mapped owners; mapping is not evidence that tests pass.

No application code, generator installation, media generation, real cancellation or autonomous repair was performed. Scope and PRD remain approved and unchanged in substance. Source evidence and local CLI help establish interfaces, not a working integration. See `screen-caps/spec-review-qa.md` for document verification and screenshots.

## Accepted Duration Policy — 21 October Follow-up

The learner reports successful 1–2 second clips and having seen others use H3 for single-frame image generation. These reports motivate testing short requests instead of turning the published ordinary range into a product restriction. The single-frame observation is not independently verified and does not add a separate image-generation mode to v1.

- **No blanket four-second minimum.** Permit shorter video requests without padding them to four seconds and trimming them solely to enforce the published ordinary range. Real positive-duration/frame-grid/input validity still needs a verified adapter contract; do not promise every possible frame count is natively supported. The earlier proposed mandatory short-range overshoot/trim policy was not accepted. Native frame-count granularity remains distinct from that rejected four-second rule.
- **Above 15 seconds: warn, do not block.** Add a visible warning marker with a hint to split the request into multiple generations. This concerns the generation's duration, not whether its absolute timeline end is after second 15. Exactly 15 seconds does not trigger a strictly-over-15 warning. Do not silently clamp, stretch, automatically split, require another confirmation, or disable Generate solely because of this advisory. Preserve requested inputs and report actual tool failures through existing generation recovery.
- **Adaptive duration for every beat-based preset.** Start at eight beats at/above 50 BPM, otherwise four. If the proposed duration exceeds 15 seconds, halve to two, then one. Do not halve below one beat even if it still exceeds 15 seconds. For steady positive BPM: 50+ selects eight; 16 to below 50 selects four; 8 to below 16 selects two; below 8 selects one. Exactly 16, 8, and 4 BPM yield 15 seconds at their selected counts without a duration warning. At 15 BPM select two beats/eight seconds, superseding the earlier four-beat/16-second example. At 3 BPM select one beat/20 seconds and warn. For irregular timing use the same beat-to-time mapping as the timing fields; define numerical representation and mapping in the spec, not a second inconsistent timing source.
- **Same count policy, distinct start rules.** Apply the adaptive count to empty-project selection, filling gaps, Continue From End and post-song presets. Ordinary gap filling still starts at the earliest free position and stops before the next occupied range, using no more than the adaptive count even when the gap is large. A 16-second gap at 30 BPM gets a four-beat/eight-second proposal, leaving the remainder for another user request. Continue From End retains the predecessor's realised adjacent-frame start, off-beat offset, and last retained original frame; only its duration default changes. Do not rewrite manually entered intervals or queued/running request captures.
- **Preserve beyond-song behaviour.** Use the adaptive window for later/post-song suggestions; the song end is not an occupied range and must not itself shorten a window. Keep existing independent start/end advisories. The duration warning can coexist with those advisories and the moved-clip-audio warning.
- **One beat is the reduction floor.** Below 4 BPM in the steady-tempo examples, one beat exceeds 15 seconds and retains the warning. No fractional-beat preset below one was requested. Manual longer ranges can also trigger the warning. Valid zero/negative/unknown-tempo handling remains analysis/input validation, not a lower preset category.

The preceding recommendation to block overlong submissions was superseded by this explicit warning-only decision. The inspected personal wrapper's 0.5–15-second validation is not an approved product rule; the product-owned adapter must not accidentally inherit a hard 15-second cap. Genuine model/backend/resource failures still need truthful reporting. UI permission to try a duration is not a compatibility or quality guarantee, particularly on the untested 16 GB baseline.

The learner explicitly resolved the continuation interaction and extended the same reduction rule to every beat-based start/end preset. Default Clip Timing, Continue From End, duration warnings, acceptance criteria, scope summary and review companions are reconciled. No additional timing-policy clarification is pending. Continue toward the first technical blueprint rather than reopening these settled behaviours. No generator, live queue, or host configuration was changed to investigate this decision.

## Accepted Shared GPU Scheduling

On 21 October 2026 the learner accepted the preceding recommendation with "yep, that sounds good".

- One application-owned queue serves GPU-heavy music and video generation from every project. Only one GPU-heavy generation executes at a time; other requests remain visibly queued.
- Tool changes include explicit model unloading and resource handoff. Merely ending an agent session or marking a database row complete is not evidence that GPU memory has been released.
- Editing, project navigation, and non-GPU agent prompt preparation can remain responsive. Preparation that itself needs the GPU must respect the same exclusive execution policy.
- Submitted work retains its original project, song, planned range, provider, inputs, and seed. Switching projects/provider does not reorder, migrate, or recreate those captured inputs. Queue ordering mechanics are still a spec detail; acceptance here does not add priority controls or automatic multi-clip generation.
- Cancellation/failure must reconcile actual generator state before another GPU job is admitted. Do not give the next job the GPU while the previous job may still be running.
- The application can serialize its own work; this is not permission to terminate unrelated processes or a guarantee that no external application uses the GPU. Insufficient resources should be reported through the existing failure/recovery behaviour.

Rationale: two models that may individually fit do not necessarily fit simultaneously. The accepted tradeoff is predictable visible waiting and model-switch overhead rather than simultaneous music/video generation. This supports `prd.md > Projects and Shared Tools`, `Music and Video Generation`, `Default Clip Timing`, and the agreed cancellation/status rules; it does not alter those product requirements.

Verification to include in the blueprint: cross-project contention, music-to-video and video-to-music handoff, browser refresh/project switching while queued, cancellation before/during tool execution, failed unloading, and no double-start while status is uncertain. No scheduler, generation, unloading, or memory measurement has been implemented or run during planning.

## Frame Retention and Job Ownership — 21 October Follow-up

The learner proposed branching from decoded images to retain every frame, alongside the existing video encoder. Current upstream ComfyUI `SaveImage` accepts an image batch and writes each image as a PNG, with optional prompt/extra metadata. Its built-in conversion produces **8-bit pixels**: PNG is lossless after that conversion, but this is not a bit-exact dump of the floating-point VAE tensor. The proposed workflow avoids lossy-video round-tripping for continuation. Record the ordered frame list and verify count, dimensions, colour/bit-depth handling, and index alignment against the viewing copy. No workflow was modified or executed.

The learner also proposed wrappers that capture the real process/job IDs. Primary source at ComfyUI revision `b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c` supports deleting a particular queued `prompt_id` and targeted interruption of a matching running `prompt_id`. Omitting the ID uses global interruption, which must not be the default cancellation path. HTTP 200 is not proof that a matching job existed or stopped. Pin/verify the installed API and reconcile queued/running/completed races; do not promise instantaneous GPU preemption.

Persist the attempt record before execution, then append actual tool IDs, resolved settings/seeds, workflow/model revisions, outputs, and terminal outcome. Output-node metadata is useful corroboration, not the sole history store: failed/cancelled work may never reach an output node. For an owned direct worker, track its process identity/group; killing the agent alone does not establish that its submitted generator job stopped. Cancellation must also prevent later submissions from that cancelled attempt.

These are technical design proposals supporting the accepted cancellation/provenance requirements. They were checked against upstream source, not tested on a live queue or on the eventual pinned product installation. See `prototype-investigation.md` for source links, hashes, and remaining checks.

## Accepted Application Stack

The learner accepted the recommendation with "sounds perfect, lets do it": React + TypeScript for the browser UI, Vite for frontend development/build tooling, and a Node.js + Fastify backend written in TypeScript. Keep generation/media tools in their native environments and integrate through individually verified process/service contracts.

Rationale: meaningful TypeScript practice across UI, request contracts, and job orchestration rather than a cosmetic frontend-only use. React components would organise the studio panels; the backend would own jobs independently of a browser tab. Fastify handles the HTTP interface, not an automatically persistent queue or media pipeline.

Tradeoff: the application still needs explicit boundaries to tools in other runtimes, including inputs, outputs, errors, cancellation, and file ownership. Sharing TypeScript definitions does not replace runtime validation of browser/agent/tool data. Persistence, process supervision, security, exact dependency versions, and generator adapters are not selected by this recommendation. Host topology was subsequently settled separately below.

Use an explicit TypeScript type-check step alongside Vite: Vite transforms TypeScript but does not itself run type checking. No dependencies were installed or application files generated. Acceptance of this stack does not approve the still-unwritten complete spec or start the build stage.

## Accepted Execution Topology

The learner specified "every thing on the Ubuntu GPU machine, and just the interface open anywhere on the lan" and "for v1 stick to the server does it all".

- The Ubuntu GPU machine runs the application backend, job execution, agent CLIs, generation tools, audio analysis, and media processing. Project records and generated media are stored there.
- The browser is a client, whether opened on that same machine or another LAN device. Install all installs tools on the server, not on the device displaying the interface.
- Browser navigation, disconnection, or refresh does not transfer ownership of server-side work or start a replacement job. The PRD's continuity requirement still needs explicit job/state/reconnection design.
- Local agent CLIs may still contact their external frontier provider. This topology does not require hosting frontier models on the GPU machine.
- Services distributed across other LAN machines belong to the future service-discovery model. No discovery, remote workers, or distributed job transport is added to v1.

This settles process/data location. LAN application access and shared GPU scheduling were subsequently settled separately. Operating-system privileges, credential handling, storage technology, and startup/supervision remain specification topics.

## Accepted LAN Access Boundary

On 21 October 2026 the learner specified "any user that can access the interface, no user restrictions" and deferred user accounts/restrictions until after the demonstration and proof of concept.

- No application login, accounts, roles, or per-user project ownership/access controls in v1. Anyone who can reach the interface has the same application capabilities, including shared setup and access to projects/media.
- Project isolation remains separation between projects, not private workspaces belonging to different authenticated people.
- The existing irreversible-delete and autonomous-debug confirmations still apply to everyone. Deferring user restrictions does not remove these agreed operation confirmations or input validation.
- Application access remains distinct from the server's Codex/Claude provider authentication and operating-system permissions. No application login does not grant additional OS privileges.
- Network reachability is the access boundary; there is no application authentication layer protecting the host-control features from a reachable user. Document this limitation clearly. Public internet exposure is not part of the v1 LAN deployment plan.
- User accounts and access restrictions are explicitly deferred. This does not add collaborative editing, user attribution, or other multiuser features to v1.

This decision settles intended access, not the implementation details of request validation, credential protection, or host process authority. No network listener or host permissions were changed during planning.

## Investigation Topics

These are planning topics, not a questionnaire the learner must answer all at once:

- Host process authority, credential protection, and request validation within the accepted single-host, no-application-login LAN deployment.
- Exact generator/model identities, supported integrations, dependencies, and applicable terms.
- Ownership of job execution, cancellation, progress, and reconnection; division between agent decisions and application-controlled operations.
- Persistent project/arrangement/provenance data and large-media storage/lifecycle.
- Musical time, requested decimal precision, realised frame boundaries, and preview/export consistency.
- Verified integration capabilities versus proposed design or simulated test fixtures.

## Prototype and Knowledge Investigation — 21 October 2026

The learner supplied `http://artigas.local:9121/#`, stated the code is on Artigas, and identified Cardogs (funk) and Nells Well (nursery rhymes) as the completed examples. The listener's cwd identified `/home/puzzleduck/music-studio`. Browser views, source inspection, targeted manifests/receipts, and FFprobe of existing assets are recorded in `prototype-investigation.md`, with source hashes and screenshots.

The product-owned knowledge requirement is accepted. A versioned guidance package, deterministic generation adapters, and separate Codex/Claude provider adapters are proposed as its technical expression; the entire architecture is not yet approved. Preserve creative agent judgment while validating execution facts and retaining exact inputs/settings.

The observed prototype uses Ruby/WEBrick, atomic JSON state, a sequential worker, Pi print-mode sessions, YuE2 via a remote installation, and H3 via remote ComfyUI graphs. This does not replace the accepted TypeScript stack or single-server topology. Its native-clip-audio default, archive restore placement, overlap rejection, outro cap, and source-end-only trim differ from the new PRD and must not be imported accidentally.

Evidence boundary: no generator was run, no new export produced, and no installation, queue interruption, test suite, service, project, or credential configuration was changed. Existing exports loaded and showed decoded frames; no full playback/listening or fresh 16 GB compatibility test was performed.

## Checklist

- [x] Verify approved scope/PRD and read the learner context and `4-spec` guidance.
- [x] Establish language/framework preferences: more TypeScript experience; no specific framework preference.
- [x] Agree the application stack: React/TypeScript + Vite and Node.js/TypeScript + Fastify, with external generation tools in their native environments.
- [x] Agree execution topology: one Ubuntu GPU server runs everything; local or LAN browsers provide the interface only. Distributed services/discovery remain future work.
- [x] Agree the LAN access/trust model: anyone who can reach the interface may use it; accounts and per-user restrictions are deferred.
- [ ] Agree the remaining consequential architectural choices, grounded in the actual generator integrations.
- [x] Inspect the identified prototype and generation skills read-only; record completed-example artifacts, source fingerprints, and consequential differences from the PRD.
- [x] Resolve the native/project rate conflict: learner selected global 24 fps, with no selector or rate conversion; amend approved scope/PRD and their review companions.
- [x] Check upstream batch image saving and targeted ComfyUI cancellation; distinguish source inspection from a live integration test.
- [x] Agree one shared cross-project GPU-generation queue with one heavy generation at a time and explicit resource handoff; non-GPU preparation/editing remain responsive.
- [x] Record the learner's duration policy: no blanket four-second minimum; warning-only above 15 seconds; all beat-based presets use the adaptive 8/4/2/1-beat rule, stopping at one even when it warns.
- [x] Resolve the slow-tempo continuation interaction and reconcile duration/tempo changes into approved scope/PRD and HTML together; add threshold, gap, continuation and warning acceptance cases.
- [ ] Complete primary documentation/interface verification and pin dependencies; prototype inspection and initial upstream checks do not establish fresh installation, cancellation, full raw-frame retention, or provider compatibility.
- [x] Define components and trace each PRD behaviour to its implementation responsibility.
- [x] Define data relationships, integration contracts, and annotated file structure.
- [x] Define startup/demo instructions and a verification approach consistent with the learner's tests-before-implementation review preference.
- [ ] Resolve consequential unknowns; retain explicit evidence boundaries for remaining feasibility checks.
- [x] Write the first substantive `spec.md` as a draft and create its HTML review companion.
- [ ] Review the blueprint and obtain approval before handing off to `5-build`.

## Decisions and Learning Notes

**Learner preference:** get more experience working with TypeScript; no particular framework in mind.

**Accepted recommendation:** the React/Vite + Node/Fastify split above. The learner's agreement applies to this stack, not unspecified storage, networking, security, or process-supervision decisions.

**Accepted topology:** one GPU host owns application execution and project/media data; LAN devices are browser clients only. This is a concrete specification decision supporting the LAN-interface requirement without bringing the future distributed-service vision into v1.

**Accepted access scope:** no application authentication or user restrictions for the proof of concept; all reachable users have the same capabilities. Preserve operation confirmations and provider sign-in requirements, and document the absence of an application access barrier.

**Accepted knowledge ownership:** ship the generator guidance needed by Codex/Claude rather than relying on personally configured Pi sessions. Actual skill/package and execution-adapter boundaries remain proposals for the spec.

**Accepted scheduling:** one shared queue serializes GPU-heavy music/video generation across projects, including explicit model unloading/resource handoff. This is a technical mechanism supporting the existing queue/continuity requirements, not a change to captured creative intent or permission to claim measured 16 GB feasibility.

**Accepted duration policy:** do not equate a published ordinary output range with mandatory product validation. The learner chose short requests without a blanket four-second minimum, an advisory rather than a block above 15 seconds, and a shared adaptive 8/4/2/1-beat rule for all beat-based presets. The continuation interaction is resolved: preserve its distinct frame-adjacent start while using that same duration policy. Preserve the distinction between user-reported success, source-level constraints, and fresh tested compatibility. No automatic four-second padding/trim or long-request splitting policy was approved.

**Concrete learning example from investigation:** 30 fps in the earlier PRD was a desired product property, not proof that H3 generates at that rate. Investigation led to an explicit product amendment to globally fixed 24 fps, rather than silently introducing conversion during implementation. The PRD now states the common grid; the spec must still define exact timing/index mappings and generator-length handling. Similarly, retaining a complete encoded video is not retaining every pre-lossy frame. A workflow branch is the proposed mechanism for the already-approved frame-preservation requirement.

Example of the planning-layer distinction to discuss: the PRD requires a generation to survive a browser refresh. The spec must identify which process owns that job, where its progress/result is recorded, and how the reopened browser finds the same attempt without starting another.

## Primary Documentation Checked

Checked during this recommendation on 20 October 2026. These establish general framework/runtime capabilities, not compatibility with the particular generators or proof of a working application. Exact compatible versions still need selection.

- [React: Using TypeScript](https://react.dev/learn/typescript) — typed components and hooks.
- [Vite: Getting Started](https://vite.dev/guide/) — development server, production build, React/TypeScript template.
- [Vite: TypeScript handling](https://vite.dev/guide/features.html#typescript) — transpilation is separate from type checking.
- [Fastify: TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) — typed server requests and responses.
- [Node.js: Child processes](https://nodejs.org/api/child_process.html) — asynchronous process invocation. This does not establish tool-specific cancellation, job persistence, or reboot recovery.

Additional primary sources checked on 21 October 2026; detailed evidence and limitations are in `prototype-investigation.md`:

- [MiniMax H3 specifications](https://www.minimax.io/news/minimax-h3-open-source) — published native output rate and modality distinctions.
- [YuE2 repository](https://github.com/multimodal-art-projection/YuE), [model card](https://huggingface.co/m-a-p/YuE2-3B), and [upstream agent skill](https://github.com/multimodal-art-projection/YuE/blob/main/skills/yue2-music/SKILL.md) — identified tool family, staged workflows, and separate licensing/installation evidence.
- [Comfy H3 model card](https://huggingface.co/Comfy-Org/MiniMax-H3) — model components and named license; not approval of a particular derivative checkpoint.
- [FFmpeg fps filter](https://ffmpeg.org/ffmpeg-filters.html#fps) — investigated before the learner selected fixed native 24 fps; conversion is now outside v1.
- [ComfyUI routes](https://docs.comfy.org/development/comfyui-server/comms_routes), [pinned queue/interrupt implementation](https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1242-L1286), and [pinned SaveImage implementation](https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L1669-L1728) — source-level support for per-job cancellation requests and full-batch 8-bit PNG saving; not a live test or selected installation revision.

## First Draft Evidence — 21 October 2026

Local read-only help: Codex CLI 0.163.0; Node v24.1.0; npm 11.21.1; Claude not installed/in PATH in the development environment. These are not target-host compatibility pins. Official documentation identifies `gpt-6.1-sol` and `claude-opus-5-5`, noninteractive structured-output interfaces and explicit autonomous Debug flags; real account/CLI compatibility remains a gate. SQLite's current WAL documentation requires the WAL-reset fix in the eventual embedded runtime. See `spec.md > External Services and Dependencies` for primary links and exact proposed invocation contracts. No credentials were inspected and no model call was made.


## Learner Review Revision — 21 October 2026

- Target corrected to **Dundee**; Artigas remains prototype evidence only. No Dundee probe/install was performed.
- Require separate ComfyUI and YuE2 Python environments; do not modify host Python package state or replace its default interpreter. Environment isolation is not agent confinement.
- **Rejected** constrained creative-plan/executor split and forced JSON/read-only/tool-removal settings. Agents retain normal tools/configuration, research, history, scripts and score editing. Helpers/workflows record execution without being the only allowed route.
- Project agent cwd: `<data-root>/projects/<project-id>/workspace/`; per-attempt run folders, explicit project sessions, no global latest-session resume. Shared-tool Debug retains the agreed tool cwd/confirmation.
- Continue From End is on each clip; no separate picker/place-first prerequisite. Saved edit context is separate from included placements.
- The learner accepted all other proposals. P1/P3/P4/P5/P6/P7 are accepted, P2/P8 replaced; do not repeat their approval interview. PRD/scope reflect approved product refinements.
- **P9 is the only new recommendation:** host bootstrap checks/installs shared native FFmpeg/FFprobe; the existing Audio analysis panel manages Librosa in its own isolated Python environment. Verify actual service-account executables, codecs and tiny fixtures; no new mandatory panel. Await the learner's response to this split, not a second full-spec sign-off.
- Librosa can support onsets, energy, spectral/chroma features, recurrence/segmentation, silence and harmonic/percussive analysis. These are informative possibilities, not new required editor features, mastering or reliable semantic labels.
- Independent revision review identified file-backed retry snapshots, missing-observability lifecycle, stable per-card edit contexts and full-authority Generate disclosure; corrections incorporated into spec. This is a documentation review, not executable acceptance evidence.
- New documentation checked: Python venv; Librosa 0.11.0 install/feature/beat/onset/segment/effects references; Ubuntu 26.04 FFmpeg package listing; Claude CLI reference and local Codex help. Version pins and Dundee compatibility remain gates.


## Approval and Next Stage — 21 October 2026

The learner said "perfect, all sounds great", approving the revised blueprint and the remaining P9 setup split. `spec.md` is now `status: approved`; the HTML companion reflects approval. `4-spec` is complete. No further planning sign-off or repeated interview is required. Next is `5-build`, preserving the learner's tests-before-feature-code review workflow and the six evidence gates. No application code, installation or generator execution was started during this approval update.
