# PRD traceability — evidence, not an acceptance scoreboard

This index covers **all 160 acceptance IDs in 18 groups** from [the approved PRD](prd.md).
It connects observable requirements to real assertion locations and recorded evidence.
**No row is automatically marked passed because code or a similarly named test exists.**
The short intent reminders do not replace the full PRD sentences.

**Original assertion baseline:** completed slice 8, commit `0b99abd`, 23 October 2026: 1,322 tests in
85 files on development and deployment hosts, typecheck/build, 11-stage isolated
CPU/HTTP lifecycle proof, and 53/53 deployment-preservation checks over 831 existing
assets. Test examples below are exact searchable titles in that baseline; a file
can contain several related assertions, not a one-test/one-criterion bijection.
Later evidence is recorded separately below, not inferred from that test count.
The current recorded-v2 source `a069a59` passed 1,504 tests in 113 files plus
typecheck/build before the fresh installation and complete creative journey.

**Reconciliation:** the completed newcomer demo is no longer a pending test.
Remaining accessibility checks are **SKIPPED / NOT VERIFIED** by the learner's
explicit submission decision. Historical narrow-layout observations remain
limited evidence, not comprehensive current-device certification. Evidence limits
in individual rows do not automatically create new pre-submission test tasks.

## Evidence key

| Key | Recorded observation | Boundary |
|---|---|---|
| native-1 | [Slice 1 native contracts](slice-1-native-evidence.md) | Actual Codex and Claude capabilities/session identity; complete Codex song→H3→export; not a second complete Claude film or provider-server attestation. |
| browser-2 | [Slice 2 LAN browser](slice-2-live-evidence.md) and [feedback](slice-2-feedback.md) | Prepared host: real music, navigation/reload, CPU setup probe and narrow layout; not fresh OS installation. |
| browser-3 | [Slice 3 creative loop](slice-3-live-evidence.md), [feedback](slice-3-feedback.md), [polish](slice-3-polish.md) | Real browser song + three short H3 clips, frame/audio audits and export; sparse7.2% coverage. Exact requested song duration/BPM was not achieved. |
| continuity-4 | [Slice 4 continuity](slice-4-continuity.md) | Real persistence/adapters and browser fixtures; controlled process interruptions/synthetic external ownership, not every race with real GPU inference. |
| edit-5 | [Slice 5 precise editing](slice-5-evidence.md) | CPU browser fixtures and copied-real-media render comparisons, exact picture/audio checks; headless VLC is not human listening. |
| continuation-6 | [Slice 6 continuation](slice-6-evidence.md) | Actual original-frame + audio-conditioned H3, post-song intervals and exact fixture timing; no seamless-motion promise. |
| recovery-7 | [Slice 7 recovery/Debug](slice-7-evidence.md) | Actual cancellation/replay/new variation and controlled repair, with measured release. Earlier OOM/observer failures retained; success uses conservative owned-Comfy flags. |
| lifecycle-8 | [Slice 8 lifecycle](slice-8-evidence.md) | Actual CPU/HTTP deletion and independent file audit; isolated browser archive/restore/Cancel and read-only purged history. No browser destructive confirmation or production-media deletion. |
| recorded-v2 | [Second fresh recorded journey](recorded-demo-v2.md) | Fresh app runtime/environments/models on prepared Ubuntu; Claude Day song+clip then Codex Night song/eight generations/six placements/four continuations/full live preview/28s export. Permanent deletion verified; one Claude-exit workaround and one Config reload. Not fresh OS, human listening or accessibility certification. |

Private run logs and screenshots are intentionally not published; the public
evidence documents state their observations and limits. A fixture assertion,
a real native result, an interactive browser observation and human listening are
different kinds of evidence, not interchangeable checkmarks.

## Current evidence and explicit limits

- **Fresh managed setup and newcomer journey — complete:** recorded-v2 uses a
  fresh bootstrap/runtime and empty generator environments/model downloads, then
  both providers and the full edit/continuation/archive/delete/preview/export
  path. Reused OS, driver/APT prerequisites and provider login are disclosed.
  A newly installed OS/driver or new-account login remains outside this proof;
  no further download/install marathon is pending.
- **Observed issues — unresolved:** one Claude CLI remained alive after its final
  report/native completion; a verified targeted SIGINT allowed normal validation.
  Config's stale preinstall reference display cleared on Reload saved contexts;
  actual tasks already had complete guides. See recorded-v2 for facts and limits.
- **Human review:** decoded media and recorded browser playback do not replace
  final perceptual watch/listen or learner acceptance.
- **Accessibility — skipped, not passed:** final keyboard/focus/dialog and
  reduced-motion checks explicitly waived for submission. Existing features/tests
  remain. Responsive proof is limited to recorded desktop/narrow viewports; no
  additional certification is claimed or added as a new gate.
- **Authority and cancellation:** full-access agents and trusted-LAN/no-auth are
  intentional. Owned cancellation has measured nonzero latency; unregistered
  external work is not certified stopped. No zero-latency or arbitrary-repair claim.
- **Terms and presentation:** application MIT remains separate from
  [third-party notices](../THIRD_PARTY_NOTICES.md). Historical Kirsty font bytes
  retain their original redistribution terms; the bundled rendering was observed
  in slice-9/browser evidence, not inferred from newer commercial font terms.
- Final learner review, learning wrap-up and publication/submission remain open.
  Preparing [the app map](app-map.html) does not establish a completed activity.

## Spec gates (not PRD IDs)

| Spec gate | Evidence available | Still not established |
|---|---|---|
| G1 — clean-host toolchain/terms | Pinned recipes, isolated venv/probe evidence, real16GiB GPU runs, host-Python observations; recorded-v2 fresh bootstrap/models and bundled font observations | Fresh OS/driver installation; no broad output-rights or all-workloads memory guarantee. |
| G2 — provider contracts | native-1/recovery-7 actual CLIs; recorded-v2 actual Claude Day and Codex Night | Claude post-final-report hang unresolved; CLI/model observation is not provider-side attestation. |
| G3 — media contracts | browser-3/continuation-6/recovery-7 real song, short audio/image-conditioned H3, original frames, surplus handling/replay/post-song input | No arbitrary-length success, exact generated song duration/BPM, seamless join or universal VRAM fit. |
| G4 — interruption/ownership | native-1/recovery-7 real cancellation/handoffs and measured release; continuity-4 process restart/identity fixtures | Uninstrumented/detached work and arbitrary GPU crash recovery are not certified. |
| G5 — edit/output parity | edit-5/continuation-6/lifecycle-8 plus recorded-v2 full live preview before exact 672-frame export, raw-frame identity and lifecycle checks | Final human watch/listen; remaining accessibility sweep skipped; responsive evidence limited. |
| G6 — newcomer demonstration | recorded-v2: empty managed generators/models to song, eight Night generations, six placements and full 28s export, plus prior Claude Day | Prepared host, not fresh OS; two recorded workarounds; human final review remains open. |

Component/gate IDs in [the spec](spec.md#verification-and-build-gates) are a different
namespace from PRD `G1`/`C1` below. For example, PRD G1 means one-click creative
submission, while spec gate G1 concerns clean-host feasibility.

## P — Projects and shared tools
Assertion locations: [`studio-store`](../tests/contracts/studio-store.test.ts), [`studio-continuity`](../tests/contracts/studio-continuity.test.ts), [`studio-clip-drafts`](../tests/contracts/studio-clip-drafts.test.ts).

Searchable example: “uses actual persistent WAL, preserves global selection/provider and isolated drafts after reopen”. Recorded evidence: **browser-2 / continuity-4 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| P1 | Create projects A and B; music, clips, sequence, archive, and generation history in A do not appear in or overwrite B. | browser-2/continuity-4 fixtures plus recorded-v2 two isolated projects and actual project switching; not a fresh-OS test. |
| P2 | Switching back to A restores A's project material | recorded-v2 switches Night to Day and back: project material/inputs restored while Night request continues. |
| P3 | Switching or creating projects does not require reinstalling tools that are already ready. | recorded-v2 Day to Night reuses the installed tools, no reinstall. |
| P4 | The project selector can show coverage without labelling it an overall quality score or a completed export. | UI labels coverage; percentage fixtures are not creative quality or export completion evidence. |
| P5 | Start a clip generation in A, switch to B, and let it complete: the result belongs to A, not B | continuity-4 exercises late completion into another project with a controlled executor, not a new GPU run for each ordering. |
| P6 | Reload the page during generation and reopen its project: the same attempt continues, with its original inputs intact | browser-2/browser-3 browser reload plus continuity-4 lost-response/restart fixtures; server restart does not resume GPU computation. |
| P7 | If generation completes while the project is not displayed, its outcome is visible on reopening | Once-only store/idempotency assertions + browser reopening; failed outcome remains a failure, not a synthetic clip. |

## F — Frontier provider
Assertion locations: [`provider-sessions`](../tests/contracts/provider-sessions.test.ts), [`provider-environment`](../tests/contracts/provider-environment.test.ts), [`studio-setup`](../tests/contracts/studio-setup.test.ts), [`studio-runtime`](../tests/contracts/studio-runtime.test.ts).

Searchable example: “assigns a fresh Claude UUID once during immutable launch capture without changing natural output or tools”. Recorded evidence: **native-1 / browser-2 / continuity-4**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| F1 | First-use setup presents the Codex/Claude choice before the generation-tool setup steps | recorded-v2 fresh provider-first setup selects Claude before Install all, then switches to Codex for Night. Existing sign-in reused. |
| F2 | The prototype uses the selected provider's fixed requested model pairing; no arbitrary provider entry or model picker is offered | native-1 verified requested CLI/native-session model identifiers; not provider-server attestation. |
| F3 | The selected provider is shared and retained across project switches and page reloads | Actual CLI/session evidence; simultaneous cross-provider job switching is a controlled fixture, not two full native films. |
| F4 | Creative inputs submitted in the UI are handled through the terminal interface of the agent selected at request submission, without making the user manually run each… | native-1 used both real CLIs with normal research/script-or-score tools and project cwd; Claude was not a second complete media film. |
| F5 | Provider selection by itself does not mark the agent usable | Missing/version/auth fixture checks; no silent fallback. New-account setup is not demonstrated by a pre-authenticated host. |
| F6 | With the selected agent installed but not signed in, its navbar indicator names that provider and displays an error status, not ordinary Idle / not running | Signed-out state has fixture coverage. Recorded-v2 reuses existing login; new-account/signed-out onboarding is not certified. |
| F7 | Hovering over that authentication-error indicator reveals actionable sign-in details for the selected provider, rather than only a generic error message | Commands match the pinned setup adapter/provider wrapper; no credentials exposed. Current tooltip usability still needs final sweep. |
| F8 | Once sign-in and agent usability are verified, clear the authentication error and show the normal activity/queue status | Readiness requires actual login/usability; selecting/dismissing cannot prove authentication. Prepared-account proof only so far. |
| F9 | Click the selected agent's navbar indicator: its Codex/Claude selector/configuration box reappears with the current choice visible | recorded-v2 actual status-selector reopening/provider switch; remaining full keyboard sweep explicitly skipped. |
| F10 | Select and apply the alternative provider: the configuration box returns to the status area, whose label/configuration now identify the new provider | browser-2 observes provider switch; fixture checks cover unavailable alternative without marking it ready. |
| F11 | The same interaction allows switching back later | browser-2/continuity-4 preserve shared selection and project state; old attempts retain captured provider. |
| F12 | With one request running and another queued under Codex, switch the selection to Claude | Running/queued capture is asserted with controlled executors and real adapter tests; not two simultaneous native-provider films. |
| F13 | A new request submitted after that switch is assigned to Claude, not Codex | native-1 actual provider identity + continuity-4 captured-routing assertions; historical labels do not follow the navbar. |

## S — Setup and tool status
Assertion locations: [`studio-setup`](../tests/contracts/studio-setup.test.ts), [`studio-runtime`](../tests/contracts/studio-runtime.test.ts).

Searchable example: “missing provider and version mismatch are not installed or signed in”. Recorded evidence: **browser-2 / recovery-7**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| S1 | A fresh supported machine can enter the setup flow through the product instead of being told to manually prepare the generation tools first. | recorded-v2 verifies app bootstrap and UI installation from empty managed generators/models. OS/driver/APT prerequisites already present; clean-OS claim excluded. |
| S2 | Install all starts the required setup work | recorded-v2 captures one Install all request through all tool/model readiness checks; ordering/error fixtures remain separate. |
| S3 | Retry attempts the failed action again | Retry and confirmed Debug have fixture/browser evidence; actual controlled repair is recovery-7. |
| S4 | The debugging outcome is reported to the user | recovery-7 verifies a controlled repair with independent readiness, not arbitrary repair success. |
| S5 | Start installation while project A is selected, then switch to B: the same shared installation and monitoring continue without resetting progress, starting a duplicate… | Project-switch installation behavior has fixture coverage; that exact switch during a model download was not separately recorded. This limit is not a claim the completed installation is pending. |
| S6 | Reload during installation: the installation and status tracking continue, and the page shows its current progress or outcome without requiring a second Install action | Earlier fresh-runtime installation in slice-9 survived browser refresh; recorded-v2 provides complete fresh installation/download capture. No OS/session restart-resume inference. |
| S7 | Original per-tool fly-away animation replaced by learner-approved persistent panels and initial status indicators | Superseded by accepted setup-presentation.md: all navbar indicators appear initially; only active installer stripes animate; all panels remain until ready. Recorded-v2 shows the revised flow. Reduced-motion sweep skipped. |
| S8 | Once all required setup is complete, completed installation panels and their empty strip are absent | recorded-v2: all tools ready at19:48:57, setup strip clears together; shared ready navbar remains visible. |
| S9 | Each navbar indicator identifies its installed tool and shows Idle / not running or Active according to whether it is executing work | recovery-7 browser proves provider stays idle during native-only replay; readiness and activity are distinct. |
| S10 | Show the tool's queue length as the number of waiting requests, separately from active work | Queue-count fixtures cover global active/waiting distinction; no claim every numeric example was live GPU work. |

## D — Confirmed Debug
Assertion locations: [`studio-debug`](../tests/contracts/studio-debug.test.ts), [`studio-debug-api`](../tests/contracts/studio-debug-api.test.ts).

Searchable example: “preparation and cancellation disclose exact sanitized context without a process, probe, directory or lease”. Recorded evidence: **recovery-7**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| D1 | Clicking Debug alone does not launch the agent; cancelling the confirmation launches nothing. | recovery-7 browser Cancel launches nothing; controlled-confirmation tests cover no-process preparation. |
| D2 | Before confirmation, the user can inspect the full prompt, command, and working directory, not just a generic description. | recovery-7 actual controlled repair verifies exact prompt/command/cwd; remaining full keyboard-disclosure sweep explicitly skipped. |
| D3 | The launch matches the disclosed request and starts in the affected tool's directory with the agreed autonomous mode. | recovery-7 actual repair used disclosed full-access launch and correct tool cwd; mismatch/expiry reject in fixtures. |
| D4 | The warning does not imply the agent is sandboxed to that directory | Warning and actual repair report retained; directory is not a sandbox and no general repair guarantee follows. |

## G — Generation and recovery
Assertion locations: [`studio-music`](../tests/contracts/studio-music.test.ts), [`studio-video-store`](../tests/contracts/studio-video-store.test.ts), [`studio-attempt-recovery-store`](../tests/contracts/studio-attempt-recovery-store.test.ts), [`studio-cancellation-runtime`](../tests/contracts/studio-cancellation-runtime.test.ts).

Searchable example: “captures exact interval, song identity, provider/seeds and globally ordered acceptance; dedup survives reopen”. Recorded evidence: **browser-3 / continuity-4 / recovery-7**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| G1 | Generate proceeds from user inputs to agent/tool execution without a second prompt-approval step. | recorded-v2 submits actual song/video requests directly from entered briefs without extra prompt-approval gates. |
| G2 | A completed music output can be heard; a completed video output can be inspected | Actual media playback/decoded files observed; final human hearing/artistic review is not established. |
| G3 | A failed attempt has a visible failure indicator and expandable details | recovery-7 real failure/controlled recovery evidence; recorded-v2 all generation attempts ultimately succeed, so it is not a fresh failure-indicator test. |
| G4 | Retry repeats the failed tool request with its same prompt/settings and recorded seed | recovery-7 exact replay + OOM recovery/new-seed variation; unchanged seed does not promise identical generated bytes. |
| G5 | Each successful new video generation enters the project's library and is automatically placed at its request's recorded start/end times in the originating song's… | browser-3 actual placement + continuity-4 other-song completion; lifecycle-8 separately proves archive restoration is unplaced. |
| G6 | Refining a result produces a fresh generation; it does not rewrite the original attempt's historical inputs or claim to undo the generated media. | recorded-v2 macro1 reused twice: identical captured creative inputs, three distinct seeds, original history retained and macro2 deleted without rewriting it. |
| G7 | The default video-generation request includes song audio as an input even when the assembled video will use the original song rather than the generated clip's audio | browser-3/continuation-6 independent captured WAV/hash/sample-range checks; input conditioning is not guaranteed artistic synchronisation. |
| G8 | Queued and running clip attempts appear as status-labelled library placeholders with a Cancel control | browser-3/recovery-7 actual queued/running placeholders; fixture coverage proves reservations do not become video coverage. |
| G9 | Cancelling a queued attempt prevents its execution; cancelling a running attempt stops that attempt immediately rather than just hiding it | recovery-7 measured owned stop/release (H3 about 1.25s in final short run); not literal zero latency or proof for unregistered processes. |
| G10 | Once cancelled, its placeholder offers Restart, Discard, and Restore parameters | recovery-7 real cancelled controls, with persisted-state fixtures; no automatic restart after navigation. |
| G11 | Restart uses the cancelled attempt's submitted creative inputs/settings, timing, and same recorded seed, creating another attempt rather than editing the historical… | recovery-7 actual native-only Restart retained inputs/seed and completed; original attempt stays separate. |
| G12 | Discard removes the cancelled placeholder, starts no work, and leaves the current timeline and coverage unchanged | recovery-7 actual queued placeholder Discard retained original history; timeline unaffected. |
| G13 | Restore parameters repopulates the relevant generation fields and removes the cancelled placeholder, without starting another generation | recovery-7 Restore/new variation plus fixture field/history checks; restore alone submits nothing. |
| G14 | Submitting a clip request captures its originating song and planned start/end times before it is queued or run | Actual native conditioning + captured-range fixtures; future form values cannot relocate accepted work. |
| G15 | With beats 1–8 and 13–20 occupied, submit a request for the free 9–12 range | Exact gap scenario is fixture evidence; not a separate native GPU run for the numeric 9–12 example. |

## SD — Seeds and variants
Assertion locations: [`seeds-and-replay`](../tests/contracts/seeds-and-replay.test.ts), [`studio-replay`](../tests/contracts/studio-replay.test.ts), [`studio-attempt-recovery-store`](../tests/contracts/studio-attempt-recovery-store.test.ts).

Searchable example: “retry reads the captured score/script/workflow/audio bytes after working files change”. Recorded evidence: **native-1 / recovery-7 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| SD1 | A fresh creative music or video generation records the actual seed for each seed-controlled tool call with its prompt/settings | Native exact-input replay and fresh-seed variation; no cross-version output-byte determinism promise. |
| SD2 | Retry a failed tool call with recorded seed S: the retry supplies S again with the same tool parameters, and its record identifies that seed | Native exact-input replay and fresh-seed variation; no cross-version output-byte determinism promise. |
| SD3 | Reuse/restore an earlier generation's parameters and then submit a new generation: use and record a new seed, not that earlier generation's seed, while retaining the… | Native exact-input replay and fresh-seed variation; no cross-version output-byte determinism promise. |
| SD4 | Earlier attempt records keep their original seeds after retries, restarts, variations, later style changes, or deletion of full output media, under the existing… | lifecycle-8 verifies old rows/inputs survive deletion; recovery-7 preserves original retries/variations and seeds. |
| SD5 | Cancel a generation with recorded seed S, then choose Restart: the restarted generation supplies and records S again with the original generation parameters | Native exact-input replay and fresh-seed variation; no cross-version output-byte determinism promise. |

## V — Persistent visual style
Assertion locations: [`studio-music`](../tests/contracts/studio-music.test.ts), [`studio-video-store`](../tests/contracts/studio-video-store.test.ts), [`studio-history`](../tests/contracts/studio-history.test.ts).

Searchable example: “new music task excludes legacy project visual style from the saved input and actual agent prompt without rewriting it”. Recorded evidence: **browser-2 / browser-3 / continuity-4**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| V1 | Enter overall style S and generate a clip with prompt P1: the agent receives both S and P1 | Captured-input and project-isolation assertions plus browser feedback; visual consistency is an artistic outcome, not guaranteed. |
| V2 | Leave the optional style empty and submit a clip prompt: generation can proceed without requiring a style description | Captured-input and project-isolation assertions plus browser feedback; visual consistency is an artistic outcome, not guaranteed. |
| V3 | Inspect an attempt's history: its user inputs include the overall style, if supplied, and its individual clip prompt, alongside the existing actual tool-prompt/settings record | Immutable style capture + recovery-7 replay; later style edits are separate history, not changes to submitted inputs. |
| V4 | The retained style follows the project's creative state across reopening and does not leak into another project merely because both projects share the same agent or video… | Captured-input and project-isolation assertions plus browser feedback; visual consistency is an artistic outcome, not guaranteed. |

## U — Linked timing units
Assertion locations: [`linked-timing`](../tests/contracts/linked-timing.test.ts), [`studio-edit-contexts`](../tests/contracts/studio-edit-contexts.test.ts), [`slice5-timing-review`](../tests/contracts/slice5-timing-review.test.ts).

Searchable example: “retains arbitrary decimal intent, containing labels and distinct realised boundaries”. Recorded evidence: **browser-3 / edit-5**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| U1 | For an editable timing position or range, display linked beats, seconds, and frame values with clear labels and allow editing through each unit representation | Exact rational fixtures and recorded-v2 beat/seconds/frame edits, trims and placement changes. Remaining keyboard sweep skipped; responsive coverage remains limited. |
| U2 | Edit one representation: update the others consistently using the current song timing and established frame rate | Exact rational fixtures and recorded-v2 beat/seconds/frame edits, trims and placement changes. Remaining keyboard sweep skipped; responsive coverage remains limited. |
| U3 | Preserve the distinction between selecting retained source frames and moving footage on the song timeline | Exact rational fixtures and recorded-v2 beat/seconds/frame edits, trims and placement changes. Remaining keyboard sweep skipped; responsive coverage remains limited. |
| U4 | Accept fractional seconds such as `12.3456789` and fractional beats such as `1.3333333` without imposing the previously mentioned five-digit limit or snapping them to… | linked-timing/slice5 timing assertions retain arbitrary decimals; no five-digit cap. Derived displays can be approximate. |
| U5 | Frame values remain whole numbers | Exact 12.3456789→containing frame297 assertion; internal zero-based start296 is not a contradictory display. |

## FT — Frame edits and fixed 24 fps
Assertion locations: [`studio-edit-contexts`](../tests/contracts/studio-edit-contexts.test.ts), [`video-plan`](../tests/contracts/video-plan.test.ts), [`studio-render`](../tests/contracts/studio-render.test.ts).

Searchable example: “source1–80 trimmed6–75 preserves origin, leaves both five-frame holes and survives reopen without rewriting generation”. Recorded evidence: **edit-5 / continuation-6**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| FT1 | An 80-frame source displays start 1 and end 80, with the labels clearly identifying inclusive source-frame bounds rather than timeline time or beat positions. | Exact fixture edits/CPU exports and native frame audits; independent media checks are not human watch/listen. |
| FT2 | The user can adjust the bounds by whole frames | Exact fixture edits/CPU exports and native frame audits; independent media checks are not human watch/listen. |
| FT3 | Prevent invalid retained ranges: bounds must be whole frame numbers within the available source and start must not exceed end | Exact fixture edits/CPU exports and native frame audits; independent media checks are not human watch/listen. |
| FT4 | The chosen retained range is reflected in the displayed clip, preview, and export | edit-5 decoded source-window proof + continuation-6 actual retained-PNG continuation; perceptual join remains unreviewed. |
| FT5 | Show the globally fixed 24 fps rate with no frame-rate selector | Native output audited at24fps; incompatible-output validation has fixtures, not an alternate-rate product mode. |
| FT6 | The available source-frame bounds reflect the actual clip, not a frame count merely assumed from the requested beats or duration | browser-3/continuation-6/recovery-7 observed requested24/native39 and requested48/native56; only requested window placed, originals retained. |
| FT7 | With source frames 1–80 placed consecutively and no other clip covering them, change the start to 6 while leaving the end at 80 | edit-5 source-window and independently decoded black-hole test; this is trim, not ripple editing. |
| FT8 | After that trim, the user can move the retained clip five frame positions earlier using the existing placement control, making source frame 6 cover the previous first position | edit-5 explicit movement preserves trim; moved audio warning is non-blocking, not automatic synchronisation. |

## RF — Original frame preservation
Assertion locations: [`video-plan`](../tests/contracts/video-plan.test.ts), [`studio-video`](../tests/contracts/studio-video.test.ts), [`studio-media-purge`](../tests/contracts/studio-media-purge.test.ts).

Searchable example: “two seconds remains a two-second placement, with extra native originals retained”. Recorded evidence: **browser-3 / continuation-6 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| RF1 | A successfully generated clip retains both its encoded output and its original pre-encoding frame sequence or a verified lossless equivalent | Actual PNG identity/order and CPU purge audit; no claim to retain media after permanent deletion. |
| RF2 | Starting/ending references drawn from generated clips use the matching preserved original frames | Actual PNG identity/order and CPU purge audit; no claim to retain media after permanent deletion. |
| RF3 | Frame identity/order remain traceable between the preserved sequence, clip display, timing/trim fields, and generation history | Actual PNG identity/order and CPU purge audit; no claim to retain media after permanent deletion. |
| RF4 | Archive retains raw and encoded clip media; confirmed permanent deletion removes both full-media representations while keeping only the lightweight provenance already agreed | lifecycle-8 independently verifies full originals/raw tails/copies absent and retained thumbnail separate; external copies excluded. |

## R — Continue from end
Assertion locations: [`studio-continuation`](../tests/contracts/studio-continuation.test.ts), [`studio-continuation-api`](../tests/contracts/studio-continuation-api.test.ts), [`continuation-preset`](../tests/contracts/continuation-preset.test.ts).

Searchable example: “per-card preparation follows retained raw frame/current end even unplaced and unselected, saves exact draft only”. Recorded evidence: **continuation-6 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| R1 | Use the Continue From End control on an available generated clip's own card, without selecting a predecessor elsewhere: the next generation's starting-frame input selects… | Native image+audio-conditioned continuation plus exact fixture timing; seamless motion is not promised. |
| R2 | The start field targets the immediately following frame boundary at the predecessor's current timeline end, including after moving or trimming it, even when that boundary… | continuation-6 fixture99-frame adjacency and native source audit; no beat snap or extra blank frame. |
| R3 | The end field is the shared adaptive preset beat count after that precise start | continuation-preset asserts99→195 and adaptive spans; native tool may produce surplus source frames. |
| R4 | The generation form preserves these frame-level timing values rather than rounding them to whole beats | continuation-6 actual request/conditioning/placement identity; preparation is a saved draft, not dispatched work. |
| R5 | The over-15-second duration warning, existing start/end warnings, and post-song soundtrack rules also apply to a continuation that crosses or follows the music's end | continuation-6 real partly/wholly post-song conditioning; no automatic transition or seamless-join claim. |
| R6 | Move or trim the predecessor before choosing continue-from-end: derive the new request's start and end from that clip's edited timeline end, not its original generation range | continuation-6 moved/trimmed fixture derives edited end and matching original; not an untrimmed-video screenshot. |

## M — Song selection and arrangements
Assertion locations: [`studio-continuity`](../tests/contracts/studio-continuity.test.ts), [`studio-video-store`](../tests/contracts/studio-video-store.test.ts), [`studio-lifecycle-store`](../tests/contracts/studio-lifecycle-store.test.ts).

Searchable example: “late music completion selects exactly once in its own project without replay stealing a manual selection”. Recorded evidence: **continuity-4 / edit-5 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| M1 | Arrange clips for song A, then select a different song B that has not been edited: B has no clip placements, while the existing clips remain in the project's library | Real SQLite/browser fixtures and isolated lifecycle proof; not every ordering was a real GPU run. |
| M2 | After working on B, select A again: its saved placements, timings, dominance order, and soundtrack choices return | continuity-4 arrangement persistence + lifecycle-8 lifecycle exceptions: restored clip unplaced; restored song unselected. |
| M3 | A newly selected, unedited song B with known duration has 0% coverage despite clips being present in the shared library | Real SQLite/browser fixtures and isolated lifecycle proof; not every ordering was a real GPU run. |
| M4 | Preview/export and beat-timing controls use the selected song's audio, timing, and arrangement | Real SQLite/browser fixtures and isolated lifecycle proof; not every ordering was a real GPU run. |
| M5 | Start a clip request for song A, then select B before completion: the resulting clip joins the project library and A's arrangement, not B's | Real SQLite/browser fixtures and isolated lifecycle proof; not every ordering was a real GPU run. |
| M6 | With song A selected and arranged, successfully generate song B: B is now visibly selected with no clip placements, A is visibly unselected, and A's saved arrangement and… | continuity-4 once-only completion and selection fixtures; failed/pending music does not select a nonexistent output. |
| M7 | After B was automatically selected on completion, manually select A and refresh or reopen the project: A remains selected with its saved arrangement | continuity-4 late completion/manual selection/reopen checks; not repeated newest-song selection. |

## B — Default ranges, gaps and warnings
Assertion locations: [`studio-timing`](../tests/contracts/studio-timing.test.ts), [`linked-timing`](../tests/contracts/linked-timing.test.ts), [`continuation-preset`](../tests/contracts/continuation-preset.test.ts), [`slice5-timing-review`](../tests/contracts/slice5-timing-review.test.ts).

Searchable example: “halves using actual irregular durations rather than BPM alone”. Recorded evidence: **browser-3 / continuation-6**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| B1 | With the selected song ready, no placements, and no queued/running clip requests for that song, the generation form proposes a first range beginning at 0.00 and spanning… | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B2 | In the steady 60 BPM example above, the first three proposed ranges are 0.00–8.00, 8.00–16.00, and 16.00–24.00 | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B3 | Once a new clip request is accepted, including when it is queued, its start/end times are assigned and the next free range can be proposed without waiting for generation… | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B4 | Adjacent default ranges share an end/start boundary without a missing or doubly allocated beat | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B5 | Retrying a failed request uses its original timing parameters, as required by Generation failure recovery, rather than silently applying the form's newer range | recovery-7 exact retry/restart preserves captured ranges; restores are editable before a fresh generation. |
| B6 | With the 18-second, steady-60-BPM example, the final proposed range remains 16.00–24.00 | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B7 | Selecting an end after the song displays an alert beside the end-beat selector with a readable explanation | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B8 | The end-position advisory updates when the range changes and clears if the end is returned to or before the song's end | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B9 | At steady 60 BPM, with beats 1–8 assigned, a proposed 9–16 request manually extended to 9–20, and beats 21–28 free, accepting that request proposes 21–28 next even if… | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B10 | At steady 60 BPM, with beats 1–8 and 17–24 assigned, propose the earlier free range 9–16 rather than skipping the gap to append after beat 24. | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B11 | At steady 60 BPM, with beats 1–8 and 13–20 assigned, propose 9–12 | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B12 | Automatic suggestions do not overlap included placements or queued/running request ranges | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B13 | For the 18-second, steady-60-BPM example, once requests cover 0–24 seconds, suggest 24–32 next, then 32–40 after that range is assigned, when those intervals are free | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B14 | A start time at or beyond the song's end displays a readable start-selector advisory that the clip begins outside the audio | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B15 | Start and end advisories update independently as their values change | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B16 | Apply the steady-tempo thresholds consistently: 50 BPM selects 8 beats; 49.999 BPM selects 4; 16 BPM selects 4; 15 BPM selects 2; 8 BPM selects 2; 7.999 BPM selects 1 | studio-timing, linked-timing and slice5-timing-review exercise adaptive boundaries/irregular maps; not live generation at every tempo. |
| B17 | Use the same adaptive duration policy for every beat-based start/end preset: initial selection, gap filling, Continue From End, and post-song continuation | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B18 | At steady 30 BPM with a free 16-second gap beginning at 0.00 and an occupied range beginning at 16.00, propose 0.00–8.00 (four beats), not one 16-second generation | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |
| B19 | A requested duration greater than 15 seconds shows a non-blocking marker and a hint to split into multiple generations | Over15s passes controlled admission with warning; native success/fit for arbitrary long intervals is explicitly not promised. |
| B20 | Do not apply a blanket four-second minimum: a valid short request such as 1–2 seconds is not blocked or padded to four seconds solely to match a published ordinary range | browser-3/recovery-7 actual1–2s clips, retaining native frame surplus; no hidden four-second placement minimum. |
| B21 | Adaptive counts affect presets only | Threshold/gap assertions and actual short/post-song clips; arbitrary duration/hardware success is not established. |

## H — Creative history
Assertion locations: [`studio-history`](../tests/contracts/studio-history.test.ts), [`studio-history-api`](../tests/contracts/studio-history-api.test.ts), [`studio-lifecycle-store`](../tests/contracts/studio-lifecycle-store.test.ts).

Searchable example: “committed style edits retain exact before/after and timestamps; no-op/conflict/invalid save writes no event”. Recorded evidence: **browser-3 / recovery-7 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| H1 | A generation entry shows its tool, result/failure state, expandable user-input and actual tool-call details, and the actual random seed associated with each… | browser-3 combined UI + recovery-7 actual recovery receipts; calls not reached before failure are not invented. |
| H2 | The record reflects what was actually submitted, including the assigned agent provider | Browser history/native receipts plus retained-row audits; no history deletion feature. |
| H3 | Successful outputs have an associated output representation | Browser history/native receipts plus retained-row audits; no history deletion feature. |
| H4 | History is project-specific, not a global mixture of every project's work. | Browser history/native receipts plus retained-row audits; no history deletion feature. |
| H5 | Video-generation records retain the originating song and planned start/end times assigned when requested, and identify the song-audio input actually supplied, including… | Browser history/native receipts plus retained-row audits; no history deletion feature. |
| H6 | After an artifact's media is permanently deleted, its original generation entry remains inspectable and a separate deletion event identifies what was deleted | lifecycle-8 original creative/native rows preserved exactly; separate deletion event added. |
| H7 | Retain the output thumbnail and mark the full media as deleted/unavailable | lifecycle-8 real HTTP GET/HEAD/range denial and thumbnail200; purged fixture viewed read-only in browser. |
| H8 | Cancelled attempts are identified as cancelled, not failed or successfully completed | recovery-7 actual cancel/restart/discard plus store assertions; cancelled attempt and fresh child remain distinct. |

## A — Archive, restore and deletion
Assertion locations: [`studio-lifecycle-store`](../tests/contracts/studio-lifecycle-store.test.ts), [`studio-lifecycle-api`](../tests/contracts/studio-lifecycle-api.test.ts), [`studio-lifecycle-manager`](../tests/contracts/studio-lifecycle-manager.test.ts), [`studio-media-purge`](../tests/contracts/studio-media-purge.test.ts).

Searchable example: “archive A across arrangements, place B, restore A unplaced; keep trims, audio, origin and original generation”. Recorded evidence: **lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| A1 | An archived artifact disappears from the active library and can be found and restored from that project's archive | lifecycle-8 browser and CPU song archive/restore preserve arrangement and keep restore unselected; cross-project checks are fixtures. |
| A2 | A restored clip is available again in the active library without regenerating it, and has no timeline placement created by the restore action. | lifecycle-8 actual browser restore returns A unplaced, no generation; separate render remains identical. |
| A3 | Deleted full media has no restore action or recoverable archive copy within the product | lifecycle-8 actual purge/HTTP denial; no secure-erasure, backup or external-download recall claim. |
| A4 | Removing a clip placement does not, by itself, permanently delete the source artifact. | edit-5 explicit unplace and lifecycle-8 archive are separate operations; placement removal does not delete source bytes. |
| A5 | Archiving a clip that is included in the video both moves it to the project's archive and removes its timeline use in the same operation | lifecycle-8 transactional store + actual CPU/browser archive removes placements; raw media remains recoverable. |
| A6 | After archiving or confirmed deletion, the updated timeline and coverage reflect the removal; subsequent preview/export of that edit no longer contains that clip's video… | lifecycle-8 managed cached exports purged/rebuilt; independently downloaded export hash remains unchanged. |
| A7 | If archiving or confirmed deletion leaves an uncovered song interval, mark it as a gap and apply the existing black-frame rule in preview/export | lifecycle-8 independently decoded first80frames black after archive, with song still present. |
| A8 | Place clip A, archive it, place clip B in A's former interval, then restore A: A returns to the library unplaced, while B remains unchanged | lifecycle-8 exact A→archive→B→restoreA browser/CPU scenario: A unplaced; B/media/coverage unchanged. |
| A9 | Restoring a clip alone leaves the current timeline, coverage, and assembled preview/export content unchanged | lifecycle-8 separate post-restore render matches picture/audio; explicit placement needed to reintroduce A. |
| A10 | Requesting permanent deletion opens a confirmation identifying the artifact and explaining both irreversible full-media removal and retained generation history, thumbnail,… | lifecycle-8 actual disclosure/Cancel/Escape/focus return; no browser permanent-delete click. Real HTTP confirmation is separate. |
| A11 | Confirming Delete removes the full media under A3 and preserves the provenance described in H6/H7, including the separate deletion event | lifecycle-8 actual HTTP purge and retained history; fixtures cover every dependency/reconciliation race and resumable failure. |
| A12 | For a clip used in the timeline, the deletion confirmation explains that its placements will also be removed | lifecycle-8 real HTTP accept removes all placements; browser Cancel preserves them. No missing-media placements. |

## T — Sequence, coverage and dominance
Assertion locations: [`studio-timing`](../tests/contracts/studio-timing.test.ts), [`studio-edit-contexts`](../tests/contracts/studio-edit-contexts.test.ts), [`studio-render`](../tests/contracts/studio-render.test.ts).

Searchable example: “partitions half-open spans with newer priority, exact offsets and black gaps”. Recorded evidence: **browser-3 / edit-5 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| T1 | For a 60-second song with 45 distinct seconds covered, show 75% coverage and visibly mark the remaining 15 seconds as gaps | Percentage arithmetic is fixture coverage; exact60s/45s display example not separately certified as a browser observation. |
| T2 | Adding coverage to an already-covered interval does not increase the percentage | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T3 | Changes to clip placements/timings update the visible gaps and coverage | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T4 | With music but no included clips, coverage is 0% | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T5 | Label the indicator as coverage | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T6 | Place clip B over a time range already occupied by clip A: B is visible throughout their overlap by default | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T7 | Use the dominance control to send B behind A: A becomes visible in the overlap, while both placements, their timings, and their source media remain intact | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T8 | With A at 0–8 seconds and B subsequently placed at 4–12 seconds, initially show A at 0–4 and B at 4–12 | Exact interval fixtures + browser/decoded export checks; coverage is not an artistic score. |
| T9 | When the selected song and its analysis are available, show its waveform and beat markers aligned with the clip-placement timeline and timing selectors | browser-3 browser waveform/beats + continuity-4 song switching; estimated beats are not manually corrected or musically certified. |

## C — Clip soundtrack selection
Assertion locations: [`studio-render`](../tests/contracts/studio-render.test.ts), [`studio-edit-contexts`](../tests/contracts/studio-edit-contexts.test.ts), [`slice5-edit-review`](../tests/contracts/slice5-edit-review.test.ts).

Searchable example: “move is independent from trim, accepts negative source origin, preserves exact last-edited intent and one-frame trims”. Recorded evidence: **edit-5 / continuation-6**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| C1 | A newly included clip contributes no audio to the assembled preview or export unless the user enables its audio, even if the generated source contains an audio track. | Independent decoded audio/source comparisons and UI toggles; human listening remains open. |
| C2 | The user can enable existing audio for one clip without enabling audio for every other clip. | Independent decoded audio/source comparisons and UI toggles; human listening remains open. |
| C3 | The same per-clip inclusion choice is reflected in the assembled preview and exported video. | edit-5 same edit plan and independent decoded audio/export checks; final human listening still open. |
| C4 | When clip audio is enabled, that clip's existing mixed soundtrack replaces the original song wherever the clip is dominant | edit-5 source replacement independently compared; no automatic extraction/mixing of foley stems. |
| C5 | Disabling the dominant clip's audio returns that interval to the original song, not to any obscured clip's audio | Independent decoded audio/source comparisons and UI toggles; human listening remains open. |
| C6 | Moving a clip away from its initial position adds a visible warning alongside its clip-audio option | edit-5 moved-position warning UI/fixtures; absence of warning never certifies H3 audio alignment. |
| C7 | The warning does not prevent selecting clip audio, previewing, or exporting | edit-5 moved enabled source remains chosen in render; warning is not a prohibition or automatic correction. |
| C8 | Returning the clip to its initial position clears this moved-position warning | Independent decoded audio/source comparisons and UI toggles; human listening remains open. |
| C9 | In a dominant clip's post-song portion, the original-song source produces silence, while selecting its clip audio uses that clip's existing soundtrack as supplied | continuation-6/edit-5 exact silence/clip-audio post-song behavior; no reverb tail or audio synthesis implied. |
| C10 | If overlapping clips A and B both have audio enabled and B is dominant, use B's audio only during the overlap: neither A's audio nor the original song is mixed underneath it. | edit-5 independently verifies only dominant enabled source in overlap; not a mixed multitrack editor. |
| C11 | If B is dominant with its audio disabled and A's audio is enabled, use the original song during the overlap, or silence beyond the song's end | edit-5 fixture/render picks original/silence when dominant disabled, never hidden clip fallback. |
| C12 | Swapping dominance from B to A applies A's existing audio choice as well as showing A's video | edit-5 swapped dominance changes both picture and chosen audio without toggling stored flags. |
| C13 | The prototype's editorial audio control is the existing original-song versus dominant-clip-audio choice | No fades/gain/mastering/foley layer; 50% browser player volume is not an exported creative treatment. |

## E — Preview and export
Assertion locations: [`studio-render`](../tests/contracts/studio-render.test.ts), [`studio-render-finalize`](../tests/contracts/studio-render-finalize.test.ts), [`video-plan`](../tests/contracts/video-plan.test.ts).

Searchable example: “rounds only the final partial music frame upward and emits an all-black plan without placements”. Recorded evidence: **browser-3 / edit-5 / continuation-6 / lifecycle-8**.

| PRD ID | Observable intent reminder | Evidence boundary / remaining check |
|---|---|---|
| E1 | An interior gap between two clips appears black for the same interval in preview and in the exported file, while the music continues. | Independent decode/headless VLC and frame/audio comparisons; no final human watch/listen or full-film capacity claim. |
| E2 | Leading or trailing uncovered music behaves the same way | Independent decode/headless VLC and frame/audio comparisons; no final human watch/listen or full-film capacity claim. |
| E3 | A valid project with incomplete clip coverage can export; 100% coverage is not a prerequisite. | Independent decode/headless VLC and frame/audio comparisons; no final human watch/listen or full-film capacity claim. |
| E4 | The exported file plays independently in VLC and reflects the chosen sequence, timing, and black-gap behaviour. | Recorded-v2 exact 28s MP4 fully decodes and matches the renderer receipt; earlier independent headless VLC proof remains. Final human watch/listen is still open. |
| E5 | When the included final clip occupies 16.00–24.00 and the song ends at 18.00 in the timing example, preview and export preserve video through 24.00 | recorded-v2 song24.9587s, output28s with full coverage; 18s/24s remains a separate fixture example, not a claim of identical generated durations. |
| E6 | Retaining the six post-song seconds in that example does not alter the music-coverage denominator, inflate the percentage above 100%, or mark those seconds as missing… | recorded-v2 visual tail3.0413s while music coverage remains100%; no claim of perceptual review. |
| E7 | In the 18-second-song/24-second-video example, the final six seconds are silent when the original-song source is selected | recorded-v2 complete original-song AAC correlation0.99958 and silent tail measured after25.1s (allowing AAC boundary ringing); older18s/24s fixture retained. |
| E8 | Preview and export show the same single dominant clip during each overlap and use its clip audio if enabled, otherwise the original song or post-song silence | Independent decode/headless VLC and frame/audio comparisons; no final human watch/listen or full-film capacity claim. |
| E9 | With an 18-second song, included clips covering through 24 seconds, and an additional included clip at 24–32, preview/export retain video through 32 seconds | Post-song extension fixtures/exports; not a verified feature-length hardware/runtime capacity promise. |

## Accepted UI refinements outside the original 160-ID inventory

These changes retain their linked historical evidence, without invented PRD IDs.
Recorded-v2 adds the current integrated workflow observations; it does not imply
every old fixture was rerun or that the skipped accessibility sweep passed.

| Refinement | Evidence / precise limit |
|---|---|
| Floating, dismissible/reopenable notices | browser-2 feedback; browser observation separate from helper tests. |
| Song selection restores description/lyrics | browser-2 feedback plus continuity-4 snapshots; no overwrite of a later unrelated draft. |
| Project visual style excludes music | `studio-music` actual captured-prompt assertion; browser-2 feedback. |
| Audio-analysis navbar indicator after YuE2 | browser-3 feedback/browser observation. |
| Editable linked units and prospective range | browser-3 feedback + exact linked-timing tests. |
| Click beat markers for End or Start | browser-3 feedback; numeric entry remains available. |
| Minimum overlap lanes | browser-3 feedback/lane fixtures; not one row per clip. |
| Clear clip description only after accepted submit | browser-3 feedback + continuity-4 delayed-response checks; never overwrite a newer draft. |
| One creative history including style and lifecycle | browser-3 history feedback, recovery-7/lifecycle-8 additions; original records unchanged. |
| Default unmuted50% media preview | browser-3 media-interface test + actual browser playback/mute observation; automation did not read native numeric volume. Not export gain. |
| Timing-input focus/scroll stabilisation | browser-3 polish; intermittent literal-click scroll jump was not reproduced, so no universal browser-fix claim. |
| Clips ordered by ascending start time | browser-3 polish/browser check. |
| Proposed duration between Start/End | browser-3 polish + exact duration assertions. |
| Start selector to the left of End | browser-3 polish/browser check. |

**Inventory check:** 160 unique IDs, matching the approved PRD exactly. None of
these tables is a declaration that all160 criteria or all6 spec gates have passed.
When new evidence is added, update the relevant row and boundary, not just the
aggregate test count.
