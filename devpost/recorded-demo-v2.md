# Cutwork recorded newcomer journey — second take

## Request
Record a new complete clean application install and generation demonstration using the updated UI and guidance. Select Claude during setup; generate Day Shift Sketchbook music and one video clip before moving to Night Shift Garden. Switch to Codex for the Night film. At its macro insert, preview take 1, remove it from the sequence, reuse its parameters for take 2 and preview it, delete take 2, reuse take 1 again for take 3 and use take 3. Play the entire live sequence before exporting, avoiding a download/save dialog over the playback.

## Boundaries
Fresh Cutwork runtime, tool environments and model downloads on the prepared Ubuntu 26.04/NVIDIA host. Reuse host OS, driver/APT prerequisites and existing normal provider sign-in. Remove only the idle Cutwork runtime; never unrelated ComfyUI, provider credentials or previous delivered recordings. Continuous raw screen capture, real waits, no reconstructed/timelapsed installation. Capture app playback separately without a microphone or unrelated desktop audio. Do not publish a submission. Final learner review remains open.

## Checklist
- [x] Freeze source, preflight idle state/storage and verify a recording pilot before deleting/installing.
- [x] Start continuous capture; clean/bootstrap app; select Claude; install generators from empty runtime.
- [x] Day: generate original music with Claude, then one audio-conditioned clip; preview both.
- [x] Switch provider to Codex; Night: generate original music and opening clip.
- [ ] Macro takes: preview 1; remove 1; reuse → 2; preview 2; delete 2; reuse 1 → 3; preview/use 3.
- [ ] Finish cohesive Night sequence with raw-frame continuation, overlap priority, archive/restore, frame-exact edits and an ending beyond the song.
- [ ] Play the full live preview before export, then export and verify full decoding; avoid an open save dialog over playback.
- [ ] Stop/validate recording, collect chapters/provenance/final outputs, restore any paused TTS and release owned capture resources.

## Evidence
Raw files and machine-specific observations are kept outside Git under Videos/Cutwork/2026-10-24-v2 and ignored .local-evidence/demo-v2-20261024. This document records completed facts only as the run proceeds; unchecked stages are not complete.

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
