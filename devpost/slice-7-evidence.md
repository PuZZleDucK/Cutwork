# Recovery and confirmed Debug — verification record

23 October 2026. This records observed behaviour, not a promise that every external
provider/model failure can be repaired automatically. Detailed machine-specific
logs, prompts and real media remain outside Git in `.local-evidence/slice-7/`.

## What changed

- Cancel has its own per-attempt request state: unrelated draft saves do not block
  it. Cancellation remains pending until owned provider/native work has stopped
  and resource release is known; uncertain ownership remains visible.
- Failed Retry and cancelled Restart create linked attempts with the original
  seeds. Resolved native requests replay captured scripts, scores, settings and
  input files without asking a provider to reinterpret them. Before a native
  request exists, restart retains intent/seeds but necessarily uses a new agent
  session. Already-successful native work is not silently regenerated.
- Restore/Reuse applies the original song and editable inputs without starting
  work or allocating seeds. A subsequent Generate creates a new variation.
  Discard hides a cancelled/failed placeholder, not its provenance.
- Debug first captures an expiring, immutable disclosure: full prompt, exact
  command, provider/model, working directory and full-access warning. Only an
  explicit matching confirmation launches it. Stale context requires renewal.
  Repair outcome is independently checked, not inferred from agent prose.

## Evidence boundaries

| Layer | Observed evidence | Boundary |
|---|---|---|
| Local contracts/UI logic | 1,248 tests in 78 files, type check and production build passed | Synthetic processes, injected faults and CPU fixtures are not live-model proof |
| Independent integration review | Fixed duplicate recovery after lost acknowledgement, cancellation blocked by saves, stale restoration revisions and cross-song draft acknowledgement | Source and focused regression review |
| Dundee candidate | Same 1,248 tests, type check and production build passed under the pinned Node runtime | Separate candidate before activation |
| Deployment preservation | 50 checks passed; all 789 pre-existing registered assets and creative/native rows unchanged across schema 6→7 | Read-only audit completed before intentional proof-project creation |
| Browser controls | Cancel/Restart, Restore/new variation, Retry, Discard, refresh persistence, Debug cancel/stale/confirm/report | Explicitly synthetic CPU fixture running the built UI |
| Real Debug | One Codex task repaired a disposable CPU fixture; six checks passed | Not arbitrary production-installer repair or GPU capacity |
| Real provider cancellation | Live owned provider cancelled before any native call; observed terminal state in approximately 126 ms; process/group absence verified | One measured run, not a latency guarantee |
| Real queued music cancellation | Cancelled before provider/native invocation in approximately 24 ms | One queued attempt behind an active creative task |
| Real YuE2 cancellation | Positive semantic-token progress plus owned CUDA observed; cancelled in approximately 3.22 s with independently verified release | One measured run |
| Real YuE2 restart | Same exact request, seeds and execution-file hashes; no provider invocation; one song ingested | No byte-identical-audio or subjective-quality promise |
| Real queued H3 cancellation | Cancelled before provider/native invocation in approximately 28 ms | One queued attempt |
| Real running H3 cancellation/restart | Positive sampling cancellation passed; conservative-policy exact restart completed 39 native frames and one 24-frame placement | Original observer race and subsequent default-policy OOM are retained as failures, not passed runs |

The real Debug fixture changed a deliberately wrong factor from 3 to 2. The
original program/checker hashes stayed unchanged, the executed disclosure matched
the receipt, the fixed controller check passed and owned resources were released.
No unconfirmed/stale repair ran. The disposable service was stopped afterward;
production preservation was rechecked separately.

A development-agent restart interrupted the browser extension connection. The learner reconnected it, and a fresh tab verified the real failed-job Restore
path and refresh persistence. The original project was restored with its music,
style and frame values unchanged. Synthetic and real UI proofs remain labelled
separately.

## Honest limitations

- Exact-replay evidence captures inputs and execution identity; model/runtime
  nondeterminism means a seed is not a universal byte-identical-output guarantee.
- Native and provider stopping only claims observed, owned work. Arbitrary
  detached external work is not certified by the cooperative helper.
- Controlled fault fixtures exercise error handling without intentionally damaging
  the host, exhausting its disk or forcing system-wide OOM.
- Archive/delete is the following slice, not part of placeholder Discard. Its
  media inventory must include the new immutable input and execution snapshots.

## Native proof details so far

A dedicated proof project contains the new attempts; the prior selected project
was restored immediately after creation. Existing creative drafts/media were not
edited. The explicitly authorised TTS pause is temporary; restoration is a gate
before closing this slice. Personal ComfyUI is never stopped.

YuE2 produced 25.63867 seconds, despite an approximately eight-second creative
brief; neither native truncation flag was set. This confirms that a duration wish
is not an exact output-length control. The regenerated ABC score, prefix and token
arrays matched the cancelled parent exactly. Planning metadata differs only in
measured execution timing; the proof does not require timing reports to match.

The first H3 observer looked for `service.log` after native ownership registration
but before service startup had created it. It failed and cancelled only its target;
the app settled to cancelled with verified release and no clip. That is a failed
observer run, not running-inference cancellation evidence. The private observer
now treats a not-yet-created log as no progress; four direct helper checks passed.
After inspecting the failure and release, a separately authorised bounded restart
uses the same resolved request with the corrected observer. No product change or
new agent interpretation was needed for that observer correction.

## Actual H3 memory-pressure failure and correction

H3 cancellation after positive sampling passed: approximately **4.47 seconds**
to cancelled, independently verified cgroup/CUDA release. Its subsequent exact
restart entered the real generator but was killed by **systemd-oomd**, not a
reported CUDA out-of-memory exception. The unit reported `oom-kill`, approximately
17.9 GiB unit memory peak and 3 GiB swap peak; the oomd journal recorded sustained
user-slice memory pressure. The helper could not write a final receipt after the
kill. The coordinator correctly marked failure and released ownership; no clip
or placement was fabricated. This run is not a successful H3 restart claim.

TTS was restored after that failure. The old request, helper snapshot, receipt,
unit result and failure record remain unchanged. No blind retry was launched.

The product-owned Comfy launch was changed to disable pinned host memory and
asynchronous offload, and use the pinned Comfy disk-backed weight policy. These
flags apply only to its own service, trade performance for lower RAM pressure and
do not constrain creative agents or disable host OOM protection. Existing exact
replays retain their old helper: a **fresh** generation is required to capture the
new policy. Live success under that policy was then verified below.

Two related presentation defects found during this proof have regression tests:
resolved native replays must not claim the provider is active/queued, and failed
replays should expose retained native diagnostic details, including independently
observed host `oom-kill`, rather than only a generic receipt hint.

## Conservative-policy deployment and real browser checkpoint

The follow-up candidate passed **1,248 tests / 78 files**, type checking and build
locally and on Dundee. Its source-only schema7→7 deployment passed **49 exact
preservation checks**, including all **790 registered assets** now present (the
original 789 plus the new proof song), all prior creative/native/Debug records,
and unchanged TTS/personal-Comfy identities during activation.

In the deployed UI, Restore on the actual failed clip restored its original
style, prompt, soundtrack and `[0,24)` interval. Refresh retained those values and
started no work. A subsequent explicit Generate accepted one new attempt with a
new seed and the new immutable helper. The clip-description field cleared after
acceptance; refresh and switching away/back kept the same active request. This
is actual product/browser proof, separate from the earlier synthetic fixture.

The fresh native receipt contains all three conservative launch flags. Launch/receipt capture alone was not treated as a completed generation; the
subsequent result follows.

## Final verified outcome

The conservative-policy request reached positive unfinished sampling with an
owned CUDA process; cancellation and independent release passed in approximately
**1.25 seconds**. The browser then launched exactly one Restart. The new child
retained the original request, seed, soundtrack bytes and captured executable
hashes, invoked no provider, and successfully ingested **39 original PNG frames**,
encoded video and generated audio. Only the requested **24 frames / one second**
were placed. The provider indicator correctly remained idle during native replay.

An independent exact-input/release audit passed for both completed music and video
replays. The H3 receipt recorded all three conservative flags. Its final resource
sample reported approximately **7.1 GiB process RSS**, zero process swap and ample
available host RAM. This is one successful short run, not a peak-memory ceiling
or a guarantee for longer jobs/different hosts. The original OOM remains failed
in history; no old request or helper was silently modified to make it pass.

The real queued-video placeholder was discarded through the UI; it disappeared
from the library while its inputs/outcome and a separate discard event remained
in history. The original user project was restored with its saved music/style and
frame selectors unchanged. TTS was restarted and observed active; personal
ComfyUI retained its exact original identity.

The final read-only audit passed **137 checks**: all **789 original assets** and
prior creative/native records remain unchanged; the acceptance counter advanced
from 19 to 29 for exactly ten intentional proof attempts. One new song and one
new clip exist; cancelled/failed attempts created no phantom placements. All
work/leases settled, including the honestly retained OOM failure. Actual browser
refresh/project-switch and recovery controls were verified after reconnection.
Human listening and full artistic-quality review are not claimed by these checks.

**Slice 7 mechanical gates are complete.** Archive/delete and final newcomer
verification remain separate later slices.
