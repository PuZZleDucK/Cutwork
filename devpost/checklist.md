---
doc: checklist
status: approved
---

# Build Checklist

**Completed and signed off for submission — 25 October 2026.** All build slices,
hands-on acceptance checkpoints and the learning wrap-up are closed within the
accepted proof-of-concept boundary. Dated checkpoints below preserve the build
history; their older pending statements do not reopen completed work.

Build mode: **fast** — explicitly selected by the learner on 23 October 2026 because submission is due this weekend. Standing approval applies to routine in-scope tests, implementation, bounded verification and commits. Do not pause for per-batch approval; stop for genuine blockers, consequential scope/architecture changes or feedback that materially affects the product. Retain tests-first development, mechanical verification, independent focused review where useful, privacy safeguards and honest live-evidence boundaries. Prior learn-mode approval gates are historical, not current blockers. No blanket permission to kill unrelated work or conceal failed results.

**Historical starting checkpoint (21 October; superseded by the index below):** The scope, PRD and technical specification are approved. The learner approved this build order on 21 October 2026 ("looks great"). It sequences the approved product, without adding new behaviour; no further build-order sign-off is required. Git was initialised with the learner's agreement. On 21 October the learner explicitly requested a partial progress checkpoint commit; this saves the work without completing slice 1. Slice 1 has initial application modules, Dundee runtime/CLI preparation and successful real provider capability probes; a direct short YuE2 generation has now passed, and a first short song-conditioned H3 clip has passed; a first agent-driven attempt recovered real media after an H3 observation failure, but a clean chain pass remains outstanding. All 78 approved local tests pass, including the eight implementation-review regressions and both provider-runner failure paths.

## Latest fast-mode verification index

**Submission and closing recap — 25 October 2026:** the owner confirms the demo
video and repository are public and included in the submitted entry. No hosted
application is planned or needed for this handoff. Owner-supplied demo, animated
submission artwork and submission answers were published unchanged in `d50f2bf` by
explicit request. The existing archive/restore planning decision and learner-written
submission reflection provide the brief learning recap; no new interactive code
tour, code edit or testing session is implied. The owner explicitly accepted the
submitted prototype and its recorded limitations on 25 October. Final Review and
slice 9 are now closed; limitations remain recorded, not converted into passing
checks.

**Submission reconciliation — learner decision:** skip the remaining accessibility
checks for this submission. The final keyboard/focus/dialog and reduced-motion
sweep is **SKIPPED / NOT VERIFIED**, not passed. Existing accessibility features
and earlier tests remain intact; no accessibility certification is claimed.
Responsive observations remain limited to the recorded desktop/narrow fixtures;
no fresh cross-device certification or new sweep is being added as a gate.

The fresh managed-install and creative journey are complete; do not restart
model downloads or treat old scratchpad “pending” notes as current work. The only
observed issues from the second recording have now been investigated: Config's
stale context display was reproduced, fixed and deployed; the Claude post-completion
hang did not recur in four pinned native CLI probes and is deferred for
post-submission investigation. See [the findings](post-demo-issue-investigation.md).
Neither was a failed render or lost project. Final owner acceptance, the brief
learning recap and submission publication are recorded above. Acceptance does not
claim an additional watch/listen session or new technical verification.

**Public source published — 25 October:** [PuZZleDucK/Cutwork](https://github.com/PuZZleDucK/Cutwork),
branch `main`, after explicit learner authorisation. Refreshed README, installation/
usage/contribution guides, four screenshots, compact GIF and unchanged sample film
are available without authentication; README and sample bytes match locally.
Bounded current/history credential review and media/link checks pass; the unchanged
code baseline has 1,510 tests plus typecheck/build, and the timing wording review
passes 20 focused tests. Measured VRAM is documented with sampling/allocator limits.
Local agent/course files, raw captures and the private learner profile remain
excluded. The owner later authorised the submission answers and supplied media
for publication in `d50f2bf`; no submission prose was written by the agent. See
[repository preparation](repository-preparation.md).

**24 October post-demo fix:** source `08a6b5a` adds setup-triggered context refresh
without discarding drafts or weakening concurrent-save conflict detection. Six new
regressions; **1,510 tests in 114 files**, typecheck/build and functional browser
checks pass. Web-only deployment leaves 30 database tables/schemas, 1,070 asset
records (995 present file hashes), both projects and service identities unchanged.
Backend remains the recorded `a069a59`; no restart, inference or downloads.

**24 October second recorded journey completed:** frozen source `a069a59`, fresh
runtime/environments/model downloads, Claude Day song+clip before Codex Night.
The requested macro take-1/remove/reuse/take-2/preview/delete/reuse-take-1/take-3
order is verified. Six whole placements, four continuations, priority swaps,
archive/restore/place, trim/move and a three-second post-song tail produce a
verified 28-second film. Full live playback precedes export; no save dialog.
Two raw segments total 4h52m19.983s, with chapter index and app-audio editions.
All recordings/export/retained clips decode; take-2 purge and frame hashes pass.
TTS restored, personal ComfyUI unchanged. See [recorded-demo-v2.md](recorded-demo-v2.md)
for the confirmation gap, two operator-workaround boundaries and exact evidence.
At that checkpoint final learner review/wrap-up and submission editing remained
open; the closing record above supersedes that status.

**Earlier 24 October recorded newcomer journey completed:** fresh application runtime,
isolated Python environments and real model downloads, followed by Night Shift
Garden: original song, eight successful video generations, seven placed clips,
five continuations, overlap priority, trim/move, archive/restore/deletion and a
verified 28-second export. The complete 4h18m30s raw recording is retained locally.
A real LAN HTTP deletion bug was fixed in `df08ce5`; **1,425 tests**, typecheck/build
and actual deletion retry pass. TTS restored; personal ComfyUI unchanged.
See [recorded-fresh-install.md](recorded-fresh-install.md) for evidence and limits.
At that checkpoint slice 9 remained unchecked for final learner acceptance, not
because downloads were still running. It is now closed with the recorded limits.
The entries below are historical checkpoints, not the current runtime inventory.

**Cutwork branding deployed:** final name, original hazard-striped clapperboard
mark/favicon, and button styling for formerly link-like actions. **1,424 tests
in 101 files**, typecheck/build and actual browser checks pass. Web-only deployment
preserves databases, **832 assets** and service identities. See
[cutwork-branding.md](cutwork-branding.md).

**The model-download/install test has finished:** a fresh read on 24 October
shows all five tools ready. H3 checksum/import checks completed at 22:48 and
audio analysis at 22:52 on 23 October, Melbourne time. Do not keep waiting for or
restart those downloads. The fresh-runtime song/clips/edit/continuation/export
journey, final learner review and learning wrap-up are still pending. See
[slice-9-readiness.md](slice-9-readiness.md). This reuses host prerequisites and
provider sign-in, not a clean-OS/new-account certification.

**Notification fix deployed:** dismissed occurrences no longer return on panel
close/reopen or polling; counts include only undismissed notices. The inbox is
failures-only except for the first-use LAN security notice, whose dismissal is
remembered across visits. Success messages and GPU/timeout explanations are
excluded. **1,418 tests**, typecheck/build and exact four-to-two browser regression
pass. The live inbox shows zero; web-only publication preserves all databases,
**832 assets** and service identities. The learner accepted whole-clip priority
with “thats perfect”; notification retry remains open. See the latest follow-up
in [workbench-round-two.md](workbench-round-two.md).

**Priority clarification deployed:** one whole sequence block per placement,
never split across rows, with at most one move-up arrow. The reported four-clip
project now shows exactly four blocks (previously seven fragments). **1,411
tests**, typecheck/build and browser swaps pass; web-only deployment preserves
all databases, **832 assets** and service identities without a restart. See
the whole-clip follow-up in [workbench-round-two.md](workbench-round-two.md).
Learner retry remains open.

**Latest: the second requested workspace refinement is deployed; slice 9 is not complete.**
Project selection and five-second floating notices are in the navbar; tabs persist
across project switches. Config exposes captured music/video agent templates.
Preview plays the current edit directly without a render; explicit export remains
revision-bound. Clip cards are 4–5 across on desktop with visible timing/audio,
placed styling and priority controls in the sequence. **1,410 tests in 100 files**
pass locally and on Dundee; typecheck/build pass. Actual browser checks cover live
playback/scrub/audio switching, priority, tabs, dismissal, templates, continuation,
export and responsive layout. All **46 preservation checks** pass for **832 assets**;
existing creative/native/Debug rows and unrelated service identities are unchanged.
Schema 9 adds only an empty prompt-template table. See
[workbench-round-two.md](workbench-round-two.md). Final learner retry remains open.
The earlier compact-layout pass is recorded in
[workbench-feedback.md](workbench-feedback.md).

The preceding slice 9 packaging checkpoint remains historical evidence:
The corrected source passes **1,332 tests in 88 files** on Dundee, typecheck/build
and 30 Python bootstrap cases. Actual persistent-service installation exposed and
repaired a working-directory quoting error missed by mocks. All **55/55** final
preservation checks pass for **831 registered assets**, exact schema-8
creative/native/Debug data and unchanged TTS/personal ComfyUI identities.
Fresh-runtime bootstrap and repeat installation pass; the separate browser
Install-all dependency/model setup and creative journey remain in progress.
See [slice-9-readiness.md](slice-9-readiness.md) for the failed-run history and
evidence boundaries. Slice 8 remains complete; final learner review/wrap-up is
unfinished.


The chronological notes below remain as history. Slice 1 is complete; its
assertion-to-run map is [slice-1-native-evidence.md](slice-1-native-evidence.md).
Slice 2 and its early hands-on checkpoint are complete. The learner accepted the
floating/dismissible notices, restored song inputs and video-only style fixes
with “great, perfect” on 23 October 2026; see
[slice-2-feedback.md](slice-2-feedback.md).

Slice 3 is mechanically verified at `http://dundee.local:9122/`: **846 tests per
host**, typecheck/build, three real browser clips, independently checked picture
and original-song audio, browser export and headless VLC playback. The planned
integrated learner checkpoint remains before precision editing. See
[slice-3-live-evidence.md](slice-3-live-evidence.md). TTS is restored and personal
ComfyUI is unchanged. Slice 3 and its integrated checkpoint are now accepted after the feedback/polish retry (“perfect”, 23 October 2026).

The learner then requested timing/sequence/history refinements. These are now
implemented and deployed: **919 tests per host**, exact schema-3 preservation
and LAN browser checks. See [slice-3-feedback.md](slice-3-feedback.md). The
requested-feedback retry was accepted with “perfect”; later precision
editing and recovery slices are not marked complete.

A subsequent small timing/order polish pass is recorded in [slice-3-polish.md](slice-3-polish.md): ascending clip starts, a linked duration column, Start-left selection and stable timing layout. Later build slices remain pending.

Slice 4 is complete and deployed: **996/996** tests on both hosts, both real
provider adapters (**51/51** independent checks), an isolated process-restart
fixture (**15/15**) and exact migration/media preservation (**43/43**, 554 assets).
Draft navigation and lost-response retries were exercised in the browser;
existing live inputs survived reload unchanged. See
[slice-4-continuity.md](slice-4-continuity.md) for boundaries and evidence.

Slice 5 is deployed with **1,054/1,054 tests per host**, three independent
copied-real-media edit exports, browser editing/conflict/export checks and
**46/46** schema/media/service-preservation checks. All 554 registered assets
are unchanged. See [slice-5-evidence.md](slice-5-evidence.md). The final learner
review still includes perceptual listening; exact sample/packet and headless
playback verification is not described as human listening.

Slice 6 is deployed with **1,135/1,135 tests per host**, three real image-plus-audio
H3 continuations, independently verified partial/wholly silent conditioning and
two 13.5-second exports. Both source updates passed **46/46** preservation checks;
the final update preserves all **789 assets**. TTS is restored, personal ComfyUI
unchanged, and the original user project reopened with its inputs intact. See
[slice-6-evidence.md](slice-6-evidence.md), including the transient read-only
monitor timeout and perceptual-review boundary.

## Working Agreement

- The build order is approved. Write tests and record their assertions, fixtures and live-test boundaries before implementation; the learner's fast-mode standing approval removes routine waiting for sign-off. A missing import or unavailable GPU is not meaningful behavioural test evidence.
- Keep development tests separate from live evidence. Synthetic media, fake provider responses and simulated failures must be labelled; they do not prove generation, authentication, audio quality, memory feasibility or stopping latency. A skipped live check is not a pass.
- Dundee is the deployment/test target; Artigas is reference evidence only. Confirm access, the actual OS/GPU, available space and the service-account environment when slice 1 starts. Do not infer fresh-host support from existing installations, or silently substitute a larger GPU, different provider/model or remote generator.
- Preserve normal creative-agent capabilities, project-specific working directories and the approved Python-isolation requirement. Helper receipts and media validation establish observable facts without forcing agent JSON replies or restricting tools. Unknown unregistered work is a visible tracking limitation, not proof of cancellation.
- Start with executable contract checks because the spec explicitly requires them. Slice 1 is the critical-risk exception to a user-interface slice: it must leave a runnable check and real media, not merely scaffolding or a written investigation. Later slices deliver browser-visible behaviours.
- Use the approved industrial styling as UI arrives, not a separate last-minute redesign. Keep Kirsty provisional until its asset/embedding terms are verified. No placeholder control may masquerade as a working feature.
- Each slice includes test review, implementation, mechanical verification, the appropriate learner check and a commit. In learn mode, wait for hands-on feedback before that commit. Inspect the staged diff and stage only intended project files; keep private context, credentials, runtime state and generated media out of Git. Record completion evidence and the commit when checking a slice off.
- Missing access or a failing native contract stops the dependent work for diagnosis; do not mark the slice done or build a convincing UI around fake success. Changes to product promises, chosen architecture or the creative kernel require agreement and reconciliation with the planning documents.

## Current Checkpoint — Native Assessment Accepted; Fast-Mode Build Continuing

Read [slice-1-progress.md](slice-1-progress.md). The learner approved the two provider-runner assertions with "yeah, looks good". Both are fixed; **78/78 local tests and typechecking pass**. A source review found no blocker. Real tasks previously verified the requested `gpt-6.1-sol` and `claude-opus-5-5` models and normal tools on Dundee. Those remain capability evidence, not native generation/cancellation proof. The 12 native live cases remain unrun.

The checksum-pinned, isolated YuE2 dependency installation, repeat invocation, `pip check` and transient user-service imports now pass on Dundee. The initial Triton index/hash mismatch was diagnosed and corrected without disabling checks; failed evidence was retained and host-Python observations matched throughout. All 21 pinned YuE2 model assets, a repeat verification and a real approximately 20-second native audio probe now pass. The audio hit its explicit token ceiling and is retained as a truncated feasibility sample, not a finished song. **Next:** the remaining native tools, provider-driven media path, ownership/cancellation, replay and GPU handoff. No product promise/build order changed. No slice is complete. The learner-requested partial checkpoint is committed as `b698afe`, separate from the final slice commit; do not check off slice 1 or advance to slice 2 before its mechanical and learner checks.

**Decision resolved:** the learner approved proceeding with H3 for the Australian-hosted, install-on-demand prototype, retaining the licensing-information page. See the [H3 feasibility review](h3-feasibility-review.md). Resume isolated ComfyUI/H3 preparation without a model substitution or unrequested agent restrictions. This is an implementation decision, not legal clearance for public distribution.

**New verified checkpoint:** pinned ComfyUI 0.42.0 / managed Python 3.12.14 / torch 2.13.0+cu130 installed in its own Dundee environment. Fresh and completed-repeat dependency checks passed with matching host-Python observations. A real temporary CPU service exposed 996 nodes; all 20 required H3/audio-guide/sampler/decode/save nodes and checked schemas passed, and its owned process exited. The first startup found a missing empty `custom_nodes` directory; that bootstrap mistake was fixed and failed evidence retained. A subsequent real CPU output test passed with a **synthetic** 56-frame batch: original PNG pixels/order/hashes, H.264/AAC at 24 fps, exact duration, independently decoded video order and sample-exact FLAC fixture audio. Seven graph diagnostics and the six service/cleanup diagnostics also pass; none replaces a native live case.

**Requested checkpoint and continuation:** commit `49dac9b` saves native setup and the verified synthetic Comfy output branch. Subsequent work adds the sample-exact conditioning helper, request preparer and temporary owned Comfy runner. The corrected runner passed on Dundee with real prior YuE2 audio and synthetic visuals: exact conditioning samples, 56 original PNGs, encoded outputs, prompt/history evidence and owned-service exit. Two failed attempts remain recorded; metadata validation and a Linux shutdown race were corrected with regression tests. All 78 approved local cases, typechecking and 25 additional H3 diagnostics pass. This is CPU integration evidence, not H3/GPU or native cancellation proof.

**New native checkpoint — 22 October:** all six H3 assets and a completed repeat hash check passed. The real GPU attempt `4ee70e27-3649-4749-8572-2f8197b9fae4` produced 56 original frames at 24 fps from the captured YuE2 interval, with verified actual seed, encoded media and 74,400 original audio samples/channel at 32 kHz. Independent inspection and focused review agreed. Sampled process GPU peak was 15,354 MiB with CPU offloading and about 2.28 GiB process swap; this is a short-request success on Dundee, not VRAM-only or broad 16 GB/8 GB certification. The owned service exited, port 8198 closed and GPU usage returned to baseline without touching personal Comfy. No download/generation remains running.

**New provider checkpoint:** Codex `gpt-6.1-sol` used the captured product guidance and normal full-access tools to write lyrics/native prompts, generate a new 32.84-second song and request real song-conditioned H3 media. The H3 helper timed out on completion observation; the native log and saved files show output generation. Codex preserved the failed receipt, verified the saved files and exported them without a generation retry. Independent checks confirm 56 original PNGs, exact conditioning, a 789-frame sparse export with 48 visual frames then black, original-song AAC and released owned resources. Missing native history and the failed helper mean this is **not a clean pipeline pass**. The learner approved the [polling regressions](h3-polling-test-review.md) and reported that the video looks great. The repair now passes nine polling methods, including whole-response deadlines, and a same-input native H3 replay with final history, exact seed, identical outputs and clean exit. All 78 approved cases, typechecking, 34 H3 diagnostics and five launcher diagnostics pass. No natural read timeout occurred in the replay; fault recovery is tested with explicit fixtures.

**Next:** continue the remaining slice-1 gates after the analysis learner check: music replay and native cancellation, complete music→video→music handoff, clean provider-chain/Claude media verification and the 12 formal live cases. The successful captured-input H3 replay and CPU analysis are narrower than these gates. No UI or completed slice is claimed. The provider-media work and polling repair form a partial checkpoint, not the final slice commit.

**Current analysis checkpoint:** `91a8db9` saves the preceding provider-media/polling
work. The learner approved the [21 analysis assertions](analysis-test-review.md);
implementation and two review-driven readiness regressions now give **23 passing
methods**, including 10 actual native CPU tests. The separate Python 3.12.14 /
Librosa 0.11.0 environment passed installation and two repeats in Dundee user
services, with all 30 pinned packages, shared native media capabilities and
unchanged host-Python observations. A retained real song was analysed without
generation or alteration; independent decoding reproduced all 3,079 waveform
peaks, original duration/sample count, and receipt identity. Estimated beats are
not musical ground truth. See the progress record for evidence and limitations.
The learner accepted this working analysis step with “looks good, move forward.”
It is committed as **`b064372`** before cancellation/handoff work; it
does not complete slice 1 or implement the browser setup panel.

**Current implementation checkpoint:** the learner approved the
[native-control test batch](native-control-test-review.md). Its 26 original cases
and 13 supplemental regressions now pass against the TypeScript functions;
typecheck and all 117 default tests pass. Node direct-loading and owned-child
retention failures were reproduced and repaired. These are injected-I/O control
checks, not native endpoint, shared-lease or GPU-cancellation proof. No native
cancellation or GPU run occurred. The learner accepted this working step with
“looks good, continue.” The partial checkpoint is committed as **`70a40af`**;
slice 1 remains incomplete.

**Current native-binding checkpoint:** the learner approved the 53 assertions in
[comfy-native-test-review.md](comfy-native-test-review.md) with “looks good.” The
real Linux/IPv4 binding now verifies the captured process and accepted server-side
socket before sending HTTP, validates complete native responses, and bounds the
whole request by one deadline. The original 53 plus five supplemental regressions
pass: **58 binding cases, 175/175 default tests on three consecutive runs**, plus
typechecking and a direct Node 24.1.0 synthetic HTTP/controller smoke. An array
status-coercion defect was reproduced and repaired; a deliberately reconnecting
copy fails the same-socket assertion. Focused review found no remaining blocker.
These are local HTTP/process tests with synthetic data, not real Comfy or GPU
cancellation. No remote service/generator was launched. The learner accepted the implementation with “proceed.” The partial checkpoint
is committed as **`620458c`**; slice 1 remains unchecked. The shared GPU lease
and resource-release observer remain outstanding.

**Current CPU implementation checkpoint:** the learner approved the
[seven extraction/two native scenarios](comfy-cpu-test-review.md) with “make it so.”
The shared transport, cooperative proof node and owned service fixture are
implemented. The default suite now passes **189/189** on development and Dundee
Node, with typechecking; the separate real-Comfy CPU suite passed **2/2** on
Dundee in a transient user service. Queued/running targets stopped through native
cancellation while unrelated jobs succeeded. Both service identities/listeners
were independently gone after separate owned teardown; personal Comfy was
unchanged. Review-driven capture/configuration/signal safeguards were repaired
before launch. See the progress/review documents for receipts and exact limits.
The learner accepted this implementation checkpoint with “all good”; it is
committed as **`6e1926e`**.
This is not H3/GPU stop latency, resource release, shared leasing or completion
of G4/the 12 live cases; slice 1 remains unchecked.

**Current GPU observation implementation checkpoint:** the learner approved the
[37-case batch](gpu-observation-test-review.md) with “looks good.” The read-only
NVIDIA probe is implemented, with one meaningful red/green final-deadline
regression: **38 probe cases, 227/227 default tests locally**, plus typechecking.
The actual adapter ran on Dundee with no test seam: three valid native queries
in **105.791 ms**, matched independent surrounding observations, and left personal
Comfy unchanged. Query children exited; the bounded proof service exited 0 and
was subsequently inactive/not-found. Retained source/evidence passed focused
review. **The learner accepted this implementation with “good to go”; it is committed as `119505c`.**
This proves compute-process observation, not resource release, GPU cancellation,
shared leasing or dispatch readiness. No remaining G4 gate is waived.

**Current process census implementation checkpoint:** the learner approved the
[39-case batch](process-census-test-review.md) with “looks good.” The reader is
implemented, with two additional passing canonical-input guards: **41 census
cases, 268/268 default tests locally**, plus typechecking. One actual default-I/O
Dundee call returned **340 identities in 226.837 ms**, all matched against
independent before/after observations. Personal Comfy and boot identity were
unchanged; the bounded proof service exited 0 and was later inactive/not-found.
Code/receipt review found no remaining blocker. **The learner accepted the implementation with “all good”; committed as `cc699e4`.** This is visible process evidence, not ownership,
GPU resource release or dispatch readiness. No remaining G4 gate is waived.

**Current whole-queue implementation checkpoint:** the learner approved the
[48-case batch and native extensions](comfy-queue-test-review.md) with “looks good.”
The read-only binding and decoder are implemented: **48/48** new cases,
**316/316** default tests and typechecking pass on development and Dundee Node.
The **2/2** extended native CPU scenarios passed, with all **six** actual queue
observations matching raw before/after responses and intended job IDs. Both
owned services exited cleanly; independent checks found their PIDs/groups/ports
gone, with personal Comfy unchanged. Exact-source/receipt review found no blocker.
**The learner accepted the implementation with “looks great, go for it”; committed
as `b45c6d2` after rechecking typechecking and 316/316 default cases.** Queue input
is not GPU release, a shared lease or model cancellation/handoff; no G4 gate is waived.

**Current composed-evidence checkpoint:** the learner approved the
[53-case/native batch](registered-work-test-review.md) with “yep”. The collector
is implemented, with a reproduced/repaired final-classification deadline defect:
**54 collector cases, 370/370 default cases and typechecking pass** locally and
on Dundee's exact source snapshot. The first native attempt failed in its opening
live-service census; the post-exit window was not executed. On 23 October the
learner approved one fresh attempt with identical source and strict checks.
That second attempt passed the live window, then failed its opening post-exit
census (`PROC_CENSUS_IO` on `/proc/2348632/stat`). Later observations were retained,
not promoted to clear/released. Both attempts' owned-service cleanup and unchanged
personal Comfy were independently verified. The original nested errno is missing,
so process churn and the failed PID's ownership remain unconfirmed. The learner then approved the
[27 diagnostic tests](census-error-diagnostics-test-review.md) with “looks good”.
The missing-cause defect was reproduced (**21 red / 6 green**) and repaired:
**27/27 diagnostic cases, 397/397 default cases and typechecking pass locally**.
The tests are promoted into the default suite; focused review found no issue.
No retry/release semantics changed and historical errno was not reconstructed.
The learner accepted the diagnostic repair and authorised one fresh native
attempt with “yes”. **Attempt 3 passed 1/1**, including all four census scans,
live empty-queue brackets, explicit post-exit queue failures and retained GPU rows.
Those expected queue failures preserved native ENOENT details; the earlier
census errors were not reproduced. Fresh exact-source Dundee and local checks
pass **397/397** plus typechecking. Owned-service cleanup and unchanged personal
Comfy were independently verified. The learner accepted this checkpoint with
“looks good, go for it”, approving its commit and preparation of the next
integration tests before implementation. Slice 1/G4, actual GPU cancellation/handoff
and shared leasing remain open. No fourth run authorised; normal agent
capabilities remain unchanged. The accepted collector checkpoint is committed as
**`3298874`**, with fresh typechecking and 397/397 default tests before commit.

**Latest:** the learner approved the [registered-work assessment contract](registered-work-assessment-test-review.md)
with “looks good”. Its pure descriptive implementation consumes actual collector
reports and independently observed exit receipts. Failed queues never become
empty; mere procfs absence cannot certify exit. All 45 approved assertions remain
unchanged, with four review regressions added: **49/49 assessment tests**, fresh
typechecking and **446/446 default tests** pass. Independent focused review is
complete. The learner accepted the implementation with “great, proceed”, approving
its commit and native test preparation. No native extension has run or been
authorised; this result remains incompatible with
release/dispatch authorization. Real shared lease/handoff work is still required.
The accepted assessment is saved as **`0356682`** after fresh typechecking and
446/446 tests. Its [native verification plan](registered-work-assessment-native-review.md)
extends the existing single CPU-service scenario with live, confirmed-exit and
same-capture withheld-receipt assessments. Typechecking and one-scenario
collection pass; independent static review found no blocker. A new explicit
`STUDIO_ASSESSMENT_EVIDENCE=1` gate prevents accidental reuse of the old launch
command. No native execution is authorised until the learner approves the plan.

**Latest native outcome:** the learner replied “approved”; the single authorised
attempt passed **1/1**, exit 0, on Dundee. Fresh local and exact-source Dundee
checks passed typechecking and **446/446**. The live service was observed active;
the post-exit report retained failed queues while the actual child exit receipt
allowed a retired-service explanation; removing that receipt from the same input
yielded indeterminate. Independent raw census/GPU and receipt checks, cleanup,
source hashes and reviewer corroboration passed. The owned fixture exited via
SIGINT only; personal Comfy identity/listener and its 234 MiB listing were unchanged.
See [the retained outcome](registered-work-assessment-native-review.md).
The learner accepted the native result and switched to fast mode with standing
approval. Commit this checkpoint and implement the shared GPU lease/handoff
path; do not rerun a completed proof without a concrete verification purpose. G4 and
real model cancellation/release/handoff remain open.

### Fast-mode HTTP integration checkpoint

The native queue now has a real Fastify listener, cooperative tool client and
project-scoped native-command resolver. Actual loopback HTTP/SQLite tests use
explicitly synthetic native adapters; they do not count as model proof. A
focused review reproduced and fixed shutdown/cancellation races. See
[native-coordinator-build.md](native-coordinator-build.md). The provider proof
now uses this shared queue; its new live execution remains to be verified.
The first model lane run failed on host RAM pressure; failure and bounded
release-settling repair are retained in [gpu-lane-build.md](gpu-lane-build.md).
No slice or live gate has been silently waived.

## Slices

**Fast-mode progress, 23 October:** the actual durable SQLite FIFO/lease and native
worker now exist, with launch-before-ack gating, frozen cancelled attempts,
maintenance exclusion and retained reconciliation. Typecheck and **484/484** tests
pass on Dundee; an independently audited real systemd/SQLite CPU lifecycle proof
also passes. These are no longer only pure decision helpers, but CPU payloads do
not prove model cancellation/CUDA release. See [GPU lane build](gpu-lane-build.md).
The next work is the prepared real-model lane verification; no slice/G4 gate is waived.

- [x] **1. Prove a real brief-to-media path on Dundee**
  Becomes usable: A repeatable contract-check command takes a small creative brief through a real provider agent, generates a song and a short song-conditioned H3 clip, retains the original frames and receipts, and produces a playable validation video. It is a developer-facing integration proof, not yet the finished browser product.
  Why now: Native versions, model access, 16 GB operation, frame output and actual cancellation can invalidate the rest of the design. Find those problems before investing in an editor. Include project bootstrapping here rather than making it an otherwise unusable first step.
  PRD ref: `prd.md > The Core Journey` (steps 2, 4, 6, 9); `prd.md > Frontier Agent Setup and Selection`; `prd.md > Music and Video Generation`; `prd.md > Raw Frame Preservation`; `prd.md > Generation Seeds and Variations`.
  Spec ref: `spec.md > Stack`; `spec.md > Where It Runs and How Someone Tries It`; `spec.md > C3 — Provider Adapters and Product-Owned Generator Knowledge`; `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`; `spec.md > C6 — Native Generation Adapters and Media Validation`; `spec.md > External Services and Dependencies`; `spec.md > File Structure`; `spec.md > Verification and Build Gates` (G1–G4, initial evidence).
  Build: After test review, introduce the TypeScript workspace/test harness, minimal server/runtime bootstrap and service ownership, version manifest and reusable installation recipes. Verify required host binaries and separate ComfyUI, YuE2 and analysis environments without replacing host Python. Pin compatible packages/models using primary sources and the observed native contracts. Add product-owned agent guidance, normal CLI invocation, project/run directories, receipt-producing helpers and the raw-frame workflow branch. Capture exact file-backed inputs, actual seeds and native job identities. Exercise both requested provider/model pairings for normal tool use; run the real song→audio-conditioned clip→validation export path without relying on the personal prototype's configuration. Keep a resource and capability report with the evidence, not credentials or full media in Git.
  Verify (mechanical): Run type checking and the reviewed contract tests. On Dundee, execute both provider smoke tasks, verify actual model identity/cwd/normal tools, and generate the fresh native media chain. Independently probe duration, codecs, exact 24/1 rate, dimensions and ordered PNG count/hashes; compare retained frame and receipt identities. Measure peak VRAM, RAM, disk and stage timings. Exercise a short request, native frame overshoot handling, music→video→music unloading, and queued/running cancellation for both native generators; record measured stop latency and verify no owned job continues after a stopped claim. Check same-seed failed-call replay and both service-account and isolated-interpreter readiness. A live contract failure is not waived by passing fixtures.
  Learner check: Run the documented contract command on Dundee, listen to its generated song, play its validation video in VLC, and inspect one native call/seed receipt and its preserved frames. Review the evidence and any limitations before an editor is built on them.
  Commit: `Prove native music and video generation on Dundee`
  Completed: 23 October 2026, fast mode. See the native evidence map for actual provider, media, replay, cancellation, resource and release results; 579 default tests/typecheck and 13 separate content diagnostics pass. Prior video feedback was positive; the next hands-on checkpoint remains slice 2. No browser UI is claimed by this completion.

- [x] **2. Set up the tools and generate a song from the LAN browser**
  Becomes usable: From a LAN browser, create/select a project, choose the agent, prepare the tools with the setup panels or Install all, enter a music description and optional lyrics, and listen to the resulting song with an expandable generation record.
  Why now: Turns the proven native path into the first newcomer-facing part of the kernel. This is the early UI feedback point, before video editing determines the rest of the interface.
  PRD ref: `prd.md > The Core Journey` (steps 1–5); `prd.md > Projects and Shared Tools`; `prd.md > Frontier Agent Setup and Selection`; `prd.md > Tool Setup and Failure Recovery`; `prd.md > Music and Video Generation`; `prd.md > Generation History`; `prd.md > Screens and Layout`.
  Spec ref: `spec.md > C1 — Studio UI and Project Workspace`; `spec.md > C2 — API, Persistence and Mutation Boundary`; `spec.md > C3 — Provider Adapters and Product-Owned Generator Knowledge`; `spec.md > C5 — Setup Manager and Confirmed Debug`; `spec.md > C7 — Audio Analysis and Exact Timing Engine`; `spec.md > Data Model`; `spec.md > Look and Feel`.
  Build: Add the React/Fastify/SQLite vertical path: Projects/Config navigation, project creation/selection, shared setup strip and provider selector, reusable install recipes, durable progress, readiness/authentication status and collapse-to-navbar behaviour. Add the music form, immutable submitted intent, server-owned queued work, original audio ingestion, waveform/beat analysis and selectable song result. Save project drafts and style without polling over dirty input. Expose user inputs, real tool settings/seeds and output thumbnail in history. Report setup/generation failures truthfully now; richer Retry/Debug/cancel recovery interactions arrive in slice 7 rather than being simulated here.
  Verify (mechanical): Run reviewed API/storage/component tests and actual browser checks. Verify first-use setup ordering, shared prerequisites, individual versus Install all deduplication, missing-sign-in guidance, exact CLI/model selection and isolated Python paths. Refresh during an install and a music request and verify the same operation/result appears once. Generate a real song through the browser; independently decode it, verify stored analysis/version references and the recorded seed, and distinguish analysis failure from song-generation failure. Reopen the project and confirm persistent content/drafts; inspect Host/Origin and asset-ID validation without adding agent restrictions.
  Learner check: Open the reported Dundee studio URL from another LAN device, use setup, create a project, describe a song with optional lyrics, and listen. Refresh while work runs and open its history. Tell me what feels awkward about setup, status, prompts or feedback before we add video controls.
  Commit: `Add browser setup and project music generation`
  Mechanical checkpoint: 23 October 2026. Projects/setup/music/playback/history are deployed on Dundee; 718 tests per host plus typecheck/build and independently audited real browser generation pass. Drafts, selected song, completed analysis and history survive an actual idle service restart unchanged. Setup verification and generation survive page reload. This was an already-prepared host, not a fresh-download installation demonstration. Early learner feedback was received; its requested corrections are now deployed and mechanically checked (750 tests per host). The learner accepted the corrected UI with “great, perfect”; slice 2 and its early feedback checkpoint are complete. See slice-2-feedback.md.

- [x] **3. Generate clips and export the first browser-made music video**
  Becomes usable: Describe clips against the selected song, see them placed at their submitted times, preview the assembled result, and download a real music video that plays outside the app.
  Why now: Completes the distinctive creative loop early. Editing and recovery refinements then improve something that already produces the intended output, instead of postponing export until the end.
  PRD ref: `prd.md > The Core Journey` (steps 6–9); `prd.md > Music and Video Generation`; `prd.md > Persistent Visual Style`; `prd.md > Default Clip Timing`; `prd.md > Raw Frame Preservation`; `prd.md > Timeline and Music Coverage`; `prd.md > Preview, Black Gaps, and Export`.
  Spec ref: `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`; `spec.md > C6 — Native Generation Adapters and Media Validation`; `spec.md > C7 — Audio Analysis and Exact Timing Engine`; `spec.md > C8 — Library, Arrangements, Coverage and Provenance`; `spec.md > C9 — Edit Plan, Preview and Export`; `spec.md > Time and Edit Semantics`.
  Build: Add the clip form, persistent style, captured song conditioning, exact 24 fps intervals, adaptive earliest-free presets, pending placeholders/reservations and automatic placement at the captured interval. Preserve the full original frame batch and actual execution provenance. Add waveform/beat display, basic sequence/library controls, coverage/gap indication and a revision-bound server-rendered preview/export. Use the original song by default and black frames for uncovered intervals; honour post-song duration and warnings without a hidden four-second minimum or 15-second cap. No separate proxy/HQ mode or effects are added.
  Verify (mechanical): Run reviewed preset/reservation/ingestion/render tests, including steady and irregular beat maps, pending ranges not counting as coverage, duplicate completion and native overshoot without timeline overhang. In the browser, generate approximately three real clips with captured song/style inputs; inspect complete raw frames and record entries. Check coverage, black gaps and output duration against the edit plan. Decode/probe the downloadable file and compare frame/audio intervals with the preview; independently play it in VLC. An edit during rendering must mark the older preview stale, not export it as current.
  Learner check: Make a short video from your generated song and a few clip descriptions. Deliberately leave one gap, preview it, export, and play the download in VLC. Check whether the output matches the visible sequence and whether the flow preserves your creative intent.
  Commit: `Complete browser clip generation and video export`
  Mechanical checkpoint: 23 October 2026. All slice-3 mechanical checks passed. The learner accepted the integrated flow and requested refinements after trying it; the final timing-polish retry was accepted with “perfect” on 23 October. See slice-3-live-evidence.md, slice-3-feedback.md and slice-3-polish.md.

- [x] **4. Switch projects, songs and providers without losing or redirecting work**
  Becomes usable: Work on multiple projects and songs, change the selected provider for future requests, and return to earlier arrangements while submitted jobs finish in their original context.
  Why now: The first complete loop gives us actual media and jobs with which to test isolation and continuity. Make that reliable before more editing operations multiply the possible states.
  PRD ref: `prd.md > Projects and Shared Tools`; `prd.md > Frontier Agent Setup and Selection`; `prd.md > Song Selection and Saved Arrangements`; `prd.md > Music and Video Generation`; `prd.md > Persistent Visual Style`; `prd.md > Generation History`.
  Spec ref: `spec.md > C1 — Studio UI and Project Workspace`; `spec.md > C2 — API, Persistence and Mutation Boundary`; `spec.md > C3 — Provider Adapters and Product-Owned Generator Knowledge`; `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`; `spec.md > C8 — Library, Arrangements, Coverage and Provenance`; `spec.md > Data Model`.
  Build: Complete saved per-song arrangements and context-aware drafts, durable manual selection, exactly-once selection of newly generated songs, and library reuse without automatically copying placements. Complete provider reconfiguration from its navbar indicator and immutable routing for queued/running work. Share only tools/configuration across projects, keep explicit project sessions/workspaces and per-attempt files, and aggregate real shared queue status. Finish revision/idempotency handling and refresh/reopen races. Add interruption reconciliation without claiming reboot-resumable inference.
  Verify (mechanical): Run reviewed transaction and browser race tests. With jobs queued/running in project A, switch to B and change provider; verify existing jobs retain A/song/provider and new requests use the new provider. Generate a second song, confirm its arrangement is empty, then return to the first and verify trims/placements/settings survive. Refresh/reopen without duplicate jobs, placements or selection side effects. Exercise both real provider adapters and a controlled service restart; uncertain external work must be reconciled without blind redispatch. Verify project paths/context selection and cooperative custom-script registration without introducing a sandbox.
  Learner check: Start work in one project, switch to another and change provider, then return. Generate/select an older and newer song and check that nothing moved, disappeared, or silently changed providers. Inspect both projects' histories and working folders.
  Commit: `Preserve project song and provider context across ongoing work`

- [x] **5. Edit exact timing, coverage, overlap and soundtrack choices**
  Becomes usable: Edit timing in beats, seconds or frames; trim and move clips precisely; choose which overlapping clip is visible; and opt into only that dominant clip's audio.
  Why now: Builds precise control on top of stable arrangements and a real renderer. Each edit can be checked against both timeline state and the exported media, rather than trusting calculations alone.
  PRD ref: `prd.md > Linked Timing Units`; `prd.md > Frame-Based Trimming and Locked Frame Rate`; `prd.md > Default Clip Timing`; `prd.md > Timeline and Music Coverage`; `prd.md > Clip Audio`; `prd.md > Preview, Black Gaps, and Export`.
  Spec ref: `spec.md > C7 — Audio Analysis and Exact Timing Engine`; `spec.md > C8 — Library, Arrangements, Coverage and Provenance`; `spec.md > C9 — Edit Plan, Preview and Export`; `spec.md > Time and Edit Semantics`; `spec.md > Internal API Contracts`.
  Build: Finish rational timing fields and containing-frame labels, inclusive source-frame trim controls, stable edit contexts, independent placement moves and explicit invalid-input feedback. Preserve retained frames' song positions when trimming. Complete free-gap suggestions/reservations, union coverage, front/behind dominance and per-placement audio replacement with moved-alignment warnings. Use one edit-plan source of truth for browser preview and export; no hidden mixing, retiming, fades or gap closing.
  Verify (mechanical): Run the reviewed exact-boundary suite: 12.3456789 seconds→containing frame 297; source 1–80 trimmed to 6–75 retains 70 frames and leaves the expected gaps; frame edits and decimal intent do not drift. Exercise 50/16/8/4 BPM thresholds and irregular beats, leading offsets and missing analysis. Render deterministic numbered-frame/audio-marker fixtures to verify source offsets, hard audio replacement, dominant-only audio, black gaps, coverage union and stale-revision rejection. Repeat representative trim/move/overlap edits on real clips and watch/listen to the export.
  Learner check: Enter a fractional beat/time, trim both ends of a clip and inspect the gaps, then deliberately move it. Overlap two clips, swap dominance and toggle clip audio; compare the result in preview and VLC. Check that precision is understandable rather than merely exposed.
  Commit: `Add precise clip editing and dominant audio selection`

- [x] **6. Continue a trimmed clip and extend the video beyond its song**
  Becomes usable: Use Continue From End on an individual clip to prepare the next request from its last retained original frame and current edited end, including repeated continuation after the music finishes.
  Why now: Continuation depends on the exact trim/move semantics just verified. It is also the remaining high-risk native input combination: preserved-image conditioning plus the correct song or silent interval.
  PRD ref: `prd.md > Continue From End`; `prd.md > Raw Frame Preservation`; `prd.md > Default Clip Timing`; `prd.md > Frame-Based Trimming and Locked Frame Rate`; `prd.md > Clip Audio`; `prd.md > Preview, Black Gaps, and Export`.
  Spec ref: `spec.md > C6 — Native Generation Adapters and Media Validation`; `spec.md > C8 — Library, Arrangements, Coverage and Provenance`; `spec.md > Trimming, moving and continuation`; `spec.md > Presets, free gaps and warnings`; `spec.md > Verification and Build Gates` (G3/G5).
  Build: Add the per-card continuation action with captured edit-context ID/revision, retained PNG reference, no global predecessor picker and no place-first gate. Preserve off-beat adjacency and use the shared adaptive duration count. Clearly show saved context for unplaced clips and a missing referenced song rather than silently retargeting. Support partial/wholly post-song conditioning, independent start/end advisories and further post-song requests. Keep final output long enough for all included clips; no automatic chains, fades or seamless-join promise.
  Verify (mechanical): Run reviewed continuation tests for trimmed/moved/unplaced/multiple-use cards and stale context revisions. Verify the selected source-frame hash, no added blank frame or beat snapping, and unchanged submitted intent after later edits. Generate a real continuation from a trimmed clip, plus requests partially and wholly beyond the song; validate conditioning padding, native counts and retained originals. Check a >15-second request is warning-only at dispatch, not guaranteed to succeed. Export more than one post-song continuation and verify silence versus enabled dominant-clip audio and the full output length.
  Learner check: Trim and move a clip, use its own Continue From End control, and inspect the proposed image/start/end before Generate. Continue past the music and watch/listen to the longer export. Judge whether the control follows the specific clip you intended.
  Commit: `Add frame-exact continuation and post-song video`

- [x] **7. Recover visibly from installation and generation failures**
  Becomes usable: Retry failed work, stop queued/running generations, restart cancelled work or restore its inputs for editing, and explicitly authorise a setup-debugging agent after reviewing its exact launch context.
  Why now: Native stopping was tested in slice 1; now the full UI state machine can be exercised against real installation, generation, continuation and provider contexts. This is not the first time process ownership is considered.
  PRD ref: `prd.md > Tool Setup and Failure Recovery`; `prd.md > Debug Confirmation and Agent Authority`; `prd.md > Music and Video Generation`; `prd.md > Generation Seeds and Variations`; `prd.md > Frontier Agent Setup and Selection`; `prd.md > Generation History`.
  Spec ref: `spec.md > C3 — Provider Adapters and Product-Owned Generator Knowledge`; `spec.md > C4 — Durable Jobs, GPU Scheduler and Cancellation`; `spec.md > C5 — Setup Manager and Confirmed Debug`; `spec.md > Data Model`; `spec.md > Important Failure Modes`.
  Build: Finish error indicators, expandable diagnostics, install Retry, generation Retry and cancelled Restart/Discard/Restore controls. Preserve exact captured scripts/scores/graphs, native inputs and seeds for retries; reuse/restore followed by Generate creates a fresh variation. Add the immutable Debug disclosure/confirmation, tool-directory launch, normal autonomous capabilities, outcome report and independent readiness recheck. Maintain resource/maintenance locks and no-new-submission handling for cancelled attempts without filtering agent tools. Missing evidence or uncertain ownership must remain an explicit failure/reconciling state, not an invented success.
  Verify (mechanical): Run reviewed fake-process/API tests for legal transitions and completion/cancel races, then live queued/running cancellation on both generators and provider preparation. Measure stopping and resource release before offering recovery choices. Verify Retry/Restart preserve actual seeds and file-backed inputs, while restored/reused parameters allocate new seeds only on Generate. Exercise download interruption, auth loss, analysis failure and an owned process failure; use deterministic faults for OOM/unload/disk errors rather than damaging the host. Test Debug cancel/no-side-effect, exact confirmation matching, stale confirmation renewal and a repair of a deliberately broken disposable tool instance; verify no undisclosed host change is needed for the test. Recheck readiness independently of the agent's report.
  Learner check: Cancel a running clip, inspect the three recovery choices, restart it, and try Restore parameters as a new variation. Inspect a failed setup's Debug dialog, cancel once, then review and explicitly confirm a controlled repair. Check that seeds, outcomes and consequences are visible and believable.
  Commit: `Add verified job recovery and confirmed setup debugging`

- [x] **8. Archive or delete media without losing its provenance**
  Becomes usable: Clear unwanted artifacts out of the workspace, restore archived clips unplaced, and permanently delete full media while keeping the agreed thumbnail/text history and deletion event.
  Why now: Correct deletion depends on known job dependencies, arrangements, raw frames, replay snapshots and render caches. Those paths now exist, so lifecycle tests can prove what is removed rather than assuming one file is the whole artifact.
  PRD ref: `prd.md > Artifact Archive, Restore, and Delete`; `prd.md > Song Selection and Saved Arrangements`; `prd.md > Generation History`; `prd.md > Raw Frame Preservation`; `prd.md > Timeline and Music Coverage`; `prd.md > Preview, Black Gaps, and Export`.
  Spec ref: `spec.md > C2 — API, Persistence and Mutation Boundary`; `spec.md > C8 — Library, Arrangements, Coverage and Provenance`; `spec.md > C9 — Edit Plan, Preview and Export`; `spec.md > Data Model`; `spec.md > Important Failure Modes`.
  Build: Add archive/library views, atomic placement removal, unplaced clip restoration and preserved archived-song arrangements. Add irreversible-deletion confirmation, queued/running dependency protection, managed-media inventory and durable purge reconciliation. Remove known raw/encoded/workspace/snapshot/cache copies before claiming deletion; retain only permitted history/tombstones/thumbnails. Explain that prior exports or unknown external copies are not recalled, rather than constraining agents to hide that limit. Preserve independent clips when deleting their source song and handle missing continuation context explicitly.
  Verify (mechanical): Run reviewed DB/filesystem/render lifecycle tests using disposable generated fixtures. Test archive A→place B→restore A; A returns unplaced and B stays unchanged. Test archived-song selection/arrangements and completion of an already submitted clip. Confirm deletion cancellation changes nothing; accepted deletion removes all relevant placements and registered full-media derivatives while history remains and current renders exclude the artifact. Race deletion against queued input registration and preview work; busy dependencies must prevent accepted deletion. Inject purge failure/restart and verify no premature deleted claim or recoverable in-app media copy. Verify exports already downloaded remain independent.
  Learner check: Archive and restore a clip after replacing its timeline space, then explicitly delete a disposable clip after reading the confirmation. Inspect remaining history and the changed preview/coverage. Archive/restore a song and verify that its saved arrangement returns without automatic selection.
  Commit: `Add artifact lifecycle and retained generation history`

- [x] **9. Demonstrate the complete newcomer path and finish verification**
  Becomes usable: A documented, coherent prototype that can be set up from no preinstalled generators, used from the LAN, and taken through song creation, several clips and an independently playable export with the full approved controls present.
  Why now: The final claim is about the integrated newcomer experience, not individually passing components or the developer's prepared machine. This pass tests that claim before final learner review and shipping preparation.
  PRD ref: `prd.md > The Core Journey`; `prd.md > What We're Building`; `prd.md > Screens and Layout`; `prd.md > Look and Feel`; all 18 feature headings under `prd.md > Features and Behavior`.
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`; `spec.md > Look and Feel`; `spec.md > Media, framework and licence references`; `spec.md > Verification and Build Gates`; `spec.md > PRD Traceability`; `spec.md > What Was Simplified and Why`.
  Build: Finish onboarding/run instructions, service lifecycle explanations, prerequisite diagnostics, verified dependency/model/font notices and the accepted visual/status/accessibility details. Exercise a clean supported installation without deleting unrelated Dundee installations; use a fresh managed runtime/root and document any host prerequisites already present. If a genuinely clean supported OS baseline is unavailable, leave that evidence gap explicit rather than certifying fresh-host support. Complete the PRD-to-test/evidence matrix and correct integration defects without silently adding deferred features. Resolve the project's own licence with the learner before public release; no licence is chosen by this checklist and no publication occurs here.
  Verify (mechanical): Run the full reviewed domain/server/Python/browser suites, type checking and production build. Audit all 160 PRD criteria for actual coverage/evidence and unresolved failures. Run the documented bootstrap/service and built-server LAN path, exercise both fixed provider pairings, and perform a fresh song-plus-approximately-three-clips browser journey with history, edits, continuation and export. Test first-use installation separately from reinstall/idempotency, verify host Python preservation and shared dependency readiness, and independently probe/watch/listen to final media in VLC. The final keyboard/focus/dialog and reduced-motion accessibility sweep is skipped by learner decision; retain earlier responsive observations without claiming current cross-device certification. Preserve recorded error/auth/status evidence and the separate pre-publication privacy audit. Do not claim an 8 GB target, seamless joins, mastered audio or unattended repair beyond the verified scope.
  Current evidence: `recorded-demo-v2.md` supersedes the older pending-install notes: current bootstrap, empty managed tool environments/model downloads, both providers and full edit/export workflow are verified on the prepared host. Accessibility sweep skipped by learner decision; no fresh-OS certification. The owner accepted the submitted prototype on 25 October with the intermittent Claude completion issue documented, accessibility sweep skipped and fresh-OS certification explicitly absent. Slice 9 is complete within those accepted limits; no repeat downloads or new certification are implied.
  Learner check: Review the completed newcomer evidence and explore the finished app freely: multiple projects, awkward timings, failed/cancelled work, archive/restore and export. Tell me what is broken, confusing or worth changing. Agreed fixes go under Final Review; the prototype is not declared finished until you retry them and confirm readiness.
  Commit: `Verify the complete newcomer music video workflow`

## Hands-on Checkpoints

- [x] Early usable behavior explored — slice 2 (corrections accepted with “great, perfect”, 23 October 2026): actual setup and song generation in the LAN UI; feedback is resolved before building the browser video workflow. Slice 1 also has its contract/media learner check, not a substitute for this UI feedback.
- [x] Integrated creative loop explored — slice 3 (accepted with “perfect”, 23 October 2026): create clips and independently play the export before investing in precision editing. This checks whether the central creative flow works, distinct from setup feedback.
- [x] Final kick-the-tires exploration and feedback completed — the existing hands-on UI/refinement rounds and recorded journey were accepted on 25 October. This closes the single final checkpoint without inventing another exploration or test session.

## Final Review

The two earlier workspace-refinement rounds are implemented and superseded by
later learner-directed refinements and the recorded journey. Their evidence stays
in `workbench-feedback.md` and `workbench-round-two.md`; they are not two additional
implementation/retest projects. Consolidate remaining human acceptance into the
single final review below rather than inventing separate approvals.

- [x] Investigate the two observed run issues under the learner's fix-if-reproduced instruction: Config refresh reproduced/fixed/deployed; Claude did not recur in four native probes, retained as a post-submission rough edge. See `post-demo-issue-investigation.md`. This is an investigation disposition, not final learner acceptance.
- **SKIPPED, not passed:** remaining accessibility checks, explicitly waived for this submission. No accessibility implementation removed.

- [x] Final review complete — owner explicitly signs off the submitted prototype on 25 October, accepting the documented limitations.

Acceptance record: after the final-review question explicitly named the unresolved
intermittent Claude completion hang, skipped accessibility sweep and absence of
fresh-OS certification, the owner confirmed sign-off. The owner had already
confirmed that the demo/repository are public and included in the submitted entry.
No hosted application is planned. The prior feedback, implemented corrections and
recorded evidence are accepted as the submitted proof of concept; no additional
code change, model run, listening session or accessibility result is claimed.
Any future improvements belong to post-submission work, not an unfinished gate.

## Code Tour and App Map

- [x] Learning activity complete — brief evidence-based recap of planning practice already performed during the build, not a repeated guided code tour.
- [x] Optional edit and transfer reflection addressed — extra edit not applicable to this existing-practice recap; reflection already supplied in the developer's own submission answers. No new reflection or survey response authored by the agent.
- [x] `devpost/app-map.html` refreshed against current code, checked, and provided as the take-home reference, including a project-grounded practice to reuse.

Activity and evidence: The owner worked through the observable archive/restore
rule during requirements: archived A is removed; if B occupies its old interval,
restored A returns unplaced and B stays unchanged. The closing recap connects that
rule to the bounded no-undo scope, the separate artifact/placement design in the
specification, `store.ts → lifecycleChange`, and the actual A/B regression in
`tests/contracts/studio-lifecycle-store.test.ts`. That targeted suite passes all
19 tests in this closing pass. This reuses completed planning practice and its
evidence; it does not claim a new hands-on test or demonstrated mastery.

Route and stops: The three-stop source route remains in `devpost/app-map.html`
as an optional reference, not an interactive tour that was performed. Refreshed
against `36d15fe`; current path/anchor checks accompany publication. The browser tool refused the
local file URL, so no new browser visual check is claimed; the map is provided
as an offline file link, with its prior visual review retained.
Edit outcome: No extra code edit needed or performed for this recap.
Reflection: Already supplied by the learner in the owner-authored submission
file, explicitly authorised for public inclusion. No private profile material
is copied into the checklist or map; no additional personal answer is required.
Activity mode: Brief existing-practice planning/verification recap, 25 October 2026.

## Revisions

- **Submission reconciliation after recorded demo v2:** learner explicitly skips
  remaining accessibility checks. Record them as skipped/unverified, preserve
  existing features and historical evidence, reconcile fresh-install/creative
  proof as complete, and consolidate obsolete workspace-review checkboxes into
  the single final review. Neither final acceptance nor issue resolution is
  inferred. This changes verification scheduling, not the product requirements.

- **24 October — configurable task contexts:** replace read-only context viewers with full editable music/T2VA/I2VA overrides, durable revisioned saves, explicit defaults and submission-time captures. Custom instructions replace rather than append the old guides. **1,504 tests / 113 files**, typecheck/build, disposable browser conflict/reset/navigation checks and isolated deployed task preparation pass. Dundee database backed up; projects/templates/native-call records preserved. See [editable-task-contexts.md](editable-task-contexts.md). Final learner review remains open.

- **24 October — YuE2 guidance and context visibility:** researched pinned official/native guidance and community observations; updated music/shared task references and added Config readers for music and both H3 modes using the same server formatters as new tasks. **1,496 tests / 112 files**, typecheck/build, disposable/live browser and isolated deployed music-preparation checks pass; existing projects/templates/native calls unchanged. No new audio-quality claim. See [yue2-guidance-and-context-viewer.md](yue2-guidance-and-context-viewer.md). Final learner review remains open.

- **24 October — Clip density and prompt visibility:** reduced clip-card bottom whitespace by 26px; shortened actions to ↑ Continue / ↑ Reuse params while preserving music controls and context guards. Verified deployed H3 guidance and existing full prompt capture; clarified the Config template/context distinction without resetting templates. **1,486 tests / 110 files**, typecheck/build, live browser and unchanged project/settings checks pass. See [clip-density-and-prompt-visibility.md](clip-density-and-prompt-visibility.md). Final learner review remains open.

- **24 October — action placement and setup dismissal:** move music reuse below Generate, right-align export with a save icon, and make non-agent tool status clicks reversible Config toggles. Verification: [action-placement.md](action-placement.md). Final learner review remains open.

- **24 October — editor proportions:** enlarge lyrics/style/clip-description defaults and remove four decorative borders while retaining the music/video divider. Verification: [editor-proportions.md](editor-proportions.md). Final learner review remains open.

- **24 October — workspace detail polish:** remove redundant music annotations and selection tick, add the section divider, relocate beat targeting into the sequence header, and place Remove above clip previews with remaining actions in one row. Verification: [workspace-polish.md](workspace-polish.md). Final learner review remains open.

- **24 October — unified generation workspace:** combine music and video under Generate, remove the duplicate soundtrack selector, and compact the song list above its player with duration/BPM and stacked lifecycle buttons. See [unified-generation.md](unified-generation.md) for verification. Final learner review remains open.

- **24 October — automatic clip edits:** valid trims and movements save automatically with guarded, typing-safe persistence. Reorder and shorten library actions, move placement status above previews and Audio above Trim. Verification is recorded in [clip-autosave.md](clip-autosave.md); final learner review remains open.

- **24 October — video presentation polish:** share the sequence teal with brighter placed-library cards, retain neutral unplaced cards, simplify the four video headings and remove redundant annotations/footer decoration. Details and verification: [video-presentation.md](video-presentation.md). No generation, placement or media changes; final learner review remains open.

- **24 October — setup presentation:** keep all tool indicators from first load, animate only the currently installing step, retain all panels until the complete toolchain is ready, and remove the group together. Verified with 1,445 tests, typecheck/build, controlled browser setup states and web-only Dundee deployment. See [setup-presentation.md](setup-presentation.md). Final learner review remains open.

- **23 October — user reprioritised the editing workspace:** do not wait for duplicate cold downloads to develop the product. Audit showed Continue From End and restored placement existed but were hidden inside fine-edit disclosures. Implement direct actions, a compact project selector, separate workspace sections, integrated preview/sequence and exact timeline-to-editor selection using existing tools/media. No backend or generator change; cold-install evidence remains separate and incomplete.

- **23 October — actual service-path repair and preservation:** real systemd rejected argument-style quotes around `WorkingDirectory`; a red regression and actual parser check now cover the corrected path syntax. The frozen repair passes the full 1,332-test suite, typecheck/build and 30 Python cases. Normal persistent service installation succeeds, and the final 55/55 audit preserves every original asset/creative/native/Debug record and unrelated service identity. The first failed activation and a separately reviewed asdf PATH observation mismatch remain in the evidence. Fresh-runtime tool installation continues separately; slice 9 and final acceptance stay unchecked.

- **23 October — slice 9 packaging checkpoint (not slice completion):** learner chose MIT for application code. Historical Kirsty v1.0 redistribution was verified against the original Linux-package author licence after the learner correctly pointed out the older distribution; retain unchanged font bytes and notices, not current-release assumptions. Bootstrap, XDG paths, persistent service checks, notices and the 160-criterion evidence map are implemented. Full local suite passes 1,332 tests in 88 files plus typecheck/build; bootstrap bridge includes 29 Python cases. Real browser checks repaired medium-width tooltip clipping and verified narrow keyboard timing/dialog behavior and bundled Kirsty. Fresh-runtime installation is being exercised separately; no fresh-OS, production upgrade, human-listening or final-review completion is claimed.

- 23 October 2026 slice 6: added captured continuation identity and image-plus-audio
  workflow wiring without changing ordinary generation. Independent review fixed
  prepared-draft/late-response ownership races. Three real continuations and exact
  exports pass; a host-pressure status timeout did not trigger duplicate work.
  Technical provenance/playback is verified; no seamless-motion or perceptual
  listening claim is made. No scope or agent-authority change.

- 23 October 2026 slice 5: made the existing spec precise about signed source
  origins, move-floor-once/constant length, absolute song trim units, stable
  per-use contexts and the explicit Apply save boundary. No scope change.
  Technical audio/video equality and inspected frames are verified; perceptual
  watch/listen judgment stays in the final learner checkpoint under fast mode.


- 23 October 2026 integrated learner feedback: bring generation-only linked timing from slice 5 into the slice-3 feedback pass, add selectable beat ranges and proposed-shot highlighting, compact overlap lanes, clear accepted clip descriptions, combine creative history including style edits, reorder navbar analysis and set preview playback to 50%. Exact timing/coverage/export semantics are unchanged; remaining trim/dominance/continuation controls stay in their planned slices. See [slice-3-feedback.md](slice-3-feedback.md).


- **23 October 2026 — diagnostic fidelity after two native census failures:**
  the learner approved 27 tests for preserving immediate native error fields in
  the composed report. Implemented the shallow data copier and promoted the
  assertions; local tests pass without changing strict census/release rules.
  Historical failures remain unmodified and native proof remains open. No scope,
  stack or agent-authority change; no further native run authorised.

- **22 October 2026 — approved CPU cancellation proof:** extracted the existing
  owned transport and added isolated cooperative native fixtures, with no product
  or agent-authority change. Local/Dundee default suites pass 189 cases; the two
  real Comfy CPU cancellation scenarios pass with unrelated-work preservation,
  explicit interruption evidence and independently verified cleanup. Review
  corrected synchronous JSON capture, inherited configuration and parent-signal
  propagation before launch. GPU/lease/live-suite gates remain open; the learner
  accepted this partial implementation checkpoint with “all good.”

- **22 October 2026 — analysis checkpoint and native-control implementation:** accepted isolated analysis work committed as `b064372`. Inspecting the selected Comfy pin found its atomic per-job cancellation route; prefer it over composing older queue/interrupt operations, without changing owned-job semantics or scope. The learner approved 26 asynchronous control assertions; their implementation and 13 supplemental regressions now pass. Direct Node loading and forgotten owned-child allocation bugs were reproduced and repaired. Typecheck and all 117 default tests pass. Concrete native bindings/shared lease and live interruption/resource-release proof remain outstanding; no slice completion or new native run is claimed.

- **21 October 2026 — implementation refinements, no scope change:** following learner approval, fixed the eight reproduced regressions without weakening their expectations. Real provider capability tasks now pass on Dundee. A subsequent code review identified two launcher failure paths, reproduced with local Node fixtures and presented for test review at that checkpoint (subsequently approved and fixed below). Evidence and remaining G1–G4 boundaries are recorded in `slice-1-progress.md`. Native installation/generation and the slice's hands-on check remain outstanding.

- **21 October 2026 — provider-runner assertions approved and fixed:** native exit status is retained separately from task success; handled probe interruption uses bounded identity-checked cleanup, with explicit uncertainty and native-work limitations. All 78 approved tests pass. Native dependency recipe preparation continues inside slice 1.

- **21 October 2026 — isolated YuE2 dependency proof:** installed the pinned standalone interpreter and separate venv from public packages. Initial cross-index Triton hash mismatch failed closed; a freshly resolved/audited lock succeeded. Repeat install produced the same source-wheel hash; host Python observations matched and user-service imports passed. No model/generation or native GPU-cancellation proof yet.

- **21 October 2026 — partial checkpoint and first native music proof:** learner-requested progress commit `b698afe`; slice 1 remains open. Downloaded/verified 21 pinned model files and repeated verification without downloads. A direct staged YuE2 helper generated a decoded/hash-checked approximately 20-second stereo WAV with distinct verified stage seeds and measured GPU/host memory. Semantic generation hit the probe token ceiling; retain the truncated sample rather than imply a finished song. Normal process exit returned GPU usage to baseline; this is not cancellation, replay, H3 or the complete provider-driven path. See the progress document for evidence and the continuation.

- **21 October 2026 — H3 decision pause:** inspected pinned ComfyUI source/model metadata and upstream licence before installation. Record the finding in `h3-feasibility-review.md`; pause the H3 installation pending a learner decision about further backend investigation. No automatic replacement or scope change.

- **21 October 2026 — proceed with H3:** learner approved continuing with the existing backend and install-on-demand approach after the licensing discussion. Retain licence provenance and release-review boundaries; resume technical installation checks.

- 21 October 2026: isolated ComfyUI dependency/repeat and real CPU-node proofs passed after a bootstrap-directory correction. No product promise changed; H3 model/GPU/media-chain gates remain open.

- **22 October 2026 — first native H3 feasibility proof:** six model files verified and repeat-checked; short audio-conditioned generation passed, including original PNGs, exact seed/native counts and observed normal resource release. Dynamic VRAM/CPU offloading and process swap were required in the observed run; no new minimum host requirement inferred. Product guidance prepared, not yet provider-exercised. No scope/build-order change or slice completion.

- **22 October 2026 — provider media and polling repair checkpoint:** learner approved the recovered video and polling assertions. Codex used the product guidance for real music/H3/export work; a failed completion observation was preserved. The reviewed bounded-GET repair passes nine regression methods and a direct same-input native replay with final history, identical media and clean release. No natural read failure occurred in that replay; diagnostic fault injection remains separate. Slice 1 is still open.

- 22 October 2026 native-binding implementation: the learner approved 53 transport/
  decoder assertions before code. Implemented them plus five supplemental
  counterexamples, repaired the reproduced non-string status coercion bug, and
  promoted 58 cases into the default suite (175 total). Three full runs and a
  direct Node synthetic wire smoke pass. An isolated mutant proves the socket-
  reuse test detects reconnecting. No product/stack/agent-authority change;
  native CPU/GPU proof remains separate. Corrected the HTML companion's stale
  Markdown fingerprint metadata only; canonical spec content is unchanged.

- **23 October 2026 — focused native verification replaces the unbound aggregate sketch:**
  retain the original twelve acceptance assertions under `tests/reference/` and
  map each to the actual focused suite/run/artifact in `slice-1-native-evidence.md`.
  Do not claim "12/12", fabricate driver responses or repeat costly generations
  solely for an aggregate count. Existing failures remain failures; no product
  feature, chosen architecture or mechanical assertion is waived. A focused
  no-dispatch test additionally records actual queued-cancellation timings.

- **23 October 2026 — first LAN browser integration:** real browser work exposed
  exact Node type-erasure compatibility, provider/setup shutdown races and an
  analysis status/restart gap. Tests and implementation were repaired without
  changing scope, stack or normal agent capabilities. The genuine 33.6-second
  song and 76 independent audit checks are separate from the 718 fixture-based
  default tests. A working checkpoint is saved while early UI feedback remains
  open. No fresh-host installation or complete browser video editor is claimed.

- **23 October 2026 — early UI feedback:** the learner requested floating, dismissible notices, original music/lyrics restoration on song changes, and visual style excluded from music generation. Updated PRD/spec and their HTML companions; implemented and verified the changes without new generation or altering retained media/history. Preserve the card-heavy look comment for polish. The learner accepted the corrections with “great, perfect”; proceed to the integrated browser video loop.

- **23 October, further integrated feedback:** add read-only generation duration between linked endpoints; sort library entries by current placement/original request time without changing overlap priority; put Start left while keeping End the default; stabilize timing/selection layout rather than globally suppress scrolling. Detailed evidence and the intermittent-scroll verification boundary are in `slice-3-polish.md`.

- **23 October — integrated checkpoint accepted:** “perfect” accepts the timing-polish retry and completes slice 3. Continue slice 4 under standing fast-mode approval; its continuity audit/test plan is `slice-4-continuity.md`.


- **23 October — continuity completed:** added revisioned per-song clip drafts,
  context-scoped retry journals, native provider-session provenance and guarded
  FIFO/provider-check races. A browser test reproduced duplicate clip submission
  from JSON key reordering; canonical/legacy signature matching repairs it.
  Independent review also repaired storage and late-response ownership edges.
  No product scope or agent capability was narrowed. Source upgrades are drained;
  interrupted inference remains explicit reconciliation rather than blind replay.
