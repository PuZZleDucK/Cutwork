# Timing and clip-order polish — 23 October 2026

## Requested changes / interpretation

- Investigate intermittent scrolling when selecting/editing Start or End. Keep focus, caret selection, keyboard navigation and touch editing native; do not pin the page or disable scrolling globally.
- Sort the project clip library (including pending attempts) by ascending start time: current selected-song placement first, otherwise original requested start; missing origin sorts last. Equal starts retain stable ordering. Sorting is presentation only, never overlap priority.
- Show a read-only Duration column between Start and End, with generated frame count and exact requested beat/second duration. Irregular measured beat anchors, arbitrary decimal intent, missing beat maps and outward frame rounding retain their existing semantics.
- Put Start to the left of End in the beat-selection control. End remains the default.

## Tests / verification plan

- [x] Duration assertions: fractional subframe interval, exact long decimal, repeating seconds, irregular beats, missing analysis and invalid range.
- [x] Ordering assertions: out-of-order completion, pending interleaving, moved/multiply placed clips, unplaced original requests, ties and unknown origin; no input/priority mutation.
- [x] Browser diagnosis and regression checks for focus/editing/selector layout, desktop and narrow viewports.
- [x] Full local and deployment test suites, typecheck/build; immutable Dundee release with fresh idle gates, backups and preservation audit.
- [x] Commit intended changes; leave unrelated services and user drafts/media unchanged.

## Investigation

Source review found stable timing-input keys and no scroll/focus calls. Visible native input clicks did not move the desktop page in the initial check. A definite responsive layout risk exists above the Start/End selector: changing its target changes a flex-wrapped sentence's length. Validation also replaces a readout with differently sized content during incomplete edits. Stabilize those areas rather than intercepting normal focus or globally blocking scroll.

## Verification notes

- **929/929 local tests across 50 files**, typecheck and production build passed. Six new exact-duration cases and four presentation-order cases cover the requested behavior. Focused independent diff review found no correctness blockers.
- Synthetic localhost UI fixture only (no agent/GPU generation): 96 generated frames / 8 beats / 4 seconds appeared between the endpoints; arbitrary input `12.3456789` produced exact requested duration `6.3456789`. Pending library starts displayed `[0, 2, 24, 96]`, irrespective of submission order.
- At 880 px, Start/End radio switching preserved scroll position and selector geometry. Native pointer focus and keyboard clear/retype preserved scroll and field geometry. Automation `fill()` recentred a field once; native keyboard checks distinguish that harness behavior from application scrolling. The originally reported intermittent literal input-click jump was not reproduced, so this is a targeted layout stabilization, not a claim that every browser/focus circumstance has been ruled out.
- At 390 px, Start / Duration / End remained three aligned readable columns, with 375 px document content width (no horizontal page overflow). Long exact output values scroll within their own field rather than expanding the page.
- No dependency, schema, generator or agent behavior changes. No global scroll suppression, pointer interception or disabled native caret/keyboard behavior.

- Dundee's immutable deployment passed the same **929/929 tests**, typecheck and build using pinned Node 24.22.0. All five tools finished startup readiness checks before the preservation audit.
- Preservation audit: **26/26 checks, 438 registered assets**, exact creative/native rows and asset hashes unchanged. Schema remains 3. TTS invocation/PID and the personal ComfyUI PID/start time are unchanged; neither service was stopped.
- Live browser refresh preserved the user's project, style, clip description and every timing field. Duration displayed **94 frames / 7 beats / 3.872 seconds** for the existing draft; completed library clips appeared at ascending starts **0, 108**. End remained selected with Start on its left. Generation is ready again. No new generation or render was run for this pass.
