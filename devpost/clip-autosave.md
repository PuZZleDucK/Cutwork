# Automatic clip edits and controls — 24 October 2026

## Request / interpretation
- Valid trim and position edits automatically update the saved sequence after
  a short typing debounce; leaving a timing field flushes valid edits immediately.
  Partial/invalid input never changes the last valid sequence. No Apply buttons.
- Preserve exact frame/beat/second intent, retained-frame positions and existing
  move/audio rules. Keep typing responsive during a save; late responses must
  not overwrite newer input. Revision conflicts retain edits and offer recovery.
- First action row: Continue from, Reuse parameters, Remove (when placed).
  Second row: Archive, Delete. The delete confirmation remains explicit.
- Placement status and the unplaced Place in sequence action go above the clip
  preview. Remove the old status divider. Audio precedes Trim and Position.
- Continue from still means the last retained frame. Multiple saved contexts
  keep their own exact continuation/removal actions, never an ambiguous target.
- Only failures warrant notifications. No agent/tool/backend-policy changes.

## Checks
- [x] Tests first: automatic saves, invalid input, in-flight typing, revision
  guards, safe arrangement-conflict recovery, action order and disclosure.
- [x] Implement autosave and reorganize the clip library.
- [x] Browser exercise on disposable fixture data; no real media generation.
- [x] Full suite, typecheck/build, web-only deployment and live layout proof.
- [x] Record verification, update planning companions and commit.

## Verification
- Test-first regression coverage includes the autosave state machine, exact
  unit conversion, guarded snapshot updates, arrangement-only conflict retry,
  in-flight/newer-input races and compact action layout. Two additional failing
  race cases caught synchronous request failure locking and audio acknowledgements
  replacing newly typed timing; both are repaired and now covered.
- Final mechanical checks: **1,469 tests / 108 files pass**, TypeScript checking
  and production build pass. No new dependency or backend change.
- Browser testing used a separate localhost server with the real application
  store and HTTP edit routes, a disposable SQLite database, synthetic FFmpeg
  test-pattern clips and test-tone audio. No AI generations or existing project
  mutations were needed. Browser actions verified:
  - Automatic source-frame trim and second/beat/frame position edits, plus
    second/beat trim edits; linked fields and sequence geometry update together.
  - Empty intermediate text leaves stored context/arrangement unchanged.
  - Delayed writes keep the input enabled and retain newer typed values, both
    during timing saves and an audio change. Focus survives sequence reordering.
  - A one-time injected save failure retains input, offers Retry save, and then
    persists successfully; no routine success notifications were added.
  - A separate concurrent fixture edit preserves the local draft, exposes Load
    latest edit, and recovers to the authoritative revision.
  - Continue from uses source frame 72 and timeline boundary 306 after trimming,
    rather than source frame 96; Reuse parameters restores the original prompt.
  - Remove and Place in sequence retain trim/timing; the placement button is
    above the preview when unplaced. Delete opens the complete warning dialog;
    Cancel closes it and restores focus. No deletion was confirmed.
  - Switching projects while a save is delayed still saves only the original
    context; returning restores its accepted frame value. Reload retains edits.
- Actual Dundee browser: all nine cards have the requested primary/lifecycle
  action order, Audio → Trim → Position, no Apply buttons, no old status divider,
  and placement status above the preview. Both placed and unplaced styling remain.
  An obsolete standalone Continue button margin was removed after visual review;
  the primary button rows are now 27 px tall rather than 57 px.
- Web-only deployment: all ten HTTP-served frontend files match the local build;
  both real project snapshots and the running service PID are unchanged. Assets
  were published before the index; previous hashes remain for existing tabs.
- Private evidence: `.local-evidence/clip-autosave/`, including browser request
  logs, timing/race/navigation results, `live-layout.json`, `fixture-library.jpg`
  and `deployed-library.jpg`. Fixture evidence is not a new native media test.
- Learner check: refresh Cutwork; type a trim or position and pause briefly (or
  leave the field), then inspect the sequence. No Apply click is required. The
  final review of the entire application remains open.

- The other-song continuation fallback also keeps Continue from before Reuse
  parameters and lifecycle actions; a dedicated layout regression covers it.
- Temporary browser tabs and the owned disposable fixture server were closed;
  user tabs and production services were left untouched.
