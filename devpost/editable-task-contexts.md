# Editable task contexts

## Request and decisions
The learner clarified that task contexts must be configurable, including replacing or optimising prompting guidance. Make all three complete texts editable, not just visible. Keep the existing outer templates separate.

- Global, durable overrides for music, video T2VA and video I2VA; an unset override follows the bundled default. Per-context Use default changes the draft; explicit Save applies it.
- Validate text and known placeholders, not creative content or mandatory wording. Placeholders are optional; explain that removing operational instructions may break a workflow. No agent-tool restrictions or response schema.
- Capture the chosen override/revision with each accepted generation. Later settings changes do not affect queued requests; Retry/Restart preserves the capture. Reuse followed by Generate captures current settings.
- Custom context is a complete replacement, with no hidden append of the old guides. Record it as user-configured provenance, not a verified upstream document. Default guide source metadata is labelled as default reference information only.
- Keep original task captures and existing projects untouched. SQLite migration adds configuration storage only. Tool-execution adapters/model setup are separate from prompt editing; this does not claim arbitrary generator replacement is already implemented.
- Save errors/conflicts retain drafts. Reload explicitly discards context drafts only, not outer-template drafts. Unsaved context edits survive Config navigation and warn on page departure.

## Checklist
- [x] Regression tests first: persistence/CAS/validation/reset, acceptance and recovery capture, full override expansion and default-guide independence, UI controls/failures.
- [x] Implement shared settings, migration, runtime composition, editable Config and history provenance.
- [x] Full tests/typecheck/build, disposable browser save/reload/reset/conflict checks and isolated task preparation.
- [x] Back up idle Dundee database, deploy/restart owned app, verify unchanged existing data, document and commit.

## Verification and outcome

- Regression tests were written first; the new settings tests initially failed because persistence/capture did not exist. During verification an I2VA regression exposed the older formatter not expanding variable names with digits; corrected it for first_frame_sha256. Historical fixture tests now accurately omit both newer template/context fields.
- Final mechanical checks: **1,504 tests in 113 files pass**, TypeScript check passes and production build passes. Test boundaries are synthetic providers/media; no new generative-quality claim.
- Disposable real API/store browser at port 9134: saved music and both video overrides; independently preserved unsaved outer-template text; induced an actual stale-revision conflict and retained the exact draft; explicitly reloaded the winning revision; reset music to bundled defaults; retained video edits across Projects/Config navigation and reloaded their saved values. No generator, installer or export was invoked.
- Default contexts (18,731 / 33,940 / 34,579 characters) pass the same placeholder validator as custom text. All three modes are editable; missing default sources do not block a custom override.
- Dundee was idle before deployment. SQLite backup: runtime/backups/before-editable-contexts-20261024-142329.sqlite. Schema migrated to 10; owned application service active with PID 3921580. Both real project snapshots, outer templates and native call records compare equal before/after. All ten served build files match local bytes.
- Isolated task preparation on Dundee captured a custom music guide at revision 1, changed global settings to revision 2, and verified that preparation used revision 1 with exact seeds, literal user placeholder-like text, the native command and custom provenance. No provider launch, model execution or production project write. Temporary store removed afterward.
- Live Dundee browser confirms the current complete music guide is editable (18,731 characters, revision 3 guidance), all three context sections and Save/default controls are present, and unchanged settings keep Save disabled. Screenshot: .local-evidence/editable-contexts/live-context-editor.jpg. No production settings were changed during verification.
- Local evidence lives in ignored .local-evidence/editable-contexts/. No runtime prompts, credentials, media or personal learner profile are staged.

## Try it

Open Config, expand Task contexts, edit any complete context and Save contexts. Use default stages that context's bundled reset until saved. Outer agent templates remain separately editable. New generations capture the new guide; old captures and retries do not change. Replacing an execution adapter is still separate work from replacing the guide text.
