# CPU audio analysis

This is the slice-1 integration helper, not a running studio UI or durable job
service. It never generates, edits, normalises or replaces the source song.

## Setup

From the reviewed source checkout on Ubuntu 26.04 x86_64:

```bash
export STUDIO_DATA_ROOT="$HOME/.local/share/music-video-studio"
bash scripts/prepare-analysis.sh           # plan only; does not create the root
bash scripts/prepare-analysis.sh --install # explicit install + real CPU checks
```

The installer uses the checksum-pinned managed Python build from `recipe.json`,
with a **separate** `tools/audio-analysis/venv`. It can reuse the managed base
interpreter also used to create Comfy's venv; it does not reuse Comfy's packages.
No global pip, system-site packages, APT, driver changes or GPU work is involved.
Missing native prerequisites belong to the explicit host setup step, not an
unannounced package-manager command. Requirements resolve from official PyPI and
install with exact versions, required hashes and binary wheels only.

Every invocation records a unique `setup-jobs/analysis.*/` log, input recipe/lock,
helper/probe source and before/after host-Python observations. Completed repeats
check actual pins/imports and rerun synthetic analysis/native media checks, rather
than assuming a marker or existing executable proves readiness. Failed evidence
is retained. The marker is only the last successful setup observation; consumers
must check current command results and recheck dependencies, not trust it forever.

`probe.py` is an actual installation check, not a mock: isolated imports and
`pip check`, shared `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` build/package ownership,
required encoders/filters, a synthetic H.264/AAC encode/decode/probe and a real
Librosa click-track analysis. A synthetic pass does not prove musical accuracy.
The same probe must also run in a transient user service on Dundee; interactive
shell success does not establish the later application's service environment.

## Analyse a captured song

Write a new request JSON, using the actual SHA-256 of the intended source:

```json
{
  "schemaVersion": 1,
  "attemptId": "00000000-0000-4000-8000-000000000001",
  "source": {"path": "/absolute/path/to/song.wav", "sha256": "<actual SHA-256>"},
  "waveformBucketSamples": 512
}
```

Use a unique attempt UUID and result filename for each actual invocation:

```bash
"$STUDIO_DATA_ROOT/tools/audio-analysis/venv/bin/python" -I \
  integrations/analysis/analyze.py --request /path/to/request.json \
  --result /path/to/new-receipt.json
```

The result directory must already exist. Existing result files, including dangling
symlinks, are refused. JSON is published atomically without replacing an existing
path. Reading/decoding uses a single immutable byte capture; the receipt's source
hash cannot drift away from the bytes analysed. The source and request are read
only by this helper; that is not a restriction on creative agents.

The decoder preserves the source rate, channels and complete decoded sample count.
Waveform buckets are max-absolute peaks across **all** channels, including the
last shorter bucket; finite floating amplitudes above 1 are not clipped. Beat
detection uses a derived arithmetic-mean mono signal at the native rate. Opposite
phase can cancel in that signal; waveform and source remain available. Invalid
non-finite PCM is rejected, not silently repaired.

The tracker receives explicit sample units and records every chosen setting.
Its 120 BPM initial estimate is not a fallback output. A valid map needs at least
two ordered, in-range anchors and a finite positive estimated tempo. Missing or
invalid estimates remain unavailable with a diagnostic; no zero beat is invented.
Native analysis windows are unrelated to the project's 24 fps video frames.

| Receipt | Exit | Meaning |
|---|---|---|
| `succeeded` | 0 | Audio facts/waveform and usable estimated beat map |
| `partial` | 0 | Audio facts/waveform retained; beats unavailable with a reason |
| `failed` | 1 | Source, decode, dependency or worker error |

Malformed requests and result-path/publication failures also exit nonzero and
report stderr; they may not have a writable new receipt. Callers must observe
both process outcome and receipt state. `partial` does not count as a passed
rhythmic setup fixture or make the generated song itself a failed generation.

Integer sample counts/positions and rational duration fields are JSON strings.
Tempo and amplitudes are numeric estimates. Version/hash/settings identify this
analysis; a new run never overwrites an older receipt. Selecting versioned beat
maps, extrapolation, exact editor timing and preserving saved arrangements belong
to later application slices, not this helper.

## Tests and evidence

The learner-approved assertions and their boundaries are in
[`devpost/analysis-test-review.md`](../../devpost/analysis-test-review.md).

```bash
python3 -m unittest discover -s tests/diagnostics -p test_analysis_contract.py -v
python3 -m unittest discover -s tests/diagnostics -p test_analysis_setup.py -v
# Explicit opt-in; requires installation. No providers or GPU work:
"$STUDIO_DATA_ROOT/tools/audio-analysis/venv/bin/python" -I \
  tests/diagnostics/test_analysis_native.py -v
```

The native suite uses real Librosa on **synthetic** PCM16/float32/click/silence
fixtures. It must not be substituted for listening to the actual retained song
or checking its detected beats. Full installation of the product, durable setup
progress and the formal native-generation suite are separate gates.
