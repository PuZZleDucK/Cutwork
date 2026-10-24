# YuE2 music guidance — revision 3

Read the supplied user music description and optional lyrics together. Preserve
provided words; when lyrics are absent, use the creative brief to decide whether
to write original lyrics or pursue an instrumental. Explain assumptions in the
record rather than making the user learn synthesizer or arrangement terminology.

## Musical direction and lyrics

Build a coherent sonic brief: singing language, genre/era, vocal character,
groove, tempo, lead instruments, arrangement development and production texture.
Translate references into audible choices rather than only artist names or
quality adjectives. Preserve deliberate genre fusion, unusual meters, accents,
names and the user's specific choices; these are defaults for filling gaps,
not a restrictive tag vocabulary. Record assumptions rather than inventing
measurements or promising exact BPM, singer identity or duration.

Keep this direction in `style`. In `lyrics`, use standard section tags such as
`[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`, with blank lines between sections.
Do not put instrumental/production instructions into the sung words. Preserve
supplied lyrics and language; do not silently rewrite, translate or add verses.
When writing original lyrics, use singable phrases, a clear hook, breathing
space and deliberate repetition. Match verbal stress and phrase length to the
musical idea rather than forcing a fixed line count or seconds-per-section rule.
A short brief deserves a compact structure and an ending, not a full-length
song cut off by a tiny token budget. Longer structure and phrasing influence
length but do not enforce exact time.

Example translation (illustrative, not a mandatory preset): for French-house
textures with dubstep rhythm and English programming lyrics, describe filtered
disco chords, a syncopated bass figure, half-time snare placement and a vocoded
English hook. Keep those notes in style; write only the intended programming
lyric lines under section tags. Do not add a second language merely because
"French" described the musical tradition.

## Choose the actual native planning mode

- `cot="full"`: YuE2 plans melody and chords; a sensible ordinary-song starting point.
- `cot="melody"`: melody planning with freer accompaniment. A supplied ABC must
  already be chord-free; this mode does not strip chords or repair a score.
- `cot="off"`: no symbolic plan; omit ABC. This is not a guarantee of better
  audio, shorter runtime or successful instrumental output.
- A supplied ABC with `full` or `melody` bypasses the planner. Edit a copy, retain
  the original and document intended invariants; changed music needs a fresh
  semantic/synthesis pass, not reuse of the old latent audio.

The native request has no `negative_prompt`, `reference_audio`, separate `bpm`
or forced phoneme-alignment field. A melody cover from audio needs transcription
first; Cutwork does not install SheetSage2 for ordinary song generation. Its
normal tools, research and script/score-editing capabilities remain available.
These are native tool contracts, not restrictions on the agent's response.

## Score editing and instrumental requests

Use the pinned native ABC reference below, not arbitrary ABC syntax. Retain the
score's `Vocal` and `Ins` voices, actual `L:` grid, meter/key, timing and section
boundaries; both melodic parts are monophonic. Check bar totals, ties, accidentals
and any requested melodic invariants. Keep pronunciation or syllable alignment
notes outside the model score; symbolic fit is not proof of sung alignment.

For an instrumental, empty lyrics or "no vocals" in style is insufficient.
The official method moves Vocal note events into Ins, leaves rests/chords in
Vocal, and resolves overlaps without breaking the two-voice time grid. Merely
renaming the voice does not perform that conversion. Preserve the source and
converted scores and validate the transfer before generating from the revised
ABC. The stock Cutwork helper has **no automatic conversion hook** between
planning and synthesis. Do not claim that conversion occurred unless an actual
adapted/staged workflow and its evidence exist. Any adaptation must retain the
assigned seeds, queue/process tracking and original outputs; the supplied tools
are adaptable, not a sandbox. Listening is still needed to assess vocal leakage.

## Sampling, length and completion

Prefer the installed native defaults as a baseline, not unrelated ComfyUI node
settings. Native `cfg_scale` defaults to 1.0 with planning and 1.01 with `off`;
higher guidance is an experiment, not an automatic quality upgrade. The installed
request validates CFG in [0,20], unlike some ComfyUI interfaces. Record deliberate
sampling changes and inspect the effective configuration.

`sampling.abc.max_tokens` and `sampling.semantic.max_tokens` are ceilings. The
500-token feasibility probe is **not a duration control**. Leave room for the
score, lyrics and generated tokens within the actual model context; inspect both
ABC and semantic truncation flags and whether the song resolves naturally.
Do not copy a ComfyUI `Max Duration`/seconds parameter into this native request.
If the brief cannot fit, report the limitation instead of silently deleting user
lyrics, shortening the composition, hiding a cut with mastering, or launching
unrequested expensive retries.

## Sources and evidence boundaries

Research checked 24 October 2026 against the installed YuE2 0.1.6 source revision
`1647252d68b70cbead046ffd3f7caf036dde47ee`:
- [Official generation guide](https://github.com/multimodal-art-projection/YuE/blob/1647252d68b70cbead046ffd3f7caf036dde47ee/docs/generation.md)
- [Native modes, parameters and defaults](https://github.com/multimodal-art-projection/YuE/blob/1647252d68b70cbead046ffd3f7caf036dde47ee/skills/yue2-music/references/generation-and-covers.md)
- [Native ABC and lyric alignment](https://github.com/multimodal-art-projection/YuE/blob/1647252d68b70cbead046ffd3f7caf036dde47ee/skills/yue2-music/references/abc-editing.md)
- [Official instrumental conversion](https://github.com/multimodal-art-projection/YuE/blob/1647252d68b70cbead046ffd3f7caf036dde47ee/skills/yue2-music/instrumental/SKILL.md)
- [Comfy-Org guide](https://github.com/Comfy-Org/docs/blob/main/tutorials/audio/yue2/yue2.mdx): different integration, not our request schema.

Community corroboration: [a wrapper author's prompting heuristics](https://github.com/EmeraldApple-AI/ComfyUI-YuE2/blob/main/prompts/yue2_prompt_generator.txt)
and [first-hand instrumental reports](https://www.reddit.com/r/YueMusicAI/comments/1ws18tf/creating_music_without_vocals/).
Treat these as observations, not universal parameter recipes. Do not adopt
fixed section-duration promises, arbitrary genre/word limits, or a prescribed
agent answer format. This product-owned synthesis does not vendor the upstream
skill or claim a controlled improvement in listening quality.

## Current helper contract

Use the isolated interpreter at
`<data-root>/tools/yue2/venv/bin/python` and the product integration source:

```sh
<yue-python> -I -u <integration-root>/integrations/yue2/generate.py \
  --request <captured-request.json> --result <new-attempt>/receipt.json
```

The request contains `schemaVersion: 1`, `attemptId`, native `parameters`, and
`seeds`. With generated full planning, seed keys are `abc`, `semantic`, `nar`;
with a provided score or planning off, only `semantic`, `nar`. Each is a
distinct canonical decimal string in [0, 2^63). Do not also put `seed` inside
`parameters`. The task supplies the allocated seeds; the helper does not invent
them. Optional `sampling` and `execution` settings are recorded separately.

The verified execution uses CUDA, 16 GiB memory budget, AR offloading, torch
backend, no quantization and a 256-frame VAE chunk. This is one observed
configuration, not a guarantee for arbitrary lengths. Do not reinstall or
change model versions as part of ordinary generation.

The helper saves per-stage input copies, score, tokens, latents, effective
settings and original **48 kHz stereo float WAV**. It deliberately preserves
separate actual stage seeds rather than pretending one seed describes all
stochastic calls. Inspect `state`, each call, `truncated` and output artifacts.
The prior approximately 20-second sample reached its 500-token semantic ceiling:
playable output was not a finished-song claim. Avoid copying that probe ceiling
as a production duration control. A duration wish in the brief is not an exact
duration promise from the generator.

Keep unprocessed source audio. No hidden fade, normalization, mastering or
compression should disguise truncation. Check audio decoding, sample counts
and hashes, then listen when a listening tool is available; otherwise explicitly
leave quality/listening unverified. Await process exit and resource release
before H3. A printed receipt path alone does not establish those observations.

## Analyse the retained audio without changing it

The server normally analyses the accepted original audio automatically; do not
duplicate that work merely to complete generation. For a requested independent
analysis, the separate CPU environment is `<data-root>/tools/audio-analysis/venv/`.
Use its Python with `-I <integration-root>/integrations/analysis/analyze.py
--request <analysis-request.json> --result <new-analysis-receipt.json>`; the full
request/receipt contract is in `integrations/analysis/README.md`. Retain a new
attempt UUID, actual source hash, versions/settings and receipt in this project's
workspace. Analysis has no stochastic generation seed and does not replace the
song or its generation seeds. These are supplied tools, not restrictions on
normal research, scripts or creative decisions.

Beat positions are estimated **source sample indices**, stored as integer
strings alongside sample rate, not 24 fps video frames. Do not use the
tracker's initial 120 BPM estimate as a detected/fallback tempo. A `partial`
receipt preserves usable audio/waveform facts while reporting unavailable beats;
it is not a reason to regenerate, trim or retime the user's music. Later editor
placement uses the captured analysis version, not whichever new analysis is
currently available. Musical accuracy still needs judgement; successful decoding
and monotonic anchors do not prove every musical beat was detected correctly.
