# Action placement and setup dismissal

## Request and decisions
- Move the selected song's left-arrow Reuse parameters action below Generate music, in the same right-aligned action column. Keep it a non-submit button with the same restoration behaviour; remove its duplicate from the player.
- Right-align the export action and add a decorative inline save icon while retaining the text label, queued/running guards, retry and download behaviour.
- Preserve the existing non-agent status-button route into Config, but make it a true toggle: Config returns to Projects on the next status click, keeping the selected project/workspace tab. Show expanded state. Provider selection keeps its separate existing toggle.
- Required incomplete setup remains visible in the project view, as previously agreed; closing configuration does not cancel setup or generations.
- No installation, provider, generation or media changes during verification.

## Checklist
- [x] Add failing action-location, export and toggle regressions.
- [x] Implement and run tests/typecheck/build.
- [x] Browser-check all four status toggles and button geometry on desktop/narrow views.
- [x] Deploy frontend only, confirm real data/service unchanged, document and commit.

## Verification
- Five focused regressions failed before implementation. Final **1,485 tests / 110 files pass**; typecheck and production build pass.
- Disposable real-store/API browser: all four tool statuses toggle expanded true/false and return to the previously selected History tab. Provider selector still opens/closes independently; a tool-status click also closes Config opened from navigation.
- Music Reuse parameters restores the selected song's description/lyrics through the existing restore-parameters route. Its button is non-submit; no duplicate remains under the player. Fixture counts stayed at four music and three video generations; no new generation was submitted.
- Desktop and 390px measurements: reuse is below and right-aligned with Generate music; export's right edge matches its control row. No narrow-page overflow or browser errors/warnings observed. Render-state regressions retain queued/running disabling, retry text and completed downloads.
- Frontend-only Dundee deployment: all ten served build files match local bytes; the service PID and both real project snapshots are unchanged. Live YuE2 open/close returns to Generate; screenshot shows the relocated actions and decorative save icon.
- Evidence: `.local-evidence/action-placement/` contains test logs, fixture request routes, browser state/geometry, screenshots, deployment hashes and before/after snapshots.

## Learner check
Refresh Cutwork. Try each installed tool's status button twice to open and close configuration without refreshing. Music reuse is below Generate music; Export MP4 is on the right with its save icon. The final overall learner review remains open.
