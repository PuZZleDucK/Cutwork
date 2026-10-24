# Post-demo issue investigation

## Request and boundaries

Investigate the Claude post-completion hang and stale Config task-context view.
Fix a reproduced defect with regression coverage; otherwise retain an explicit
post-submission investigation item. No speculative watchdog, agent restrictions,
new media generation, model downloads, accessibility sweep or demo-data edits.

## Questions and evidence

- Claude: does the recorded CLI/launcher hang reproducibly, including after a
  background Bash job? Original native transcript ends at 09:07:58 UTC; the
  process receipt ends at 09:13:11 after the operator interrupt. No original
  stderr diagnostics. Exact cause is not established by those timestamps.
- Config: can the mounted editor retain its pre-install error after tool readiness
  changes? Any refresh must retain unsaved context/template edits, reset-to-default
  intent and stale-revision conflict detection. No provider/generator is needed
  to reproduce this UI lifecycle.

## Checklist

- [x] Inspect original captured launch/transcript and current refresh code.
- [x] Run bounded native Claude completion probes with the pinned CLI/model,
  inherited service environment and ordinary tools, in disposable workspaces.
- [x] Reproduce Config staleness in an isolated browser/API fixture before edits.
- [x] Write regression tests first; implement only evidenced corrections.
- [x] Full tests/typecheck/build plus functional browser verification.
- [ ] Deploy any fix without changing demo projects/settings/media; verify it.
- [ ] Reconcile findings and remaining limits, then commit.

Private logs/fixtures live in ignored `.local-evidence/post-demo-issues/` and a
separate remote investigation directory, not the recorded delivery bundle.

## Config: reproduced and corrected

Before the correction, the mounted Config editor fetched unavailable H3 references
once, then continued showing “default incomplete” after the overview showed H3
ready. The isolated real-browser fixture reproduced this exact transition without
installing or generating anything. Its request log confirmed no follow-up read.

The editor now refreshes when relevant setup state changes. Ordinary queue/log
polling does not trigger rereads. A transition during a read or save queues one
follow-up refresh instead of being lost. Automatic reads update default references
without replacing unsaved overrides or their saved revision: a concurrent edit
still produces the existing conflict warning rather than being overwritten.
Explicit Reload retains its deliberate discard behaviour.

Six new regression tests cover these rules. Full verification: **1,510 tests in
114 files**, typecheck and production build pass. Actual browser checks also prove:

- installation-to-ready clears the stale warning automatically;
- unsaved context and outer prompt-template drafts survive refresh;
- concurrent saved changes still conflict on Save and retain the draft;
- explicit context Reload does not discard the separate template draft;
- a failed refresh keeps the current contents and displays the error;
- readiness changes during a delayed read produce the latest guide afterward;
- a staged Use default reset survives refresh and saves as null, not as a copied
  override (fixture revision 2).

No production prompt/context values were edited for these tests.

## Claude: not reproduced; defer further investigation

Four real probes used Dundee's pinned Claude **2.1.306**, `claude-opus-5-5`, the
same captured-launch/provider runner and service environment, with ordinary tool
access. Each used its own disposable workspace; no GPU inference or downloads.

| Probe | Elapsed | Result |
|---|---:|---|
| Plain final response | 4.635 s | Natural exit 0 |
| Foreground Bash job (2-second wait) | 7.836 s | Natural exit 0 |
| Background Bash job (8-second wait) | 17.553 s | Natural exit 0 |
| Background Bash job (65-second wait, original requested timeout) | 79.737 s | Natural exit 0 |

All receipts show successful input delivery and completion; none hit the bounded
test timeout or received an interrupt. All four recorded process IDs were absent
after completion. The longer probe requested the original 7,200,000 ms Bash timeout;
the CLI harness blocked a foreground sleep used to poll, so the agent waited for
the background completion notification and then read the result. It is therefore
not an identical replay of the original multi-minute media task.

The original event remains real: the native transcript's final `end_turn` was
09:07:58.084 UTC, while process closure followed the operator's targeted SIGINT
at 09:13:11.475 UTC. The original stderr was empty; no retained diagnostic trace
establishes why it stayed alive. These four successes neither diagnose the event
nor prove it cannot recur. No CLI upgrade, tool restriction, response-format change,
prose-based completion detector or speculative watchdog was added.

**Disposition:** retain this as an intermittent completion rough edge for
post-submission investigation, as the learner requested for non-reproduced issues.
If it recurs, capture process/child identity, native session and CLI diagnostics
before intervention; distinguish unfinished work from completed media awaiting
CLI closure. A safe correction must preserve native validation and avoid duplicate
generation. The existing recorded workaround is not an automatic app recovery.

## Deployment

Pending web-only publication and preservation audit. Backend, provider runner,
recorded demo media and installed tools require no changes.
