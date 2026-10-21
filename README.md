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

Type checking and **all 78 approved local tests pass**, including the input-delivery and provider-interruption regressions. Separate real provider probes on Dundee succeeded with the requested Codex/Claude models and normal tools; they are not native music/video generation evidence. A separate real YuE2 probe also produced a decodable approximately 20-second audio sample on Dundee; it hit its probe token ceiling and is not a finished song. A first real H3 probe then produced 56 original frames at 24 fps with that song as conditioning; it used CPU offloading and swap on the 16 GB GPU host. A first real Codex-driven task subsequently generated a fresh 32.84-second song and H3 outputs. The H3 helper timed out while observing completion; Codex preserved that failure and recovered a decodable sparse export from the saved outputs without regenerating. This is useful provider/media evidence, **not a clean pipeline pass**. The full native live suite remains unrun. Default tests use local fixtures and never invoke paid providers or generators.

## Prerequisite recipe, not full application setup

```sh
./scripts/prepare-runtime.sh            # print the plan only
./scripts/prepare-runtime.sh --install  # Ubuntu 26.04 x86_64 only
```

This installs pinned Node/provider executables in the studio data root without changing existing system/asdf defaults, host Python or NVIDIA drivers. It does not install models, start agents, sign in, install the application service or expose a LAN port. `STUDIO_DATA_ROOT` can select an absolute local runtime directory. The separate [YuE2 dependency recipe](integrations/yue2/README.md) has passed installation/import checks on Dundee. Its model installer and staged helper now have a first direct generation proof. The separate [ComfyUI recipe](integrations/comfyui/README.md) has passed fresh/repeat dependency checks, a real temporary CPU-service test of the 20 required nodes, and synthetic output tests. All pinned [H3 assets](integrations/h3/README.md) are verified, and its first real short generation passed with independently checked original frames, encoded media, exact seed and normal owned-service exit. Native cancellation, music replay, broader resource feasibility and a clean media chain remain unverified. [Product-owned agent guidance and the opt-in probe](integrations/knowledge/README.md) have now been exercised by Codex. The approved [completion-polling repair](devpost/h3-polling-test-review.md) now passes nine regression methods and a real same-input H3 replay, with final history captured and all 56 PNGs matching the earlier attempt exactly. That native replay is not a rerun of the complete provider chain.

See [test commands and boundaries](tests/README.md). Never commit runtime state, media, authentication stores or learner-private context. Application/model licensing is not yet ready for a public release.
