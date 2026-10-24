# Workspace detail polish

## Request and decisions
- Remove the selected-song tick, seed/history note, agent-translation sentence, song-list subheading and routine music recovery explanation. Keep the short description guidance and real failure/cleanup messages.
- Music Reuse parameters gets a left arrow; behaviour and recorded seeds stay unchanged.
- Add one divider between music and video, including the no-song state.
- Sequence header order: title, Click beats to set selector, coverage. Move waveform/lane guidance to the legend underneath.
- Interpret the described Place in sequence/frame-count layout as the clip library's preview bar. Put Remove in that same top-right position for placed edits; keep status and frame count. Continue from, Reuse parameters, Archive and Delete share one row on normal desktop cards, wrapping only when needed on narrow cards.
- Keep exact saved-context targeting, autosave guards, lifecycle confirmation and all generator behaviour unchanged.

## Checklist
- [x] Add failing markup/order regressions.
- [x] Implement the presentation changes.
- [x] Run the full tests, typecheck and build.
- [x] Browser-check desktop/narrow layout and placement actions with disposable data.
- [x] Deploy web assets only, verify real project data is unchanged, update docs and commit.

## Verification
- Four focused markup/order regressions failed before implementation.
- **1,480 tests / 110 files pass**, including the relocated Remove action's exact-context and dual-revision guards. Typecheck and production build pass.
- Disposable real-store/API browser check: Remove converts the same card to unplaced / Place in sequence; re-placing restores coverage without changing any source media, retained frames, position or audio choice. No generation or deletion performed.
- Desktop browser measurement: every selected/unselected song duration/BPM shares the same right edge. All four clip actions share one row. Header order is title, beat-target controls, coverage; changing the target updates beat-button actions.
- At 390px viewport width, no page overflow and all four actions still fit one row. The divider and concise music reuse action remain visible.
- Frontend-only Dundee deployment: all ten served build files match local bytes, service PID unchanged, both real project snapshots unchanged. Live screenshots and DOM measurements are in `.local-evidence/workspace-polish/` alongside red/final test logs and API snapshots.

## Learner check
Refresh Cutwork to see the cleaner music section, divider, revised Sequence header/legend and top-right Remove controls. The final overall learner review remains open.
