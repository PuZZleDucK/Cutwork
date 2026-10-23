# Editing workbench — second refinement pass

Requested 23 October 2026. Fast mode; implement this feedback before returning to
newcomer verification or submission. This explicitly supersedes the earlier
render-first preview compromise. Export remains a revision-bound FFmpeg render;
preview becomes immediate browser playback of the current saved edit plan.

## Decisions / boundaries

- Templates are shared configuration, captured at request acceptance. Editing a
  template affects new generations, not queued/running requests or exact retries.
- Preview follows the same trim, placement, dominant-picture/audio and black-gap
  rules as export, but browser seeking/decoding is an approximate fast preview,
  not an encoded quality guarantee. No render is requested by viewing/editing.
- Workspace tab selection is session UI state, independent of project selection.
- Top sequence lane is visually dominant. Move-up exchanges overlapping order;
  non-overlapping spans still pack compactly rather than creating empty tracks.
- Original frames and provenance remain stored; remove their technical browsing
  UI, not the underlying reproducibility/quality records.

## Checklist

- [x] Project selector and notification control in navbar; newest notices float
  open for about five seconds, dismiss reliably and remain manually reviewable.
- [x] Tabs before project title; retain active tab across projects; hazard-guide
  Music when absent, then Video when no clips; remove duplicate music shortcut.
- [x] Duration/BPM-first soundtrack options, title capped near 80 characters.
- [x] Editable actual music/video agent templates in Config, default restoration,
  validation and immutable per-request capture with regression tests.
- [x] Remove continuation success notice, frame provenance, preserved-frame list,
  timing explanation disclosure and range captions; useful precision help as tips.
- [x] Immediate live preview, no automatic-render checkbox; explicit HQ export.
- [x] Compact 4–5-across desktop clip cards, distinct in-sequence treatment,
  always-visible trim/placement/audio controls with reduced repeated prose.
- [x] Priority editing in sequence only; top lane wins and lower lanes move up.
- [ ] Regression/full tests, typecheck/build, actual browser live-preview and
  dismissal/tab/layout checks, safe server deployment and preservation audit.
- [ ] Learner review; no final readiness inferred from agent tests.

## Evidence

Local full suite: **1,410 tests in 100 files**, typecheck and production build pass.
Independent review found no blocker in preview projection, lifecycle and audio
switching; this does not substitute for human listening.

Actual disposable CPU-fixture browser checks:
- Music stayed selected after creating a second project; History stayed selected
  when switching back. Empty-project Music hazard guidance appeared.
- Live play started from source media without a render. Paused scrub at 2.5s
  selected the moved orange clip at source 0.5s. Swapping priority immediately
  displayed blue at source 2.5s, still paused.
- Selecting orange clip audio muted the original song and played only orange's
  registered soundtrack at the correct moved offset. Music → Video left all
  preview media paused. This is observed media state, not perceptual listening.
- New notification occurrences appeared; dismissing the warning and an older
  success worked, and a new identical success could be dismissed again. Five
  second expiry and polling/non-renewal have fake-timer regression coverage.
- Continue prepared the visible source image without a success notification or
  provenance disclosure. An explicit Export produced a Download MP4 link.
- Config templates saved/reloaded an actual modification; defaults were restored.
  Removing the context token disabled Save and displayed its validation error.
- At 1320px, four card columns fit with document clientWidth == scrollWidth ==
  1305px; at 390px both are 375px and the library has one column. Desktop 1905px
  displays the five-column grid. These are browser checks, not device certification.
- Browser testing found Ctrl+Home was intercepted by the tab keyboard handler;
  modified browser shortcuts are now left alone, with a regression test.

Deployment/preservation evidence pending. No production creative edits, model
inference or downloads were needed for this refinement. Private logs/screenshots
are under `.local-evidence/slice-9/workbench-round-two/`.
