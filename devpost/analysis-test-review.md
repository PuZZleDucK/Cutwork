---
doc: test-review
status: approved
---

# Isolated audio analysis — tests before implementation

22 October 2026. **Approved by the learner: “looks good.”** This is the next bounded part of
slice 1, not completion of that slice or permission to start the editor.

## Request and scope

Continue the approved C7/P9 design: set up Librosa in its own Python environment,
verify it in Dundee's service-account context, and prove a small real analysis
helper. Keep the song unchanged while deriving its sample count/rate, duration,
waveform, estimated tempo and beat sample positions.

The previous native H3 polling repair is committed in `91a8db9`. At the original
test-review checkpoint, the analysis environment was **not installed or verified**,
and no implementation or installation accompanied that draft. The continuation
below records implementation/live results after the learner approved the tests.

## Proposed implementation details to review

- Reuse the already pinned **managed Python 3.12.14 interpreter**, but create
  `tools/audio-analysis/venv/` with its own pinned dependencies and no inherited
  system/Comfy/YuE packages. Sharing an interpreter build is not sharing a venv.
  Start with **Librosa 0.11.0**; resolve/checksum-pin compatible transitive wheels
  after this review. Compatibility is not yet demonstrated.
- Keep FFmpeg/FFprobe as shared host executables from the native Ubuntu package.
  This installer must not install duplicate binaries or run APT/global pip.
  A missing host prerequisite is reported for the explicit host-setup action.
- Decode at the **source sample rate**, retaining the source channel count and
  full decoded length. No trimming, normalisation, effects or audio replacement.
  Analyse immutable captured bytes so the recorded hash belongs to the input
  actually decoded, not a different observation of a mutable path.
- For the small waveform, use **maximum absolute amplitude across all channels**
  per sample bucket, including a shorter last bucket. Do not average channels
  first: opposite-phase channels can cancel while the original audio isn't empty.
- For beat detection only, use an arithmetic-mean mono analysis signal at that
  same sample rate. Record that choice; it can lose opposite-phase rhythm.
  This changes neither the retained song nor its waveform. No promise to detect
  all beats, bars/downbeats, genre, key or song sections is introduced.
- Call `beat_track` with explicit `hop_length=512`, `start_bpm=120`,
  `tightness=100`, `trim=True`, `units='samples'`, `sparse=True`.
  `start_bpm` is the algorithm's **initial estimate**, not a forced tempo or a
  fallback result. `trim` concerns weak detected beat events, **not source audio**.
- A usable map needs a finite positive estimated tempo and at least **two**
  strictly increasing integer sample anchors inside the decoded song. Two
  anchors are needed for the approved nearest-interval extrapolation later.
  Preserve irregular spacing and a first beat after time zero. Do not fabricate,
  sort, clamp or round invalid detector output into a plausible map.
- Store sample positions/counts and rational duration integers as decimal
  strings. Estimated BPM and waveform amplitudes are finite numeric estimates,
  not exact rational musical truth. No video-frame quantisation in this worker.

These are internal, testable choices for the agreed features, not new UI controls
or restrictions on creative agents. Critique them before we write the helper.

## Proposed helper contract

`<analysis-venv>/bin/python -I integrations/analysis/analyze.py --request <json> --result <new-json>`

Input: schema version 1, attempt UUID, source absolute path and SHA-256, waveform
bucket size in samples. Output: matching schema/attempt, analysis version, helper
hash, actual package versions and analysis parameters; observed source facts,
waveform and beat result. The input source and request are never rewritten.

Three outcomes are deliberately distinct:

| Receipt state | Meaning | Process exit |
|---|---|---|
| `succeeded` | Valid decoded facts/waveform and usable estimated beat map | 0 |
| `partial` | Audio facts/waveform available, beats unavailable with a reason | 0 |
| `failed` | Source/hash/decode or other worker prerequisite failed; no usable analysis claim | nonzero |

`partial` means the **analysis process finished with explicitly degraded data**,
not that the generator failed or that the tool installation is ready. Silence
may legitimately have no beat map; a setup readiness check must still pass the
known rhythmic fixture. Existing receipt paths are refused, not overwritten.
Reanalysis writes a new receipt. Versioned storage references/no-retiming of
arrangements are covered when persistence/timing arrive, not falsely proved here.

Two small production functions are the proposed pure-test seam:
`normalise_beats(tempo, sample_indices, *, sample_count)` and
`detect_beats(mono, sample_rate, *, tracker=None)`. Only tests supply a fake
tracker. The ordinary worker calls the pinned real Librosa implementation;
there is no fixture mode or fake-success path in the CLI.

## Concrete test inventory

### Nine local beat-result tests

File: [`test_analysis_contract.py`](../tests/diagnostics/test_analysis_contract.py).
Standard-library fixtures and an explicitly injected detector result, **not**
evidence of Librosa's actual accuracy.

1. Native sample rate and explicit sample units reach the tracker exactly once;
   all algorithm settings are explicit, and the returned BPM is not the prior.
2. Irregular anchors and a lead-in remain unchanged, with no 24 fps rounding or
   invented time-zero beat.
3. A genuinely reported time-zero anchor is retained.
4. Empty detections expose no BPM/map, even if the detector returns 120 BPM.
5. A single anchor cannot create a usable extrapolation interval.
6. Zero/negative/non-finite/boolean/string or ambiguous tempo values are rejected.
7. Duplicate, reversed, negative, out-of-range, fractional, boolean, non-finite
   and string native positions are not silently repaired.
8. A detector exception has a visible reason and no invented map.
9. Sample indices beyond JavaScript's exact-number range stay exact strings;
   this is a representation fixture, not a huge decoded-song claim.

### Two local installer-plan tests

File: [`test_analysis_setup.py`](../tests/diagnostics/test_analysis_setup.py).
They only invoke plan mode, never `--install`.
They observe the designated temporary root, not every host directory; host-Python
preservation is a separate before/after installation observation below.

10. No argument prints the separate environment and explicit install action,
    without creating the data root.
11. A relative data root fails without creating it.

### Ten opt-in real CPU/environment tests

File: [`test_analysis_native.py`](../tests/diagnostics/test_analysis_native.py).
Run only with the dedicated interpreter and explicit absolute data root.
Wrong/missing prerequisites fail visibly, not as silently skipped passes.

12. Actual imports come from the separate venv, system packages are excluded,
    interpreter/dependency versions match recipe/lock, and `pip check` succeeds.
13. A 1,103-sample stereo/44.1 kHz fixture retains exact count/duration/channels;
    opposite-phase peaks survive and the last partial waveform bucket is present.
    The source bytes/mtime are unchanged, while the mono detector has no map.
14. A real 13-second synthetic click track at 120 BPM, with a one-second lead-in,
    returns at least 12 strictly ordered beats. Allow ±5 BPM and **60 ms** from
    the known click onsets; do not demand every click or exact detector timing.
    Verify recorded versions, parameters, helper/source hashes and native grid.
15. Actual silence retains decoded facts and all waveform buckets, with no
    default tempo/beat map.
16. A source-hash mismatch is a failure, with no waveform/map or changed source.
17. Corrupt audio fails decoding rather than becoming successful silence.
18. A second analysis has a new receipt and matching deterministic observations;
    an existing receipt cannot be overwritten. This is not a database/editor test.
19. The generator's actual **48 kHz stereo float32 WAV** profile retains native
    samples/channel peaks, including finite amplitudes above 1 without clipping.
20. NaN/infinite floating PCM is rejected with a diagnostic, not sanitised into
    a different song or emitted as non-finite JSON.
21. A result path cannot overwrite the source or request, or follow/replace an
    existing dangling symlink; all original bytes and the absent target survive.

The click tolerance is an up-front acceptance criterion, not an asserted native
result. If the pinned tracker fails it, investigate and bring a justified change
back for review; do not silently widen it to make the tests green.

## Additional live setup observations — not automated passes yet

These supplement the 21 methods and must be recorded as actual observations:

- Before/after host-Python snapshots and actual resolved executable paths;
  no default Python/package changes, no effects on personal Comfy.
- Pin/hash validation, isolated installation, `pip check`, real imports/fixture
  and a completed repeat that verifies rather than blindly reinstalling.
- Ownership/mismatched-recipe and failed-download paths must not produce a
  ready marker or overwrite somebody else's environment. Final recipe-specific
  failure assertions should be reviewed if installation reveals new behavior.
- Repeat imports, the real analysis fixture and shared FFmpeg/FFprobe capability
  checks in a transient **user service** using explicit executable paths, not
  just an interactive shell. This is not the not-yet-built application service.
- Independently compare decoded counts/rate/channels with FFprobe/decoding, and
  record native FFmpeg build/required filters/encoders and encode/decode/probe
  fixture results. File existence alone is not readiness.
- Analyse the existing retained YuE2 song without generating/replacing it;
  compare sample facts with its prior evidence and inspect estimated beats.
  A synthetic click-track pass does not establish the song's musical accuracy.

## Work checklist and current verification boundary

- [x] Reconcile with approved spec C7/P9 and slice-1 scope.
- [x] Write concrete test fixtures/assertions and identify unimplemented seams.
- [x] Learner reviews the assertions/implementation details above.
- [x] Write the checksum-pinned recipe, read-only-plan installer and CPU helper.
- [x] Run local behavioral tests, diagnose real failures and review corrections.
- [x] Install/verify on Dundee; record service-context, repeat and host observations.
- [x] Run native CPU tests and independently check the retained real song.
- [x] Learner reviews results before the next implementation checkpoint — “looks good, move forward.”

**At the original draft:** no helper or installer existed, so the new behavioral/native
tests have not run. Syntax/discovery checks are not passing behavior; a missing
module is not a useful red-test result. These files are outside the default
Vitest suite, which remains the previously approved 78 cases. No portion of the
12 formal native live cases is marked complete by this draft.

Focused source review caught missing coverage for YuE2's float WAV profile and
input/result collisions; these are now concrete fixtures. It also removed an
unnecessary Python-object-identity requirement: preserving detector samples is
required, reusing the same array object is not. Syntax/collection checks pass;
the existing **78/78 contracts and TypeScript check** were rerun successfully.

## Implementation continuation after approval

The learner approved this batch with “looks good.” The helper/installer are now
implemented. The original nine beat-result and two plan-mode tests pass.
Pre-deployment review found two violations of the existing readiness contract:
a failed host-media recheck could leave an old ready marker, and running the
standalone probe with `-O` could disable its assertions. Two regression methods
first reproduced these failures against the real entrypoints, then passed after
correction. There are now **23 methods: 9 pure + 4 setup + 10 native**.

The missing-FFmpeg regression explicitly intercepts OS/command discovery and
invokes only the installer's bounded preflight, proving that an owned marker is
invalidated while an unowned one is preserved; no environment is installed.
The optimized probe now refuses before creating evidence. Focused review closed
both findings. These are fixes to approved readiness behavior, not new product
requirements or claims of naturally occurring host failures.

The first real isolated installation ran as transient Dundee user service
`studio-analysis-setup-20261022a`, **09:20:54–09:22:19 AEDT**, and exited 0.
Both completed repeats also passed: `20261022b` in 10.981 seconds and the final
installer source check `20261022c` in 11.898 seconds. All 30 versions, imports,
shared FFmpeg/FFprobe checks and synthetic fixtures passed. Each before/after
host-Python snapshot matched. This verified the existing native host package,
not a fresh APT installation, and reused the already owned managed interpreter
to create a genuinely separate analysis venv.

The 10 native methods passed in the actual dedicated interpreter, from another
user service, in 86.851 seconds. All 9 pure/4 setup methods also passed on Dundee.
The existing 78 contracts, typecheck, 34 H3 diagnostics and 5 launcher diagnostics
still pass. Three real installer failure checks used deliberately prepared
unowned/mismatched directories and a corrupt cached interpreter archive: they
failed without readiness or environment creation and preserved the protected
bytes. This is not an observed or injected network outage.

The retained YuE2 song also passed analysis: **1,576,256 samples/channel, 48 kHz
stereo FLOAT, 32.838666… seconds, 65 estimated beat anchors, 119.680851… BPM**.
An independent FFmpeg/stdlib check reproduced every one of its **3,079** waveform
peaks exactly and confirmed its original hash. A focused independent reviewer
corroborated sample/PCM hashes, peaks, version/isolation evidence and test counts.
This does not establish musical beat accuracy, editor integration or completion
of the formal native-generation suite. Full evidence/paths are in the
[slice-1 progress record](slice-1-progress.md).

## Primary references checked for this review

- [Librosa 0.11.0 load](https://librosa.org/doc/0.11.0/generated/librosa.load.html):
  default loading resamples to 22,050 Hz; retaining native rate must be explicit.
- [Librosa 0.11.0 beat tracker](https://librosa.org/doc/0.11.0/generated/librosa.beat.beat_track.html):
  sample units, estimator parameters, one-element tempo arrays and no-onset behavior.
- [Audio frames to samples](https://librosa.org/doc/0.11.0/generated/librosa.frames_to_samples.html):
  analysis-hop frames differ from video frames; asking for samples avoids an
  accidental second hop conversion.
- [Librosa installation](https://librosa.org/doc/0.11.0/install.html):
  PyPI distribution. The product uses its approved isolated install policy,
  not the page's system-wide installation examples.

**Learner checkpoint accepted:** the learner reviewed the reported working result
and asked to move forward. This authorises the partial analysis checkpoint commit;
it does not assert a separate listening review or complete slice 1.
