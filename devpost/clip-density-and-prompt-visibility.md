# Clip density and prompt visibility

## Request and decisions
- Reduce empty space below the clip-library timing controls without hiding errors or shrinking inputs.
- Clip actions read **↑ Continue** and **↑ Reuse params**. Keep music's left-arrow Reuse parameters action and historical recovery labels unchanged. Other-song continuation retains its source in the accessible name and tooltip.
- Diagnose Config's apparently old prompts; do not reset user-editable templates. Explain the editable-template versus injected-guidance boundary in Config.

## Investigation
- Live desktop cards have 36px from the final position input to their bottom border: body padding plus inherited 12px context padding, 6px fieldset padding and 8px label margin. Remove those three redundant inner spacings, retaining the card's outer padding.
- Dundee template revision 2 equals the current default wrapper templates. All four deployed H3 task/guidance/manifest files match the local improved implementation by SHA256. The running service starts that source checkout.
- `prepareVideoTask` expands `{{task_context}}` with revision-3 product guidance, the complete verified official base guide, mode-specific direction and retained/native-tail beat anchors. Config edits only the wrapper; improving product guidance deliberately did not rewrite those saved fields.
- The existing bounded-comparison run's captured `user-and-task-prompt.txt` contains revision-3 guidance, retained-interval/beat direction and the I2VA alignment line. This is verification of an existing capture, not a new generation or an assertion that old project captures were upgraded.

## Checklist
- [x] Failing regressions for labels, compact bottom spacing and Config explanation.
- [x] Implement; run focused/full tests, typecheck and build.
- [x] Browser-check deployed cards and Config, preserve real project/template data.
- [x] Update planning companions, record evidence, commit intended changes.

## Verification
- Test-first run: 12 regressions failed; after implementation all 17 focused tests passed. Full suite: **1,486 tests / 110 files**, typecheck and production build pass.
- Real Dundee desktop browser: all nine clip cards now have a 10px bottom gap instead of 36px, reducing card height by 26px with input height unchanged at 24px. Both placed and unplaced cards show the two requested up-arrow labels; lifecycle controls remain in the same row. Music's label is unchanged.
- Config visibly explains the injected guidance boundary. Installed pinned base/reference/licence files passed the real SHA256-verifying guide reader; the existing comparison capture contains the complete official base guide as well as the revision-3 product guide. No new generation was needed.
- Frontend-only deployment: all ten served build files match local bytes, backend PID remains 3775749, and both project snapshots and editable template settings are unchanged. No browser warnings/errors observed. Only navigation/read-only DOM inspection was performed against real projects.
- Evidence: `.local-evidence/clip-density/` contains before/after screenshots and geometry, test logs, unchanged snapshots/settings, guide verification and deployment hashes. No models, generators or personal services were modified.

## Learner check
Refresh Cutwork and compare the library's lower edge and up-arrow buttons. Config now explains why the editable template stays unchanged while runtime H3 guidance improves. The full guidance is still composed server-side rather than exposed as an additional Config editor. Final overall learner review remains open.
