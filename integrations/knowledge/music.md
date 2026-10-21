# YuE2 music guidance — revision 2

Read the supplied user music description and optional lyrics together. Preserve
provided words; when lyrics are absent, use the creative brief to decide whether
to write original lyrics or pursue an instrumental. Explain assumptions in the
record rather than making the user learn synthesizer or arrangement terminology.

## Turning musical intent into native input

Put sonic direction—genre, instrumentation, rhythmic feel, voice, language and
tempo—in `style`; keep singable words and section labels in `lyrics`. The native
`cot="full"` mode plans melody and harmony; `melody` and `off` are alternatives.
An explicit `abc` supplies a composition instead. Use the native score dialect,
not an assumed arbitrary ABC variant. Consult the pinned
[generation guide](https://github.com/multimodal-art-projection/YuE/blob/1647252d68b70cbead046ffd3f7caf036dde47ee/docs/generation.md)
when editing or restoring a plan.

Our first supported proof uses the model's score-planning path. Instrumental
score conversion has not been integrated; an empty lyric string is not proof
of instrumental behavior. The upstream
[music skill](https://github.com/multimodal-art-projection/YuE/tree/1647252d68b70cbead046ffd3f7caf036dde47ee/skills/yue2-music)
is a research reference, not an automatically installed or validated product
dependency. No transcription model is required or installed for this proof.

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

The separate CPU environment is `<data-root>/tools/audio-analysis/venv/`.
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
