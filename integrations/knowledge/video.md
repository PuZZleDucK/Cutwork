# H3 video guidance — revision 1

Combine the user's persistent visual style with the individual clip brief.
Use the captured song and interval, not whichever song or timeline gap is now
selected. The agent owns the creative interpretation; the supplied graph/helper
are adaptable tools rather than a required agent response format.

## Native prompting reference

For the text-led base model, the official
[base prompting guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
organizes prompt text into `integrated_multimodal_description`,
`overall_soundscape`, and `non_diegetic_music`. Use `[Shot 1]` to establish the
scene, visible action and camera movement. Later shots may have increasing cut
timestamps. Describe camera movement concretely, with speed/range where useful.
For dialogue, consult the guide's speaker and language-markup rules; do not
invent special tokens or rewrite user-provided speech. Image-reference tasks
have additional alignment instructions and require real supplied images.

For this project's short music-led clips, a single coherent shot is a useful
starting point. Preserve the requested music rather than gratuitously adding a
competing score. Prompt prose does not supply audio: the workflow's actual
captured WAV is the conditioning source. Nor does a prompt guarantee exact beat
events. If an analysed beat map is supplied, express event times relative to
the captured clip start; do not invent beat measurements from a style label.

## Timing and original media

The studio grid is exactly **24 fps**. Use the shared TypeScript `planVideo`
output for placement and conditioning, not a separate agent-written rounding
rule. The current native graph takes 17k+5 frames. For example, a 48-frame
placement uses 56 generated frames. The WAV covers all 56 native frames with
real song samples where available and silence only after the song ends. Keep
the complete generated batch; initial placement still ends at frame 48.

The project has no blanket four-second minimum or automatic 15-second cap.
Long-duration warnings are advisory; hardware can still fail. The successful
short proof does not establish longer clips, continuation or post-song quality.

The reviewed graph connects song conditioning to the guider, not in place of
the joint AV latent. It branches the same decoded IMAGE batch to PNG and video
outputs. Preserve **all original 8-bit RGB PNGs**; extracting frames from MP4
would add encoding loss and cannot replace the originals. Native H3 audio is
retained separately at 32 kHz; its sample grid can differ slightly from video
duration. Do not silently time-stretch it to conceal that difference.

## Current helper and limits

`integrations/h3/generate.py --request <captured-request.json>` prints a plan;
add `--run` to execute. `--fixture` explicitly means synthetic CPU visuals and
must never be presented as a native generation. The request has `schemaVersion`,
canonical UUID `attemptId`, `projectId`, source-song path/hash, shared `plan`,
exact decimal-string `seed` in [0, 2^64), and final tool `prompt` text.

The standalone `scripts/h3-proof-request.ts` convenience script is deliberately
limited to a fresh two-second request in `native-h3-proof`. It allocates its own
seed; it is **not** a general project/request builder and should not overwrite
the seed or project captured by a future provider launcher. Use the shared
planner with the actual assigned context when constructing that integration.

The helper uses the installed isolated Comfy environment, captures the input
WAV, graph, prompt ID, actual seed, output manifests and resources, and stops
only its owned temporary service. It rejects reused attempt directories. Read
the resulting state and independently inspect media; process/job evidence is
required in addition to an agent's success report.

Measured baseline: 640×480, 24 fps, 56 frames, 20 steps, `res_multistep` with
`simple`, w6a8 diffusion / NVFP4 text encoder / INT8 video VAE / FP32 audio VAE.
The RTX 4060 Ti run used CPU offloading, emulated NVFP4 and process swap. It is
not a VRAM-only recipe or an 8 GB compatibility claim. No image-input controls,
durable scheduler or job-cancellation API are exposed by this proof helper yet.
