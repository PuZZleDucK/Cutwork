# Slice 6 — Frame-exact continuation

## Request and boundary

Continue the approved fast-mode build after slice 5 (`6972c63`). Each available
clip/card edit context gets Continue From End. It prepares—not submits—the next
shot, using the last retained original PNG and the immediately adjacent frame
boundary. Apply the existing adaptive duration from that exact off-beat point.
No global predecessor picker, place-first requirement, automatic chain, image
generator, transitions or seamless-motion promise.

## Questions being resolved from existing requirements/code

- Carry the selected edit-context identity/revision and original frame identity
  through saved drafts, immutable attempts, agent guidance and actual H3 input.
- Reject stale source-context choices at submission rather than silently
  changing the captured image or interval. Later edits after accepted submission
  cannot alter that request.
- Unplaced contexts must work; other-song contexts need an explicit song label,
  never silently use whichever song happens to be selected.
- Preserve an existing shot description rather than inheriting the predecessor's
  individual prompt. Continue changes frame/timing defaults only; generation
  still requires a deliberate Generate action.
- Native image-plus-song conditioning is a verification gate, not an assumption.

## Checklist

- [x] Review native image/audio node contracts and define bounded shared types.
- [x] Add failing store/API/timing/capture/UI recovery tests, then implement.
- [x] Verify browser preparation, saved/reloaded choices and stale rejection.
- [x] Prove real trimmed continuation, partial/wholly post-song conditioning,
      independent original-frame identity, output lengths and audio behavior.
- [x] Review, full tests/typecheck/build, preserve/deploy, update evidence, commit.

Local and staged Dundee tests pass 1,135 cases. All three real native continuations
and independent 13.5-second export audits pass. Both deployments passed 46
preservation checks; the last protects 789 assets. Chrome reload/preparation and
return to the original user project passed. See `slice-6-evidence.md` for the
retained observer timeout and explicit perceptual-review boundary.
