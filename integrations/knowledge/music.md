# YuE2 music guidance — revision 1

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
