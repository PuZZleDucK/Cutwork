# Slice 9 — newcomer path and final verification

**In progress · 23 October 2026.** Slice 8 is committed as `0b99abd` with 1,322 passing tests and the final 53/53 production preservation audit. This document is a scratchpad, not final acceptance or fresh-host certification.

## Request and decisions

- Finish the approved newcomer path on Ubuntu 26.04 x86_64 / NVIDIA 16 GiB. All services run on the server; clients use the trusted LAN. Do not add accounts, discovery or restrictions to creative agents.
- **MIT** for the application's own source, explicitly chosen by the learner on 23 October. Tools, model weights, generated-output conditions and fonts retain their separate terms. No publication is authorised here.
- Bootstrap must expose missing host dependencies and an explicit install path, preserve host Python, use the pinned Node/providers and support a persistent user service. Driver installation, swap changes and login-linger policy are not automatic.
- Align the server's XDG data-root default with installers without moving existing production data.
- Kirsty provenance resolved after the learner identified its historical Linux distribution: bundle unchanged Kirsty Regular v1.0 from Ubuntu `fonts-larabie-straight` 20011216-6 with its original author licence and notices. Current desktop-release terms were the wrong evidence for these older bytes. No substitute or licence purchase is required; the font remains separately licensed, not MIT.
- Real native inference, fixture checks, prepared-host fresh-runtime setup and a genuinely clean OS baseline are distinct evidence. Human watch/listen and final learner review remain outstanding.

## Checklist

- [x] Test and implement bootstrap, host checks, runtime defaults and persistent service packaging; actual first-use/service execution is still a separate gate.
- [x] Update README, MIT licence, verified third-party notices and historical Kirsty decision.
- [x] Audit all 160 PRD criteria against exact test/live evidence and explicit gaps (`prd-traceability.md`).
- [ ] Exercise current browser keyboard, dialogs, responsive layout and reduced-motion behavior where supported.
- [ ] Exercise fresh managed runtime setup and newcomer creative journey; disclose reused host prerequisites/cache/auth.
- [x] Run full checks and preserve existing production rows/assets during this deployment; repeat after any further code changes.
- [ ] Final learner exploration and perceptual watch/listen; do not infer approval from agent tests.
- [ ] Show the prepared app map and complete the learning wrap-up with the learner.

## Evidence boundaries

The initial private preflight was taken while slice 8 was unfinished. Its partial test/proof counts are historical, superseded by `slice-8-evidence.md`. Do not repeat them as current failures. Production now runs the verified slice-9 packaging checkpoint with the service-path correction described below. No clean-OS installation, universal memory guarantee, seamless visual joins, mastered audio, or unrestricted model/output licensing is claimed.

## Current UI findings

- Real medium-width browser inspection reproduced a clipped provider help tooltip; two red CSS tests now pass after anchoring at the shared-status wrap breakpoint.
- A real 390px iframe viewport (browser viewport emulation was blocked by a stale older tab) has no horizontal document overflow, keyboard beat/start selection updates linked values and the proposed range, and deletion disclosure Cancel/Escape restores focus. Historical Kirsty is visually verified in the rebuilt local bundle. These are CPU-fixture observations, not production deployment or native-generation evidence.
- Live reduced-motion preference toggling remains unverified; do not confuse the media-query rule with an observed OS/browser preference switch.

## Packaging review

Default bootstrap is read-only; explicit installation uses pinned Node and native SQLite verification, isolated-tool setup stays in the UI, and persistent service installation never silently stops another service. Server/installer now agree on XDG data-root precedence. Tests-first review reproduced and repaired stale loaded-unit reuse after a failed reload, omitted build dependencies under production environments, nested Debug-state and failed-purge idle guards, and lost stdout diagnostics. The final focused Python bridge runs 29 actual fixture cases; the bounded independent review verified the preceding 28 plus notices/font/UI tests before the final diagnostic addition. These are not real systemd installation results.

`app-map.html` is prepared and visually checked, but the learner has not yet toured it or completed the wrap-up. No publication or final acceptance is implied.

## Actual service installation and recovery

The first real persistent-service activation failed: systemd treated the quoted
`WorkingDirectory=` value as a non-absolute path. The mocked service tests had
missed the difference between that directive and `ExecStart=` argument quoting.
Retain the failed candidate and activation logs; they are not a successful run.

A regression first reproduced the defect. The correction emits the absolute
working-directory path without argument quotes, retaining systemd percent-sign
escaping. All **30 Python bootstrap cases** pass, actual systemd verification
passes, and the corrected frozen source passes **1,332 tests in 88 files**,
typecheck and build on Dundee. The normal installer successfully creates and
starts the enabled, persistent (not transient) user service.

The deployment observer then found that the account's existing asdf Python shim
adds exactly two Python directories to PATH. This was an observer expectation
mismatch after successful startup, not a second service failure. The original
expectation is retained; an exact reviewed delta records those two existing
directories with every other unit/environment field unchanged.

The final **55/55 read-only preservation checks** pass: all **831 registered
assets**, schema version 8 and every schema object, creative/history/edit/draft
row, native queue and Debug record are unchanged. Only ordinary startup tool
readiness changed. TTS and personal ComfyUI process identities are unchanged.
The repair test process inherited the production data-root environment; default
tests use temporary fixtures, and this preservation audit verifies no production
mutation. Do not describe that process environment as an isolated runtime.

The real LAN browser reload shows the existing selected project, saved prompts,
style, timing and clips intact, with bundled Kirsty headings and all five tools
ready. No new production generation or creative edit was made for this check.

## Fresh-runtime installation — tool setup complete, creative journey pending

A separate source and empty managed runtime on Dundee pass actual bootstrap and
repeat-install/idempotency checks. Host Python and existing production/TTS
service identities are unchanged. Browser **Install all** was submitted once;
installation survived refresh and has now completed the isolated dependencies,
model downloads and tool readiness checks.
One clearly named first-use proof project has a saved music prompt but no
generation has been requested yet.

This reuses Ubuntu, the NVIDIA driver, system APT/FFmpeg prerequisites, the user
service manager and the account's existing provider sign-in, but no existing
generator environments or model cache. It is not a clean OS or new-account
authentication test. That separate source snapshot predates the service-path
correction and is not evidence for a fixed fresh persistent-service install.
A fresh read on 24 October confirms all five setup steps are ready. Local
Melbourne completion/check times on 23 October: agent 19:44, YuE2 20:40, ComfyUI
21:00, H3 22:48, audio analysis 22:52. The H3 log records all six model/notice files
verified; both generator dependency/import and model-checksum checks pass.
ComfyUI registration/cancellation and CPU media/analysis checks also pass.
No song has yet been generated in this separate proof project. The
song/clips/edit/continuation/export journey remains pending; tool readiness is
not a completed newcomer creative-path claim. The current status receipt is
`.local-evidence/slice-9/cutwork-branding/fresh-install-overview.json`.
