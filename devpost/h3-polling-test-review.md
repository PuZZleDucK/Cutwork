---
doc: regression-review
status: approved
---

# H3 completion-observation regression

## Observed failure, 22 October 2026

The Codex-driven attempt submitted one real H3 prompt. H3 wrote 56 original
PNGs, its native MP4 and FLAC, and logged completion. The helper's history
observation raised `TimeoutError: timed out`; no final history was captured.
The helper retained a failed receipt and stopped its owned service. Codex
recovered and inspected the saved files without another generation, preserving
the failure and writing a separate recovery record/export.

`integrations/h3/generate.py` gives each GET ten seconds. Unlike startup,
the completion loop does not tolerate a transient observation timeout: it
immediately enters failure/teardown, even though the distinct overall native
job deadline has not elapsed. Final queue inspection has the same exposure.
Host-memory pressure was observed, but its causation of the HTTP delay is not
proved. The issue is the handling of an unavailable observation, not proof
that H3 generation failed or that a longer minimum clip is needed.

## Approved behavior and fixture assertions

Keep the submitted prompt ID, graph, seed and original overall deadline. Retry
only transient read-only observations, retaining their errors. This is not
the user's generation Retry action and must never repeat a POST.

1. **Transient history timeout:** timeout, empty history, then matching completed
   history. Exactly one native submission; output validation occurs once.
2. **Persistent observation failure:** stop at the original overall deadline;
   each request timeout and backoff respects the remaining budget. Preserve
   observation errors and fail honestly rather than extending the deadline.
3. **Stop/ownership change:** termination or owned-process exit between reads
   prevents further queries/submissions and follows existing cleanup rules.
4. **Non-transient response:** HTTP errors, malformed JSON, failed native
   history or mismatched identity cannot become successful recovery. In
   particular, `HTTPError` is a subclass of `URLError`; classify deliberately.
5. **Final queue timeout:** retry only the read-only queue observation, without
   recollecting outputs or regenerating. A timed-out submission POST is never
   automatically resubmitted, because acceptance may already have occurred.

Use deterministic clock/transport/process fixtures, not a GPU or paid provider.
First reproduce the current observation-failure behavior, then implement the
small bounded polling correction and rerun local checks. Only a separately
observed native run can establish the repaired end-to-end path; local fixture
success cannot do that. Retain this failed attempt unchanged.

**Review state:** approved on 22 October 2026: “perfect, video looks great too.”
This also records positive learner feedback on the recovered validation video;
it does not mark all slice-1 gates complete or invent separate audio critiques.

## Implementation and regression evidence

`tests/diagnostics/test_h3_polling.py` now contains nine test methods covering
these five behavior groups, including subcases. The initial seven methods ran
against the unchanged runner: one passed (the existing no-POST-retry guard),
while six methods had eight failing subassertions. Transient-read recovery,
persistent retry budgeting, late-success acceptance and internal prompt-ID
validation exposed behavior failures; empty-poll/stop subcases also checked
more informative diagnostics, not previously observed duplicate submissions.
This was an executable baseline, not a missing import.

The repair retries only GET observations of the persisted job, records read
errors before retry/stop, checks the immutable deadline before and after reads,
limits backoff to remaining time, verifies history identity and leaves native
POST submission separate. Existing graph/status/media checks still apply.
A final queue-read retry does not collect or generate outputs again.

Review caught the distinction between socket inactivity and a whole-response
deadline. A deterministic slow-body fixture reproduced overshooting a two-second
budget before the additional correction. The Linux main-thread helper now uses
an owned alarm around GET/open/body decoding, restores its prior handler and
refuses an already-active timer. An independent local Python child also proved
real alarm interruption at roughly 120 ms and handler/timer restoration, with a
five-second parent timeout as teardown protection. The alarm never wraps POST.

All nine methods pass. Native boundaries are explicit transport/process/model
fixtures; no GPU, provider, Comfy service or network call is made by these tests.
The one real subprocess is the owned local alarm test. All 78 approved contract
cases, typechecking, the other 25 H3 diagnostics and five launcher diagnostics
also pass. Before/after logs are retained under ignored
`.local-evidence/slice-1/h3/polling/`.

A focused review found no remaining deployment blocker after the slow-body
correction. A supervised native replay uses the identical captured song, prompt,
seed and settings in a new attempt directory; the failed attempt stays intact.
See [slice 1 progress](slice-1-progress.md) for the independently observed live
outcome. Local green fixtures alone are not a native pass or cancellation proof.
