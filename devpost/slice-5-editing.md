# Slice 5 — Precise edits and dominant audio

## Request

The learner accepted slice 4 and requested continuation with “looking good, go
for it”. Continue in fast mode from commit `46dbd3d`, preserving the approved
industrial interface and all existing media/user work.

## Interpretation and boundaries

- Trimming removes source frames without shifting retained content on the song.
  Source 1–80 trimmed to 6–75 retains 70 frames and leaves five-frame gaps.
- Moving is a separate action. Linked beats/seconds preserve exact typed intent;
  realised output remains on the fixed 24 fps grid. Inclusive source labels are
  distinct from containing timeline-frame labels and exclusive end boundaries.
- Each use has a stable saved edit context, including when unplaced. Edits do not
  modify native output, generation prompts/seeds or another song's arrangement.
- Overlaps have one visual winner; only that winner's audio choice applies.
  Clip audio replaces the song rather than mixing with it. Moving away from
  original audio alignment or using another song warns but does not prohibit.
- No fades, gain, mixing, transitions, lifecycle controls or continuation request
  are silently added to this slice.

## Checklist

- [x] Test trim/move/dominance/audio contracts and exact timing before fixes.
- [x] Implement stable contexts, revision-checked edits and clear editor controls.
- [x] Compile and render deterministic numbered-frame/audio-marker fixtures.
- [x] Verify browser editing, errors/conflicts and preview/export parity.
- [x] Verify representative retained real media in isolated copied test projects.
- [x] Full tests/typecheck/build, independent focused review, preservation-aware
      immutable deployment, live browser check and intended-file commit.

Native generations are unnecessary for editing verification. CPU render fixtures
and copied real media will be labelled separately. No personal service shutdown
is required or authorised by this slice.

Completion evidence: [slice-5-evidence.md](slice-5-evidence.md). Human listening
quality judgment remains in final learner review; exact audio/video references
and headless playback are verified separately.
