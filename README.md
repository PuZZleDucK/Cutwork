# Cutwork — AI music-video studio

A text-first, agent-mediated music-video workbench: describe a song, generate
song-conditioned clips, arrange them on a beat/frame timeline, and export an MP4.
The browser works across a **trusted LAN**; one Ubuntu/NVIDIA server runs the tools.
**Cutwork** is the project name. Its original hazard-striped clapperboard mark is
editable SVG at `apps/web/public/cutwork-mark.svg`, included under the project MIT
licence. Existing runtime directories and browser-storage keys are intentionally
unchanged so renaming the app does not disturb projects or saved drafts.

The creative loop, precise edits, live preview, continuation, recovery and media
lifecycle are implemented. Current verification is indexed in
[the build checklist](devpost/checklist.md), with
[recent workspace refinements](devpost/workbench-round-two.md) and
[installation evidence](devpost/slice-9-readiness.md).
Fresh managed-runtime tool installation and model checksum checks have passed on
Dundee. The end-to-end creative journey in that fresh runtime, final learner
review and learning wrap-up remain open. **A clean Ubuntu installation is not
claimed.** See the [criterion-by-criterion evidence map](devpost/prd-traceability.md)
rather than interpreting a test count as complete product acceptance.

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
does not silently stop other services. [Observed limits](devpost/slice-7-evidence.md).

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
[YuE2](integrations/yue2/README.md), [ComfyUI](integrations/comfyui/README.md),
[H3](integrations/h3/README.md) and [analysis](integrations/analysis/README.md).

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
Never commit runtime data, authentication stores, personal context or generated
media into the source repository.

## Make and refine a video

1. Create/select a project. Music, clips, arrangements and history are separate;
   only the tools/provider selection are shared.
2. Describe the **music** and optional **lyrics**, then Generate. The agent may
   research, write scripts or edit scores with its normal tools. Project visual
   style is for video, not music. Selecting an older song restores its submitted
   description/lyrics and saved arrangement; a new song starts with no placements.
3. Set the optional persistent visual style and describe a clip. Inspect the
   prospective range on the waveform/beat sequence; click markers to adjust End
   or switch to Start. Beats, seconds and frames are linked, with exact rational
   timing realised on a fixed **24 fps** grid. The UI shows the requested duration.
4. Generate. Song audio from the captured interval is supplied to H3 by default.
   The accepted prompt clears for the next clip; the server keeps its immutable
   inputs and planned placement. Placeholders are not coverage. On success the
   clip is added once at its planned position, even after a project switch/reload.
5. Trim retained source frames, move/place/remove clips, and swap overlap dominance.
   **Continue from end** on a particular clip uses its last retained original PNG,
   not a re-decoded video frame. Native extra tail frames remain available but do
   not silently lengthen the planned edit.
6. Preview and download the assembled MP4. Preview and export use the same edit.
   Gaps are black while the song continues; post-song video is retained. Less than
   100% music coverage is valid. Coverage is not a quality or export-success score.

The default is original-song audio. Enabling a clip's audio **replaces**, rather
than mixes with, the song where that clip is dominant. Hidden clips contribute no
audio. Beyond the song, use silence or the dominant clip's enabled audio. Moving
a clip gives a non-blocking audio-alignment warning. Media previews start unmuted
at 50% player volume; this is not an export-gain treatment.

Default ranges use up to 8 unassigned beats, scaling to 4/2/1 for slow tempos and
stopping at an occupied range. Over 15 seconds warns rather than forbids a request;
short clips have no blanket four-second minimum. Exact desired song duration/BPM
is **not guaranteed**: an earlier 20–30-second request produced an 83.56-second song,
and Librosa estimates are not authoritative musical annotations. Continuity input
is not a promise of a visually seamless join. Start with short trials and inspect
the actual result. [Real three-clip loop](devpost/slice-3-live-evidence.md).

### Recovery, archive and deletion

- Failed work shows details and **Retry** / **Restore parameters**. Retry (and
  Restart of cancelled work) reuses the recorded seed/captured call; restoring
  editable parameters and submitting anew gives a new recorded seed. Same seed
  aids reproducibility but is not a cross-version byte-identical-output guarantee.
- Cancel waits for owned work to stop before reporting cancelled, then offers
  Restart, Discard or Restore parameters. Unknown/unregistered external work is
  not certified stopped. Discarding a placeholder does not erase history.
- **Remove from sequence** only removes a placement. **Archive** hides the artifact
  and removes all its placements. Restoring a clip returns it **unplaced**; restoring
  a song leaves it **unselected**, retaining its saved arrangement.
- **Delete permanently** first discloses what will be removed and retained. Dependent
  work must finish or be cancelled. Accepted deletion removes timeline use and
  full-media access immediately; durable purge failure stays visible/retryable,
  not falsely complete. Original generation text/settings/seeds/logs and a bounded
  thumbnail remain. There is no history-delete option.
- Purge covers known managed originals, raw frames, recorded copies/intermediates
  and affected preview/export caches. It is **not secure disk erasure** and cannot
  recall downloads, backups or unknown copies made by unrestricted agents.
  Independent generated clips survive deletion of their source song and may still
  contain its audio. A surviving clip can be explicitly retargeted to another song
  for continued editing without being automatically placed.
- **Debug** shows the complete prompt, command and working directory before
  confirmation, warns about changes beyond that folder, then reports the repair
  and an independent readiness result. It is not a guarantee of automatic repair.

## Development, evidence and licence

Use the pinned Node 24 runtime (its `bin` must be first on `PATH`):

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm test
npm run build
npm start
```

The default test suite uses fixtures and does not spend provider credits or launch
model inference. Live tests are a separate opt-in; read [tests/README.md](tests/README.md)
before running them. `npm run dev` is the Vite development UI, not the complete
production server/service.

- [Scope](devpost/scope.md) → [PRD](devpost/prd.md) → [technical spec](devpost/spec.md)
  → [160-criterion traceability](devpost/prd-traceability.md).
- [Build checklist](devpost/checklist.md) and [latest completed evidence](devpost/slice-8-evidence.md).
- [Offline app map](devpost/app-map.html): a reference route through one real
  action and the reasoning behind it; preparing it does not complete a walkthrough.
- [Product-owned agent knowledge](integrations/knowledge/README.md).

Application code is [MIT licensed](LICENSE). Models, CLIs, dependencies, fonts and
codecs have their **own terms**; installing them does not make them MIT or establish
unrestricted output rights. Read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
before installing/distributing/using their outputs. The bundled original Kirsty
Regular font is an unchanged historical freeware copy from Ubuntu
`fonts-larabie-straight`, with its original redistribution terms/notices retained.
It is **not MIT or an OSI-open-source font**; the newer commercial font licence
is not the licence attached to this archived copy.

Deferred: user accounts, distributed discovery, a general headless-agent API,
separate image/foley generation, fades/transitions, mastering/mixing, arbitrary
frame rates and smaller-GPU support. Publication, demo submission and the final
learning wrap-up are separate from the current build checkpoint.
