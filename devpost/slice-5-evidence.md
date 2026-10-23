# Slice 5 — Precision editing and dominant audio evidence

## Implemented behavior

- Each clip use has a stable, revisioned edit context. Source-frame trimming is
  one-based/inclusive; song beat/second endpoints retain exact typed intent and
  the end is an exclusive boundary. Trimming keeps surviving footage in place.
- Move is separate: floor the requested start once and retain source bounds and
  length. A negative source origin is valid if retained footage starts at/after
  zero. Unsupported display ranges are rejected rather than crashing the editor.
- Removing a placement preserves its context, trim and audio choice. Re-placing
  uses that same identity. Unplaced changes neither add coverage nor invalidate
  an unrelated arrangement render.
- Pairwise overlap controls exchange only visual priorities. The visible winner
  alone may replace song audio with its own source-aligned audio. No hidden
  fallback, mixing, gain, fades or automatic gap closing. Misalignment warns.
- Apply is the explicit save boundary for timing; unapplied timing is local, not
  an autosaved generation draft. Remote conflicts preserve typed values and
  disable applying until the user explicitly loads the newer edit.

## Mechanical verification

- **1,054/1,054 tests**, typecheck and production build on development and Dundee
  pinned Node 24.22.0 (61 test files). Tests are fixture/contract tests, not 1,054
  native model calls. Private logs: `slice-5/local-tests.log`, `typecheck.log`,
  `build.log` and the candidate's `slice5-deployment-checks/`.
- **45/45 focused independent editor/timing/store/API checks**. Review reproduced
  the oversized-end display crash, then verified its fix. Invalid text no longer
  disables otherwise available beat input. `slice-5/edit-review/final.md` records
  source review limits and the separate 108-case timing check.
- **73/73 renderer/finalization/runtime checks** include deterministic numbered
  PNGs, independently assembled PCM/AAC packets, trim offsets, overlap priority,
  hidden/audio-off behavior, exact song tail, post-song/short-source silence,
  registered audio bindings and scratch cleanup. Renderer profile v2 prevents
  new cache reuse of old-profile output without rewriting historical records.
- **34/34 deployment-helper regression cases**, including altered historical
  content, incorrectly derived contexts and unrelated-service changes.

## Browser proof — isolated synthetic project

Chrome/CUA exercised a real local API/store and CPU renderer; no agents or GPU
ran. The two synthetic clips each contain 80 numbered original PNGs and native
FLAC; the song is eight seconds at 120 BPM.

Twelve observed checks are recorded in `slice-5/browser-acceptance.json`:
1. Source 1–80 trimmed to 6–75 gives 70 frames at [5,75).
2. Invalid text blocks Apply but leaves a valid beat-map repair input enabled.
3. Exact 12.3456789-second move survives reload, realising [296,366).
4. Moving the trim to zero preserves 70 frames and permits origin −5.
5. Unplace/re-place retains context ID, trim and clip-audio choice.
6. Swapping overlapping priorities preserves 54.2% union coverage.
7. A simulated second-client edit retains typed source end 74 and disables Apply.
8. Explicit Load latest adopts the saved context rather than silently clobbering.
9. Stale preview is labelled and cannot be downloaded as the current edit.
10. Automatic new-revision render succeeds.
11. Browser download matches the registered preview bytes/hash exactly.
12. UI readouts, gaps, warning and saved-context identity agree with stored edits.

Download SHA256:
`b6ce0e1ae1eb91f9dd4589d2dd91fafa55284a8c7f04dd521f598231f7a48371`.
Private screenshot: `slice-5/fixture-editor.png`.
The isolated fixture process later exited 0 without an error; it was no longer
listening when the final byte comparison was performed directly against its
saved registered file. This does not claim a long-running fixture soak test.

## Copied real media proof

Three isolated eight-second exports use copied registered real YuE2/H3 media,
not synthetic footage or new generations. They cover trim/move/overlap with clip
B dominant, swapped A dominance, and B dominant with song audio selected.

For **all three**, all 192 video-frame packets and all AAC packets match separate
frame-by-frame/PCM reference assemblies. Soundtrack PCM digests also match.
All **117** source files on Dundee were reverified afterward: registered paths,
SHA256, byte size, mtime and inode unchanged. The eight-second song excerpt is
sample-equal to its full original; no mastering or loudness alteration.

Evidence: `slice-5/render-proof/real-20261023-035245/` contains
`real-render-proof.json`, `originals-after.json`, independent frame choices and
outputs. A six-frame contact sheet was visually inspected: leading black,
trimmed first shot, dominant second shot, then uncovered black. Headless VLC
playback is a decoder check only, not human listening or a perceptual-quality
endorsement. Final learner review still includes listening to hard audio seams.

## Live deployment

Deployed at `http://dundee.local:9122/` from immutable source
`slice5-20261023-035614-1380563`. Schema 4→5 preservation audit: **46/46**
checks passed, **554 registered assets** unchanged and **7 derived edit contexts**.
Every pre-existing creative/native row, clip draft and historical render snapshot
remains byte-identical. TTS and personal ComfyUI process identities are unchanged.
All five tools report ready and the selected provider is signed in.

An earlier audit ran before the final analysis readiness check settled and
correctly failed that single readiness condition; it is retained separately as
`preservation-during-startup.json`, not relabelled a pass. The final successful
audit is `preservation-after.json`.

LAN browser reload preserved the user's music, lyrics, visual style, clip draft,
all linked generation inputs and placements. Existing clip controls displayed
correct source bounds, linked times and overlap actions. Only disclosure/focus
was changed in the production UI; no user arrangement/media was edited for proof.
Private screenshot: `slice-5/dundee-precision-editor.png`.
Application PID 2880141, invocation `13dcded7167b4a3aadf1bd04874d9019`.

## Boundaries

This slice does not add continuation, lifecycle/delete controls, cancellation
UI, effects, transitions, mastering, or a new generator run. Full native provider
and generation evidence remains in earlier slice documents. Final perceptual
listening/whole-journey feedback stays in the planned final learner review;
independent sample/packet equality is technical correctness evidence, not an
opinion about how good an intentional hard cut sounds.
