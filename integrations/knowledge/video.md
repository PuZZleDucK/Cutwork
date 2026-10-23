# H3 video guidance — revision 3

Combine the user's persistent visual style with the individual clip brief.
Use the captured song and interval, not whichever song or timeline gap is now
selected. The agent owns the creative interpretation; the supplied graph/helper
are adaptable tools rather than a required agent response format.

## Native prompting and directing

The task includes the **complete pinned official base guide**, with its source
URL and SHA256, rather than requiring you to find it yourself. It covers T2VA,
I2VA, FL2VA and L2VA. Follow the explicitly selected mode for the actual inputs:

- **T2VA** without a captured image: start with the three base-guide fields.
- **I2VA** with the captured continuation PNG: use the supplied official
  `<Picture 1>` alignment header, then the three fields. Inspect the actual
  image and develop its existing scene forward.
- The current helper exposes only a first frame, not a last-frame or arbitrary
  full-reference input. Audio through `MiniMaxH3AddGuide` does not turn this into
  Ref2VA. Do not describe nonexistent image/video references.

For later reference workflows, the separately installed official full-reference
guide is `references/h3/MiniMax-H3/<pinned revision>/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md`
under STUDIO_DATA_ROOT. Ref2VA uses **six** sections: `subject_definitions`,
`summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`,
`non_diegetic_music`. It is not the three-field base format with extra tags.
FL2VA/L2VA and Ref2VA guidance describes model capabilities, not implemented
Cutwork UI features. Upstream references retain their own licence, not MIT.

Translate the style and brief into a small amount of observable action: a clear
opening composition, an intermediate change/reaction, and a resolved final
state. Concrete action and physical continuity are more useful than a pile of
quality adjectives. Give camera motion a direction, extent and speed when it
helps. One coherent shot is a useful short-clip default, not a ban on cuts.
Use the guide's shot, dialogue, language and sound syntax where relevant; retain
exact user dialogue/text and explicit creative choices. No arbitrary word cap.

Use a few **retained** beat anchors for meaningful gestures, not a dense list of
commands on every beat. Times are local to the captured interval, not song time.
For example, a hand can approach a switch, press on a measured beat, and reveal
a light settling before the last retained frame. With a continuation, preserve
what the supplied image actually shows rather than restarting the establishing
shot. Timing instructions are best-effort model direction, not proof of sync.

The soundtrack is actual captured WAV conditioning. Prompt prose cannot replace
it. Describe compatible ambience/action sounds without gratuitously adding a
competing score. Distinguish diegetic sounds from audience-only music using the
official fields. Normal research, tools and creative interpretation stay available;
this guide does not constrain the agent's final response format.

## Timing and original media

The studio grid is exactly **24 fps**. Use the shared TypeScript `planVideo`
output for placement and conditioning, not a separate agent-written rounding
rule. The current native graph takes 17k+5 frames. For example, a 48-frame
placement uses 56 generated frames. The WAV covers all 56 native frames with
real song samples where available and silence only after the song ends. Keep
the complete generated batch; initial placement still ends at frame 48. The task separates retained beat
anchors from native-tail-only anchors. Finish essential gestures and the intended
ending by the **last retained frame**, not on a beat that exists only in the
extra tail. Use the tail to sustain the resolved state; do not discard those
originals or shorten the audio-conditioning interval.

The project has no blanket four-second minimum or automatic 15-second cap.
Long-duration warnings are advisory; hardware can still fail. A successful short clip does not establish quality at arbitrary lengths.

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

A captured continuation also supplies `firstFrame` with a server-owned PNG path,
SHA256 and decoded RGB pixel SHA256. Use those exact bytes, not an MP4 extraction,
thumbnail, discarded ending or an image invented from a description. The frame
is the clicked edit context's last retained original; the supplied timing is
already captured and can be off-beat or beyond the song. Inspect the image with
your normal image tools to inform the creative prompt. Your usual research,
browsing, scripts and other tools remain available; no JSON response is required.
The helper loads this PNG into `MiniMaxH3ImageToVideo.first_frame`, while the
existing audio guide still conditions the joint AV generation. The model may
reinterpret motion; the reference does not promise an identical first output
frame, a seamless join, or an automatic chain. Preserve image identity in the
brief and describe the intended continuation rather than contradicting the
supplied scene. Do not add image conditioning when no reference was captured.

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
not a VRAM-only recipe or an 8 GB compatibility claim. The helper now accepts the
narrow original-frame continuation input; the recorded fresh-install run also exercised image-plus-audio continuation and
post-song output. These examples do not guarantee seamless joins or quality for
every brief. The standalone helper
is not itself the durable scheduler or job-cancellation API.
