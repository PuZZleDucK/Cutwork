# Early studio feedback — 23 October 2026

## Request

- Dismiss warnings/notifications and float them over the workspace, without layout movement.
- Selecting another song restores the original description and lyrics used for it.
- Project style is video-only visual consistency, not a music input.
- The current card-heavy appearance feels generic; the learner regards this as non-blocking polish feedback, not a request for a redesign before proceeding.

## Decisions / boundaries

No further clarification is required. Dismissal only hides a message, never changes an underlying error or tool status. Keep a Notifications control to reopen hidden current messages, including draft-conflict actions. Remember static warning dismissal for this browser tab/session; changed warnings and new notification occurrences remain visible. Error messages do not auto-expire while being read. Position the stack outside document flow, with bounded mobile height and pointer events only on the actual controls/messages.

A manual change to another song atomically restores original user music description and lyrics, including empty lyrics, not the agent's transformed tool prompt. Preserve current project visual style and immutable history. Selecting the already-selected song does not reset edits. Existing accepted work retains its captured inputs; new music capture excludes visual style entirely. The video style control will live with video generation, not the music form.

## Tests before implementation / verification

- [x] Store: original input restoration, style preservation, same-song selection, revision/project guards and reopen persistence.
- [x] Separate music input schema and provider capture; reject style on new music submissions; preserve legacy accepted records/plans.
- [x] Notifications: dismiss/reopen, polling stability, changed/new messages, storage failure, accessible actions and bounded overlay.
- [x] Browser: warning dismissal causes no workspace movement; survives reload; hidden messages reopen.
- [x] Browser: change between real retained songs, compare description/lyrics with immutable original inputs; no generation required.
- [x] Typecheck/default tests/build, deploy idle studio only, check personal services unchanged.
- [ ] Learner retries the affected controls; feedback checkpoint completion remains pending that report.

## Verified outcome

- **750/750 default tests in 37 files pass locally and on Dundee**, plus typecheck and a production browser build. The new style-free API assertions failed before the schema repair; legacy input/capture and song restoration regressions also had meaningful red/green evidence.
- Independent review found three notification recovery gaps: conflict actions disappearing after another action, repeated direct-save failures remaining hidden, and dynamic operational incidents being treated as persistent advisories. These were repaired with regressions. A fourth regression ensures a distinct failure while resolving a conflict is still visible alongside that conflict.
- Actual LAN browser switched between two real retained songs. Form descriptions and lyrics matched the original immutable inputs exactly, including restoring an empty lyric field. The previous selected song and draft were restored afterward. All four song/attempt records were unchanged; no new generation or setup installation was requested.
- Actual notice dismissal reduced visible messages from four to three with **identical workspace-title and compose-panel top coordinates** before/after. Dismiss-all persisted across refresh; the Notifications control reopened hidden messages. A new song-selection notification appeared even after dismissing the identical prior text.
- The music form has no project-style control. New music inputs and task files omit visual style; old history stays unchanged and historical style is explicitly labelled when present. Already-prepared legacy requests remain executable only when their full captured identity/input/seeds match exactly.
- The first 390 × 844 mobile inspection found a three-pixel left overhang caused by viewport units including the scrollbar. Replacing width arithmetic with safe-area-aware insets fixed it: overlay bounds 12–363 px inside a 375 px content viewport, with a bounded scrollable stack. No horizontal document overflow. The temporary viewport override was reset.
- Source/build parity: **101 selected files matched** the deployed source and served bundle. The idle studio alone was restarted; TTS remained active and the personal ComfyUI PID/start time remained unchanged. All five managed tools are ready.
- Private logs, API comparisons, layout measurements and desktop/mobile screenshots live under ignored `.local-evidence/slice-2-feedback/`. Error/conflict recurrence tests use explicit fixtures, not claims of induced failure in the user's real project. No new native generation/style-quality assessment is claimed.

The user described the current UI as functional. The generic/card-heavy aesthetic is recorded for the later polish pass; do not silently reinterpret it as approval of final typography/visual design or spend the submission window on a new design system.
