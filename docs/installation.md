# Installation and operation

[Back to Cutwork](../README.md)

## Before you run it

> **Full-access agents; no application accounts.** Everyone who can reach this
> interface can submit work, delete managed media and confirm autonomous Debug
> repairs as the server account. Agents retain their normal tools, network access
> and ability to change files **outside** project/tool folders. Those folders
> organise work; they are not security sandboxes. Host/Origin checks are not
> authentication. Do not expose this prototype to the public Internet or an
> untrusted LAN. Provider usage may consume account quota or money.

The supported target is **Ubuntu 26.04 Desktop, x86_64, NVIDIA GPU with 16 GB VRAM**,
with a functioning NVIDIA driver, an ordinary logged-in user session and internet
access for downloads/frontier providers. Everything except the browser runs on
that machine. Smaller GPUs, other OSes and distributed generator discovery are
not supported by this proof of concept.

Allow substantial local disk space for model weights, separate Python packages,
original frames and exports. The pinned H3 model files alone are about **35.1 GB**;
that is not the complete installation/storage requirement. Check the bootstrap's
individual disk diagnostics and leave room for generated media.

Memory matters beyond VRAM. On the tested 22 GiB RAM host, an earlier H3 offload
profile exhausted memory. New owned Comfy runs use
`--disable-pinned-memory --disable-async-offload --fast-disk`; one successful short
run ended at about **7.1 GiB process RSS / no process swap**, not a measured universal
peak or safe RAM minimum. Longer jobs can need more. An unrelated TTS service was
paused **with permission** for the native tests and restored afterward; the product
does not silently stop other services. [Observed limits](../devpost/slice-7-evidence.md).

## Set up the server

Run these commands **on the Ubuntu GPU machine**, from a stable checkout directory,
as the user who will own the projects and sign in to the provider. The persistent
service uses this checkout in place; it does not copy it into an independent app
installation.

```sh
# 1. Inspect host prerequisites and the plan. No install or service changes.
bash scripts/bootstrap-ubuntu.sh

# 2. Explicit installation: host dependencies, pinned runtime, app build and service.
bash scripts/bootstrap-ubuntu.sh --install --host-deps --service
```

`--host-deps` authorises installation of shared Ubuntu prerequisites using APT
(with the usual local privilege prompt): `ca-certificates`, `curl`, `tar`,
`xz-utils`, `unzip`, `git`, and `ffmpeg`. It does **not** install/replace an NVIDIA
driver, change host Python/pip defaults, add swap, alter the firewall or stop other
applications. Omit it when those prerequisites are already available.
`ffprobe` is provided by the same Ubuntu `ffmpeg` package. These are shared native
commands, not Python packages or a bundled codec build.

The bootstrap prepares pinned Node/provider CLIs, runs the lockfile-based app
install, checks the real SQLite native binding, typechecks and builds. It leaves
YuE2/Comfy/H3/analysis installation to the studio's setup flow. The default
**plan-only** mode of every setup helper is distinct from an actual successful
installation. Ready means the checks passed, not simply that a folder exists.

If you want to inspect/start the app before installing a user service, omit
`--service`; use the pinned Node directory reported by the bootstrap at the front
of `PATH`, then run `npm start` from the checkout. The production server serves
both UI and API at `http://<server-name-or-IP>:9122/`.

### Provider sign-in

Open the studio, choose **Codex** or **Claude**, and sign in using the corresponding
normal terminal flow on the server as the **same user**:

```sh
bash scripts/provider.sh codex login --device-auth
# OR
bash scripts/provider.sh claude auth login

# Inspect the selected provider's actual authentication state:
bash scripts/provider.sh codex login status
# OR
bash scripts/provider.sh claude auth status
```

`provider.sh` only selects this app's pinned executables while preserving the
normal home/config/tools environment. It does not replace provider login or copy
credentials into the studio. No API key/password is entered in the browser UI.
An unsigned-in/unusable provider remains an error with sign-in guidance; selection
alone does not make it ready. The fixed requested models are `gpt-6.1-sol` and
`claude-opus-5-5`; access depends on your account. There is no hidden fallback.
Click the provider's navbar indicator to reopen its selector later. Existing jobs
keep their captured provider; the new selection applies only to new requests.

### Install and verify the generators

Use the setup panels or **Install all**. They cover YuE2, audio analysis, ComfyUI
and H3 dependencies/models, with tool-specific progress, failures, Retry and
confirmed Debug. Setup belongs to the server, not a project: switching projects
or refreshing the browser does not start a duplicate installation. All tool indicators are visible from the start, disabled until installed. Keep
every setup panel visible until the complete toolchain is ready, then clear the
setup area together. Only the actively installing step has animated hazard stripes.

- **YuE2:** its own managed Python/venv and pinned music model assets.
- **ComfyUI + H3:** a different managed Python/venv, owned loopback service and
  product workflow that saves decoded PNG frames before video encoding. H3 setup
  also installs pinned upstream prompting guides; each new video task captures
  the complete relevant guide and its hash. These documents retain their upstream
  licence and are downloaded separately from the large model weights.
- **Audio analysis:** a separate CPU-only Librosa venv; it may reuse Comfy's base
  interpreter, never Comfy's installed packages. It measures duration/sample
  metadata, waveform peaks, estimated tempo and beat positions. Missing/uncertain
  beat analysis is not fabricated. It also verifies shared FFmpeg/FFprobe and a
  real synthetic encode/decode.

No `sudo pip`, host-Python replacement or shared ML environment is required.
The app does not adopt or stop your personal ComfyUI installation.
The pinned recipes and independent lower-level instructions are in
[YuE2](../integrations/yue2/README.md), [ComfyUI](../integrations/comfyui/README.md),
[H3](../integrations/h3/README.md) and [analysis](../integrations/analysis/README.md).

### Service, locations and configuration

```sh
# Separate service helper: inspect first, then explicitly install/start if desired.
bash scripts/install-user-service.sh
bash scripts/install-user-service.sh --install --start

systemctl --user status music-video-studio.service
journalctl --user -u music-video-studio.service -f
systemctl --user restart music-video-studio.service
systemctl --user stop music-video-studio.service
```

The installer enables a persistent **user** unit. This normally starts with that
user's login; boot-without-login requires a separately chosen systemd linger
policy. The helper does not enable linger or silently replace a different active
service. `--replace-stopped-service` is an explicit option for an incompatible,
**inactive** previous unit; it is not permission to stop a service automatically.
For an existing prepared runtime without a bootstrap receipt, or after deliberately
changing the checkout, review the plan and use bootstrap `--install --update`
while the relevant app is stopped and idle. A different active deployment is not
permission to rebuild its shared source/runtime. Preserve the runtime and receipts;
do not delete them to bypass an ownership check.
Do not restart in the middle of valuable work expecting GPU computation to resume.
Uncertain ownership is reconciled visibly, not automatically regenerated.

Set configuration before bootstrap/service installation. The unit records these
settings plus the pinned executable PATH and optional `XDG_CONFIG_HOME`,
`CODEX_HOME` and `CLAUDE_CONFIG_DIR`; existing account credentials are not copied
into the unit:


| Variable | Default / purpose |
|---|---|
| `STUDIO_DATA_ROOT` | Absolute runtime directory; takes precedence over XDG. |
| `XDG_DATA_HOME` | Otherwise use `$XDG_DATA_HOME/music-video-studio`; fallback is `~/.local/share/music-video-studio`. |
| `STUDIO_HOST` / `STUDIO_PORT` | `0.0.0.0` / `9122`; choose a free port. |
| `STUDIO_ALLOWED_HOSTS` | Optional exact comma-separated `host:port` allowlist. Include `127.0.0.1:<port>` for cooperating agent calls as well as the LAN hostname/IP you use. Not an access-control system. |
| `STUDIO_GPU_UUID` | Choose a GPU on a multi-GPU host. |
| `STUDIO_NATIVE_LIMIT_SECONDS` | Native execution deadline, default `3600`; not a requested clip-duration limit. |

The data root holds the SQLite database, shared tool environments/model assets,
setup logs and per-project runtime workspaces/media/history. Keep it local and
back it up separately from the source checkout. Treat logs and prompts as private.
Keep runtime data, authentication stores, personal context and raw generated
media out of source control. The small, explicitly curated samples in `docs/media/`
are a documentation exception, not a reason to commit project storage.


## If setup or generation fails

- **Missing GPU/driver:** check `nvidia-smi` on the server. Driver installation is a
  host responsibility; the app does not silently install or replace it.
- **Cannot open the UI:** check the user service and its log with the commands
  above, the chosen port and the server's LAN hostname/IP. Do not solve this by
  exposing the full-access interface to the public Internet.
- **Sign-in still fails:** run the provider helper's status command as the service
  user. A desktop login under a different account does not authenticate this
  process. Model access is also checked when generation is requested.
- **Download/install failed:** expand the setup details and Retry. Inspect existing
  receipts and verified files rather than deleting model storage and starting over.
- **Out of memory:** shorten the proposed clip, inspect competing workloads and
  retry deliberately. Cutwork does not stop unrelated services for you. The tested
  16 GB VRAM target is not a guarantee that every workload fits.
- **Agent appears finished but generation remains active:** inspect the retained
  details first. A final text report alone is not a completed native result. One
  intermittent Claude non-exit incident remains documented in the
  [post-demo investigation](../devpost/post-demo-issue-investigation.md); do not
  blindly relaunch an already-generated shot or terminate unrelated processes.

The recorded fresh-runtime setup reused a prepared OS/driver and existing provider
sign-in. See [the recorded journey](../devpost/recorded-demo-v2.md) for measured
results and boundaries, rather than treating the installation plan as proof of a
new host's readiness.
