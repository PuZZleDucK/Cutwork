# YuE2 dependency recipe — slice 1

This is a **dependency/import proof**, not a working music setup panel or verified 16 GB generation recipe. On Dundee, installation, a repeat invocation, `pip check`, imports and transient user-service imports passed; host-Python observations matched. Model downloads, actual stage seeds, native cancellation, memory measurements and generated audio remain separate gates.

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
