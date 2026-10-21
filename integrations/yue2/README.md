# YuE2 dependency recipe — slice 1

This directory contains **dependency/model preparation and an initial direct generation proof**, not a working music setup panel or complete generation/recovery integration. On Dundee, installation, a repeat invocation, `pip check`, imports and transient user-service imports passed; host-Python observations matched. Separate model installation/recheck and a short native generation with distinct stage seeds passed on the 16 GB Dundee GPU. Native cancellation, replay, full orchestration and broader memory/duration behavior remain separate gates.

## Install boundary

```sh
./scripts/prepare-yue2.sh             # plan only
./scripts/prepare-yue2.sh --install   # Ubuntu 26.04 x86_64 only
```

The explicit install uses the studio data root (default `~/.local/share/music-video-studio`):

- A checksum-pinned standalone CPython under `tools/runtime/`; no host/default Python replacement.
- A separately marked `tools/yue2/venv/`, with system-site-packages disabled.
- Exact, hashed dependency distributions from public PyPI and an explicit official PyTorch CUDA 12.8 wheel. No optional vLLM extra or copied personal CUDA wheel.
- YuE2 source from the pinned official GitHub revision, built locally with pinned build tools and a fixed source-date epoch. Source SHA256 is a locally recorded checksum of that official archive, not an upstream signature.
- Only explicit `<venv>/bin/python -I -m pip` calls. Installer-scoped `PIP_CONFIG_FILE=/dev/null` plus `--isolated` prevents inherited pip configuration from redirecting installation; agent configuration/capabilities are not changed.
- `setup-jobs/yue2-dependencies.*/` retains logs, recipe/lock, wheel hash, imports, exit code and before/after host-Python observations. The observation comparison is not a full filesystem audit.

No APT, driver, model, service or GPU inference changes. Existing personal YuE2/Comfy installations are untouched. A marked partial venv can be recreated in place on retry; unmarked/different-recipe environments are refused. A partial prerequisite install is not reported as generation-ready. Downloads/caches can consume substantial disk; the 30 GiB preflight floor applies to this dependency step only, not all product models.

## Pin rationale and provenance

Python 3.10.19 and the CUDA 12.8 backend reproduce the previously observed prototype baseline, **not** a claim that the whole current native stack has been validated. Assess interpreter/dependency support lifecycle before release. The application still needs a separate Comfy environment and a separate audio-analysis environment.

- [Pinned YuE2 source](https://github.com/multimodal-art-projection/YuE/tree/1647252d68b70cbead046ffd3f7caf036dde47ee) defines the core package dependencies.
- [Astral's pinned interpreter metadata](https://github.com/astral-sh/uv/blob/0.12.21/crates/uv-python/download-metadata.json) supplies the standalone interpreter URL/build/checksum. Managed Python is separate from system Python; see [uv's Python documentation](https://docs.astral.sh/uv/concepts/python-versions/).
- The [official PyTorch CUDA 12.8 index](https://download.pytorch.org/whl/cu128/torch/) supplies the CPython 3.10 Linux wheel URL and hash. An explicit backend avoids an unintended CPU/different-CUDA build; see [uv's PyTorch guidance](https://docs.astral.sh/uv/guides/integration/pytorch/).

Code, dependency and model licences are distinct. Upstream notices are retained in the source/wheel; this recipe is not legal clearance for distribution or a claim about generated-output rights.

## Rebuild the dependency lock deliberately

The lock was resolved with checksum-verified **uv 0.12.21** (a development tool, not required by the installer). The installer consumes the lock rather than resolving current latest dependencies again:

```sh
lock_stage="$(mktemp -d)"
uv --no-config pip compile integrations/yue2/requirements.in \
  --python-version 3.10.19 --python-platform x86_64-unknown-linux-gnu \
  --generate-hashes --no-build --emit-index-url --emit-index-annotation \
  --no-header --no-python-downloads -o "$lock_stage/requirements.lock"
diff -u integrations/yue2/requirements.lock "$lock_stage/requirements.lock"
# Review before explicitly replacing the committed candidate lock.
```

Re-resolution can change transitive packages: review that diff and repeat the native checks. A changed recipe/lock deliberately does not overwrite an existing marked installation silently.

**Observed installer failure and correction:** the first attempt rejected Triton 3.6.0 because the existing output lock retained hashes from an earlier PyTorch-index resolution, while installation used PyPI. The [PyTorch index](https://download.pytorch.org/whl/triton/) and [PyPI metadata](https://pypi.org/pypi/triton/3.6.0/json) identify different wheel hashes for the same version/platform. A fresh output lock agreed with independently fetched PyPI metadata for all 50 PyPI packages; the explicit torch wheel stayed pinned to its official URL/hash. The original failed attempt and environment were retained, not silently overwritten, and hash enforcement stayed enabled. Resolve into a fresh output when changing index provenance; do not merely add whatever hash an error reports.

Current recheck limitation: the direct-URL PyTorch requirement can download the large wheel again even when installed. Successful repeat execution proves consistent versions/build output, not minimal network use. A separate lightweight readiness check and improved download reuse belong in the setup integration.

## Separate pinned model preparation

```sh
/usr/bin/python3 -I scripts/prepare-yue2-models.py           # plan only
/usr/bin/python3 -I scripts/prepare-yue2-models.py --install # explicit download/check
```

[`models.json`](models.json) allowlists **21 files / 7,794,656,016 bytes** from immutable revisions of the [official model](https://huggingface.co/m-a-p/YuE2-3B/tree/8f24312f187763b9854adeec87e437e2b03bbff1) and [official VAE](https://huggingface.co/m-a-p/YuE2-Vae/tree/152733a19ad43aa67e367f9b5503ef8075bb5126). Weight hashes come from upstream LFS metadata; smaller files were independently hashed and checked against the pinned upstream Git blob IDs. It retains model licences/notices and skips example media and bundled older wheels. Model licence identifiers are recorded separately from package licences; this is not a commercial-use or output-rights clearance.

The downloader uses public HTTPS without accessing Hugging Face credentials, verifies size and SHA256 before promoting each `.part`, and records an attempt under `setup-jobs/yue2-models.*/`. It only reuses matching, marked model directories. Complete corrupt partials are retained with the failed/repair attempt instead of being endlessly resumed; shorter partial downloads can resume. Changed installed files are refused and retained for investigation. The free-space calculation includes remaining download bytes plus a 2 GiB reserve, not already downloaded partial bytes. A successful recheck hashes existing files without downloading them again. Setup completion here means verified model bytes, not working inference.

## Staged native helper — integration proof in progress

```sh
<data-root>/tools/yue2/venv/bin/python -I -u \
  integrations/yue2/generate.py --request <request.json> --result <new-attempt>/receipt.json
```

The helper accepts a version-1 request with `attemptId`, native `parameters` (style, lyrics, optional score/COT controls), a decimal-string `seeds` map, optional `sampling` overrides and optional native `execution` settings. It does not assign new seeds itself: the caller uses the application seed allocator for a fresh request and preserves assigned seeds for recovery. Stochastic stages are `abc`, `semantic`, and `nar`; provided-score/COT-off requests omit the unused `abc` seed. Deterministic decoding has no seed.

YuE2's ordinary combined call reuses its request seed across stages. This helper instead uses its staged API and separate dataclass copies of each request/plan, preserving the original score/tokens while passing the recorded seed to each stochastic stage. It saves each stage's inputs before calling the native API and retains the generated score, exact semantic tokens, latents, effective configuration and original floating-point WAV. It does not use the combined upstream result saver, which would incorrectly describe this multi-seed run as a single-seed request. There is no product fade, normalization or mastering; upstream decoding's own sample clamping remains upstream behavior.

The receipt records supplied seeds and stage outcomes, model/helper identities, process PID/group/start/boot identity, elapsed times, peak Torch allocation/reservation, process high-water RSS and output hashes. An interrupted receipt is **not** proof that the process exited or released the GPU. Parent observation and durable scheduling/cancellation remain outstanding. A requested token range is an explicit generation setting, not an exact song-duration guarantee; truncation is retained. Helpers are optional agent tools, not restrictions on normal agent tools, configuration, scripts or response format.

Development diagnostics have used tiny synthetic files/fake pipelines for installer recovery and seed handoff checks. Those checks are not real-model compatibility or audio-quality proof, and are not additional cases in the 78-test approved local suite. The first live generation is recorded in [slice-1 progress](../../devpost/slice-1-progress.md): approximately 20 seconds, 48 kHz stereo, decoded/hash-checked, with semantic truncation at the probe token ceiling; the complete native suite remains unrun.
