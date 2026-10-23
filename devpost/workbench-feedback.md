# Dense editing workspace and reachable actions

23 October 2026 — learner feedback, implemented, verified and deployed. The card-heavy page wastes space
and makes required continuation and restored-clip placement appear missing.
Product work takes priority over the separate cold-download proof; use the
established runtime and retained media for these UI checks.

## Findings and plan

- Continue From End and same-song restored placement already exist, but sit in a
  closed fine-edit disclosure. Make both direct, visible per-clip actions.
- Replace the persistent sidebar/long stack with a compact project selector and
  Music / Video / Archive / History workspace navigation. Preserve mounted drafts
  across section changes; successful parameter reuse opens the matching editor.
- Put video direction and preview side by side, followed by a compact sequence
  and horizontal clip rows. Remove repeated instructional prose from the primary
  working area without removing errors, timing precision or provenance.
- Keep trim/move/audio/overlap controls labelled and accessible, raw-frame
  inspection, archive behavior and original seeds. No backend/media migration.
- Verify layout/discoverability regressions, continuation input preparation,
  archive → restore → explicit placement, keyboard use and narrow layout. Use
  labelled fixtures for mutations, not the learner's creative work.
- Deploy only built web assets if server code stays unchanged, retaining a rollback
  build. No generator redownload is needed. Do not claim the newcomer proof passed.

## Verification

- [x] Focused tests, full suite (1,347 in 92 files), typecheck and build.
- [x] Browser before/after, visible actions and functional workflow checks; details below.
- [x] Existing runtime deployment and no creative-data changes.
- [ ] Learner retry of the revised workspace.

## Verified interactions (CPU fixture, not new model inference)

- Archive removed a placed test clip and reduced coverage; restore returned it
  unplaced without changing the remaining clip. Place in sequence was visible
  without expanding Timing & audio; placement restored its saved [0,80) span.
- Clicking that timeline clip opened its matching context. Editing the last source
  frame to 76 disabled Continue/Remove until Apply; the saved trim retained [0,76).
- Continue selected raw source frame 76 and prepared one-based start 77 / exclusive
  end 173: 96 frames, eight beats at the fixture's 120 BPM. No generation started.
- A real browser focus failure after asynchronous continuation was reproduced and
  fixed: destination focus now waits for the enabled editor after React commits.
- Clip draft text survived Music → Video navigation. Music & lyrics focuses its
  destination; history reuse restored the original music description and lyrics,
  selected Music and focused its prompt without starting a generation.
- A real CPU render of procedural fixture media completed and exposed Download MP4.
- Actual 390px iframe layout has clientWidth == scrollWidth == 375px (scrollbar
  excluded), including expanded fine editing. This is a browser CSS check, not
  physical mobile-device certification.
- Independent review found and fixed repeated-clip selection (pass placement ID,
  not only clip ID), history badge undercounting, and cross-tab focus handoffs.

Existing full-access agent behavior, model inputs, source-frame retention and
backend timing/archival operations are unchanged. This does not finish the cold
install journey or constitute the learner's final UI acceptance.

## Deployment and retained evidence

- Web release `workbench-20261023-213606-e5792a0` is live at the existing Dundee
  studio on port 9122. Source commit: `e5792a0`. The existing backend was not
  rebuilt or restarted; this is an explicit static-web overlay, not a claim that
  its frozen source tree or original web manifest still matches the current UI.
- The release retains its exact source archive, web candidate/checksums, the
  previous complete web directory and private before/after audit snapshots under
  the runtime's `web-releases` directory. Old hashed resources remain available;
  the new index was published atomically after its resources.
- All six preservation checks passed: exact database rows/schema, registered
  assets, Debug data, application process/unit identity, unrelated service
  identities and old/new web resources. All **831 registered assets** are intact.
  All nine reviewed web resources were then fetched over LAN HTTP and matched
  their expected checksums. No model download, inference or service restart was
  required for this update.
- The actual existing browser tab was reloaded after confirming its drafts were
  saved. Clockwork Light retained its project, music, clip description/style and
  timing inputs. Its already-restored clip now visibly exposes an enabled
  **Place in sequence** button; all three clips expose **Continue From End**.
  The production arrangement was not changed. Browser warnings/errors: none.
- Private evidence: `.local-evidence/slice-9/workbench/` includes full test logs,
  HTTP and deployment receipts, `deployed-top.png`, `deployed-clip-actions.png`
  and the narrow synthetic-editor screenshot. Functional mutations/rendering
  were tested only in the explicitly synthetic disposable fixture.
