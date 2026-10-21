# H3 assets and workflow — feasibility work, not a ready generator

The learner approved continuing with the install-on-demand H3 prototype; see
[the decision and public-release boundary](../../devpost/h3-feasibility-review.md).
These files do not establish licence clearance or a working 16 GB recipe.

## Pinned assets

`models.json` records six files totalling **35,087,235,076 bytes**: the four
selected weight files, their model card and the upstream licence. Weights are
pinned to `Comfy-Org/MiniMax-H3` revision
`e5eb578a89295337b8ff433a035929ce0279e0b6`; the notice is pinned separately to
`MiniMaxAI/MiniMax-H3` revision `42ed227ee7df40d41602854ae760620d6eb651fe`.

Selection: pruned fl2va **w6a8**, **nvfp4** text encoder, **int8** video VAE and
**fp32** audio VAE. No turbo adapter or optional model collection is included.
This is disk size, not a VRAM requirement or proof of offloading feasibility.

```sh
./scripts/prepare-h3-models.py            # inspect plan; no writes or downloads
./scripts/prepare-h3-models.py --install  # explicit download/verification
```

The installer uses stdlib Python and curl, public pinned URLs and SHA-256
verification. It does not sign in, install Python packages, start inference or
modify personal tool installations. `STUDIO_DATA_ROOT` is the same absolute
product data root used by the other installers.

Managed files go under `models/h3/MiniMax-H3/<revision>/`, with an ownership
marker and an installation lock. Partial downloads resume; incomplete bytes
are never promoted to model files. Corrupt completed partials are retained in
the failed attempt's evidence, not silently accepted. Existing changed final
files are refused. Space accounting includes remaining bytes plus a 2 GiB
reserve. A repeated successful invocation rehashes files without downloading
them again. Receipts/logs live in `setup-jobs/h3-models.*/`.

**Current checkpoint:** the real Dundee download is still in progress. Only
the small model card has completed verification; no weight loading or H3
inference has passed. See [the timestamped progress log](../../devpost/slice-1-progress.md)
for the active unit and exact continuation point. Do not launch another
installer while its lock is held, or confuse systemd's current `Result=success`
with a finished installation: require the receipt's `state: succeeded`.

## Workflow and original-frame branch

`workflow.py` builds the API graph for the pinned ComfyUI revision. It accepts
the **native** frame count supplied by the existing TypeScript timing planner;
it does not duplicate beat/placement arithmetic. The first real request is
planned as a two-second placement, rounded up to **56 native frames** at
**24 fps**, **640×480**, 20 steps, `res_multistep` / `simple`.

The song interval enters `LoadAudio → MiniMaxH3AddGuide → BasicGuider`.
`AddGuide` returns conditioning, not a replacement latent. The original joint
audio/video latent goes to the sampler. Seeds enter the helper as exact decimal
strings and become Python integers for native JSON; do not round these through
a JavaScript `Number`.

The decoded image batch branches to both `SaveImage` and `CreateVideo`.
`SaveImage` retains all pre-encode **8-bit PNGs**, including native overshoot;
this is not preservation of floating-point VAE tensors. Video encoding uses
the pinned dynamic-input API for MP4/H.264, CRF 18, sRGB, 8-bit. Audio is also
saved to FLAC. Native H3 audio is expected at the VAE's 32 kHz rate; preserving
that source is separate from the final renderer's recorded resampling to the
accepted 48 kHz working/export rate. No mastering or extra loudness processing
has been added; upstream audio decoding itself can attenuate samples.

This H3 graph has source/contract checks, **not an executed model proof yet**.
It is a helper, not a constraint on creative agents or a requirement that an
agent answer in JSON. The durable adapter, conditioned-audio preparation,
actual seed capture/replay, ownership/cancellation and GPU scheduling remain
integration work.

## Executed synthetic output proof

```sh
python3 -m unittest discover -s tests/diagnostics -p 'test_h3_workflow.py' -v
./scripts/probe-comfyui-nodes.py --verify-output        # plan only
./scripts/probe-comfyui-nodes.py --run --verify-output  # temporary CPU service
```

The opt-in probe uses **56 deliberately synthetic, widely separated solid
colours** and a known stereo tone, with no model nodes. It uses the very same
output branch as the H3 graph. On Dundee the corrected probe passed:

- Every pixel and the order of all 56 original RGB PNGs, plus file/pixel hashes.
- H.264/yuv420p at 640×480 and exact 24/1 fps, 56 frames and duration 56/24 seconds.
- Independently decoded video order; distinct colours cannot alias within the
  lossy codec tolerance. AAC at 48 kHz stereo is checked for this fixture.
- FLAC decoding reproduces all **112,000 samples/channel** of fixture PCM exactly.
- Submitted graph equals recorded history; prompt ID is captured before
  polling; the prompt leaves the queue; the owned CPU service exits cleanly.

The native sources and synthetic sources differ. Passing this probe proves
the **output branch**, not H3 decoding, model quality, 16 GB compatibility,
native audio rate/count, seed replay, job cancellation or the complete agent
media chain. It does not pass any of the 12 formal native live cases by itself.
