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
- Top sequence lane is visually dominant. Each placement is one uninterrupted
  block on one row, with at most one move-up control. Disjoint clips reuse rows;
  whole-clip identity takes precedence over absolute minimum row count.
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
- [x] Regression/full tests, typecheck/build, actual browser live-preview and
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

Deployed code checkpoint: `3e462fc`. The frozen candidate passed the same **1,410
tests in 100 files** and typecheck on Dundee. All **46 preservation checks** pass:
**832 registered assets** retain exact identities, paths, hashes, sizes, mtimes and
inodes; all existing creative/history/native-queue/Debug rows are unchanged.
Schema 8 → 9 adds only the empty prompt-template table. Existing readiness records
only refresh their check timestamps; all tools return ready. TTS and personal
ComfyUI process identities are unchanged. All nine HTTP-served frontend files
match the reviewed build hashes.

The deployed browser shows the navbar selector/notices, retained project/style/
continuation, five-column library, always-visible timing/audio and templates in
Config. Existing real project media plays immediately: picture muted and playing,
original soundtrack unmuted and playing, next media paused; Pause stops all media.
The preview volume control defaults to 0.5. Config inspection made no production
template changes. Production screenshots: `production-top.png` and
`production-library.png` in the private evidence folder below. Browser black-gap
and responsive checks remain disposable-fixture evidence; no new native generation
or perceptual audio-quality claim is made.

No production creative edits, model inference or downloads were needed for this
refinement. Private logs/screenshots are under
`.local-evidence/slice-9/workbench-round-two/`. Final learner review, the separate
fresh-install journey, and the learning wrap-up remain open.


## Follow-up: whole-clip priority rows

The learner correctly rejected the overlap-segment display: four placements
appeared as seven UI fragments and four arrows. This was presentation-only;
source media and saved placements were never split. Remove that representation
entirely: four placements must show exactly four whole blocks, each confined to
one row. Preserve saved priority and timing, reuse rows where possible, and offer
at most one move-up arrow per lower clip. Keeping whole clips can require an
extra row in overlap chains; do not sacrifice clip identity to compress rows.

- [x] Regression first: reproduced duplicate blocks from the reported geometry.
- [x] One whole interval per placement/reservation, truthful top-row dominance,
  no split/repeated block keys or arrows, and deterministic row reuse.
- [x] Cover all 120 priority orders of a five-clip overlap chain; every offered
  move-up actually raises the whole clip without changing geometry.
- [x] Full suite/build, disposable browser swap, safe web-only deployment and
  live reported-project verification.
- [x] Learner accepted the simpler sequence with “thats perfect” (24 October).

Follow-up evidence (deployed checkpoint `c5752d0`): **1,411 tests in 100
files**, typecheck and build pass. The disposable browser swapped two whole
clips in both directions while retaining both full intervals and one arrow.
The live reported project previously displayed seven fragments/four arrows; it
now displays **four whole blocks, four unique placement IDs and two arrows**,
each lower clip receiving just one. All saved start/end bounds remain exact.
The web-only publication restarted no service, downloaded/generated no media,
and preserved all database schemas/rows, all **832 assets**, native/Debug data
and application/TTS/personal-Comfy process identities. Nine HTTP-served files
match the reviewed build; the reported project's complete API snapshot is
unchanged. Private before/after screenshots and audit receipts are under
`.local-evidence/slice-9/whole-clip-priority/`.


## Follow-up: failures-only notifications and permanent dismissal within an occurrence

The learner reproduced a real bug: dismiss the bottom two of four notices,
close the panel, then reopen it; all four returned. The previous review action
explicitly included dismissed IDs and the badge counted the original inputs.
That behaviour is removed. Collapse does not dismiss; dismissal removes the
occurrence from both the inbox and count. Review cannot undo dismissal.

- [x] Tests first reproduced the exact four-to-two sequence.
- [x] Remove success notifications, GPU-lane advisory and timeout explanation;
  retain actual failures and the initial trusted-LAN security notice.
- [x] Persist only an opaque LAN-dismissal preference across browser visits;
  migrate the previous session-based dismissal without retaining error text.
- [x] Preserve actionable draft-conflict recovery in the music form even when
  its notification has been dismissed.
- [x] Full suite: **1,418 tests in 100 files**, typecheck and production build.
- [x] Browser component proof: four → dismiss bottom two → close → poll → reopen
  leaves two; a new occurrence of the same failure announces again and expires;
  resolving failures leaves an empty/disabled inbox; dismissed LAN warning is
  absent after reload. Exact 5,000ms duration retains fake-timer coverage.
- [ ] Application success-action check, safe deployment and production proof.
- [ ] Learner review of notification behaviour.

Private evidence: `.local-evidence/slice-9/notification-dismissal/`. No model
download or new generation is required. Previous notification tests incorrectly
encoded manual resurrection as expected behaviour; those expectations are now
replaced, not presented as proof that the old behaviour was correct.
