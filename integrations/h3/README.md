# H3 assets and workflow — feasibility work, not a ready generator

The learner approved continuing with the install-on-demand H3 prototype; see
[the decision and public-release boundary](../../devpost/h3-feasibility-review.md).
These files do not establish licence clearance or general 16 GB compatibility.
One short native run has now passed on Dundee with CPU offloading and swap;
its exact evidence and limits are below.

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

**Current checkpoint (22 October):** all six files completed downloading on
Dundee; a separate completed-install invocation rehashed every file successfully
without downloading again (238.36 seconds). The first native GPU probe then
passed; see [the timestamped progress log](../../devpost/slice-1-progress.md)
for its media, memory and cleanup evidence. Model-byte verification and native
execution are separate checks.
Do not launch another installer during owned generation or confuse a running
systemd unit's `Result=success` with a finished operation.

## Workflow and original-frame branch

### Prompt references (24 October update)

The application's H3 setup now also installs `prompt-guides.json`: the complete
official base guide, full-reference guide and upstream licence, **56,930 bytes**
at revision `42ed227ee7df40d41602854ae760620d6eb651fe`. These are runtime downloads
under `references/h3/MiniMax-H3/<revision>/`, not MIT-licensed bundled app text.
Their manifest/ownership is separate from `models.json`, so adding guidance does
not invalidate or download existing weights. For an existing manual installation:

```sh
./scripts/prepare-h3-models.py --prompt-guides --install
```

New studio video tasks inline and hash the complete base guide, with explicit
T2VA/I2VA mode selection and separate retained/tail beat anchors. The full-reference
guide is available for research/future integrations; arbitrary reference and
last-frame workflows are not currently exposed by the studio. Existing task
captures and exact native retries retain their recorded guidance and prompts.
See [the change and verification record](../../devpost/h3-prompt-improvements.md).

### Native graph

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

This H3 graph has source/contract checks and **one executed short model proof**.
It is a helper, not a constraint on creative agents or a requirement that an
agent answer in JSON. The temporary runner below now prepares conditioning
and records owned execution. The durable adapter, native seed replay,
queued/running cancellation and cross-project GPU scheduling remain integration
work; none is certified by the CPU fixture.

## Temporary generation runner

`scripts/h3-proof-request.ts` uses the existing TypeScript timing planner and
fresh-seed allocator; `media.py` performs sample-exact conditioning and output
validation; `generate.py` owns a temporary Comfy service and its evidence.
From the repository root on Dundee, with the pinned Node 24 runtime on PATH:

```sh
# Preparation only: reads/probes the song; exclusively creates a new request.
node scripts/h3-proof-request.ts /absolute/song.wav /absolute/prompt.txt /absolute/new-request.json

# Plan only; no service or generation starts without --run.
python3 -I integrations/h3/generate.py --request /absolute/new-request.json

# Explicit CPU diagnostic: synthetic visuals, real captured song interval.
python3 -I integrations/h3/generate.py --request /absolute/new-request.json --fixture --run
```

Each execution requires a fresh attempt ID/directory. A retry retains the
original seed and captured inputs but uses a new attempt ID; do not overwrite
earlier evidence. Once the six model files and completed installer recheck
have passed, the native command is the same runner with `--run` **without
`--fixture`**. This mode passed the short probe below. The fixture is explicit, never an
automatic fallback for failed model generation.

The first proof accepts native **48 kHz stereo PCM WAV** and records the source
hash and captured copy. It cuts the precise sample interval for all native
frames, pads only past the song end, and supports wholly post-song silence.
Broader imported-audio conversion is not implemented. The request places
48 frames while preserving all 56 generated frames; it does not stretch or
silently place the extra eight frames.

The runner records the exact graph and Comfy prompt ID before polling,
checks history/output identity, hashes and decodes every original PNG, and
validates encoded video and separate lossless audio. Comfy adds an audio-file
fingerprint (`is_changed`) to PNG prompt metadata: the validator checks that
fingerprint against the captured WAV rather than mistaking it for a changed
generation request. This does not relax semantic graph-input equality.

Native H3 audio uses a different grid from video: the pinned decoder produces
`800 * round(nativeFrames * 40 / 24)` samples/channel at **32 kHz**. For
56 frames that is 74,400 samples (2.325 s), not 56/24 s. The full decoded FLAC
is retained; Comfy crops only the mux input when audio exceeds video length.
Validation accounts for that crop and bounded AAC encoder padding separately.
The 56-frame/74,400-sample case now matches real H3 inference; the 22-frame
cropping case remains a diagnostic, not a second native run. No unrecorded
resampling, mixing or mastering is introduced.

Runtime files go under `projects/<projectId>/runs/<attemptId>/` within
`STUDIO_DATA_ROOT` (default: the XDG data directory's `music-video-studio`).
Project workspace, captured request, hashes, service argv, PID/group/start/boot
identity, graph/history, outputs and resource samples are retained. Cleanup
signals only the owned group and keeps its leader unreaped until descendants
are stopped, preventing process-group ID reuse. Unconfirmed cleanup writes a
durable reconciliation marker and blocks another proof. No global Comfy
interrupt or personal-service cleanup is used. The helper lock is **not** the
future application-wide GPU scheduler.

The corrected Dundee CPU run `ed38cdf6-5b3f-4d4e-b450-41c8be60138f` passed:
112,000 samples/channel of the real YuE2 source matched the conditioning WAV
bit-for-bit after float32 decoding, all 56 original frames and encoded media
validated, and the owned service exited. This verifies runner plumbing with
synthetic visuals, not H3 quality, native seeds, GPU memory or cancellation.

## Executed native proof — 22 October 2026

Attempt `4ee70e27-3649-4749-8572-2f8197b9fae4`, Comfy prompt
`973c23ff-2b3f-43f4-b1c8-387346878cca`, succeeded with actual seed
`13039281409138935984` and the real prior YuE2 song interval. Independent checks
confirmed all 56 original PNG file/pixel hashes and order, the VAE-to-PNG/video
branch, 640×480 H.264/yuv420p at exact 24/1 fps and 56/24-second duration, and
74,400 finite/nonzero stereo FLAC samples at 32 kHz. The generated audio is
8⅓ ms shorter than the native video; this is retained and recorded, not hidden
by stretching. First/middle/final frame inspection showed the requested robot
at a synthesizer. Listening, audio-sync quality and motion-quality approval
remain separate from these mechanical checks.

Native prompt execution took 189.455 s; the complete helper took 341.65 s,
including model hashing, startup, validation and shutdown. Of 109 resource
observations, the highest sampled owned-process GPU value was **15,354 MiB**;
process high-water RSS was **12,126,436 KiB**, and sampled process swap peaked
at **2,386,196 KiB**. Sampling can miss brief peaks. The host had approximately
22 GiB RAM and 207 GiB configured swap. This used dynamic VRAM/CPU offloading
and emulated NVFP4, not VRAM-only inference; it is not a minimum-RAM/swap
recommendation or proof of longer-duration/8 GB compatibility.

The service exited 0 after its owned SIGINT, its process/group was subsequently
absent, port 8198 closed, and GPU use returned to 330 MiB including the untouched
personal Comfy process at 234 MiB. This is normal completion/resource release,
not cancellation, same-seed replay, GPU handoff or the full provider-driven
media path. The 12 native-suite cases remain unrun.

## Later provider attempt: completion-observation failure

The 22 October Codex-driven attempt generated new song-conditioned media but
exposed a runner bug: a single ten-second history GET timeout aborts observation
and triggers cleanup, independently of the overall job deadline. Final queue
inspection has the same exposure. The native service had saved 56 originals,
MP4 and FLAC, but no final history was captured; the helper receipt remains
failed. Codex recovered the saved outputs into a separately verified export
without another generation. That recovery does not turn the native attempt
into a clean pass.

The [approved polling repair](../../devpost/h3-polling-test-review.md) now
retries only transient GET observations within the original deadline, including
whole-response decoding, while preserving every read error. It never retries
POST. Nine regression methods pass, and a supervised same-input native replay
completed with final history, exit 0 and identical PNG/MP4/FLAC hashes. No natural
read timeout occurred during that replay; transient recovery is fixture-tested.
The earlier failed receipt remains unchanged. Full evidence and remaining limits
are in [slice 1 progress](../../devpost/slice-1-progress.md).

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
