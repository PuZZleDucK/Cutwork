# Cutwork: recorded newcomer journey

## Request and agreed boundaries

On 24 October 2026 the learner requested an uncut recording from initial setup
through a complete music video, including real model downloads, continuation,
overlap/priority, a visual tail beyond the song, archive, restore, deletion and
broader feature use. Previous Cutwork installations and test data may be removed.
The raw footage is for later timelapse editing, not an already-edited submission.

This is a fresh **application installation on the prepared Ubuntu 26.04 host**,
not a reinstallation of Ubuntu. The NVIDIA driver, APT prerequisites, desktop
account/user systemd, and existing normal provider sign-in are reused. The new
runtime has no previous projects, model weights or Python environments. The new
browser origin avoids previous workspace and notification preferences.

## Capture and privacy

- Frozen application source: `2da9d49`.
- App interface: `http://dundee.local:9127/`.
- A dedicated browser window isolates the recorded content from other tabs.
- The initial installer console displays actual live command output; after
  bootstrap, the recording follows the real application UI.
- Continuous GNOME screencast, H.264, 1920 × 936 content area, requested maximum
  24 fps with real-time variable timestamps. No timelapse or synthesized waits.
- No microphone or default desktop audio capture. App playback audio must be
  captured separately and verified before being claimed as recorded.
- Raw local media and machine-specific logs stay outside Git.
- A temporary recording-session idle inhibitor is released when recording stops;
  authentication and persistent desktop security settings are not modified.
- Recorder pilot attempts are separate from the deliverable. The first CUA
  screenshot-stream pilot could not persist outside an active tool invocation;
  no installation started until the working native recorder was verified.

## Checklist

- [x] Preflight storage, source revision and absence of in-progress old jobs.
- [x] Verify real recording playback before starting installation.
- [x] Remove the two old idle Cutwork runtimes; keep unrelated services untouched.
- [x] Bootstrap pinned application/runtime and persistent user service.
- [ ] UI agent setup and genuine generator/model installation.
- [x] Confirm clean project/library/history and no reused generated media (initial API and browser).
- [ ] Generate a complete original song; inspect audio and analysis.
- [ ] Generate cohesive audio-conditioned video clips.
- [ ] Exercise continuation from retained last frame.
- [ ] Exercise overlap and whole-clip priority controls.
- [ ] Exercise trim and placement using linked time units and visual sequence.
- [ ] Exercise archive, restore, unplaced restoration and deletion.
- [ ] Include a visual ending after the soundtrack.
- [ ] Inspect live preview, export, full-file decoding and playback.
- [ ] Check provenance/history, seeds, templates and project isolation.
- [ ] Verify host Python unchanged and restore any paused TTS service.
- [ ] Validate raw footage duration, capture continuity and chapter index.
- [ ] Record final defects, fixes, verification boundaries and remaining learner checks.

## Acceptance boundary

Agent checks do not substitute for the learner's final watch/listen review,
learning wrap-up or submission writing. No submission/publication is authorized
by this recording request alone. Unexpected failures remain in the raw recording
and are recorded as failures, not silently edited out.

## Run log

- 01:12 AEDT: continuous native capture started and verified before installation.
- 01:12:41–01:12:51: old idle app runtimes removed with explicit learner approval;
  unrelated personal ComfyUI and TTS retained. Available disk increased to257GiB.
- 01:13:59: pinned Node/app bootstrap and real persistent service installation
  completed; before/after host-Python snapshots matched.
- 01:14: first opening shows zero projects and all generator tools missing.
  Existing Codex sign-in was checked through the app.
- 01:15: Install all requested through the UI; fresh YuE2 installation running,
  ComfyUI/H3/analysis queued. Setup details remain visible in the recording.

### Observed non-blocking presentation issue

A missing private tool interpreter is initially described as “Setup executable
could not be started.” The state is correctly Not installed and setup proceeds,
but a newcomer-specific “Not installed yet” explanation would be clearer.
