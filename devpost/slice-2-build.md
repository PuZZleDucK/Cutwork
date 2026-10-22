# Slice 2 — first LAN studio

## Request and implementation boundary

Fast mode continues from slice 1 commit `3af6122`. Build the approved first
browser slice, not a fake complete editor: Projects/Config, provider and setup,
music inputs, server-owned generation, audio/analysis and expandable history.
No synthetic success in normal app operation. Video/timeline/archive/export
controls arrive in later slices and must not appear operational now.

All product decisions are already approved. No new question is needed. Normal
creative-agent tools/permissions remain unchanged. Setup manages only studio
installations; it must not stop personal Comfy, TTS or other unrelated work.

## Tests before feature implementation

- [x] Real SQLite project/provider/draft persistence and revision conflicts.
- [x] Immutable idempotent requests, captured provider/seeds, project membership.
- [x] Ingestion is once-only; analysis failure retains playable music.
- [x] Setup deduplication/order, honest readiness/auth and durable logs/status.
- [x] API JSON/Host/Origin, known media-ID/range handling and path checks.
- [x] Browser refresh reconnects to the same install/generation; dirty edits survive polling.
- [x] Actual LAN browser project/setup/music journey and independently decoded result.
- [x] Industrial UI and responsive desktop/mobile inspection; focus/reduced-motion styles included.
- [ ] Learner hands-on feedback before adding browser video controls.

Implementation is split into typed store, setup adapter, browser and server/music
integration work with disjoint file ownership. Exact shared types define the
hand-off rather than competing assumptions. Tests use labelled fixtures; actual
provider/model and browser evidence is recorded separately when run.

## Verified checkpoint — 23 October 2026

718 default tests pass on both development and Dundee; typechecking and production
build pass. Actual browser generation, playback, setup/generation refresh, project
and provider switching, original-media audit and idle-server restart persistence
are recorded in [the live evidence](slice-2-live-evidence.md). Source/receipts and
private screenshots remain outside Git.

This is a working progress checkpoint, not a claim that the planned early learner
feedback has happened. Slice 2 stays unchecked until that feedback is resolved.
