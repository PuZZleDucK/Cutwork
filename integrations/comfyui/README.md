# Isolated ComfyUI/H3 preparation

This is a slice-1 developer prerequisite, **not the finished setup UI or a proven
H3 generation recipe**. The learner's decision to proceed with H3 is recorded in
[the feasibility review](../../devpost/h3-feasibility-review.md). Application,
tool, model and output terms remain separate; an installer does not itself
establish public-release compliance.

## What is pinned

- ComfyUI **0.42.0**, source revision
  `f5c611e3849ff7219dfb7d7b251092ab8a9b51dc`.
- Managed CPython **3.12.14**, standalone build **20260929**. This does not
  replace the host interpreter or YuE2's separate Python 3.10 environment.
- PyTorch **2.13.0+cu130**, torchvision **0.28.0+cu130**. The latter's official
  wheel metadata requires torch 2.13.0; both wheel URLs and hashes are pinned.
- The full upstream dependency list, including frontend/templates, is retained.
  Transformers is deliberately pinned at **4.57.6**, satisfying upstream's
  minimum and providing the Qwen tokenizer used by Comfy's own text-encoder
  implementation. Native inference compatibility still needs execution proof.
- `requirements.lock` records 92 package versions and distribution hashes.
  The 90 PyPI package hash sets were checked against official release metadata;
  torch/torchvision hashes match the official wheel index. No alternate index
  is used for unrelated packages.

Primary sources: [pinned ComfyUI requirements](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/requirements.txt),
[official isolation/GPU installation guidance](https://docs.comfy.org/installation/manual_install),
[PyTorch CUDA 13.0 wheel index](https://download.pytorch.org/whl/cu130/torch/),
[torchvision wheel index](https://download.pytorch.org/whl/cu130/torchvision/),
[pinned managed-Python metadata](https://github.com/astral-sh/uv/blob/0.12.21/crates/uv-python/download-metadata.json).

## Commands and boundaries

Run on Ubuntu 26.04 x86_64 after reviewing the plan:

```sh
./scripts/prepare-comfyui.sh            # plan only; no installation
./scripts/prepare-comfyui.sh --install  # isolated dependency/source preparation
./scripts/probe-comfyui-nodes.py        # plan only; no service
./scripts/probe-comfyui-nodes.py --run  # temporary owned CPU node/API probe
./scripts/probe-comfyui-nodes.py --run --verify-output # also test synthetic PNG/video/audio outputs
```

`STUDIO_DATA_ROOT` selects an absolute data root, defaulting to
`~/.local/share/music-video-studio`. Installation writes only its managed
interpreter/environment/source, caches and setup evidence. It does not run APT,
change NVIDIA drivers, modify provider configuration, install model weights,
reuse a personal Comfy checkout or start a persistent service. This environment
is **not a sandbox or restriction on creative agents**.

Relevant layout:

```text
tools/runtime/cpython-3.12.14-20260929-linux-x86_64/
tools/comfyui/venv/
tools/comfyui/source/
downloads/                         # pinned archives/wheels and pip cache
setup-jobs/comfyui-dependencies.*/ # log, exact pins, host observations, result
setup-jobs/comfyui-nodes.*/        # temporary base, API snapshots, log, receipt
```

An installer lock prevents concurrent dependency writes. Existing unowned or
differently pinned tool directories are refused rather than adopted. Installer
lock/cache links are refused before writes. Python packages are installed only
through the explicit venv interpreter, with mandatory hashes and no dependency
re-resolution. Source archive hashes are locally calculated pins, not upstream
signatures. Before/after host-Python metadata is compared; this is a useful
observation, not a complete filesystem audit.

Completed repeated installation verifies every locked package version, venv
identity, source ownership marker, `pip check` and imports without another
download or fresh-install disk budget. Direct torch wheels are also explicitly
cached and checked for interrupted-install retries. **Known limitation:** a
fresh or incomplete install conservatively requires 35 GiB free even if it has
already downloaded some dependencies. Model storage is a separate budget.
Do not edit the immutable recipe/lock in place on an existing installation and
expect automatic migration; upgrades are not implemented yet.

The CPU probe refuses an occupied loopback port (default **8198**), starts its
own child process with a unique data directory, checks `/system_stats` against
the exact launched arguments, and saves `/object_info`. It verifies required
H3/audio-guide/sampler/decode/save nodes and schemas, then stops only its owned
process group. By default no prompt is submitted. `--verify-output` additionally
submits a clearly labelled synthetic workflow and checks its real encoded and
original outputs; see [the output proof](../h3/README.md). Successful node registration is **not**
model-load, quantization, GPU-memory, raw-PNG, export or native-job cancellation
proof. Normal process shutdown is recorded separately from those pending tests.

## Verified checkpoint

On Dundee, fresh and completed-repeat installations passed with matching
host-Python observations. The corrected real CPU probe registered 996 nodes,
verified all 20 required nodes and checked schemas, and exited its owned Comfy
process cleanly. Its first startup failure (missing empty `custom_nodes`
directory) is retained; the helper now creates the full base layout. No model
weights or generation were involved. A subsequent opt-in synthetic output
probe also passed on Dundee: 56 ordered original PNGs, exact 24 fps H.264/AAC
video and sample-exact FLAC fixture audio. This is not H3 generation evidence.
Detailed evidence is in the progress log.

## Re-resolving deliberately

Use a fresh output file, not an existing lock from another index/target:

```sh
uv --no-config pip compile integrations/comfyui/requirements.in \
  --python-version 3.12.14 --python-platform x86_64-manylinux_2_28 \
  --default-index https://pypi.org/simple --generate-hashes --no-build \
  --emit-index-url --emit-index-annotation --no-header --no-python-downloads \
  -o /an/empty/path/requirements-fresh.lock
```

This recipe used uv **0.12.21**. Review changes and rerun live checks before
replacing the project lock. Tool-specific model manifests/workflows and measured
16 GB inference still need execution proof; pinned assets are now downloading
and the H3 graph/output branch is in [the H3 integration](../h3/README.md).
See [current progress](../../devpost/slice-1-progress.md).
