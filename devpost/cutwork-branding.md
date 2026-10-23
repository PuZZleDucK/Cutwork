# Cutwork branding and button affordances

Requested 24 October 2026, under the existing fast-mode approval.

- [x] Name the app **Cutwork** in the navbar, footer, browser title, package metadata,
  README and prepared app-map identity. Keep runtime paths, service names, saved
  project names and existing browser-storage keys unchanged for compatibility.
- [x] Add an original, project-authored hazard-striped clapperboard SVG as the
  navbar mark and favicon; no stock asset, external image service or font dependency.
- [x] Make text-link-looking actions use the standard secondary button treatment,
  including delete, remove starting image, next free beat window and preview mute.
  Delete keeps its explicit confirmation and gets a restrained destructive accent.
- [x] Tests first reproduce old branding and link-style controls.
- [x] Check the real first-use installation status rather than repeat the old ETA:
  all five tools are ready. Last H3 check 22:48 and analysis 22:52 on 23 October,
  Melbourne time. The separate proof project still has no song; no new generation
  or model download is started by this branding task.
- [ ] Full tests/typecheck/build, actual browser logo/button check and safe deployment.
- [ ] Learner visual review of the requested changes.

Remaining project work, not newly added features:
1. Complete the song → clips → editing/continuation → export journey in the fresh
   managed runtime; installed tools alone do not prove that complete path.
2. Finish the targeted final UI/keyboard/reduced-motion checks and learner
   watch/listen/acceptance of the finished app.
3. Refresh/show the prepared app map and complete the short learning wrap-up.
4. Shipping stage: public GitHub repository/privacy audit, short demo video, and
   the learner-authored Devpost submission/exit survey. These are not submitted.

The setup test reuses Dundee's OS/driver/APT prerequisites and provider sign-in;
it is not a clean-OS installation claim. Existing production generation evidence
remains valid but is separate from the fresh-runtime creative-path check.

Private evidence: `.local-evidence/slice-9/cutwork-branding/`.

Verification before publication: **1,424 tests in 101 files**, typecheck and
production build pass. In the actual disposable app browser, Cutwork appears
in the title/navbar/footer and its clapper SVG loads at 38×38px. All four named
actions have visible borders/backgrounds and no underline. Mute/unmute retains
its pressed state; Delete opens the existing disclosure, and Cancel leaves both
clips intact and returns focus. Desktop document width has no horizontal overflow.
