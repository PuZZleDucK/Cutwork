# AI Music Video Maker — build in progress

A learner-led, agent-mediated music-video studio for Ubuntu 26.04 / 16 GB NVIDIA hardware, with a LAN browser interface. **The application is not ready to run yet.** There is no UI or production service to open.

Approved product decisions live in [`devpost/`](devpost/). Current build state is in [the checklist](devpost/checklist.md); detailed evidence and verification boundaries are in [slice 1 progress](devpost/slice-1-progress.md).

## Development checks

Use Node 24:

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm test
```

Current verification: **579/579 default tests and typechecking pass**. These tests
use explicit fixtures and do not spend provider credits or generate media.

The first developer-facing native proof also passes on Dundee: both requested
provider CLIs used their normal tools; a fresh Codex task generated a complete
song, an audio-conditioned H3 clip with all original PNGs, and a playable export.
Independent checks verified picture/audio content, recorded seeds and resource
release. Failed-call replay, queued/running cancellation and music → video → music
handoff have separate real evidence. Read [the evidence map](devpost/slice-1-native-evidence.md)
for exact runs, repeatable commands, failed attempts and limits. This is **not yet
a browser studio or a fresh-host installation demonstration**.

## Prerequisite recipe, not full application setup

```sh
./scripts/prepare-runtime.sh            # print the plan only
./scripts/prepare-runtime.sh --install  # Ubuntu 26.04 x86_64 only
```

This installs pinned Node/provider executables in the studio data root without
changing existing system/asdf defaults, host Python or NVIDIA drivers. It does
not sign in, install the application service or expose a LAN port.
`STUDIO_DATA_ROOT` selects an absolute local runtime directory.

Separate version-pinned installation recipes exist for [YuE2](integrations/yue2/README.md),
[ComfyUI](integrations/comfyui/README.md), [H3 assets](integrations/h3/README.md) and
[audio analysis](integrations/analysis/README.md). Python environments are isolated.
[Product-owned agent guidance](integrations/knowledge/README.md) preserves normal
creative-agent tools and full-access invocation rather than requiring a JSON reply.

The verified H3 run used CPU offloading, about 18 GiB peak system RAM and swap on
the 16 GiB GPU host. The user's separate TTS service was temporarily paused with
permission and restored afterward; setup/generation must not silently stop other
applications. These results are not an 8 GiB or arbitrary-workload guarantee.

See [test commands and boundaries](tests/README.md). Never commit runtime state, media, authentication stores or learner-private context. Application/model licensing is not yet ready for a public release.
