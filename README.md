# AI Music Video Maker — build in progress

A learner-led, agent-mediated music-video studio for Ubuntu 26.04 / 16 GB NVIDIA hardware, with a LAN browser interface. **The first soundtrack browser slice is live and mechanically verified; early UI feedback is next.** Video editing/export and fresh-host release packaging are still in progress.

Approved product decisions live in [`devpost/`](devpost/). Current build state is in [the checklist](devpost/checklist.md); current browser evidence is in [slice 2 verification](devpost/slice-2-live-evidence.md), with native generation evidence in [slice 1](devpost/slice-1-native-evidence.md).

## Development checks

Use Node 24:

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm test
```

Current verification is recorded in [the slice-2 evidence](devpost/slice-2-live-evidence.md). Typechecking, the default test suite and the browser build are run before checkpoints. These tests
use explicit fixtures and do not spend provider credits or generate media.

The first developer-facing native proof also passes on Dundee: both requested
provider CLIs used their normal tools; a fresh Codex task generated a complete
song, an audio-conditioned H3 clip with all original PNGs, and a playable export.
Independent checks verified picture/audio content, recorded seeds and resource
release. Failed-call replay, queued/running cancellation and music → video → music
handoff have separate real evidence. Read [the evidence map](devpost/slice-1-native-evidence.md)
for exact runs, repeatable commands, failed attempts and limits. That proof is separate from the new browser integration and is **not a fresh-host installation demonstration**.

## First LAN studio (developer deployment)

On the prepared Ubuntu/NVIDIA server, with Node 24 and the pinned runtime recipe
already installed:

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm test
npm run build
STUDIO_HOST=0.0.0.0 STUDIO_PORT=9122 npm start
```

Open `http://<server-name-or-IP>:9122/`. The current Dundee instance is
`http://dundee.local:9122/`. This is a **trusted-LAN, full-access-agent prototype**:
anyone who can reach it can run work as the server account. Do not expose it to the
public Internet. No credentials are entered through a studio web form.

The first slice provides Projects/Config, reversible Codex/Claude selection,
managed tool setup/verification, saved music/lyrics/style drafts, server-owned
generation, original WAV playback, estimated beat/waveform analysis and expandable
history. Reloading a browser does not stop a setup job or generation. The interface
shows only implemented stages; video editing, export and richer recovery controls
come next. The Assembly branding is provisional; Kirsty is not bundled yet.

`STUDIO_DATA_ROOT` defaults to `~/.local/share/music-video-studio`. Optional
`STUDIO_ALLOWED_HOSTS` is an exact comma-separated `host:port` list and must include
`127.0.0.1:9122` (or your chosen port) for cooperating agents. `STUDIO_GPU_UUID`
selects the GPU on multi-GPU hosts. `STUDIO_NATIVE_LIMIT_SECONDS` defaults to 3600;
the visible runtime notice reports this limit. Normal agent tools and environment
are retained. Python/tool readiness is verified, not inferred from directories.

Completed projects and jobs persist in SQLite and the data root. Interrupted
agent/native ownership is visibly held for reconciliation, never automatically
replayed or declared stopped. The complete novice-friendly host bootstrap remains
a later build slice; these are developer commands, not the final installer.

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
