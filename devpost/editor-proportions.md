# Editor proportions and divider cleanup

## Request
Double the lyrics and visual-style text areas, increase the clip-description area by 50%, remove lines above both generation buttons and below the video-generation and sequence sections.

## Decisions
- Live baseline: lyrics 90px, visual style 42px, clip description 66px. New default heights: 180px, 84px and 99px respectively.
- Retain vertical manual resizing and the existing minimum heights.
- Remove only the four requested borders. Keep the recently requested music/video divider and other section boundaries.
- CSS-only behaviour change: no edits to project data, generator work or API calls.

## Checklist
- [x] Add failing presentation regressions.
- [x] Implement the heights and targeted border removal.
- [x] Run tests, typecheck and build.
- [x] Deploy web assets only and verify desktop/narrow live computed styles and screenshots.
- [x] Confirm real data/service unchanged, update docs and commit.

## Verification
- Two focused presentation regressions failed before implementation and pass afterward.
- **1,482 tests / 110 files pass**; typecheck and production build pass.
- Live desktop and 390px browser measurements confirm 180px / 84px / 99px field heights, unchanged minimums and vertical resizing. No narrow-page overflow or browser warnings/errors observed.
- Both generation footers have 0px top borders; video generation and Sequence have 0px bottom borders. The music/video divider retains its 1px border.
- All ten served build files match local bytes. Frontend-only deployment left the running service PID and both real project snapshots unchanged.
- Matched before/after screenshots and computed layout records are saved under `.local-evidence/editor-proportions/`, alongside test logs and deployment hashes.

## Learner check
Refresh Cutwork to see the taller text areas and cleaner section endings. The overall final learner review remains open.
