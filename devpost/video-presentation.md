# Video presentation polish — 24 October 2026

## Request and decisions
- Placed library clips use a brighter border and background matching the
  sequence's existing teal. Unplaced clips stay neutral; membership follows
  the selected song, not any historical placement.
- Headings: Generate, Sequence, Library, Preview / Export. Keep the clip count,
  remove the named H3/FPS and project-library heading annotations.
- Remove the decorative workspace footer (its text and extra bottom rule).
  Keep the existing section divider. No media, timing or generation changes.
- Browser diagnosis: production CSS groups a normal selector with a higher-
  specificity obsolete expanded-card selector using `:is()`, overriding both
  placed and unplaced card colours. Remove the redundant selector grouping.

## Checklist
- [x] Tests first for labels, footer, selected-sequence membership and shared colours.
- [x] Implement the small presentation changes.
- [x] Full suite, typecheck and production build.
- [x] Deploy web only, verify live colours/layout and unchanged project data.
- [x] Record evidence and commit intended files.

## Verification
- Test-first assertions failed on the six intended label/style/footer checks;
  selected-song placement membership already passed. The subsequent contrast
  assertion also failed before adding a lighter muted-text colour on teal cards.
- Final suite: **1,449 tests / 105 files pass**. Typecheck and production build
  pass; no new dependency or framework was introduced.
- Real Dundee browser: seven placed cards match the sequence background
  `rgb(54, 77, 80)` and cyan border `rgb(127, 204, 200)`; two unplaced cards
  remain neutral `rgb(34, 39, 41)` with muted borders. The state labels remain
  present, with brighter text on the teal background. Library count is retained.
- Browser confirms Generate, Sequence, Library and Preview / Export headings,
  no redundant heading annotations, and one remaining bottom section rule with
  no decorative footer text. Existing timing/audio controls are unchanged.
- Web-only deployment: all ten served frontend files match the local build.
  Assets precede the atomic index replacement; previous hashed assets remain.
  Service PID and both project API snapshots are unchanged. No backend restart,
  generation, installer, media edit or placement mutation was performed.
- Private screenshots and DOM colour evidence are under
  `.local-evidence/video-presentation/`: `sequence-library.jpg`,
  `placed-unplaced.jpg`, `headings.jpg`, `bottom.jpg`, `browser-proof.json`.
- Learner check: refresh Cutwork, open Video, compare placed and unplaced
  library cards, and inspect the shorter section headings. Final learner
  acceptance of the whole application remains open.
