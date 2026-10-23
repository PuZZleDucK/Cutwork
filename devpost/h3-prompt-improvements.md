# H3 prompting improvements — 2026-10-24

## Approved request
Apply the prompt audit recommendations: complete mode-specific upstream guidance,
explicit continuation alignment, concrete action progression, beat-aware events
and endings inside the retained clip, and correct Artigas's optional Ref2VA
rewriter. Preserve normal agent tools, editable templates, seeds and old captures.

## Implementation decisions
- Download pinned official base/reference guides and their licence into runtime,
  separately from model weights. Do not relabel upstream documentation as MIT or
  invalidate/re-download the existing 35 GB weight installation.
- Inline the complete verified **base** guide for supported T2VA/I2VA tasks.
  Keep the reference guide available, but do not pretend the current graph offers
  arbitrary Ref2VA, end-frame or reference-video inputs.
- Split retained beat anchors from native padding; preserve all original frames.
- Update only the Artigas optional rewriter's format guidance, not its launcher,
  enabled state, model, keys, or Music Studio behaviour.

## Checklist / verification boundary
- [x] Regression tests first: guide integrity/capture, mode routing, retained-tail
  boundaries, editable templates, setup and historical replay.
- [x] Implement and run full tests, typecheck and production build.
- [x] Verify the Artigas reference change with focused tests.
- [x] Install only small guide files and deploy to idle Dundee; preserve projects.
- [ ] Bounded matched-prompt comparison; distinguish structural verification from
  observed media quality. No claim of guaranteed beat sync or better aesthetics.
- [ ] Record results and commit intended source changes.

## Verified implementation

- Test-first runs failed on the absent guide reader, omitted guide capture/mode
  context, and missing setup verification. After implementation: **1,436 tests
  across 103 files passed**, TypeScript checking and production build passed.
- Installer regression executes the real installer against explicit fixture
  downloads. Repeated installation does not download again; an existing weight
  ownership marker is unchanged. No model-manifest or checkpoint changes.
- Dundee installed and verified three small upstream files (56,930 bytes), then
  verified them again without downloads. Only `music-video-studio.service` was
  restarted after confirming no active/queued work. TTS and personal ComfyUI
  stayed running. Both existing project snapshots were byte-for-byte equivalent
  as parsed JSON after deployment, including songs, clips, arrangements/events.
- Artigas optional rewriter now routes Ref2VA to six sections and applies its
  chronology/dialogue rules to `detailed_description`. Added focused tests:
  **3 tests / 29 assertions**; existing video skill suite: **12 / 370**, all pass.
  It remains opt-in and keeps its existing provider/model and normal tool access.
  The reference is read on invocation, so no Artigas service restart is needed.
  Updated reference SHA256:
  `ee62a6cb03cefa812c5949c9c857563b006ee0796b1b7659d92e42fc3271f295`.
- Original task captures, editable templates, replay seeds and project data are
  untouched. No new model features or agent restrictions were introduced.

## Bounded comparison in progress

A native-only comparison is separate from the user projects. It reuses the
recorded first continuation's exact song bytes, starting PNG, 64-bit seed,
103-frame retained interval, 107 native frames, and unchanged 20-step w6a8 graph.
The new prompt was written by the normal full-access Sol 6.1 provider using the
updated guidance. It includes the official I2VA header, a few retained beat
cues, and an explicit resolved pose at 4.10 seconds instead of using the
4.348333-second native-tail beat as an ending cue. No media-quality conclusion
has been drawn from prompt text alone.

The comparison joins the same durable GPU queue/lease as the live application;
it does not create a parallel GPU lane. This is not an end-to-end UI test, and a
single historical-versus-new example cannot isolate every prompting change or
establish statistically better quality. Raw evidence stays in ignored
`.local-evidence/h3-prompt-audit/` and the dedicated runtime comparison directory.
