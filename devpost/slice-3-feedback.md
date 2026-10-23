# Integrated creative-loop feedback — 23 October 2026

The learner requested these changes after trying the working clip/export flow.
Fast-mode approval applies; this is not a new model-generation test.

## Request and interpretation

- Put Audio analysis immediately after YuE2 in the navbar; leave installation dependencies unchanged.
- Pull linked **generation** start/end timing forward from the precision-editing slice: editable frames, beats and seconds, exact entered intent retained, 24 fps containing-frame conventions unchanged.
- Show the next proposed generation as a distinct sequence overlay, not included footage or coverage.
- Let the waveform/beat markers set the end by default, with an explicit start/end selector. Keyboard-accessible markers and numeric controls coexist. Invalid inverted selections explain the problem rather than silently swapping endpoints. Clicked song boundaries retain exact sample time.
- Compact placed and reserved clips into the smallest number of overlap lanes. The unsubmitted draft does not increase lane count.
- Clear only the clip description after confirmed request acceptance. Keep style; retain description/timing/idempotency identity on uncertain or failed acceptance.
- Merge music, video, render and recorded project changes into one chronological creative record, including saved style changes. Do not invent historical edits that the old application did not record.
- All video players start unmuted at 50%; user playback adjustments survive polling. This does not alter exported audio levels or clip-audio selection.

## Verification checklist

- [x] Exact linked timing, invalid inputs, rational click boundaries and lane allocation tests.
- [x] Durable history migration and project isolation, successful changes only, unified ordering tests.
- [x] Navbar, accepted-description and playback-default regressions.
- [x] Full local and Dundee CPU test suites, typecheck and browser build.
- [x] Browser check of all requested controls, preview sound defaults and responsive layout.
- [x] Immutable deployment, before/after data preservation and unrelated-service checks.
- [x] Verified intended-file commit prepared.
- [ ] Learner retry checkpoint.

## Boundaries

Trimming, dominance controls, clip-audio selection, continuation, archive/delete,
cancel/retry and generation-parameter restoration remain their planned later
slices. The existing generation history retains inputs now. No new native song
or H3 run is required to verify this UI refinement.

## Verification notes

- Local contract suite: **919/919 tests across 49 files**, plus typecheck and
  production build. Includes 53 exact timing/selection/lane cases and strict
  HTTP validation of captured timing metadata.
- Focused review found two real recovery bugs: a beat click could not repair an
  inverted endpoint, and configuration navigation forgot an uncertain request's
  exact timing/idempotency identity. Both were corrected before deployment.
- An isolated localhost browser fixture (real HTTP/SQLite, **no agent or native
  generation**) deliberately stored a request then returned an error. Visiting
  Config and returning preserved `0.123456789` seconds and the request identity;
  retry returned the sole original attempt. Confirmed acceptance cleared the
  description, kept style and advanced the proposed range.
- The same fixture verified beat clicks, fractional beats, arbitrary decimal
  seconds, containing-frame edits, invalid-range repair, and four queued
  intervals in three rows with the later nonoverlapping interval back in row
  one. Reservations/draft still gave 0% actual coverage.
- A saved style change appeared in the combined record with expandable before
  and after values. A 390-pixel browser check found long history text overflow;
  scoped wrapping fixed it (375-pixel page content including scrollbar space).
- These are control/persistence checks. Existing native-generation evidence
  remains the preceding slice; no new song/H3 quality or resource claim is made.

## Deployed result

The update is live at `http://dundee.local:9122/`. Both local and pinned-runtime
Dundee suites pass **919/919**, with typecheck and production build. The first
remote run exposed a disappearing-process `ESRCH` race in a test-only `/proc`
observer; it now treats that and `ENOENT` as a vanished owned fixture. Production
process handling, stop deadlines and assertions were not weakened. The failed
run is retained separately.

Schema 2→3 preservation passed **25/25 checks**, including exact historical
creative/native database rows and all **438 registered media assets** (content,
identity and file metadata). An earlier audit during startup observed a
transient readiness-maintenance row; after all five tools reached ready/idle,
the same strict checks passed without exemptions. All existing projects,
selections, prompts, arrangements and media remained unchanged. TTS kept its
original invocation and personal ComfyUI its original process.

The live LAN browser showed the requested navbar order, linked exact timing,
click-to-select start/end, proposed shot, one lane for adjacent existing clips,
and one combined history. Existing clips played; previews were unmuted and a
viewer mute choice survived polling, then was restored. Half-volume assignment
is covered by the preview initialization regression (the browser automation
surface does not expose the numeric native video volume property). No export
mixing or real generation was performed for this feedback pass.

Local evidence: `.local-evidence/slice-3-feedback/`; live screenshot
`live-sequence.png`. Deployment/source manifests, failed and passing logs,
private database backups and preservation reports are kept there or in the
immutable Dundee deployment's `feedback-deployment-checks` directory.

**Learner retry:** refresh the studio, edit any timing unit or click beat markers,
and try the next generation. New confirmed requests clear the description;
existing drafts are deliberately not erased during the upgrade. Saved style
changes from this version onward appear in the unified record. The integrated
checkpoint remains pending the learner's retry; no later slice is marked done.
