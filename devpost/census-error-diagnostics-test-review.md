---
doc: test-review
status: approved
---

# Census error diagnostics — tests-first review

23 October 2026. After reviewing the 27-case diagnostic batch, the learner said
“looks good”, approving implementation. That approval did not include a native
rerun. The learner subsequently said “yes” to one separately recorded attempt;
its passing result is recorded below. **No assertion relaxation or further run
is authorised.** Slice 1/G4 remains open; learner feedback precedes the checkpoint
commit.

## Scratchpad — request, evidence and boundary

Retain the underlying filesystem error in the registered-work evidence report
so a subsequent failure can distinguish a missing file from denied access or
another I/O error. References: `spec.md > C4 — Durable Jobs, GPU Scheduler and
Cancellation` and `spec.md > Important Failure Modes`. This is diagnostic
fidelity, not a change to product scope or cancellation/release decisions.

Source inspection finds the loss boundary: `readLinuxProcessCensus` already wraps
the original rejection in `ProcessCensusError.cause`, but the collector's
`fault()` keeps only its outer code/message and query-cleanup metadata. Tests
must exercise this actual reader-to-collector path, not a replacement serializer.

The two retained native failures do not establish their original errno. Later
PID absence cannot reconstruct it. This batch must not relabel those records as
ENOENT, claim process ownership, or turn either attempt into a pass.

## Approved diagnostic contract

Add an optional, plain-data `cause` to a collected `Fault`. It captures the
**immediate** native cause, sufficient for the existing census wrapper:

```ts
cause?: {
  name?: string;
  message?: string;
  code?: string;
  errno?: number; // finite integer, including signed native errno
  syscall?: string;
  path?: string;
};
```

- Keep outer `PROC_CENSUS_IO` and its message unchanged. Native `ENOENT`, `EACCES`
  or `EIO` belongs under `cause.code`; it does not replace the outer failure.
- Copy only available correctly typed scalar fields. No coercion, guessed code
  from message text, reverse errno mapping or invented defaults. Omit `cause`
  when no supported fields exist. A normal `Error` supplies its name/message.
- Preserve these fields through JSON serialization and later mutation of the
  original error. Retain neither a live Error reference nor arbitrary custom
  properties, stacks, nested cause chains or `toJSON` behaviour. This is a small
  allowlist, not a general-purpose exception dumper or arbitrary secret redactor.
- Causes contain native diagnostic text/paths and remain local evidence under
  the existing privacy rules. Do not publish raw reports without review.
- Both opening/closing observations and a failed reader recorded as
  `adapterError` during bounded abort/deadline cleanup retain diagnostics. The
  collector's primary abort/deadline reason keeps precedence.
- No retry, PID skipping, extra procfs read, success substitution, partial census
  or ownership/release verdict. Existing query PID/cleanup metadata remains covered
  by the default suite. Existing deadline and drain budgets do not change.

### Deliberate limits and questions

Only one cause level is proposed because this reader already places the native
error there. Recursive exception history, hostile proxies/accessors, new text
truncation policies and a new logging subsystem are outside this narrow batch.
If future adapters add another wrapper, its diagnostic contract needs review;
this batch must not claim to preserve arbitrary cause chains. Approval of these
tests authorises the small diagnostic repair, **not** another native attempt.

## Test batch

Executable tests are now promoted to
`tests/contracts/census-error-diagnostics.test.ts`, included in the default suite.
The draft lived under `tests/review/` with `vitest.review.config.ts`; that temporary
config has been removed. All assertion bodies are unchanged by promotion. Tests
import production functions directly; no facade, fake implementation or
expected-failure annotation. All filesystem bytes/errors, queue/GPU responses and
clocks are synthetic. No real procfs, network, subprocess, model or provider is used.

| Cases | Requirement |
|---|---|
| 1 | The real census wrapper preserves the exact original cause and fails without reading further PIDs. |
| 6 | ENOENT/EACCES/EIO in either opening or closing census survive real wrapping, collection and JSON; collection stays incomplete and the other window's evidence remains distinct. |
| 4 | Initial boot read, directory listing, closing boot read and synchronous stat-read throw all preserve the actual operation/path without extra reads. |
| 1 | Plain Error keeps name/message; wording resembling ENOENT does not manufacture an errno. |
| 2 | Missing or primitive cause does not manufacture an empty/native diagnostic. |
| 4 | Malformed scalar types and NaN, positive/negative infinity or fractional errno are omitted, not coerced. |
| 2 | Partial plain-object causes preserve only actual fields, including valid zero errno, without invented name/message. |
| 2 | Empty or entirely unsupported-field objects omit cause rather than emit an empty diagnostic. |
| 1 | Mutating the original cause after collection cannot rewrite retained report data. |
| 1 | Stack, arbitrary data, cyclic nested cause and custom toJSON do not enter the report or execute during serialization. |
| 2 | Abort/deadline remains primary; settled adapter-error diagnostics survive bounded cleanup and no later phase starts. |
| 1 | Schema failure without a native cause remains schema failure and stops further phases. |

**27 cases**, approved before implementation and now in the default contract suite.

## Verification before implementation

- Typechecking passed; test collection found all **27** cases without executing
  native work.
- The isolated draft run exited **1**: **21 failed / 6 passed**. Every failure is
  at a missing `error.cause` or `adapterError.cause` assertion. The preceding
  failure-policy, operation-count and retained-evidence checks passed. This
  reproduces a real diagnostic loss in existing code, not a missing implementation
  import or a claim about the errno of either historical native failure.
- Six controls passed: original in-memory cause identity, both unsupported-cause
  variants, both unsupported-object variants and terminal schema failure.
- Focused review found missing finite-integer/zero errno and partial/empty-object
  coverage in the initial 20-case batch. Seven additional assertions address those
  gaps. The original **16 failed / 4 passed** log is retained as
  `initial-red-20.txt`; the final 27-case results above supersede it. Focused
  re-review confirmed both findings closed, without production or native work.
- Existing default suite freshly passed **370/370**; no test was removed or
  converted to an expected failure. All **103** source files in native attempt 2's
  snapshot remain hash-identical.
- Evidence: `.local-evidence/slice-1/census-error-diagnostics-review/` contains
  `typecheck.txt`, `test-list.json`, `red.txt`, `default-tests.txt`, `status.txt` and
  `source-check.json`. No production files changed; no remote/native execution.

The review-only commands used for the red run are retained here as historical
evidence; their temporary config no longer exists:

```sh
npm run typecheck
node node_modules/vitest/vitest.mjs list --config vitest.review.config.ts --no-staticParse --json
node node_modules/vitest/vitest.mjs run --config vitest.review.config.ts --reporter=verbose
npm test
```

## Implemented and verified — 23 October 2026

The learner approved implementation with “looks good”. Before changing production
code, the isolated 27-case batch was rerun: **21 red / 6 green**, reproducing the
same loss. The repair in `apps/server/src/jobs/registered-work-evidence.ts` adds
the exported `FaultCause` shape, a small `nativeCause()` field copier and optional
`Fault.cause`. Nothing in the process reader or collector control flow changed.

`nativeCause()` copies only the five named string fields plus a numeric integer
errno; `Number.isInteger` rejects NaN, infinities and fractions. Empty diagnostics
are omitted. `fault()` attaches the copied result without replacing the outer
code/message or query-cleanup metadata. It is also used for `adapterError`, so
the existing abort/deadline precedence is retained.

- First implementation passed **27/27** diagnostic cases and typechecking.
- Promotion to the default suite changed only the test file's location and header,
  not its assertion bodies. Focused/default collection confirms **397 cases**.
- Final local verification on Node **24.1.0**: **27/27** focused tests,
  **397/397** default tests and typechecking pass. Default run: **12.45 s**.
- Focused independent review found no issue: shallow data copying, absent/malformed
  fields, outer error precedence, cleanup metadata and unchanged control flow all
  match the approved contract.
- Of the **103** files in native attempt 2's source snapshot, only the collector
  changed. The approved new test body is byte-identical below its header.
  Collector SHA-256: `4849316e960b1c8ebaaccbb8a8285fbf128e4a446b36648ef42f0904b3fa722c`.
  Test SHA-256: `435b63fbcf848574f4b9887669d5cf59bc0ce9fe2dc4e2b74531fff0fb599324`.

Evidence is separate from both native attempts:
`.local-evidence/slice-1/census-error-diagnostics/`, containing `before-red.txt`,
`first-green.txt`, `promoted-green.txt`, `default-tests.txt`, `typecheck.txt`,
`test-list.json`, `source-check.json`, `implementation.diff`, original source/test
copies and exit statuses. The earlier draft-review evidence is untouched.

Current local commands:

```sh
npm run typecheck
node node_modules/vitest/vitest.mjs run tests/contracts/census-error-diagnostics.test.ts --reporter=verbose
npm test
```

**Learner check:** compare the small implementation diff with the approved field
list, or run the focused command above. The `before: ENOENT` case demonstrates
the actual wrapper → collector → JSON path while checking that the report still
says incomplete and performs no retry. The same guarantee is tested for EACCES
and EIO, so missing-file errors receive no special permission to skip a PID.

**Boundary at the implementation checkpoint:** these are synthetic tests of diagnostic propagation, not new native
evidence. No Dundee command, native process census, GPU query or generator was run
for this repair. The two native failures remain failures with unknown original
errno. No third attempt or commit was made. Next is learner review of this repair;
any further native attempt needs separate approval and its own source/evidence ID.

## Subsequent separately approved native evidence

The learner accepted the diagnostic repair and authorised one fresh native attempt
with “yes”. [Attempt 3](registered-work-test-review.md#native-attempt-3--complete-scenario-passed-after-diagnostic-repair)
passed **1/1** with fresh exact-source **397/397** tests and typechecking on
Dundee. Independent review corroborated the evidence and cleanup.

All four process censuses succeeded. The two expected dead-service queue failures
did preserve real native `ENOENT`, errno **-2**, `open`, and the exited owned
service's `/proc/2366077/stat` path. This verifies native propagation through the
owned transport, not the earlier mid-census failure path. The historical census
errors' missing causes remain unknown; those records are untouched.

No fourth run is authorised. The learner subsequently accepted the composed
collector checkpoint with “looks good, go for it”; saved in **`3298874`**. Slice 1/G4 and actual model cancellation/handoff remain
open. See the linked review for separate source hashes, audit and limitations.

## Checklist

- [x] Record requested change, exact loss boundary and limits.
- [x] Draft and typecheck all 27 executable assertions.
- [x] Run the isolated draft batch; distinguish missing behaviour from harness failures.
- [x] Recheck existing default suite and unchanged production source hashes.
- [x] Focused review of assertions and scope; address diagnostic-field coverage gaps.
- [x] Learner approved the 27-case batch with “looks good” before implementation.
- [x] Implement, verify and review; a future native run needs separate approval.
- [x] Learner accepted the diagnostic repair and separately approved one native attempt with “yes”.
