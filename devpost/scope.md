---
doc: scope
status: approved
---

# AI Music Video Maker

*Working description, not a chosen product name.* A beginner describes a musical and visual idea in ordinary language; an agent coordinates tool setup, generation, and assembly into a playable music video.

**Approval record:** initial scope approved 19 October 2026; reconciled on 20 October 2026 with the learner-approved `prd.md`. Amended 21 October 2026 during `4-spec` to use globally fixed 24 fps, adaptive beat-based presets, and advisory-only duration guidance, by explicit learner decisions. The same review names Dundee for deployment, preserves normal creative-agent capabilities and per-project working context, places continuation on each clip, and accepts the stated media-lifecycle refinements. The PRD defines the observable behaviour and acceptance criteria for the expanded prototype below. Approval does not establish toolchain feasibility.

## The Unique Kernel

Preserve creative flow by translating artistic intent into specialist prompts and coordinated production, rather than making the user learn each tool's terminology and workflow. Getting the necessary tools ready is part of the product's responsibility, not prerequisite homework for the beginner.

## Who It's For

Someone with no previous AI music- or video-generation experience, using Ubuntu **26.04** and an NVIDIA GPU with **16 GB VRAM**. They can describe what they want without knowing model-specific syntax. This is the intended support target, not yet a verified compatibility claim for the eventual toolchain. Dundee is the named deployment/demo host; Artigas is the laptop holding the reference prototype, not the deployment target.

## The Core Loop

On first use, choose and prepare the frontier agent, then let the product set up music/video generation and audio analysis. Create or select a project, describe a short song with optional lyrics, listen to the generated result, describe accompanying clips, inspect and arrange them against the song, and preview/export a playable video. The demonstration still uses one short song and roughly three clips, but the product supports multiple isolated projects and saved arrangements for each song.

An agent translates creative intent into specialist tool calls, retaining its normal research, history, script/score editing and other tools without product-added sandbox, read-only or JSON-response constraints. Project workers start in a known project-specific workspace, sharing that project's materials rather than a generic creative directory. Refine results through new generations rather than undoing generated output. Inspect the inputs, tool settings, seeds, and results in the project's generation history. Timing controls, coverage feedback, and continued post-song clips support intentional assembly without requiring the user to operate the underlying tools separately.

The interface accepts text. Any dictation used while demonstrating it is an external input aid, not a built-in speech feature.

## Inspiration & Identity

Creative freedom without the administrative burden of elaborate generation workflows. Prefer a LAN-accessible web interface with an attractive, functional industrial feel. Use hazard stripes for unfinished work and animated stripes for activity or the next essential step. Use Larabie Kirsty for top-level headlines/titles with a conventional, readable companion for other content. These are approved design directions, not a finished interface or evidence of licensed font assets; exact assets and embedding/redistribution terms remain to be checked.

The learner's experience of [Civitai](https://civitai.com/) competitions and [ComfyUI](https://comfy.org/) workflows provides context, not a requirement to reproduce either product. No particular competition or visual reference page has been supplied. The existing personal prototype is inspiration; its implementation and two completed examples were inspected read-only on 21 October 2026 (see `prototype-investigation.md`), without selecting its architecture or code for reuse.

## Why This Matters to the Learner

Making ambitious creative work should involve describing an outcome and refining results, rather than losing momentum to prompt syntax and laborious editing. The learner wants to make the freedom experienced in a machine-specific prototype available to others, while practising the separation of scope, requirements, and technical specification.

## What "Working" Looks Like

A newcomer starts on the supported machine without the generation tools installed, uses product-managed setup, describes a song and three clips, and obtains an exported music video that plays independently in VLC. The compelling moment is ordinary creative language becoming a finished audiovisual result without the user having to operate the underlying generators separately.

The proposed demo narrates setup, compresses long installation and generation waits with timelapses, shows the creative inputs, exports the result, and ends with independent playback. Its closing narration must distinguish implemented features from future ideas. Demo editing is not a promise of installation or generation speed.

Submission also requires a public GitHub repository and a short demo video; deployment is optional. The expanded prototype exceeds the original minimal assembly sketch. The curriculum's nominal 2–4 active-hour target is not a credible established estimate; a short timelapsed demo does not make the implementation small.

## The POC Boundary

The initial minimal assembly boundary is expanded by the approved PRD. The following capabilities are required for the first prototype, not optional extras merely because the demo does not show them all:

- **Target and shared setup:** Ubuntu 26.04 with a 16 GB NVIDIA GPU, deploying on Dundee; product-managed agent, music/video, and audio-analysis setup. Select Codex with the requested Sol 6.1 model or Claude with the requested Opus 5.5 model, using terminal interaction. Shared setup/status and sign-in guidance survive project switches/reloads. Install individually or together, retry failures, and offer autonomous setup debugging only after an informed confirmation showing the actual prompt/command and warning of changes beyond the tool's working directory. Provider selection can be reopened from its navbar status; existing queued/running requests retain their assigned agent, and only new requests use a changed selection.
- **Projects and songs:** separate project music, clips, archives, and history, with only underlying tools/configuration shared. Each song has its own saved arrangement. A newly generated song is selected with no clip placements; previous arrangements remain available to switch back to.
- **Creative generation and recovery:** text music description with optional lyrics; video prompt with optional persistent project style, both supplied to the agent, and song-audio conditioning by default. Generations continue across navigation/reload. Queued/running clip placeholders support cancellation, then same-input Restart, Discard, or Restore parameters. New outputs are placed at their request's captured song/times, not at a newly calculated gap when they finish.
- **Timing and continuation:** waveform and beat markers; all beat-based generation presets use adaptive 8/4/2/1-beat selections. Begin with eight beats at 50 BPM or above, otherwise four; halve until the proposed duration is at most 15 seconds or the count reaches one. Ordinary gap filling uses at most this count and stops before the next assigned range, never filling a long gap merely because it is free. Use exactly 24 fps globally across projects, generation, timing controls, preview, and export, without a frame-rate selector or conversion. Linked editable beats/seconds accept arbitrary fractional precision while frames remain whole-number containing frames. Exact inclusive source-frame trimming preserves retained frames' song times, leaving gaps; placement changes are separate. Continue-from-end uses the edited clip's last retained original frame, starts at its realised end without an extra blank frame or beat snapping, and proposes the same adaptive preset count from that start, retaining any off-beat offset.
- **Duration guidance:** no blanket four-second minimum. A duration over 15 seconds displays a non-blocking warning suggesting multiple generations, without automatically shortening, splitting, or blocking the request. Exactly 15 seconds does not warn. If one beat itself exceeds 15 seconds, keep the one-beat preset and warning. Presets do not change manually entered or already-submitted ranges; actual tool support remains unverified.
- **Assembly and soundtrack:** show unique music coverage and highlight gaps, rendered black in both preview and export; full coverage is not required. Overlaps show one dominant clip with a front/behind swap. Use original-song audio by default; optionally replace it with the dominant clip's existing mixed audio, never layer the two or use hidden clips' audio. Warn, without prohibiting the choice, if that clip has moved from its original audio alignment.
- **Continued post-song video:** retain overhanging clips and allow further clip-by-clip generation after the song, with non-blocking start/end advisories. Use silence or the dominant clip's enabled audio beyond the music. This is not pre-song editing, automatic effects, or a verified feature-length rendering promise.
- **Media lifecycle and provenance:** archive/restore and confirmed irreversible media deletion, with automatic removal of archived/deleted clips from arrangements and restoration to the library unplaced. Retain generation records, thumbnails, text logs, and deletion events. Protect artifacts depended on by queued/running work from permanent deletion; archived songs retain their saved arrangements, while restored clips remain unplaced. Inspect user/agent inputs, actual tool prompts/settings, and seeds. New creative generations/variations use new recorded seeds; failed Retry and cancelled Restart reuse the seed. Seed changes support near-miss variations; seed records support reproducibility without guaranteeing identical output. Preserve original pre-lossy frames or a lossless equivalent alongside encoded video for frame references; archive/delete both together under the stated retention rules.
- **Demonstrable delivery:** inspection, matching preview/export decisions, and an independently playable video file. The demo remains one short song and approximately three clips, not a restriction on how many projects or clips a user can make.

Each clip has its own Continue From End control, using that card's edit context rather than a separate predecessor picker. Creative project agents retain their normal capabilities and use project-specific working folders; these are organisational boundaries, not sandboxes.

`prd.md` is the approved source for exact behaviour, states, and acceptance criteria. Technical mechanisms, supported generation durations, output formats/resolution, native frame-count limits, and integration constraints belong in `4-spec`. No application code, tool installation, or real generation has been performed for this project.

### Feasibility still to establish

H3 and Yue2 are learner-named candidates, with ComfyUI and audio analysis also requested in the setup experience. Prototype inspection has identified YuE2 and MiniMax H3 integrations and verified existing 24 fps media, but this is not a fresh installation or end-to-end test of the new product. Exact pinned versions, installation units, practical 16 GB VRAM compatibility, provider/model availability and invocation, provider authentication, cancellation, full original-frame access/storage, seed handling, precise timing, and applicable code/model/output/font terms still require verification. Approval selects the product behaviour, not untested implementation claims. If investigation undermines the baseline, explicitly revisit scope/requirements rather than silently substituting tools or weakening promises.

## Later

The PRD approval supersedes the original broad deferrals where it explicitly brings bounded features into the prototype. The following remain deferred:

- **Separate foley/diegetic sound generation.** Existing sound already mixed into a generated clip may be used through the approved soundtrack-source switch; there is no separate editable foley layer.
- **Separate image generation and general-purpose image-guided workflows.** The narrow approved exception is continue-from-end using an existing generated clip's last retained original frame; it does not require another image model.
- **Support for 8 GB or smaller GPUs**, only if feasible and later approved.
- **Alternate frame rates and frame-rate conversion.** V1 uses globally fixed 24 fps, replacing the earlier configurable 30 fps default by explicit learner decision.
- **Advanced editing beyond the confirmed controls:** seamless joins, transitions, and advanced beat-aware editing. Basic beat analysis, waveform/beat markers, precise linked timing, frame trimming, placement, persistent style, and continue-from-end are now required, not deferred.
- **Audio finishing:** mastering, spatial effects, audio fades/crossfades, levelling, output-level changes, stem separation, and foley mixing. No hidden automatic creative audio processing is implied.
- **Pre-song intros, a general-purpose intro/outro editor, and broader non-music-video workflows.** Continued post-song generation is the explicit approved exception to the earlier deferral of all beyond-song timelines.
- **Automatic LAN discovery, arbitrary toolchain configuration, additional agent providers/model selection, and a headless agent API.** The reversible two-provider agent selector is the bounded prototype exception, not a general tool catalogue.
- **Workflow sharing, generation replay, and a deep creative-history editor.** Bounded expandable generation provenance is now required; undo/redo is not the generation-revision mechanism. Optional deletion of retained history remains later; confirmed media deletion does not erase its provenance.
- **Dedicated licensing/about UI and specialised fast-preview versus high-quality-export modes.** Dependency terms still require investigation even without a licensing screen.
- **Selectable gap background colours/images.** Uncovered intervals remain black for the prototype.

These deferrals preserve the wider vision without contradicting the bounded controls now approved in the PRD.

## Explicitly Cut

- **Built-in speech input/output:** the product stays text-only; users can use their preferred external input tools.
- **Mandatory image generation in the basic path:** the basic generation path remains direct text/audio-conditioned video. Continue-from-end may reuse an existing generated frame, but no separate image generator is required.

No broader vision feature has been permanently rejected merely to meet the initial proof-of-concept boundary.
