# Cutwork recorded newcomer journey — second take

**Completed 24 October 2026.** The fresh-install journey and requested Claude→Codex
demo are captured in two raw segments totalling **4h 52m 19.983s**. The 28-second
Night film is exported and verified. Original silent screen captures, separate
Chrome-only FLACs, video-bitstream-preserving audio editions, chapter bookmarks,
project provenance and checksums are retained locally. The historical pending
notes below describe checkpoints, not the final state.

## Request
Record a new complete clean application install and generation demonstration using the updated UI and guidance. Select Claude during setup; generate Day Shift Sketchbook music and one video clip before moving to Night Shift Garden. Switch to Codex for the Night film. At its macro insert, preview take 1, remove it from the sequence, reuse its parameters for take 2 and preview it, delete take 2, reuse take 1 again for take 3 and use take 3. Play the entire live sequence before exporting, avoiding a download/save dialog over the playback.

## Boundaries
Fresh Cutwork runtime, tool environments and model downloads on the prepared Ubuntu 26.04/NVIDIA host. Reuse host OS, driver/APT prerequisites and existing normal provider sign-in. Remove only the idle Cutwork runtime; never unrelated ComfyUI, provider credentials or previous delivered recordings. Continuous raw screen capture within each segment, real waits, no reconstructed/timelapsed installation. Capture app playback separately without a microphone or unrelated desktop audio. Do not publish a submission. Final learner review remains open.

## Checklist
- [x] Freeze source, preflight idle state/storage and verify a recording pilot before deleting/installing.
- [x] Start continuous capture; clean/bootstrap app; select Claude; install generators from empty runtime.
- [x] Day: generate original music with Claude, then one audio-conditioned clip; preview both.
- [x] Switch provider to Codex; Night: generate original music and opening clip.
- [x] Macro takes: preview 1; remove 1; reuse → 2; preview 2; delete 2; reuse 1 → 3; preview/use 3.
- [x] Finish cohesive Night sequence with raw-frame continuation, overlap priority, archive/restore, frame-exact edits and an ending beyond the song.
- [x] Play the full live preview before export, then export and verify full decoding; avoid an open save dialog over playback.
- [x] Stop/validate recording, collect chapters/provenance/final outputs, restore any paused TTS and release owned capture resources.

## Evidence
Raw files and machine-specific observations are kept outside Git under Videos/Cutwork/2026-10-24-v2 and ignored .local-evidence/demo-v2-20261024. This document records completed facts only as the run proceeds; unchecked stages are not complete.

### Final verification

- Day has one original song and one video, both Claude/Opus 5.5, previewed before
  Night. It intentionally remains a one-clip sketch, not a completed second film.
- Night has one song and eight successful Codex/Sol 6.1 clip generations. Six
  whole placements cover all 672 frames at 24 fps; maximum overlap is two clips.
  Four continuations match the exact retained source-frame hashes and boundaries.
- Macro takes share the same captured creative inputs and have three distinct
  seeds. Take 1 is unplaced, take 2 deleted, take 3 placed and dominant. All 76
  planned take-2 files are absent and full-media endpoints return 404; its small
  history thumbnail remains accessible. Its full source was not copied out.
- Live playback reached 28:00/28:00 before the export request. No native download
  dialog was opened. Export revision 19 is H.264/AAC, 640×480, 672 frames, 28 seconds,
  SHA-256 `027f234296294b041537f083c3331904167b275b2c4a7c96a800b601b61d8965`.
- Export and all eight retained native clips fully decode. Exported music matches
  the complete original song (AAC correlation 0.99958); the visual tail continues
  3.041 seconds past it, with silence. No mastering or subjective listening claim.
- Both screen originals and audio editions fully decode with zero diagnostics;
  their H.264 bitstreams match pairwise. Audio alignment uses wall timestamps,
  not a sample-accurate calibrated clock. `CHAPTERS.md` indexes the real waits.
- TTS is restored with `loaded=true`; personal ComfyUI kept its original process.
  Owned recording/audio/helper services are stopped. Cutwork and both projects
  remain available. No implementation changes during this frozen-source run.

**Remaining rough edges:** Claude's post-final-report idle hang required the
recorded targeted SIGINT; Config needed Reload saved contexts to clear a stale
preinstall guide view. The source/runtime were not patched mid-recording. The
confirmation pause separates the two original segments; this is not a claim of
an uninterrupted capture or a zero-intervention installation. Final learner
review, public-release audit and an edited submission demo remain separate work.

## Observed issues not yet fixed

### Claude process did not exit after completed Day video

- **Observed once in this run:** H3 had produced and validated its native media,
  and Claude had written its final report, but the Claude CLI stayed alive with
  no child processes. Cutwork was still waiting for process closure before
  finalizing its generation, so the user would see work remain in progress.
- After five idle minutes following the report, the operator verified process
  identity and sent SIGINT only to that Claude process. It returned exit code 0;
  Cutwork then performed its normal checks and placed the original clip. No
  regeneration, media loss, database edits or fabricated success receipt.
- This is an unresolved completion/launcher issue, not a demonstrated H3 failure.
  The exact cause and recurrence rate are **not diagnosed**. The wrapper in
  `apps/server/src/providers/run.ts` currently awaits process closure; a natural-
  language final report is not a substitute for validated completion evidence.
- A future fix must distinguish genuinely completed work from a still-working
  agent and retain native validation; it must not blindly cancel slow generation
  or rerun an already-produced clip. No such fix has been applied.

### Config retained the pre-install task-context display

- Config initially fetched H3 defaults while its installed reference files were
  unavailable. After installation succeeded, that mounted view still displayed
  “default incomplete” and its old unavailable-reference warning.
- The live context API and captured generation tasks already contained the
  complete pinned guides. Clicking **Reload saved contexts** refreshed the view;
  no prompt edits or regeneration were needed. This was stale UI data, not agents
  using the old guide or missing prompting instructions.
- `apps/web/src/TaskContextSettings.tsx` loads on mount and explicit Reload, with
  no setup-readiness-triggered refresh. Any fix must preserve unsaved edits rather
  than silently replacing the user's custom context. No fix has been applied.

These workarounds allowed the requested recorded journey to finish. They are
not claims that the two underlying issues are resolved. Remaining accessibility
checks were subsequently explicitly skipped by the learner, not failed or passed.
No runtime/code change or new inference was performed during note reconciliation.

## Run log

- 16:58:01 AEDT: continuous 1920×904 H.264 screen capture started after a verified content-only pilot. Separate isolated Chrome audio pilot passes; no microphone/default sink is captured.
- 16:58–16:59: previous idle Cutwork runtime removed; frozen a069a59 source bootstrapped on port 9128. Host Python snapshots match. First API response has no projects and all generation tools uninstalled. Provider credentials and unrelated services remain outside the reset.
- 17:00 AEDT: selected Claude/Opus 5.5 through setup, verified existing sign-in, then clicked Install all. YuE2 is installing; ComfyUI, H3 and analysis are queued. All setup panels/status indicators remain visible. Recorder and read-only installation observer are active.
- 17:42: YuE2 dependency/import/model verification passed. 17:59: ComfyUI setup passed and H3 began its 35,087,235,076-byte fresh model download. Brief observer HTTP timeouts recovered without restarting installations; these are retained in evidence.
- Latest source regression: 1,504 tests in 113 files, typecheck and production build pass.
- 19:48:57: all five shared tools ready. Host-Python snapshot still matches. TTS temporarily paused for inference; separate personal ComfyUI retains PID 1216557.
- 19:50: created Day Shift Sketchbook and submitted its first original music request through the UI. Captured provider is Claude/Opus 5.5; no Night project exists yet.

- Day music completed: 25.52 seconds, analysed 112.5 BPM; full song and 4.46-second native clip playbacks reached their ends without media errors. Both captured Claude/Opus 5.5. The video CLI remained alive for five minutes after its final report with no child processes; a recorded identity-checked SIGINT yielded code 0, then normal Cutwork validation accepted the already-generated output. No receipt/database edits or rerender. This operator intervention is a known demo boundary, not a seamless-install claim.
- 20:14: switched provider to Codex through the status selector, created Night Shift Garden, and submitted its fresh short-score music request.

- Night song completed at 24.96 seconds / estimated 112.5 BPM. Opening and first raw-frame continuation completed and played back. Opening trimmed from 104 to 102 frames before Continue; captured source index 101/hash matches the retained endpoint. Planting and the first macro insert are now queued.
- Config view retained its pre-install H3 context error until Reload saved contexts was clicked. The live endpoint and generation captures already contained verified pinned guides; reloading corrected the display. This stale-view defect is recorded for follow-up; no runtime prompt was missing or replaced.

- 20:58–21:07: macro take 1 completed and played to its native end, was removed from the sequence, then its Reuse params control supplied take 2. Captured inputs match exactly and H3 seeds differ. Take 2 completed and played to its end without a media error. Its permanent-delete dialog is open; the browser requires action-time confirmation and that confirmation is pending. Take 1 is retained unplaced. Take 3 and final sequence/export are not yet done.

- 21:13: first raw segment stopped cleanly at the pending deletion confirmation rather than recording an unattended dialog indefinitely. Duration 4h 15m 31.651s, H.264 1920×904, 363,394,478 bytes. Saved as raw/01-install-to-macro2.mp4. Chatterbox TTS restarted; remaining work needs a second recording segment after confirmation. This is a partial run, not a completed film/export.

- TTS restoration: service and model startup completed; its local model-info endpoint returns HTTP 200 after an initial cold-start UI timeout. Personal ComfyUI remained PID 1216557, 234 MiB GPU use. Owned recorder/audio/helper services are stopped; the studio and pending confirmation remain available.

- 21:28: learner confirmed continuing at the deletion gate. Verified resumed capture area; started raw/02-macro2-to-export.mp4. Refreshed the expired plan for the same take and clicked Delete permanently; the purge succeeded for 76 files /30,254,334 bytes, preserving thumbnail/text history. Reused take1 again for take3; all three creative inputs are identical and all three seeds differ. Growth continuation is queued after take3.

- Take3 succeeded and played fully; it remains placed and dominant at12–14.5s. Recorded a whole-clip priority swap to planting and back, with two lanes and no split placements. First raw screen segment fully decodes with preserved demux time base and zero diagnostics; an initial null-muxer check produced timestamp-rounding warnings from its inferred output time base, retained separately in the evidence.

- 21:48–22:02: garden continuation previewed, archived (automatically unplaced), restored unplaced, then explicitly placed. Clip-audio moved-position warning demonstrated and cleared; final mix restored to original song. Continued from its last retained raw frame for the closing shot. Six placements now cover the full 28-second timeline, including 3.04 seconds beyond the music. All native generation attempts succeeded.

- 22:03–22:04: full live playback completed before clicking Export MP4; export
  succeeded and its exact file was collected without opening a save dialog.
  Second capture stopped at 22:04:48 after Export ready was visible, duration
  36m 48.331s. Final lifecycle/media audits passed; all raw captures and muxed
  audio editions decode. Chapters, provenance and checksums packaged locally.
  TTS restored and model readiness confirmed; personal ComfyUI unchanged.
