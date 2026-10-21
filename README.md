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

Type checking and **all 78 approved local tests pass**, including the input-delivery and provider-interruption regressions. Separate real provider probes on Dundee succeeded with the requested Codex/Claude models and normal tools; they are not native music/video generation evidence. A separate real YuE2 probe also produced a decodable approximately 20-second audio sample on Dundee; it hit its probe token ceiling and is not a finished song. The full native live suite remains unrun. Default tests use local fixtures and never invoke paid providers or generators.

## Prerequisite recipe, not full application setup

```sh
./scripts/prepare-runtime.sh            # print the plan only
./scripts/prepare-runtime.sh --install  # Ubuntu 26.04 x86_64 only
```

This installs pinned Node/provider executables in the studio data root without changing existing system/asdf defaults, host Python or NVIDIA drivers. It does not install models, start agents, sign in, install the application service or expose a LAN port. `STUDIO_DATA_ROOT` can select an absolute local runtime directory. Native generation remains a feasibility gate. The separate [YuE2 dependency recipe](integrations/yue2/README.md) has passed installation/import checks on Dundee. Its model installer and staged helper now have a first direct generation proof. The separate [ComfyUI recipe](integrations/comfyui/README.md) has passed fresh/repeat dependency checks, a real temporary CPU-service test of the 20 required nodes, and a synthetic 56-frame PNG/video/audio output test. The pinned [H3 assets](integrations/h3/README.md) are downloading; H3 model loading/generation, native cancellation and the complete media chain remain unverified.

See [test commands and boundaries](tests/README.md). Never commit runtime state, media, authentication stores or learner-private context. Application/model licensing is not yet ready for a public release.
