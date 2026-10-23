---
doc: spec
status: approved
---

# AI Music Video Maker — Technical Spec

**Approved by the learner · 21 October 2026 · Working name, not a chosen brand.**

Markdown is canonical; `spec.html` is the offline visual companion. The learner accepted the other first-draft proposals while explicitly correcting the deployment host, Python isolation, agent autonomy, project working directories and per-clip continuation. Those decisions are recorded as accepted below; the rejected constrained-plan architecture is not retained as a fallback. The learner approved the revised blueprint and the host/tool dependency setup split with "perfect, all sounds great" on 21 October 2026. `4-spec` is complete; no further planning sign-off is required. Application implementation has not started and belongs to `5-build`.

**Reading key:** **Agreed/Accepted** records the learner's choices. **Accepted P9** records the approved host/tool dependency-installation split. **Gate** means evidence still required before claiming the integration works. Accepted design is not a feasibility certificate.


**Product identity, 24 October:** the learner selected **Cutwork**. Use the
original hazard-striped clapperboard SVG in the navbar and favicon. Actions,
including delete/remove/range-preset/mute, have button styling rather than
underlined link styling. Preserve existing runtime paths and stored identities.

## How This Works, In Plain Language

The browser is the studio's control surface, not the machine doing the work. Dundee, the target Ubuntu GPU server, remembers projects and edits, installs and monitors the tools, runs the selected frontier-agent terminal program, and owns every generation even when you close the browser.

The agent is a creative worker, not a JSON-plan compiler. Give it the user's intent, this project's context, generator skills, working tool paths and helpful wrappers/workflows; let it research, inspect relevant history, write scripts, create or edit scores, and invoke tools using its normal capabilities. **Agreed:** no product-added sandbox, read-only mode, tool denylist, configuration-stripping mode or forced JSON response. Wrappers and workflows help record real calls, seeds, processes and outputs; they do not prescribe the only permitted creative route.

Project workers start in a stable project-specific workspace on Dundee and can share that project's notes, references, scripts and scores. Separate folders and context selection prevent accidental mixing by the application, not filesystem access by an unrestricted agent. The server still stores submitted intent and checks actual media; it does not infer successful generation merely from the agent's final prose.

One shared queue lets music and video take turns using the GPU. A small local database remembers requests and edits; large media lives in ordinary server directories. Each song has its own arrangement, while the project's clip library can be reused across its songs. The same edit plan determines both preview and export: which clip is visible, which audio source wins, and where black frames or silence belong.

**The learning distinction:** “generation survives refresh” is a requirement. “Persist an attempt before launch, run it in the server worker, and let a refreshed browser fetch that attempt” is the specification that makes the requirement implementable.

## The Core Journey Through the System

1. **Prepare the shared tools.** The browser asks the setup manager to prepare the chosen provider and then the generator/analysis dependencies. Durable install records drive progress and navbar status; closing the page is irrelevant to the installer.
2. **Create a project and a song request.** The API records the project, user description, optional lyrics, provider/model snapshot, and assigned seed identity before acknowledging submission. The project agent receives the task and can research, create/edit a score and invoke native music tools. The supplied helpers coordinate GPU use and record actual execution.
3. **Verify and analyse the result.** The media store checks the real song file. Analysis records duration, waveform peaks and beat positions. A successfully generated song is selected once, with a new empty arrangement; an analysis failure is shown separately, not disguised as a failed or invented song.
4. **Prepare a clip.** The timing engine proposes the next free adaptive beat window. The user can edit it or use Continue From End. Submission freezes project/song, exact timing intent, realised frame interval, both prompts, conditioning references, provider and seeds. It reserves the interval and creates a placeholder immediately.
5. **Translate and generate.** The agent receives the captured style, clip idea and timing/audio context. The agent can use the supplied helpers/workflow or write a script. The supported integration path extracts the matching song interval, records the actual graph/seed/job ID and saves both video and all decoded pre-lossy frames. Custom paths need the same observable facts; they are not prohibited.
6. **Commit once.** Only validated output becomes an artifact and placement. Both belong to the originating project/song at the captured times, regardless of the currently open project. The next suggestion never relocates a completed request.
7. **Arrange, inspect and export.** Trims, moves, priority and audio-source choices update an arrangement revision. The browser previews the current edit immediately; explicit export renders a verified file from that revision. History exposes supplied inputs and actual calls. Export is a real downloadable file to test independently in VLC.

Implements `prd.md > The Core Journey`; component ownership follows below.

## Stack

| Layer | Choice and status | Why / tradeoff |
|---|---|---|
| Browser | **Agreed:** React + TypeScript, Vite | Typed studio components; explicit `tsc` checking in addition to Vite's build. |
| Application server | **Agreed:** Node.js + TypeScript, Fastify | Owns HTTP, validation, jobs and tools independently of browser tabs. |
| Native tools | **Agreed:** retain native Python/media environments | ComfyUI/H3 and YuE2 each have a separate isolated Python environment; helper contracts remain observable. |
| Persistence | **Accepted P1:** SQLite through `better-sqlite3`, plus filesystem media | Transactions without a database service. Short synchronous DB operations only; never do inference or media work in a DB transaction. |
| Queue | **Agreed:** one shared GPU-heavy lane. **Accepted:** persisted FIFO sequence, one Node worker module in the server process | No Redis, separate broker, remote workers or priority UI. Research/preparation may run ahead; helpers coordinate the accepted FIFO GPU lane. Unrestricted direct calls cannot be universally policed by that lane. |
| UI updates | **Accepted:** snapshot polling (about 1 s while active, 5 s idle) with revision numbers | Easier reconnect/debugging than a second persistent transport. Native tool progress may use its own WebSocket; the browser does not connect directly to ComfyUI. |
| Validation | **Accepted:** shared TypeScript contracts plus JSON Schema, checked by Fastify and at adapter boundaries | Validate HTTP requests, helper receipts and Python results; this does not impose a response schema on the agent. |
| Tests | **Accepted:** Vitest for domain/contracts, server integration tests, Playwright for actual browser flows, Python tests for media wrappers | Test cases reviewed before feature implementation; mocked success never counts as generator proof. |
| Runtime delivery | **Accepted P3:** Node 24 LTS at a tested patch, npm lockfile, user-level systemd service; isolated Python environments | One application service, not containers/Kubernetes. No dependence on the developer's installed packages. |

Select exact compatible package versions during the first contract/build slice, record them in lockfiles and a tool manifest, and test on Ubuntu 26.04. “Latest” is not a reproducible installation recipe. SQLite WAL requires a version containing the upstream WAL-reset fix (3.51.3+ or documented backport); record the embedded SQLite version, not just the JavaScript package version. See [SQLite WAL](https://www.sqlite.org/wal.html), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), and [Node release policy](https://nodejs.org/en/about/previous-releases).

## Where It Runs and How Someone Tries It

**Agreed:** the named deployment/demo target is **Dundee**, not Artigas. Artigas is the laptop hosting the inspected personal prototype; that evidence is not a hardware recommendation. Everything except the browser runs on one Ubuntu 26.04 Desktop machine with an NVIDIA GPU and 16 GB VRAM. This includes provider CLIs, project files, Python environments, ComfyUI, YuE2, analysis and FFmpeg. Frontier model requests still contact their provider over the internet. Sixteen-gigabyte feasibility is a gate, not measured evidence; 8 GB support is deferred.

**Accepted P3 — launch contract, not commands available today:** from the future release checkout, run `./scripts/bootstrap-ubuntu.sh`. It checks the OS, driver visibility, disk space and host prerequisites, installs the pinned application runtime/build, creates a user service, and prints the studio URL. It must not silently replace an NVIDIA driver. Any required privileged package step is described and authorised locally by the operator; no sudo password enters a web form, agent prompt or log. Generator downloads and installations remain in the product's setup UI, not manual prerequisite homework.

The intended developer start sequence is:

```sh
npm ci
npm run typecheck
npm run build
STUDIO_HOST=0.0.0.0 STUDIO_PORT=9122 npm start
```

Open `http://localhost:9122/` on the server or `http://<server-name-or-IP>:9122/` from the LAN. On Dundee that would be `http://dundee.local:9122/`, **if that hostname resolves and the application is installed there**. Keep the selected 9122 application port; the Artigas prototype on 9121 remains an independent reference. Dundee's hostname resolution, available port and installed capabilities have not been probed during this revision. For development, `npm run dev` will run Vite on localhost:5173 with `/api` proxied to the backend. LAN demos use the built single-origin server, not an exposed Vite development server.

The selected service design is `music-video-studio.service` under the normal server account. It owns the server and tool subprocesses; browser refresh cannot stop it. Service restart is a reconciliation event, not a promise to resume GPU computation after a crash or reboot. Do not auto-retry uncertain jobs. The bootstrap must explain what happens on logout and offer the explicit user-service persistence setup needed for unattended operation; do not silently change system policy.

Data root: `${XDG_DATA_HOME:-$HOME/.local/share}/music-video-studio/`; tools under that root's `tools/`, configuration under `${XDG_CONFIG_HOME:-$HOME/.config}/music-video-studio/`. Environment overrides permit another local disk. Do not put the SQLite database on a network share or commit media, credentials or personal state to Git.

**Access boundary:** no app accounts, roles or private per-user projects. Every reachable LAN user can generate, delete and authorise host-changing Debug. Ordinary Generate also launches a full-authority creative agent, without the separate Debug confirmation; its normal tools can affect files or shared services outside the project workspace. Project directories organise work, not access control. Keep native generators bound to loopback, reject unexpected Host/Origin and cross-origin mutation requests, validate paths/IDs, and use no permissive CORS. Those are request safeguards, not user authentication. Do not expose this service publicly or claim LAN reachability makes it secure against reachable users. Provider authentication and OS permissions remain separate.

**Demo/ship:** bootstrap on a clean supported host, use setup panels, make a song and roughly three clips, show history/timing, export, play in VLC. Timelapse waits honestly. A short demo video and public GitHub repository are required; public hosting is not. The new bootstrap, startup scripts and service do not exist yet.

## Look and Feel

**Second workspace refinement, 23 October:** project selection and five-second floating notification announcements live in the navbar. Tabs precede the project name and stay selected across project switches; hazard stripes guide Music then Video. Duration/BPM precede truncated soundtrack titles. Clip cards form a 4–5-column desktop library, distinguish placed clips, and expose trim/position/audio controls without disclosures. Technical frame/provenance and repeated timing prose move out of the working UI, not out of retained records. Priority is edited in the sequence: top lane wins; each placed clip remains one whole block in one row, with at most one move-up control. Never split a clip across rows to reduce row count. Shared Config provides actual music/video agent templates with explicit Save/default restoration and revision-conflict handling. Each new attempt captures template text/revision, preserving old queued/running/retry instructions. See `workbench-round-two.md` for verification.

**23 October workspace refinement:** use a compact project selector and explicit Music / Video / Archive / History navigation rather than a long stack of cards. Keep video direction, preview and sequence together on desktop; stack them on narrow screens. Continue From End and Place/Remove are visible per-clip actions, with separately labelled Timing & audio controls. Clicking a placed timeline clip opens its exact saved edit, including repeated uses of one clip. Section changes preserve drafts, and parameter reuse opens/focuses the appropriate editor. This changes presentation and reachability, not generation, timing, archival or agent-authority rules.

Carry forward `prd.md > Look and Feel` and `Screens and Layout`: Projects/Config navigation; shared setup strip above project work; music, video generation, waveform timeline, library, preview/export, archive and expandable history.

Use Kirsty for top-level titles **once the specific asset's web embedding and redistribution terms are verified**; use a system sans-serif for ordinary UI and a system monospace for times/logs. Do not call an unbundled local fallback a verified Kirsty rendering. [The official Kirsty page](https://typodermicfonts.com/kirsty/) identifies the font; downloading or assuming a permissive licence is not part of this planning work.

**Slice-9 asset verification (23 October 2026):** bundle the unchanged historical Kirsty Regular v1.0 (2000) TTF from Ubuntu's `fonts-larabie-straight` package, with its original author licence and notices. The retained licence permits unmodified redistribution; the current commercial/free-desktop release is not substituted. Exact source/package/font hashes and the no-modification record are in `apps/web/public/fonts/provenance.json`. This satisfies the asset-provenance gate, not a claim that Kirsty itself is MIT or open source.

**Accepted styling direction:** graphite surfaces, warm neutral text, amber for unfinished/advisory states and a restrained cool accent for selection. Hazard stripes mark work still needed and gaps; movement marks actual activity or the next essential action, not every panel. Respect reduced-motion preferences, provide text/icon status rather than colour alone, visible focus and keyboard-operated dialogs/disclosures. Numeric controls distinguish source frames from song positions. On narrow screens stack panels and allow the timeline's own horizontal scrolling rather than shrinking timing text. This review page is a document, not a finished product mockup.

## Components

### C1 — Studio UI and Project Workspace

Render global warnings and transient messages in a fixed, viewport-bounded notification stack outside workspace flow. Individual dismissal and a review toggle remain keyboard accessible; hidden draft-conflict recovery actions can be reopened. Persist only known standing advisory dismissals in sessionStorage, with an in-memory fallback. Reconcile resolved operational messages and assign occurrence IDs to new errors so later identical failures are not suppressed.

Manual song selection is a single revision-checked store transaction: read the selected song’s originating attempt, restore only its original musicPrompt and lyrics, preserve project visual style, and save selection plus draft together. The client immediately adopts the returned draft, without allowing stale polling to overwrite it or later typing. Selecting the same song preserves edits.

Implements `prd.md > Projects and Shared Tools`, `Frontier Agent Setup and Selection`, and `Screens and Layout`.

React renders server-owned snapshots; local component state holds unsent edits, selection focus and disclosure state. Save project style and selected song to the server. Accepted draft-form persistence is per project/song in the server record, debounced with a revision; refreshing restores saved drafts, but a draft is never a submitted request. A visible dirty form is not overwritten by polling.

Shared setup/provider status sits outside the project route. Provider selection opens from its indicator and updates only the default for new submissions. Tool queue counts include all projects and count waiting attempts, not completed/cancelled work or the active item. Show missing-sign-in guidance on hover and keyboard focus. Track installation, authentication and usability separately. A successfully installed provider collapses into its navbar indicator even if it still needs sign-in; that indicator shows the named authentication error and guidance until usable. Generator/analysis panels collapse after their installation readiness checks pass. Reduced-motion users get the same state change without animation.

Project selection and manual song selection are durable. Successful song ingestion selects the new song exactly once; reopening does not replay that selection side effect. Server completion never changes whichever different project the browser is currently displaying. Coverage is labelled coverage, not “finished”.

### C2 — API, Persistence and Mutation Boundary

Implements `prd.md > Projects and Shared Tools`, `Song Selection and Saved Arrangements`, and the continuity requirements in `Music and Video Generation`.

Fastify is the only application writer to SQLite. Use foreign keys, migrations, short transactions, a single connection and WAL on local storage. Media is not a BLOB in the database. A transaction creates a generation intent, attempt, reservation, placeholder and history event together. An idempotency key makes a repeated browser submission return the existing attempt; it is not a second creative generation.

All project-owned lookups validate project membership even without accounts, preventing accidental cross-project references. Arrangement edits use an expected revision: concurrent/stale edits receive a conflict and refreshed data rather than overwriting silently. This is basic lost-update protection, not collaborative editing or undo.

Results are ingested with unique attempt/artifact and placement-origin constraints. Verify files first, then commit the artifact and placement once. A recorded “publish pending” step bridges filesystem moves and DB commits; reconciliation can finish that step without rerunning the generator. Never treat filesystem and SQLite operations as one magically atomic transaction.

### C3 — Provider Adapters and Product-Owned Generator Knowledge

Keep MusicInput (musicPrompt, lyrics) separate from the project draft’s persistent visual style. New music API requests and captured agent instructions exclude project visual style. Read legacy records without rewriting their provenance; validate and continue already-captured legacy plans against their exact original inputs.

Implements `prd.md > Frontier Agent Setup and Selection`, `Music and Video Generation`, `Persistent Visual Style`, and `Generation Seeds and Variations`.

**Agreed P2 replacement — unrestricted creative agents.** Keep the agent in charge of the creative process and actual tool calls. Ship versioned music/H3 guidance, score/lyric conventions, timing examples, working environment paths and receipt-producing helpers. Do not require a predefined plan, schema-shaped final reply or a closed set of tools. It may use its normal web/research tools, plugins/MCP connections, installed skills, relevant chat histories and shell, and write or edit scripts/scores when useful. Preserve normal provider configuration; product instructions add project/tool knowledge rather than replacing its normal capabilities.

Provider adapters expose `runTask(input)`, `cancel(handle)` and `checkReadiness()`, not a mandatory `preparePlan()` phase. A submitted request snapshots provider/model, project/song, creative inputs, timing, assigned seeds and product guidance revisions. Switching the shared default does not retarget queued/running work. Missing provider/model access is a visible failure, not a silent substitution.

Start ordinary project agents with cwd `<data-root>/projects/<project-id>/workspace/`. Keep shared project references, research notes, scores and reusable scripts there; put request-specific artifacts under `runs/<attempt-id>/`. All project workers can find this context. Record session IDs against project/attempt; never implicitly resume a globally "latest" session or inject another project's conversation. An agent may deliberately consult relevant history using its normal tools; we do not disable that capability. Multiple workers use distinct run paths for intermediate files and publish shared updates deliberately, avoiding accidental overwrites without restricting their tool access.

This directory is an organisational starting point, **not a sandbox or security boundary**. Normal creative tasks and confirmed Debug run without product-added confinement, subject to the OS account and provider's own capabilities/policies. Shared-tool Debug retains its previously agreed tool-directory cwd and explicit confirmation; it is a global maintenance task, not an ordinary project worker.

**Observability is separate from creative constraints.** Helpers and Comfy output nodes can write machine-readable receipts automatically while the agent speaks normally. Record actual prompts/settings, seeds, native job IDs, workflow/model versions and outputs from those receipts and native logs. Agent-written scripts may call the helpers or register equivalent execution details. JSON inside the internal API or a helper-generated receipt is not a requirement that the agent answer in JSON. Inspect/validate actual files independently. Missing evidence is marked incomplete and investigated, not invented from a confident completion message. Uncertain native ownership stays `reconciling`, holds the GPU lane and cannot be labelled cancelled. If process completion is verified but required provenance remains missing, show an explicit incomplete-integration failure rather than ordinary verified success; retain discovered media for investigation without automatic placement. These are rules for application claims, not agent permissions.

Instructions still communicate the user's requested project, seeds, timing and GPU-sharing policy. They are task requirements, not a hidden permission filter. **Gate:** arbitrary uninstrumented or detached tool calls may evade job tracking, seed capture and immediate cancellation; unrestricted operation cannot honestly promise universal interception. The supported generation path must demonstrate the PRD guarantees with the supplied integration, and any observed deviation is reported rather than "fixed" by silently reintroducing a sandbox/tool denylist.

### C4 — Durable Jobs, GPU Scheduler and Cancellation

Implements `prd.md > Music and Video Generation`, `Generation Seeds and Variations`, and `Default Clip Timing`.

Use a persisted state machine: `queued → preparing → waiting_gpu → running → validating → succeeded`; failures become `failed`; cancellation goes through `cancel_requested` until stopped, then `cancelled`. `reconciling` means ownership or outcome is uncertain. UI groups these as queued/running/failure/cancelled with readable stage details, never invented progress percentages.

Allocate monotonically ordered submission numbers. The supplied helper path acquires one shared GPU lease spanning native heavy stages, cancellation and resource release. Give agents the queue protocol and let their scripts use it; do not remove their normal shell or alternative tools to enforce it. Model switches explicitly unload the owned previous model/process and check completion before admitting the next. If unload fails, hold the lane and show recovery information; do not kill unrelated GPU applications. Installation or Debug that can alter a tool takes a maintenance lock against its active generation, and GPU readiness probes use the same lease.

Record attempt and tool-call intent **before** launch. Immediately persist actual Comfy `prompt_id` or process identity (PID, process-group/session, start time and boot identity). On a crash between launch and acknowledgement, reconcile the attempt's tagged external job; if identity cannot be established, block new GPU work rather than blindly submitting again. A PID number by itself is not proof of ownership.

**Build refinement, 23 October:** the supplied local native-helper path uses a uniquely named transient systemd user unit to own ordinary descendants, including new process sessions. A supervisor gate prevents native work until the unit invocation and process identity are durably acknowledged. This is process lifecycle management, not a filesystem/network sandbox or a restriction on creative agents, which retain their normal environment and tools. Each native execution has an explicit recorded runtime deadline, not a clip-duration cap. Empty cgroups and direct-PID NVIDIA observations remain bounded evidence; MPS/proxies/hidden PID namespaces and unregistered work are not certified. See [the GPU lane implementation/evidence](gpu-lane-build.md).

Cancel first marks the attempt stopped-for-submission in application/helper state and asks/stops its agent so no further work should be dispatched; helpers reject subsequent work for that cancelled attempt. Remove a specific queued Comfy job or interrupt its specific running job; stop owned direct-process groups and escalate to termination only for that verified identity if graceful stop fails. Killing the agent alone is insufficient. Tracking owned descendants and registered remote/service jobs is process ownership, not filesystem/network confinement; detached or unregistered work is an explicit observability gap, not proof of cancellation. Confirm the native queue/process is stopped and resources released before offering Restart/Discard/Restore. A race with completion is serialised: success committed first remains success; cancellation accepted first prevents automatic placement and cleans up partial results.

**Gate:** the PRD asks for immediate active cancellation. Source-level interrupt support is not evidence of preemption latency. Measure it on both tools; if cooperative interruption is too slow, investigate owned-worker termination or explicitly revisit the requirement. A permanent “cancelling” label does not satisfy it.

On failure/cancellation release timing reservations only after work cannot complete into the arrangement. Retry/Restart creates a new attempt, preserving parameters and seeds; no automatic retry of expensive generation. Failed-call Retry reuses the recorded resolved call, not a new agent reinterpretation. Restart begins the cancelled generation again, not partial-state resume. Restore parameters removes a cancelled/failed placeholder and copies editable non-seed inputs into the correct project/song form; the next explicit Generate is a fresh variation. Successful outputs also expose Reuse parameters: copy their editable non-seed inputs into the form without deleting their output, changing history, or starting work; Generate then assigns new seeds.

### C5 — Setup Manager and Confirmed Debug

Implements `prd.md > Tool Setup and Failure Recovery` and `Debug Confirmation and Agent Authority`.

Persist one installation record per shared tool/version and a list of recipe steps with logs and exit outcomes. Install All retains the provider-first tool flow, shared prerequisites, separate music and Comfy environments, H3 assets/nodes/workflows and analysis environment. The specific host-versus-tool installation split is Accepted P9 below. The visible H3 panel can depend on ComfyUI without installing a second copy. Serialize conflicting package operations and deduplicate repeated Install clicks. Refresh only reconnects to monitoring.

Recipes are versioned and idempotent, with explicit download URLs, checksums where available, terms and disk requirements. Resume a verified partial download or rerun the failed step on Retry. Readiness tests check executables/imports, required model assets and workflow nodes, then the relevant tiny contract check. Merely finding a directory or trusting the agent's “fixed” summary is not readiness.

Debug preparation creates a durable, short-lived confirmation record with provider/model, full prompt, argument array, working directory, failure-log digest and a readable command. Confirm launches exactly that record; if context/config changed, show the updated request and require a new confirmation. Cancel launches nothing. The dialog discloses autonomous changes outside the tool directory and impact on all projects. Credentials are never included in the displayed prompt/arguments.

Debug runs the requested YOLO/no-per-action-approval mode as the service account, starting in the tool directory but **not sandboxed to it**. OS rights still limit what it can do. Keep its transcript/report, then independently rerun readiness. If the selected provider cannot start at all, say so and give verified local sign-in/install guidance; a broken agent cannot repair itself through a fictional running job. See the exact planned CLI forms under External Services.

### C6 — Native Generation Adapters and Media Validation

Implements `prd.md > Music and Video Generation`, `Raw Frame Preservation`, and `Continue From End`.

The agent uses its music knowledge and the pinned YuE2 interface, directly or through the supplied helper, to create/edit scores and generate audio. There is no required JSON-plan handoff to a separate executor. Retain original audio and verify decoded duration, channels, sample rate and playable content; do not select a new song on failure. Native staged music generation remains internal to one user request, with separate actual calls/seeds recorded. No mandatory user score review or batch variation interface is added.

Supply a versioned Comfy graph and callable helper for the video agent. The agent can use or adapt these and may construct its own tool-call script; the provided graph demonstrates the supported media/receipt contract. Branch the full decoded image batch into an ordered PNG sequence and the encoded viewing output. Persist frame count, dimensions, exact rate, ordered filenames/checksums, graph/node/model identities, prompt and actual seeds. Standard SaveImage preserves 8-bit pixels without lossy video encoding; it is **not** a bit-exact floating-point VAE dump. The complete batch, not only endpoint images, belongs to the artifact.

Extract conditioning audio from the captured realised frame interval. Use a lossless working WAV, silence-pad only beyond the song, and tag source song/hash, sample offsets, channel/rate conversion and padding in provenance. For wholly post-song clips the input is an explicitly recorded silent interval; whether H3 accepts it and still produces useful output is a gate. Supply the continuation image from the retained PNG frame, never by decoding the viewing MP4. Creative timing instructions to H3 are relative to this clip's start, derived from the same beat map.

Output validation uses FFprobe plus the frame manifest: real duration/frame count, 24/1 rate, dimensions, decodability, file ownership and expected audio. Missing original frames or wrong rate is a failed integration result, not a successful clip with a quiet workaround. Missing generated audio leaves the original-song path available but the clip-audio choice unavailable with an explanation; do not invent sound.

**Accepted P5 — native length reconciliation:** if the pinned H3 graph requires discrete frame counts, generate the smallest supported count at least as long as the realised request, retain every source frame, and initialise the placement to only the requested realised count. Report the extra generated frames separately. This is the accepted handling of native granularity, **not the rejected blanket four-second padding policy**, not rate conversion and not permission for timeline overhang. Never stretch a short result; too few frames fails validation. Record a separate native execution interval starting at the same realised start and extending for the native source count. Its conditioning WAV covers that whole native interval, using the corresponding additional song samples if available and silence only beyond the actual song. The agent receives both requested and native lengths; extra conditioning/output samples are excluded from initial placement, not shifted into the requested edit. This is accepted as design and must still be tested before claiming support; the observed prototype's `17k+5` rule is not automatically the final adapter rule.

### C7 — Audio Analysis and Exact Timing Engine

Implements `prd.md > Linked Timing Units`, `Default Clip Timing`, `Frame-Based Trimming and Locked Frame Rate`, and `Timeline and Music Coverage`.

A CPU Python worker produces waveform peak buckets, decoded sample count/rate, estimated BPM and monotonically increasing detected beat positions. Store analysis version and source hash. Librosa's analysis frames are not video frames. Preserve beat positions as sample indices with sample rate so their times have an exact stored representation; estimation accuracy is still limited by the detector.

**Accepted P4 — beat map:** number the first detected beat 1; interpolate piecewise between detected beat anchors. Extrapolate before/after the detected region using the nearest valid interval, marking extrapolated markers visibly. The first generation still starts at time 0, which may be a fractional/pre-first beat on a track with a lead-in; do not invent an onset at 0. Post-song extrapolation enables indefinite suggestions but is not evidence of music beyond the song. Save the map with that song; reanalysis never silently retimes saved edits or submitted attempts.

With missing/invalid beat analysis, show the actual song and waveform where available, explain the analysis failure and offer retry; seconds/frames remain editable, but beat presets/fields are unavailable rather than displaying an invented BPM. Preserve arbitrary entered decimals as strings and exact rational arithmetic (BigInt numerator/denominator internally); JSON serialises integers/rationals as strings, not rounded JavaScript Numbers. Derived repeating decimals may be displayed with an approximation marker while retaining their exact rational value. No five-digit cap or repeated rounding through displayed values.

The common rules are specified in Time and Edit Semantics below and implemented once in shared pure TypeScript functions, reused by UI, API and renderer.

### C8 — Library, Arrangements, Coverage and Provenance

Implements `prd.md > Song Selection and Saved Arrangements`, `Artifact Archive, Restore, and Delete`, `Generation History`, `Timeline and Music Coverage`, and `Clip Audio`.

Separate an immutable generated artifact from editable placements using it. A project has songs and a clip library; each song owns one arrangement. A new successful song starts empty, old arrangements remain. Editing a placement never rewrites generation inputs. Placing a library clip creates a placement; removing it does not delete media. Accepted audio choice belongs to the placement so two uses need not silently change one another.

Archive is a logical media lifecycle change plus removal of **all** that clip's placements across the project's song arrangements in one DB transaction. Raw frames and encoded media stay together. Restore only changes library visibility, creating no placements. **Accepted P6 song policy:** archiving a song hides/deselects it but preserves its saved arrangement; if selected, persist no selected song rather than silently choosing another. Previously submitted clip attempts continue into that song's preserved arrangement, even while hidden. Restoring the song makes it selectable again, without automatically selecting it; its arrangement is still saved. This differs from restoring a clip, which is always unplaced. Deleting a song removes its arrangement after the dependency checks below; derived clips remain separate library artifacts, not silently deleted. These first-draft song-lifecycle details were accepted in the learner's "all the other proposals" response and are reconciled into the PRD.

Delete requires the PRD confirmation, removes placements immediately from current edits, and runs a durable purge of full media, raw frames, working copies and stale assembled previews that could otherwise recover that media. Keep only permitted lightweight thumbnail/history/text logs plus a deletion event. Mark `deleting` until the filesystem purge succeeds; failure is not “deleted”. Previously exported files remain independent under A6; the confirmation must explain that deletion does not recall earlier exports or external copies.

**Accepted P6 — busy media:** prevent deletion while any nonterminal attempt/render depends on that artifact, including queued work that has not started reading. Register input dependencies transactionally with submission, and test them transactionally when accepting deletion so a concurrent submission cannot race the purge. Identify the dependencies and ask the user to finish/cancel them first. This avoids secretly retaining a full “deleted” source as a job snapshot. Archive can remove current placement immediately while a previously submitted generation uses its captured source; a stale render must never be presented as the new edit. This busy-delete policy was accepted in that same review and is reconciled into the PRD.

**Agreed P8 correction — Continue From End is on each clip.** The clicked clip card identifies the predecessor. Pass that card's clip ID, displayed song/timing context, current trim bounds and edit revision; take its last retained original frame and current edited end directly. Do not introduce a separate "which clip?" picker, a global selection dependency or a requirement to place/re-place the clip merely to invoke its own control.

Implementation convention for the per-card action: keep the card's editable reference interval even when its placement is removed: an unplaced card shows that it is unplaced and retains its last edit, initially the generation's captured interval. This is saved edit context, not a hidden placement and contributes no coverage. Restore still creates no placement. If the same source is shown through multiple edit instances, each instance's own action carries its displayed context. The form clearly shows the song and start/end it will use; switching projects or later edits cannot silently retarget a submitted continuation. If that referenced song has been deleted, retain the card's image/trim context but show the missing soundtrack and require an explicit replacement-song choice before Generate; never silently borrow the currently selected song.

History is append-only event/provenance data, not event-sourced undo. Record user inputs, actual provider and tool calls, resolved seeds, workflow/model revisions, outputs and failures. Store redacted text logs, not credentials or claimed hidden model reasoning. Failed/cancelled attempts have no fake thumbnail; audio success can use a retained small waveform thumbnail. Deletion retains historical associations via tombstones rather than breaking references.

### C9 — Edit Plan, Preview and Export

Implements `prd.md > Timeline and Music Coverage`, `Clip Audio`, and `Preview, Black Gaps, and Export`.

Compile an immutable edit plan for one arrangement revision. Partition time at placement boundaries; choose the highest visual priority in every span, or black if none. Default newly placed clips to highest priority; a front/behind swap changes only ordering. Only the winner's audio option matters. It selects that clip's soundtrack **instead of** the song; otherwise use the song within its duration and silence afterward. Hidden audio is never a fallback and no mixing, fades, gain or mastering is added.

**P7 revised by explicit learner feedback, 23 October:** preview is immediate browser playback of the current arrangement from existing encoded clips and captured song/clip audio, with play/pause/scrub and 50% initial volume. It must not request a render or expose an auto-render checkbox. Source offsets, dominant picture/audio, black gaps and post-song length follow the export semantics; browser decode/seek synchronization is approximate and not final render quality. Only the current/upcoming sources preload. Leaving Video or hiding the document pauses playback. Export remains an explicit revision-bound CPU FFmpeg job, cached and independently validated; a stale export is never labelled current. This supersedes the earlier render-first preview compromise, not the source-format or no-mastering rules.

Accepted first validation format: 640×480, 24 fps H.264/yuv420p MP4 with AAC 48 kHz stereo, no upscaling or claim of mastering. This modest first-build profile was accepted with the other proposals; it is not proof on 16 GB or a promise of a later distribution-quality mode. Render from retained frames plus the selected original audio sources, not repeated decoding/re-encoding of already edited videos. Native graph compatibility still requires a measured contract check. If native output differs, revisit the format rather than silently convert frame rates or pretend quality equivalence.

Output length is `max(ceil(songSeconds × 24), latest included placement endFrame)` frames. The song is not cut off to match the last clip; uncovered tails are black. Pad only the final partial audio/video-grid interval with silence as needed. Download uses range-capable media routes and a safe filename. Export completion requires a verified output file, not an agent sentence or successful process exit alone.

## Data Model

**Accepted P1:** a relational core with JSON snapshots/receipts for tool-specific details, not required agent responses, not dozens of tables for every prompt parameter. All IDs are opaque UUIDs; UTC timestamps are for audit, ordered event sequence numbers for polling.

| Record | Ownership and important fields |
|---|---|
| `settings`, `tool_installations` | Global provider default; tool/version/recipe pins, readiness, install step/log references. No credentials in these rows. |
| `projects` | Name, persistent visual style, selected song ID, per-song form drafts, revision. |
| `artifacts` | Project, kind music/video, generating attempt, active/archived/deleting/deleted lifecycle, media manifest, thumbnail, source hash. Deleted rows remain tombstones. |
| `songs` | Music artifact, project, analysis status/map/peaks, exact decoded sample duration; one saved arrangement/revision. |
| `clip_edit_contexts`, `placements` | Stable edit-context ID, project/source clip, song/reference origin, trim bounds and revision remain available when unplaced. An included placement references one context and supplies dominance/audio choices; multiple uses have independent contexts. Removing a placement never creates coverage from its retained card context. |
| `generation_intents`, `attempts` | Immutable creative snapshot, origin song, planned frame range and input intent, provider/model/knowledge pins, assigned seed root; attempt state, queue sequence, retry/restart parent, placeholder visibility, cancellation flag. |
| `tool_calls` | Attempt/stage, assigned seed versus actual submitted seed, exact prompt/settings/command/graph, external job/process identity, timestamps, observed result/error. |
| `history_events` | Project/global setup scope, ordered type/payload, attempt/artifact links, retained log/thumbnail references. |
| `renders` | Song/arrangement revision, immutable edit-plan hash, status, media references, preview/export output and validation receipt. |

A reservation is derived from a nonterminal attempt's stored planned interval; do not keep an independently editable second interval. Only actual included placements contribute coverage. Use constraints for project/song membership and unique ingestion; deleting an artifact must not cascade-delete provenance. Selected-song changes and arrangement mutations carry revisions.

**Seed identity:** fresh generation allocates a fresh root and distinct actual per-stage seeds within each tool's supported integer domain. Persist their decimal-string values before dispatch; do not record `-1`/“random” as the resolved seed. Retry copies a resolved failed call unchanged. Restart reuses the original intent's seed mapping and already captured native inputs; if cancelled before those inputs were produced, retain assigned intent/seeds and distinguish them from nonexistent actual calls. Reusing parameters creates a new intent/root only when Generate is clicked. Preserve all parent links and tool/model/environment fingerprints; seeds do not guarantee bit-identical output.

**File-backed input identity:** each registered call records a manifest with hashes and retained snapshots of the exact scripts, scores, workflow graphs and conditioning assets it read, not only mutable workspace paths. Retry/Restart uses those snapshots where the original inputs were already resolved; if the required inputs are missing, report exact recovery as unavailable rather than silently using a later edit. These application-owned snapshots do not make the agent workspace read-only. They obey the same dependency/deletion policy as other full-media copies; keep lightweight text provenance where permitted.

**Application media ownership:** catalogued output belongs to an artifact, active attempt, render, installation or permitted history thumbnail/log. Agents may create working material elsewhere using their normal tools. Register/import delivered outputs into managed storage and validate files rather than treating a reported path as proof. HTTP media routes resolve registered asset IDs inside the managed data root and reject traversal/symlink escape; those web-route checks do not confine the agent's filesystem access. Track known full-media derivatives in project workspaces for deletion, but do not claim to erase unknown copies created elsewhere by unrestricted tools; surface that limitation rather than silently overriding agent authority. No content-addressed deduplication of full media in v1; it would complicate irreversible deletion.

## Time and Edit Semantics

### One grid, two kinds of frame labels

**Agreed:** exact `24/1` fps, source frames one-based/inclusive, entered beats/seconds retained, containing-frame quantisation. **Accepted P4:** use zero-based half-open frame intervals internally: `[startFrame, endFrame)`. A frame index `i` covers `[i/24, (i+1)/24)`; the corresponding containing-frame label is `i+1`. Exact boundary instants belong to the frame starting there.

For a requested time interval `[s,e)`, preserve the exact rational intent and realise start as `floor(24s)`, end as `ceil(24e)`. Show the realised boundaries and discrepancies; reject nonpositive or negative-time intervals, not merely short or over-15-second intervals. No pre-song negative timeline in v1.

The linked **timeline containing-frame** field for an entered instant is `floor(24t)+1`. A direct edit of this field to K means its start boundary `(K−1)/24`; label that convention. At an exact end boundary this names the first excluded frame, not the last retained source frame. Keep **source trim end** as a separate inclusive control: source end N has an exclusive boundary N/24. Do not present these distinct meanings as an unlabelled “end frame”.

Example: `12.3456789` seconds remains that exact input and selects containing timeline frame 297. An end there realises to 297/24; an end exactly at 12.5 seconds realises to frame boundary 300, without adding another frame. A direct source trim to frame 300 retains frame 300. No conversion round-trip through approximate display decimals.

### Trimming, moving and continuation

Store an edit context's `sourceOriginFrame` (an included placement references that context): the timeline boundary where source frame 1 would start. Retaining source `[a,b]` yields timeline `[origin+a−1, origin+b)`. Thus 1–80 changed to 6–75 retains 70 frames at their original times, leaving five frames empty at the start and end unless covered elsewhere. Moving changes origin; trimming does not. Validate integer source bounds within `1…N`, `a ≤ b`; equality retains one frame. Explain invalid input without silently correcting it.

**Slice 5 implementation detail:** the saved source origin may be negative after
moving a trimmed range to time zero; the retained start and end must still be
nonnegative valid timeline boundaries. Moving floors the requested start once,
then adds the unchanged retained frame count—never independently rounds the new
end. For example, moving a 70-frame trim to `12.3456789` seconds yields `[296,366)`.
The trim editor's beat/second values are absolute positions on its selected song;
its source-frame values remain one-based/inclusive. Exact saved trim intent and
move intent are separate, revision-checked records. An explicit move clears
obsolete absolute trim intent, while history retains the previous edit.

Schema 5 adds stable per-use edit contexts without rewriting existing creative
rows, historical render snapshots, prompts or native assets. Removing a use keeps
its context and re-placing it reuses that identity; unplaced edits do not alter the
arrangement or invalidate its preview. Priority swaps exchange only the two
chosen overlapping uses' priorities. Audio choice belongs to each use, not the
shared source clip. The renderer's versioned profile invalidates new cache reuse
when its sound assembly changes, without mutating old render records.

The historical initial origin and originating song remain immutable. Warn for clip audio if the current origin differs, or if placed against another song whose audio did not condition it; trimming alone does not warn. Returning to original alignment clears only that warning, not a claim about generated audio fidelity.

Continue From End snapshots the clicked edit-context ID/revision, song, source PNG frame `b`, trim and origin, and starts at `origin+b`, the next frame boundary with no blank frame. Calculate its end by adding the adaptive count in the same beat map from that exact possibly off-beat instant, then realise the new interval once. Later edits to the predecessor do not alter this submitted request.

**Slice 6 implementation detail:** preparation atomically checks the clicked edit
context and target-song draft revisions, saves the captured PNG identity and
exact timing in that song's draft, and does not allocate seeds, reserve time or
submit generation. It preserves the target draft's shot description. Missing
beat analysis preserves the exact start and image but leaves the end blank for
explicit entry. Other-song actions name their song; the UI selects that song
only after successful preparation. Unapplied predecessor timing must first be
applied or discarded.

The browser submits only a context ID/revision, never a trusted file path or
caller-supplied hash. A new request resolves and validates the saved original;
a stale context fails visibly. Existing idempotency-key replay is resolved first,
so later edits cannot block recovery of an already accepted immutable request.
Native preparation copies the captured PNG into attempt-owned inputs, verifies
both file and decoded RGB hashes, and supplies it through the pinned H3
image-to-video first-frame input alongside the unchanged audio-conditioning
branch. This uses the existing model pins, not an added image generator.

Schema 6 is a metadata-only compatibility boundary for these optional draft and
attempt fields. No old context, creative row, native call, render snapshot or
asset is rewritten. Clean cross-song session recovery acknowledges the prepared
draft; genuinely dirty or concurrently changed recovery remains visible rather
than being silently replaced. Acceptance of an old generation cannot clear a
newer starting image or its associated timing.

### Presets, free gaps and warnings

For each preset start `s`, choose count 8 if estimated BPM ≥50, otherwise 4. Convert `beat(s)+count` with the saved map; halve the count while duration is strictly over 15 seconds and count >1. Missing/invalid BPM is not zero-BPM music.

Ordinary presets find the earliest free realised frame interval from time zero, considering included placements and queued/running reservations. Express that position in the beat map, apply the adaptive count, then stop at the next occupied boundary if sooner. Starting at a residual off-beat boundary avoids leaving small trim/quantisation gaps permanently unfillable. Do not round the realised end beyond the next occupied frame. Continue From End uses its explicit adjacent-frame start instead of the gap search. Neither path automatically submits another clip.

At constant tempo: ≥50 BPM →8; 16–<50 →4; 8–<16 →2; 0–<8 →1. At 15 BPM use two beats/eight seconds. At 3 BPM use one beat/20 seconds and warn. At 30 BPM a 16-second gap proposes eight seconds, leaving the rest for another request. Test irregular maps with the same function, not a separate constant-BPM shortcut.

Do not clamp at song end. Extend beat references beyond it and keep suggesting further windows. Independently show: requested duration >15 seconds; start ≥song duration; end >song duration. Exactly 15 seconds has no duration warning. Preserve manual/submitted ranges and Retry/Restart parameters; no automatic splitting, stretching or four-second padding. Realised frame rounding can add less than one frame at either side; disclose it, do not reinterpret it as a new user duration.

### Coverage and deterministic audio

Coverage is the measure of the union of included realised intervals intersected with `[0, exactSongDuration)`, divided by exact song duration. No pending placeholders, archived/library-only media, overlap double-counting or beyond-song inflation. Unknown duration gives N/A; known music with no placements gives 0%.

The edit plan maps each visible frame span to a source frame offset. For audio, use that same source offset converted to samples; accepted render working rate 48 kHz gives exactly 2,000 samples per 24 fps frame. Resampling for format compatibility is recorded, not loudness processing. Audio switching is a hard source switch under the PRD, so seams may be audible; do not silently add crossfades to conceal them.

## Internal API Contracts

These are **planned internal application contracts**, not an implemented public/headless agent API. JSON requests are schema-validated; mutation responses carry revision and operation ID. Invalid input returns 400/422, missing resources 404, stale revision/busy conflict 409. Asynchronous operations return 202 with their stable job ID; reusing an idempotency key returns the same operation, and using it with different inputs conflicts.

| Route family | Request / response responsibility |
|---|---|
| `GET /api/state?projectId=…&after=…` | Shared tool/provider status plus selected project's revision, songs/library/attempts/arrangement and event cursor. No full media blobs or credentials. |
| `POST /api/projects`; `PATCH /api/projects/:id` | Create/name/style/selection/draft changes with expected revision; no job migration. |
| `PUT /api/config/provider` | Provider enum and expected config revision; return actual readiness, not invented successful login. |
| `POST /api/setup/:tool/install` or `/retry`; `POST /api/setup/install-all` | Stable installation job(s), deduplicated shared dependency steps. |
| `POST /api/setup/:tool/debug-plan`; `POST /api/debug/:id/confirm` | Exact disclosed immutable launch plan, then confirmed execution. No side effect from opening the dialog. |
| `POST /api/projects/:id/generations` | Kind, song ID where relevant, creative inputs, exact timing intent/realisation, continuation asset plus edit-context ID/revision and captured context, idempotency key. Server snapshots provider and assigns seeds. Returns attempt + reservation. |
| `POST /api/attempts/:id/cancel`, `/retry`, `/restart`, `/restore-parameters`, `/discard` | Validate legal lifecycle transition; restore/discard starts no work. Cancel does not report stopped prematurely. |
| `POST /api/songs/:id/placements`; `PATCH/DELETE /api/placements/:id` | Place/trim/move/audio/priority or remove use only; transaction returns revised arrangement and coverage. |
| `POST /api/artifacts/:id/archive` or `/restore`; `DELETE /api/artifacts/:id` | Archive/restore semantics above; delete requires the current confirmation digest and performs durable purge. |
| `PATCH /api/clip-edit-contexts/:id`; `POST /api/clip-edit-contexts/:id/continue` | Expected context revision; edit source bounds/origin or prepare continuation from the clicked card. Return captured context/song/frame inputs to the form, not a queued generation. A missing source song is explicit. |
| `POST /api/songs/:id/preview` or `/exports` | Expected revision; freeze and render the corresponding edit plan; export does not silently use stale cached content. |
| `GET /api/history?projectId=…&cursor=…`; `GET /api/assets/:id` | Paginated provenance and registered media with range support; deleted media unavailable while permitted thumbnails remain. |

## External Services and Dependencies

### Provider terminal contracts

Checked 21 October 2026: local `codex-cli 0.163.0` help supports noninteractive exec, explicit working directory and `--dangerously-bypass-approvals-and-sandbox`. Claude's invocation below is documentation-derived, not locally executed. These observations do not establish Dundee's installed CLIs, login or account access.

Keep the requested exact model IDs **`gpt-6.1-sol`** and **`claude-opus-5-5`**; no silent model substitution. Official pages establish names, not account entitlement. [Sol documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Claude model configuration](https://code.claude.com/docs/en/model-config).

Creative-task invocation templates, to verify against pinned CLIs on Dundee:

```text
cwd = <data-root>/projects/<project-id>/workspace/
codex exec --model gpt-6.1-sol --dangerously-bypass-approvals-and-sandbox
  --skip-git-repo-check --cd <project-workspace> -

cwd = <data-root>/projects/<project-id>/workspace/
claude -p --model claude-opus-5-5 --dangerously-skip-permissions
```

Supply the creative brief and paths to project guidance over stdin; collect normal text output and native session/tool logs. Do not add `--output-schema`, `--json-schema`, forced JSON final output, `--bare`, tool-disable lists, read-only sandbox flags, `--ignore-user-config`, `--ignore-rules` or ephemeral history suppression. Preserve installed skills, tools, MCP/plugin integrations, research access and normal usable configuration. The adapter launches the chosen executable with an argument array and `shell:false`; that prevents accidental shell interpolation in our launcher, **not** the agent's ability to invoke a shell or author scripts. [Codex noninteractive interface](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude CLI reference](https://code.claude.com/docs/en/cli-reference).

Confirmed shared-tool Debug uses the same autonomous capability policy, but starts in `<affected-tool-directory>` as previously agreed and receives the disclosed repair context. Its full actual command/cwd/prompt are shown before confirmation; no fresh confirmation is added to ordinary Generate. Provider-native policies and OS account rights remain real; no product-added restrictions are intended. Keep credentials in supported provider stores, not browser prompts/commands or public history. Preserve project session identity explicitly rather than automatically resuming another project's run.

These are documented templates, not commands launched during planning. Live verification must check authentication, model identity, normal tool availability, retained project history, helper receipts and cancellation. Account-specific costs/limits remain setup information; open-source application code does not make provider usage free.

### ComfyUI / H3 contract

The supplied helper and agent-accessible product-owned loopback instance use `POST /prompt` with `{prompt: workflowGraph, client_id: attemptClientId}` and records returned `prompt_id` or node errors. Observe `/queue`, `/history/{prompt_id}` and native progress events. Tag the graph/output namespace with attempt identity so crash reconciliation can distinguish owned work.

At inspected upstream revision `b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c`, `POST /queue` with `{"delete":[prompt_id]}` removes a specific queued job; `POST /interrupt` with `{"prompt_id":prompt_id}` targets a matching running job. Never omit the ID and globally interrupt unrelated work. HTTP 200 alone does not prove cancellation. This revision is evidence, not the selected production pin. [Routes](https://docs.comfy.org/development/comfyui-server/comms_routes), [inspected server implementation](https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1242-L1286).

**Build refinement, 22 October:** the selected pin `f5c611e3849ff7219dfb7d7b251092ab8a9b51dc` also provides `POST /api/jobs/{job_id}/cancel`, with an atomic matching-ID check for running work and queued-to-running race handling. Prefer this per-job route over composing the older operations. Its response still acknowledges an action, not process stop or GPU release. Source inspection is complete; real endpoint/cancellation proof remains a gate. This preserves the approved owned-job behavior without changing scope or patching upstream. See [pinned implementation](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/server.py#L1033-L1076) and the [native-control test review](native-control-test-review.md).

Graph inputs include model/node pins, text/multimodal prompt, assigned seed, requested/native frame count, conditioning WAV and optional continuation PNG. Native filenames are created by the adapter in the owned input directory, not arbitrary browser paths. Result history plus an ordered frame manifest links encoded video/audio and all image outputs. Validate the full branch, frame order and audio origin. [Inspected SaveImage implementation](https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L1669-L1728), [MiniMax H3 description](https://www.minimax.io/news/minimax-h3-open-source), [Comfy H3 model card](https://huggingface.co/Comfy-Org/MiniMax-H3).

**Gate:** choose and pin an appropriate checkpoint and licence. The personal prototype's derivative checkpoint is evidence only, not automatically shipped. Verify no minimum-four-second or hard-15-second policy leaks in from its wrapper.

### YuE2 and analysis contracts

Supplied helper interface: `<tool-venv>/bin/python <owned-wrapper> --request <run/request.json> --result <run/receipt.json>`, with optional equivalent command-line inputs. It records schema version, attempt/stage, actual native inputs, seed map, output directory, job identity and media manifest; logs carry observed progress/errors. The helper writes this receipt automatically; the agent is not required to produce JSON or use this helper exclusively. Custom scripts may use the native interface and supply equivalent registration/receipts. **This is a product helper to write, not an existing upstream CLI.**

The exact YuE2 native entrypoints, model revision, staged score/audio interfaces and 16 GB recipe remain an early executable contract gate. Existing prototype evidence and upstream guidance differ on memory baseline; do not claim fresh-machine support from a previously generated file. Sources: [YuE repository](https://github.com/multimodal-art-projection/YuE), [YuE2 model card](https://huggingface.co/m-a-p/YuE2-3B), [upstream skill](https://github.com/multimodal-art-projection/YuE/blob/main/skills/yue2-music/SKILL.md).

Analysis uses an analogous owned JSON-in/JSON-out process, calling the pinned Librosa beat tracker and recording its parameters. Source reference: [Librosa beat implementation](https://github.com/librosa/librosa/blob/main/librosa/beat.py). Do not confuse native analysis-hop indices with output video frames or assume detected beats prove exact musical timing.

### Python isolation and installation ownership

**Agreed:** ComfyUI/H3 and YuE2 have separate isolated Python environments, not one combined ML environment and not global/system pip installs. Custom Comfy nodes install their Python dependencies in Comfy's environment; YuE2 dependencies remain in YuE2's. Use explicit `<env>/bin/python` / `<env>/bin/python -m pip`, no `sudo pip`, `--break-system-packages`, replacement of `/usr/bin/python*` or `--system-site-packages`. This is the learner's host-Python preservation requirement, not an agent sandbox. Use a tested interpreter version for each tool; if Ubuntu's interpreter is unsuitable, install a separate managed interpreter rather than changing the host default. Exact compatible versions remain a gate. [Python virtual environments](https://docs.python.org/3/library/venv.html).

**Accepted P9 — host prerequisites plus managed tool setup:**

| Dependency | Installation location and method | Setup ownership and proof |
|---|---|---|
| ComfyUI + H3 Python/node dependencies | `tools/comfyui/venv/`, separate from source/models | Existing ComfyUI/H3 setup panels; verify env interpreter, imports, required graph nodes and actual tiny workflow. |
| YuE2 Python dependencies | `tools/yue2/venv/` | Music setup panel; verify env/imports/model assets and native generation contract. |
| Librosa + NumPy/SciPy/SoundFile/Numba dependencies | Dedicated third environment `tools/audio-analysis/venv/`, pinned pip installation | Existing Audio analysis panel; import/version check plus analyse a tiny known audio fixture. No Librosa package installation into Ubuntu's system Python. |
| FFmpeg and FFprobe | Native executables from Ubuntu's **`ffmpeg` APT package**, shared across tools; not Python libraries | Bootstrap checks the exact paths/build/capabilities and installs a missing compatible package through the previously authorised local host-package step. Setup panels show this shared dependency and can recheck it; do not install duplicate binaries per venv. |
| Interpreter/venv support and native libraries | Host preflight checks what's available; install only required native packages through that explicit prerequisite step | Avoid unnecessary blanket upgrades. If a pinned Python wheel already supplies a required native library, verify it rather than blindly adding another host dependency. |

Librosa supports installation through PyPI; the product chooses an isolated interpreter and pinned requirements rather than upstream examples that install system-wide. FFmpeg/FFprobe are separate native programs; installing a Python package called `ffmpeg` or `ffmpeg-python` is not a replacement for those executable checks. [Librosa installation](https://librosa.org/doc/0.11.0/install.html), [Ubuntu 26.04 ffmpeg package file list](https://packages.ubuntu.com/en/resolute/ppc64el/ffmpeg/filelist). The fetched Ubuntu list establishes the package's executable grouping; Dundee's architecture-specific candidate/build must still be verified locally rather than inferred from that listing.

This split keeps host privileges in a visible bootstrap/prerequisite action while preserving the requested Audio analysis setup panel and Install All experience. It adds no mandatory new navigation panel. Verify from the **service account's environment**, not only an interactive shell: `ffmpeg -version`, `ffprobe -version`, required encoders/filters, an encode/decode/probe fixture and the isolated Python imports. File existence alone does not prove usability. Record resolved executable paths and versions; a later missing/broken dependency returns a real setup error with retry/debug. No installation is being performed as part of this specification revision.

### What Librosa can provide beyond BPM

The required first build still computes duration/sample count, waveform data, beat timestamps and a tempo estimate. The following are available analysis possibilities, **not silently added editor features or mandatory new scope**. An unrestricted agent may use its installed analysis tools for a particular creative task.

| Information | Possible creative use and limit |
|---|---|
| Individual beat positions and local pulse | Align events to detected beats rather than assuming the whole song follows a perfect metronome. Beat detection is estimated, not a guarantee of bar/downbeat labels. |
| Onsets and onset strength | Candidate note/drum attacks for accents, impacts or cuts; these are not necessarily every musical beat. |
| RMS energy over time | Suggest calmer versus more energetic visual passages; RMS is not mastered loudness/LUFS. |
| Chroma and spectral features | Describe pitch-class activity, brightness and texture changes; key/chord labels require additional interpretation. |
| Recurrence/self-similarity and temporal clustering | Find repeated passages or candidate section boundaries; automatic verse/chorus names require extra logic/evidence. |
| Non-silent intervals and harmonic/percussive decomposition | Find pauses and inspect rhythmic versus sustained content; not instrument-perfect stem separation. |

Sources: [beat/pulse](https://librosa.org/doc/0.11.0/beat.html), [onsets](https://librosa.org/doc/0.11.0/onset.html), [features](https://librosa.org/doc/0.11.0/feature.html), [segmentation](https://librosa.org/doc/0.11.0/segment.html), [silence and harmonic/percussive tools](https://librosa.org/doc/0.11.0/effects.html). Do not silently trim silence, retime audio, add effects or replace the song just because a library can do so. The approved assembly behaviour remains unchanged.

### Media, framework and licence references

FFmpeg/FFprobe are local processes, not a hosted rendering API. Build filter graphs from validated edit-plan values; use frame trims and timestamp resets, audio trims/padding and concatenation from the same spans. Pin the executable build and codec availability; verify final files independently. [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [FFprobe](https://ffmpeg.org/ffprobe.html).

Framework references: [React with TypeScript](https://react.dev/learn/typescript), [Vite](https://vite.dev/guide/), [Vite TypeScript checking](https://vite.dev/guide/features.html#typescript), [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Node child processes](https://nodejs.org/api/child_process.html), [systemd user-service concepts](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [Vitest](https://vitest.dev/guide/), [Playwright tests](https://playwright.dev/docs/intro).

Record code licences, model/checkpoint terms, redistribution/download conditions, output-related conditions, font embedding and codec/build obligations separately in `THIRD_PARTY_NOTICES.md` and the tool manifest. Do not flatten them into “all CC-NC” or “all outputs unrestricted”. The learner selected MIT for the application's own source on 23 October 2026. This does not relicense third-party tools, weights, fonts or their outputs. A dedicated licensing/about UI is deferred, not this investigation or required notices. No legal compatibility conclusion is asserted by this draft.

## File Structure

**Planned application files, not files already implemented.** Use one repository and npm workspaces only for browser/server/shared contracts; native integrations stay visibly separate.

```text
.
├── devpost/                         # Canonical scope, PRD, spec; HTML review companions
├── apps/
│   ├── web/
│   │   ├── src/App.tsx              # Studio routing: Projects / Config
│   │   ├── src/api.ts               # Validated snapshots, mutation and revision handling
│   │   ├── src/components/          # SetupStrip, ProviderSelector, StatusBar, dialogs
│   │   ├── src/features/projects/   # Project/song selector and per-project drafts
│   │   ├── src/features/generation/ # Music/video forms, placeholders, timing fields
│   │   ├── src/features/timeline/   # Waveform, beats, gaps, placements, priority/audio
│   │   ├── src/features/library/    # Frames, trim/move, continuation, archive/delete
│   │   ├── src/features/history/    # Actual input/call/seed disclosures
│   │   ├── src/features/render/     # Player, stale/current preview, export jobs
│   │   └── src/styles/              # Industrial tokens, responsive/reduced-motion rules
│   └── server/
│       ├── src/main.ts              # Fastify + built assets + worker lifecycle
│       ├── src/routes/              # The internal API families above
│       ├── src/db/                  # Connection, migrations, transactions/repositories
│       ├── src/projects/            # Selection, isolation and arrangement mutations
│       ├── src/jobs/                # State machine, FIFO GPU lease, cancellation/reconcile
│       ├── src/providers/           # Codex/Claude autonomous task launch, sessions and confirmed Debug
│       ├── src/setup/               # Install graph, recipes, readiness/confirmation
│       ├── src/generation/          # Tool helpers/receipts, seeds, native jobs and media ingestion
│       ├── src/media/               # Owned assets, manifests, validation, purge
│       ├── src/history/             # Append-only events and redacted logs
│       └── src/render/              # Edit-plan compiler, FFmpeg runner, cache/export
├── packages/core/src/
│   ├── contracts/                  # HTTP/helper types and schemas, not forced agent-response formats
│   ├── time/                       # Exact rationals, beat maps, 24 fps boundaries/presets
│   ├── timeline/                   # Interval union, dominance and source mapping
│   └── jobs/                       # Legal transitions and immutable request types
├── integrations/
│   ├── knowledge/                  # Versioned music/H3 guidance; no personal Pi paths
│   ├── workflows/h3/               # Supplied adaptable graph + raw-frame/receipt output branch
│   ├── python/                     # YuE/analysis wrappers and contract tests
│   └── tool-manifest.json          # Verified versions, assets/hashes, terms, capabilities
├── scripts/                        # Bootstrap, service installation and diagnostics
├── tests/
│   ├── domain/                     # Timing, presets, coverage, seeds, state transitions
│   ├── integration/                # DB/API/adapter contracts and recovery
│   ├── e2e/                        # Actual browser journeys and refresh/switch cases
│   └── fixtures/                   # Clearly labelled tiny synthetic media/CLI responses
├── .env.example                    # Paths/ports only, never credentials
├── package.json / package-lock.json # Reproducible TS dependencies and scripts
├── README.md                       # Supported host, startup, access warning and demo
├── THIRD_PARTY_NOTICES.md           # Code/model/font/codec evidence, not output guarantees
└── LICENSE                         # Project licence selected before release
```

Runtime storage is outside the repository:

```text
music-video-studio/
├── studio.sqlite                   # Projects, arrangements, jobs, tool state and history
├── tools/
│   ├── comfyui/venv/               # Isolated ComfyUI + H3/custom-node Python packages
│   ├── yue2/venv/                  # Separate YuE2 Python packages
│   └── audio-analysis/venv/        # Isolated Librosa environment
├── setup-jobs/<job-id>/            # Global installs/Debug logs, not creative project cwd
├── projects/<project-id>/
│   ├── workspace/                 # Stable cwd for this project's creative agents
│   │   ├── references/            # Research material shared within this project
│   │   ├── notes/                 # Project context and creative decisions
│   │   ├── scores/                # Agent-created/edited music scores
│   │   ├── scripts/               # Agent-authored reusable tool-call scripts
│   │   └── runs/<attempt-id>/      # Per-attempt inputs, logs, intermediates and receipts
│   ├── artifacts/<artifact-id>/     # Original song or video + audio + complete PNG sequence
│   ├── history/                    # Permitted retained text logs and small thumbnails
│   └── renders/<render-id>/         # Revision-bound previews and explicit exports
└── trash-work/                      # In-progress purge bookkeeping, NOT recoverable archive
```

A purge queue must finish removing known managed full files, including registered workspace/run copies, before claiming deletion; `trash-work` is not a restore feature. Backups, previous exports/downloads and unknown copies created outside the managed lifecycle by unrestricted tools are not recalled by an in-app delete. This capability tradeoff is disclosed; it is not a reason to confine the agents.

## Important Failure Modes

| Failure | Required observable response / technical ownership |
|---|---|
| Missing provider sign-in/model access | Named provider error and verified sign-in instructions; no silent alternative. C1/C3. |
| Interrupted download or missing node/model | Failed setup step with Retry or separately confirmed Debug; ready panels remain collapsed. C5. |
| OOM, native error or overlong request failure | Retain exact inputs/call/seed and logs; Retry same call or Restore for new variation. Duration warning is not permission to fake success. C4/C6. |
| Browser disappears | Server work continues; reopened UI fetches same attempt/install and eventual result. C1/C2/C4. |
| Server crashes or external job identity uncertain | Reconcile against owned jobs/output receipts; never duplicate an unknown expensive call. Show uncertain/interrupted status. C4. |
| Cancel acknowledged but generator still active | Keep cancellation pending, revoke further submissions and hold GPU lane; measure/resolve immediate-stop gap. C4. |
| Missing frames, wrong rate, bad output manifest | Validation failure; no successful placement or MP4-only “raw frame” claim. C6. |
| No reliable beat analysis | Keep playable song, explicit unavailable beat controls and retry; seconds/frames still work. C7. |
| Disk fills or media purge fails | No success/deleted claim; retain actionable error and durable recovery record. Never delete unrelated files to free space. C5/C8. |
| Edit occurs during preview/export | Immutable render revision; stale preview visibly marked, new export tied to requested revision. C9. |

## Verification and Build Gates

No application tests or live generations were run to write this blueprint. Existing prototype assets, read-only source inspection and published interfaces are evidence of possibilities, not completed new-product acceptance tests. See `prototype-investigation.md` for hashes, sources and exact observation limits.

**Gate G1 — clean-host toolchain and terms.** Pin runtime/CLI/Python/node/model versions; verify downloads, licences and checkpoint suitability. Verify Dundee as the actual deployment host and also test the clean Ubuntu 26.04/16 GB installation path without assuming existing personal generators. Check separate Comfy/YuE2/analysis interpreters and that installation leaves host Python packages/defaults unchanged. Do not inherit the personal prototype's remote-generator topology. Record GPU peak memory, system RAM, disk use, timings and real outputs. If the target fails, report the constraint and revisit the plan; do not silently require 24 GB.

**Gate G2 — provider contracts.** Run a real research/script-or-score/media task through both fixed CLI/model pairings, checking actual model identity, login, ordinary tool availability, natural-language responses, project cwd/history and cancellation. Confirm no product-added sandbox, tool filtering or JSON response constraint. Validate helper receipts rather than agent prose against machine schemas. Check exact Debug invocation/authority against the confirmation in an appropriate controlled test. No hidden provider substitution.

**Gate G3 — media contracts.** Prove song generation, audio-conditioned short H3 output, complete ordered original frames, frame-count granularity handling, native 24 fps, same-seed retries, a continuation from a trimmed original frame, and partially/wholly post-song conditioning. A >15-second request must reach the adapter without a product cap; success on constrained hardware is not guaranteed.

**Gate G4 — interruption and resource ownership.** Test queued/running cancellation in each tool, completion races, provider cancellation before dispatch, project-workspace separation/default context, cooperative custom-script registration, uninstrumented-call limitations, cross-project FIFO, music→video and video→music unloading, failed unload and server-restart reconciliation. Record stop latency; source inspection does not pass **PRD G9**'s immediate-stop requirement.

**Gate G5 — editing and output parity.** Review tests first for decimal `12.3456789`→frame 297, exact boundaries, 1–80→6–75, moved/trimmed continuation, all BPM thresholds and irregular maps, pending reservations versus coverage, overlap priority/audio replacement, black gaps, post-song output, archive/restore/delete and current-render invalidation. Compare emitted frame/source identities and audio intervals, then watch/listen to the real export.

**Gate G6 — real newcomer demonstration.** From no generator tools, set up one provider, generate a song and approximately three clips, inspect provenance, export and play independently in VLC. Exercise the other provider separately. Show actual errors and real files; fixture-only tests, an old prototype export or a timelapse are not substitutes for this proof.

The first build work should be contract tests and narrow integration investigations, not a polished UI wrapped around guessed generator behaviour. Before each implementation slice, present the tests for the learner's review. Maintain a PRD-ID coverage matrix; automated checks complement, not replace, live GPU/browser/listening proof. The learner has approved the blueprint including P9, so it is ready for `5-build`; do not require another ceremonial sign-off. The gates remain visible prerequisites to declaring features complete, not unresolved planning approvals.

## PRD Traceability

Every approved feature heading has an implementation owner. These ranges cover **160 acceptance criteria**, not 160 already passing tests.

| PRD feature heading | Acceptance IDs | Components / verification |
|---|---|---|
| Projects and Shared Tools | P1–P7 | C1, C2, C4; G4/G6 |
| Frontier Agent Setup and Selection | F1–F13 | C1, C3, C5; G2/G6 |
| Tool Setup and Failure Recovery | S1–S10 | C4, C5; G1/G6 |
| Debug Confirmation and Agent Authority | D1–D4 | C3, C5; G2 |
| Music and Video Generation | G1–G15 | C2–C6; G2/G3/G4/G6 |
| Generation Seeds and Variations | SD1–SD5 | C3, C4, C6, C8; G3/G5 |
| Persistent Visual Style | V1–V4 | C1, C3; G2/G5 |
| Linked Timing Units | U1–U5 | C7; G5 |
| Frame-Based Trimming and Locked Frame Rate | FT1–FT8 | C6–C9; G3/G5 |
| Raw Frame Preservation | RF1–RF4 | C6, C8; G3/G5 |
| Continue From End | R1–R6 | C6–C8; G3/G5 |
| Song Selection and Saved Arrangements | M1–M7 | C1, C2, C8; G5/G6 |
| Default Clip Timing | B1–B21 | C4, C7; G3/G5 |
| Generation History | H1–H8 | C2–C6, C8; G2/G3/G5 |
| Artifact Archive, Restore, and Delete | A1–A12 | C2, C8, C9; G5 |
| Timeline and Music Coverage | T1–T9 | C7–C9; G5 |
| Clip Audio | C1–C13 | C6, C8, C9; G3/G5 |
| Preview, Black Gaps, and Export | E1–E9 | C7–C9; G5/G6 |

Component IDs C1–C9 and gate IDs G1–G6 are local to this spec; PRD criteria such as C1 or G1 are identified as PRD IDs in the table, not silently conflated with them.

## What Was Simplified and Why

- One host, one database, one application server and one owned GPU lane; no distributed discovery, remote workers, Redis, hosted storage or account system.
- Product-owned skills, helper scripts and workflows reduce routine effort without narrowing agent capability. Agents can research and author their own scripts/scores; receipts and actual-file checks establish what happened. No forced planner/executor split or JSON final reply.
- One fixed frame rate and accepted initial output profile; no frame-rate conversion, multitrack transitions or mastering.
- Immediate source-media browser preview plus explicit verified FFmpeg export; no proxy-generation service or new output-format mode.
- Bounded history, not undo/event replay or workflow sharing. A small relational model is justified by saved songs, immutable jobs and media lifecycle, not speculative scale.
- No image generator, separate foley tool, speech feature, pre-song editor, general headless API or licensing UI in v1.

This is still a substantial integration project, not a credible 2–4-hour build. Much of the complexity comes from approved recovery, provenance and precise-editing behaviour rather than the TypeScript framework. No required behaviour has been quietly downgraded because the demo will be short.

## Decisions and Open Issues

### Already agreed

React/TypeScript/Vite + Node/TypeScript/Fastify; Dundee as the deployment target for the Ubuntu 26.04/16 GB server with LAN browsers; no app accounts; native tools remain native; product-owned knowledge; one cross-project GPU-heavy queue with explicit handoff; exact 24 fps; complete pre-lossy frame retention; captured job ownership and seed rules; adaptive 8/4/2/1 presets everywhere; no blanket four-second minimum; advisory only above 15 seconds. The approved PRD governs all other product behaviour.

### Review decisions recorded

The learner said "other than that i like all the other proposals". Treat the retained first-draft recommendations as accepted, not an invitation to ask them all again.

| Item | Review outcome | Consequence |
|---|---|---|
| P1 — SQLite + filesystem | Accepted | Transactional metadata, local media and purge reconciliation. |
| P2 — constrained plan/execute split | **Rejected and replaced** | Agents retain their normal tools, research, shell, history and creative freedom; no sandbox/read-only/JSON-response requirement. Supply useful skills/helpers/workflows. |
| P3 — bootstrap + user service | Accepted; deployment host corrected to **Dundee** | One host, port 9122, browser clients; Artigas is reference only. |
| P4 — exact timing representation | Accepted | Rationals, containing-frame labels, half-open cuts and one beat map. |
| P5 — native frame granularity | Accepted, implementation test still required | Retain extra native frames; initially place only requested realised frames. Not four-second padding. |
| P6 — media dependencies/song lifecycle | Accepted | Protect queued/running input dependencies; preserve archived-song arrangements and retained history. |
| P7 — one render path/profile | Accepted | Server-rendered MP4 preview/export; first profile 640×480/24 fps/H.264/AAC. |
| P8 — placement picker/place-first restriction | **Replaced by per-clip action** | The clicked card supplies its current edit context; no extra clip-selection gate or required re-placement. |
| Separate Python environments | Explicitly requested | ComfyUI and YuE2 must not install packages into or replace host Python. |
| Project-specific agent cwd | Explicitly requested | Stable project workspace shared among its workers; no generic shared creative cwd and no security-confinement claim. |
| P9 — host/tool dependency setup split | **Accepted, 21 October 2026** | Check/install native FFmpeg prerequisites through host bootstrap; manage isolated Librosa in the existing Audio analysis panel; recheck both from the service account. |

### Still needs evidence, not another opinion survey

Exact generator/environment/model pins, practical 16 GB behaviour, cancellation latency, true raw-frame/audio alignment, silent post-song conditioning, provider account access and actual unrestricted CLI/tool behaviour, and licence/redistribution compatibility remain gates. Pin them through small executable checks before building assumptions on them. A failed gate can require a visible PRD/scope amendment; it cannot authorise one silently.

### Useful unknown clarified during planning

The learner initially expected configurable video fps and wondered whether raw VAE frames and per-job cancellation could be exposed. Inspection separated desired behaviour from native capabilities: 24 fps was explicitly adopted; saving the decoded batch and targeted Comfy cancellation have source-level support, but quantised PNGs are not floating-point tensor dumps and interruption requests are not measured stopping. Native frame counts remain the clearest example of a spec decision that needs both learner review and a real contract test.

**Approval and handoff:** the learner approved the complete revised blueprint with "perfect, all sounds great" on 21 October 2026, including P9. Earlier proposals are accepted or explicitly replaced as above. `4-spec` is complete; the next stage is `5-build`, preserving test review before feature implementation. Extra Librosa capabilities are informational, not added requirements. No application implementation, Dundee installation, generation or repair agent has been launched during planning.

### Integrated creative-loop implementation refinement (23 October 2026)

Generation timing is pulled forward into the creative-loop UI. Each endpoint
retains its last typed unit/string, or exact seconds as serialized integer
numerator/denominator for a clicked sample-time boundary. Server validation
re-resolves against the captured song analysis and verifies floor-start/ceil-end
frame bounds; immutable attempt metadata records the resolved rational seconds.
Approximate repeating displays never become authoritative through focus or
polling. Invalid/incomplete entry is retained for correction, not auto-coerced.

Sequence markers support keyboard buttons and pointer selection. Pointer
coordinates choose a nearest measured beat (or exact zero/song-end boundary);
post-song beats extrapolate the established beat map. The end selector is the
default. Draft highlight is separate from placed/reserved rows. Sort placements
by descending saved priority; put each whole interval immediately below its
lowest overlapping predecessor, reusing rows for disjoint clips. Reservations
follow placed clips without priority controls. Never split UI blocks at overlap
boundaries. Each lower clip has one move-up target: the highest-priority
overlapping placement in the row immediately above. The existing pairwise
priority swap lifts the whole clip; source bounds and timings do not change.
Whole-clip identity and truthful dominance take precedence over minimum rows.
Coverage still uses only included placements. No timeline edit implicitly
starts generation.

Schema 3 adds an append-only project event ledger without rewriting legacy
attempts or fabricating past style edits. A single UI timeline merges recorded
project events with existing generation/render submission and terminal records.
Video source changes initialize playback to unmuted volume 0.5 once, not on
polling rerenders; encoding/mixing inputs are unaffected. Navbar order is a
presentation rule, separate from installation dependency order.

### Context continuity implementation refinement (23 October 2026)

Schema 4 adds `studio_clip_drafts`, keyed by song with project membership and an
independent revision. `PUT /api/projects/:projectId/songs/:songId/clip-draft`
saves bounded prompt/timing text without requiring an incomplete form to be a
valid generation request. Generation still validates exact timing separately.
Migration creates only empty revision-zero forms; existing creative rows and
history are not rewritten. Clip-draft history records changed fields and revision,
not a second copy of every unsent prompt.

A per-tab recovery journal complements server autosave. Newer local typing is
retained across saves, navigation and conflicts; an old unmounted response cannot
overwrite its successor's recovery. Conflicts offer explicit load-saved/keep-local
choices. Music/video submission journals are scoped to their originating context;
canonical signatures preserve uncertain request identity even when JSON property
order changes. Ordinary confirmed re-generation creates a new key/seed. If browser
storage cannot be written, fallback recovery lasts only for that page lifetime.

FIFO dispatch is ordered by durable acceptance, including a head request whose
capture is still pending. Provider-check results apply only to their current
selection/check generation. Captured jobs never adopt a later provider or model.
Provider receipts distinguish an observed Codex native header session from a
Claude session assigned through its native CLI argument; absent metadata does not
fabricate an ID or turn a valid creative result into failure. Normal tools and
ordinary-language agent replies remain unchanged.

Uncertain interrupted work remains reconciling and blocks blind dispatch.
Never-dispatched captured jobs can proceed after a same-source restart. Upgrades
are drained/idle deployments: plans tied to a different immutable source are
refused rather than silently re-captured or reinterpreted. This is not
reboot-resumable model inference.


### Notification dismissal refinement (24 October 2026)

The notification inbox contains failures and the initial trusted-LAN notice, not successful operations or routine GPU/timeout documentation. Keep collapse, review and dismissal separate: review selects only undismissed IDs and the badge counts only those IDs. Polling must not resurrect a dismissed occurrence; a new error occurrence may announce normally. Persist only the opaque LAN-warning dismissal ID in localStorage, migrating the previous session preference without persisting error or prompt text. Expired five-second announcements remain reviewable until individually dismissed. Draft-conflict recovery also stays in the music form so dismissing an overlay cannot strand an unsaved draft.
