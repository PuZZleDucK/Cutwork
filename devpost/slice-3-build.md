# Slice 3 — Browser clips, sequence and export

Status: mechanically verified, integrated learner feedback pending, fast mode. Slice 2 and the early UI feedback checkpoint were
accepted with “great, perfect” on 23 October 2026. No new product decisions are
required for this approved slice.

## Implementation / verification checklist

- [x] Capture video requests against a particular song, with visual style, prompt,
  interval, provider and seeds; persist placeholders and reservations.
- [x] Generate through the proven owned H3 pipeline; retain and independently
  validate complete PNG batch, native overshoot, audio conditioning and provenance.
- [x] Maintain each song's arrangement, once-only submitted-location placement,
  basic remove/place/move controls and exact coverage/gaps.
- [x] Share exact rational beat-map/preset logic; count pending reservations for
  suggestions, never coverage. Keep warnings advisory and post-song extension.
- [x] Render immutable arrangement revisions from originals, black gaps and song
  audio; verify output, show stale previews, disallow stale current export.
- [x] Add browser clip form, persistent video-only style, timeline and library,
  generation history and preview/download controls with honest readiness/status.
- [x] Run focused and full tests/typecheck/build. Run real browser generation of
  approximately three clips, probe/decode export and inspect real playback.
- [x] Record actual live evidence, unchanged personal services and any limits.
- [x] Save the mechanically verified implementation checkpoint in git.
- [ ] Integrated creative-loop learner check; mark slice complete after feedback.

Richer precision editing/audio overrides, continuation, recovery and lifecycle
remain slices 5–8, rather than disabled controls pretending to implement them.
Source previews and the UI remain usable while the one-at-a-time CPU render runs.
Actual model runs are distinct from deterministic synthetic media fixtures.

## Tests first

Shared timing tests start with the missing-module red state, then exercise eight
constant-tempo thresholds, irregular/leading-offset beats, missing analysis,
reservations, earliest residual gaps, exact sample-end coverage and independent
post-song/duration warnings. Renderer tests use explicitly synthetic numbered
frames/audio, not claims about native H3 output. Store/API/task tests independently
cover transaction/capture/ownership and stale-render boundaries.

## Mechanical and live result

See [slice-3-live-evidence.md](slice-3-live-evidence.md) for exact checks,
failures/corrections, native media and honest boundaries. Highlights:

- **846 tests / 43 files**, typecheck and build pass locally and on Dundee.
- Three actual browser H3 requests succeeded; 168 original frames retained,
  144 placed frames and 1,862 exact black frames verified independently.
- Original-song AAC packet/timing comparison, complete A/V decoding, actual
  browser playback/download and headless VLC-to-EOF passed.
- A real edit during rendering left the older output stale and download-blocked.
- Existing five user songs preserved (57/57 checks); full test-project snapshot
  unchanged across the final idle restart; TTS restored, personal Comfy untouched.
- Integrated learner check remains: make clips, leave a gap, preview/download,
  play normally in VLC and report what felt wrong or interrupted creative intent.

The generated song exceeded its requested duration. The test sequence covers
only 7.2% of it intentionally; this is pipeline evidence, not a completed artistic
music video or proof of longer H3 workload capacity.
