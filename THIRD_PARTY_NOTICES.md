# Third-party notices and licence boundaries

Reviewed **23 October 2026** against the committed pins below. This is a provenance
and obligations inventory, **not legal advice**, a warranty of compatibility, or
clearance to publish any particular video. Read the full licence text, not only an
SPDX label. Versions and rights may differ when dependencies are upgraded.

## Application source

The original ASSEMBLY application source is [MIT licensed](LICENSE). That grant
**does not relicense** third-party code, model weights, fonts, provider services,
codecs, or user-supplied music/images/characters. Third-party material retains its
own terms. This source repository contains no model checkpoints and installs
external runtimes separately; providing an installer is **not an exemption** from
upstream use, redistribution, service, output, or patent conditions.

No blanket claim is made that generated outputs are unrestricted, original,
copyrightable, commercially usable, or cleared for competitions. The operator
must check model/service terms, competition rules and the rights in inputs and
outputs. Optional research by an agent, user imports, unknown external assets,
and tools installed outside these recipes are not exhaustively inventoried here.
Australia-based development does not itself settle worldwide distribution rights.

## Model weights and outputs

Exact checkpoint filenames, byte sizes and SHA-256 hashes are retained in
[integrations/yue2/models.json](integrations/yue2/models.json) and
[integrations/h3/models.json](integrations/h3/models.json). Those manifests are
technical integrity records, not licence approval. The model installers retain the
pinned notices alongside their managed model copies.

### YuE2: code and checkpoint licences differ

| Material | Pinned upstream source | Terms / retained copy |
|---|---|---|
| YuE2 inference code (`yue2-infer` 0.1.6) | [multimodal-art-projection/YuE at `1647252d68b70cbead046ffd3f7caf036dde47ee`](https://github.com/multimodal-art-projection/YuE/blob/1647252d68b70cbead046ffd3f7caf036dde47ee/LICENSE) | Apache-2.0; [full code licence](integrations/licenses/YuE-code-LICENSE.txt) |
| Music checkpoint | [m-a-p/YuE2-3B at `8f24312f187763b9854adeec87e437e2b03bbff1`](https://huggingface.co/m-a-p/YuE2-3B/blob/8f24312f187763b9854adeec87e437e2b03bbff1/LICENSE) | **CC BY-NC 4.0**, not the code's Apache licence; [full checkpoint licence](integrations/licenses/m-a-p--YuE2-3B--LICENSE) |
| VAE checkpoint | [m-a-p/YuE2-Vae at `152733a19ad43aa67e367f9b5503ef8075bb5126`](https://huggingface.co/m-a-p/YuE2-Vae/blob/152733a19ad43aa67e367f9b5503ef8075bb5126/LICENSE) | **CC BY-NC 4.0**; [full checkpoint licence](integrations/licenses/m-a-p--YuE2-Vae--LICENSE) |

The checkpoint grant is noncommercial and includes attribution/notice conditions
when sharing licensed material. The pinned model cards do **not** provide an
explicit blanket output-rights exemption. That is not a claim that every generated
song automatically receives CC BY-NC; model use and copyright in a generated song
are different questions. Obtain appropriate permission/clarification for commercial
model use, and assess actual output/competition rights separately.

The checkpoint's [third-party code notice](integrations/licenses/m-a-p--YuE2-3B--THIRD_PARTY_NOTICES.md)
separately identifies Oobleck/stable-audio-tools code (© 2023 Stability AI, MIT) and
SnakeBeta/BigVGAN code (© 2022 NVIDIA, MIT), derived from stable-audio-tools commit
`a6ae0cdf8b2eb1567a4b42ceadddec3712d99d45`. Their full original
[Stability AI](integrations/licenses/stable-audio-tools-MIT.txt) and
[NVIDIA](integrations/licenses/SnakeBeta-NVIDIA-MIT.txt) MIT notices are retained;
the checkpoint licence does not replace those code licences.

### MiniMax H3: custom community terms, including output conditions

The selected pruned diffusion model, quantized Qwen text encoder, video VAE and
audio VAE come from [Comfy-Org/MiniMax-H3 at `e5eb578a89295337b8ff433a035929ce0279e0b6`](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/e5eb578a89295337b8ff433a035929ce0279e0b6/README.md).
The pinned upstream licence is [MiniMaxAI/MiniMax-H3 at `42ed227ee7df40d41602854ae760620d6eb651fe`](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/LICENSE),
dated 2 August 2026; [full retained licence and acceptable-use policy](integrations/licenses/MiniMaxAI--MiniMax-H3--LICENSE).
It is **not** MIT, Apache, CC0, or an unrestricted-output grant.

Important conditions to inspect in that exact text include:

- **Applicable Territory:** the definition excludes the EU, UK, Republic of Korea
  and USA. Section V.4 restricts use, reproduction, modification, distribution and
  display of both the model works **and outputs/results** outside that territory.
  An Australian creator is not thereby cleared for unrestricted worldwide output
  publication or service availability.
- Commercial conditions include prior written authorization above the stated
  US$20 million annual commercial product/service revenue threshold and prominent
  MiniMax H3 UI branding for commercial products/services (section IV).
- Restrictions on use for improving other AI models, downstream enforceable use
  terms, and safeguards/reporting for products or services that let third parties
  generate outputs appear in section V. Read the acceptable-use policy too,
  including its public machine-generated-content disclosure requirement.
- Section VI.4 says MiniMax claims no rights over generated outputs; that sentence
  **does not cancel** the territorial, use or downstream conditions elsewhere.
- The encoder's additional note identifies Qwen3-VL-32B under
  [Apache-2.0](https://github.com/QwenLM/Qwen3-VL/blob/main/LICENSE); this does not
  convert the whole H3 workflow or its outputs to Apache-2.0.

Retained attribution: MiniMax H3 is licensed under the MiniMax H3 Community License
Agreement, Copyright © 2026 MiniMax. All Rights Reserved.

Current [MiniMax H3 guidance](https://design.minimax.io/h3) and
[Comfy's commercial-licensing guidance](https://support.comfy.org/articles/6065098425-minimax-commercial-licensing-who-needs-a-license-and-how-to-get-one)
are additional references, not replacements for the pinned agreement. Their
commercial-use descriptions are not identical. Confirm applicable rights with the
licensor for your use/service rather than inferring clearance from an installer,
a small revenue figure, a model-card label, or this notice. This prototype's setup
and licence inventory do not certify compliance with every service obligation.

## Provider CLIs and Node runtime

| Installed component | Source and terms |
|---|---|
| Node.js 24.22.0 | [Official release](https://nodejs.org/dist/v24.22.0/) and [full Node licence/third-party notices](https://github.com/nodejs/node/blob/v24.22.0/LICENSE). Node's main code is MIT; included libraries have their own notices. Tarball/hash pin: `integrations/tool-manifest.json`. |
| `@openai/codex@0.163.0` | [Exact package metadata](https://registry.npmjs.org/@openai%2fcodex/0.163.0), Apache-2.0 CLI code; [official source](https://github.com/openai/codex). The selected hosted model is `gpt-6.1-sol`. CLI code rights do not grant account access or replace applicable OpenAI service terms. |
| `@anthropic-ai/claude-code@2.1.306` | [Exact package metadata](https://registry.npmjs.org/@anthropic-ai%2fclaude-code/2.1.306), `SEE LICENSE IN README.md`, not an open-source grant. [Official licence](https://github.com/anthropics/claude-code/blob/main/LICENSE.md) reserves rights and points to commercial terms. The selected model is `claude-opus-5-5`; applicable account/service terms remain separate. |

Authenticate with each provider's normal CLI. Check the account's applicable
terms and usage policy; this app does not grant access, waive fees, or promise
ownership/non-infringement of provider-generated prompts or material. Provider
and native platform packages are locked in
[integrations/provider-cli/package-lock.json](integrations/provider-cli/package-lock.json).

## Python / GPU and native code

| Component | Pinned version/source and terms |
|---|---|
| ComfyUI | Commit [`f5c611e3849ff7219dfb7d7b251092ab8a9b51dc`](https://github.com/Comfy-Org/ComfyUI/blob/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc/LICENSE), GPL-3.0; [full retained text](integrations/licenses/ComfyUI-LICENSE.txt). Independently installed tool, not app MIT code. Redistribution/modification obligations must be assessed for the distributed form. |
| librosa | 0.11.0, **ISC**, [official source licence](https://github.com/librosa/librosa/blob/0.11.0/LICENSE.md), [retained full text](integrations/licenses/librosa-license.txt). Analysis code, not music/model ownership. |
| CPython | 3.10.19 for YuE2; 3.12.14 for ComfyUI and analysis. [Python licence](https://docs.python.org/3/license.html) includes PSF terms and bundled third-party notices. Exact archives and hashes are in each recipe. |
| Standalone Python distributions | Astral python-build-standalone builds `20260211` and `20260929`; [distribution licence metadata](https://docs.astral.sh/python-build-standalone/distributions/). The build-tool's MPL-2.0 licence does not replace CPython or its bundled library terms. |
| PyTorch / CUDA wheels | YuE2 uses `torch` 2.10.0+cu128; ComfyUI uses `torch` 2.13.0+cu130 / `torchvision` 0.28.0+cu130. Exact wheel URLs/hashes are in the recipes/locks. PyTorch source/package notices and NVIDIA runtime-library terms are separate; see [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE) and [NVIDIA CUDA EULA](https://docs.nvidia.com/cuda/eula/index.html). A permissive PyTorch label does not license every GPU binary. |

The three tools use isolated Python environments. Their complete locked Python
package inventory follows below, including CUDA/NVIDIA packages. Metadata that
omits a licence is explicitly marked **Not declared** rather than treated as
public-domain or permissive. For `comfy-aimdo` and the Comfy frontend, see the
[official aimdo licence](https://github.com/Comfy-Org/comfy-aimdo/blob/master/LICENSE)
and [frontend source](https://github.com/Comfy-Org/ComfyUI_frontend); both have GPL
licence material even though their sampled PyPI metadata omits a label. For CUDA,
cuDNN, NCCL and NVSHMEM, inspect the exact installed package's notices and relevant
NVIDIA component terms, not only an umbrella EULA or absent metadata label.
Retain installed distributions' licence/NOTICE files when packaging or
redistributing them. This inventory is not a full binary-level SBOM or an audit of
every vendored file inside a wheel, native addon or standalone runtime.

## FFmpeg / FFprobe and export codecs

FFmpeg and FFprobe come from the Ubuntu **APT `ffmpeg` package**, shared by the
isolated tools; they are not installed by pip. The OS package version/build is not
pinned by this repository. Use the actual host's `ffmpeg -version`, `ffmpeg -L`,
`dpkg-query -W ffmpeg` and `/usr/share/doc/ffmpeg/copyright` plus setup receipts to
identify it. Do not substitute a developer workstation's build identity.

[FFmpeg's official legal page](https://www.ffmpeg.org/legal.html) explains the
LGPL-2.1-or-later default, GPL-enabled components/build configurations and
nonfree redistribution limitations. Inspect the actual build flags and linked
libraries (including x264 where used). H.264/AAC export capability is a technical
feature, not a patent, codec or media-rights clearance. Patent obligations are
jurisdiction/use dependent; neither being in Australia nor downloading via APT
makes a blanket exemption. FFprobe is covered by the same installed build's terms.

## Kirsty headline font — exact historical release, unchanged

The bundled title font is **Kirsty Regular, version 1.0 (2000), Ray Larabie**.
It is the original `kirsty__.ttf` from the official Ubuntu archive's
[`fonts-larabie-straight_20011216-6_all.deb`](https://archive.ubuntu.com/ubuntu/pool/multiverse/f/fonts-larabie/fonts-larabie-straight_20011216-6_all.deb),
package version `1:20011216-6`, not a newly downloaded commercial Typodermic OTF.

- Copyright (c) Ray Larabie, 2000. All rights reserved. Freeware. Dedicated to the
  late Kirsty MacColl. Kirsty is a trademark of Ray Larabie.
- The original author's [READ_ME.TXT / full EULA](apps/web/public/fonts/READ_ME.TXT)
  permits unlimited use and copying/distribution as received in any medium,
  provided copyright and licence notices accompany the copies. It includes
  modification restrictions and is **not MIT or an OSI-approved open-source
  licence**. Debian's non-free / Ubuntu's multiverse classification is consistent
  with those restrictions; redistributable is not the same as open source.
- The file is copied **byte-for-byte**: no conversion, subsetting, renaming, glyph
  modification or change to its embedded notices. The embedded OS/2 `fsType` is 0;
  the legal basis is the retained author EULA, not that metadata alone. No
  conflicting separate web-embedding restriction appears in this historical copy's
  accompanying terms. Modern commercial releases have different terms and are not
  covered by this provenance.
- [Full package copyright](apps/web/public/fonts/copyright),
  [original Debian README](apps/web/public/fonts/README.Debian) and
  [provenance/hashes](apps/web/public/fonts/provenance.json) accompany the TTF in
  the served `/fonts/` directory. Package SHA-256:
  `737f0fc6aa699c68952bca2b9da227e927178d7892c46135b2362b4af3fcfd79`.
  TTF SHA-256: `f879b17aa6787ea4546aff3298a1ece251dfd733b7cbaac490f30cd823a44496`
  (46,380 bytes).

CSS loads the bundled TTF for headings/brand only, with the existing normal system
font stack for body text and controls. No external font service is contacted.
[Browser-distributed notices](apps/web/public/THIRD_PARTY_NOTICES.txt) are served
as `/THIRD_PARTY_NOTICES.txt`; no full About/licensing UI is implied.

## Retained source-text integrity

[integrations/licenses/sources.json](integrations/licenses/sources.json) records
source URL, exact retained path, byte count and SHA-256 for full licence texts,
third-party notices and the font. Tests hash those local files. This proves the
recorded bytes agree with the checked-in provenance, **not** legal compatibility
or authenticity of every future upstream release. Model/code licences remain
unchanged even though this application is MIT.

## Locked npm distribution inventory

The following is generated from the committed root and provider lockfiles.
Labels are the packages' declared licence metadata, not independently inferred
permissions. Links identify exact distributions. Includes build/test and optional
platform packages; presence in a lockfile does not mean every package is installed
on Ubuntu. Full notices live in each installed package and upstream source.
React, React DOM and scheduler's complete MIT text is also retained in the served
browser notice file, so it does not depend on an end user having `node_modules`.

### Application / build / test lock

| Exact package | Declared terms | Distribution role |
|---|---|---|
| [`@fastify/accept-negotiator@2.1.2`](https://registry.npmjs.org/@fastify/accept-negotiator/-/accept-negotiator-2.1.2.tgz) | MIT | runtime |
| [`@fastify/ajv-compiler@4.0.7`](https://registry.npmjs.org/@fastify/ajv-compiler/-/ajv-compiler-4.0.7.tgz) | MIT | runtime |
| [`@fastify/deepmerge@3.2.4`](https://registry.npmjs.org/@fastify/deepmerge/-/deepmerge-3.2.4.tgz) | MIT | runtime |
| [`@fastify/error@4.2.1`](https://registry.npmjs.org/@fastify/error/-/error-4.2.1.tgz) | MIT | runtime |
| [`@fastify/fast-json-stringify-compiler@5.1.1`](https://registry.npmjs.org/@fastify/fast-json-stringify-compiler/-/fast-json-stringify-compiler-5.1.1.tgz) | MIT | runtime |
| [`@fastify/forwarded@3.1.2`](https://registry.npmjs.org/@fastify/forwarded/-/forwarded-3.1.2.tgz) | MIT | runtime |
| [`@fastify/merge-json-schemas@0.2.2`](https://registry.npmjs.org/@fastify/merge-json-schemas/-/merge-json-schemas-0.2.2.tgz) | MIT | runtime |
| [`@fastify/proxy-addr@5.1.2`](https://registry.npmjs.org/@fastify/proxy-addr/-/proxy-addr-5.1.2.tgz) | MIT | runtime |
| [`@fastify/send@4.2.0`](https://registry.npmjs.org/@fastify/send/-/send-4.2.0.tgz) | MIT | runtime |
| [`@fastify/static@10.1.7`](https://registry.npmjs.org/@fastify/static/-/static-10.1.7.tgz) | MIT | runtime |
| [`@jridgewell/resolve-uri@3.1.2`](https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz) | MIT | build/test |
| [`@jridgewell/sourcemap-codec@1.6.0`](https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.6.0.tgz) | MIT | build/test |
| [`@jridgewell/trace-mapping@0.3.31`](https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz) | MIT | build/test |
| [`@lukeed/ms@2.0.2`](https://registry.npmjs.org/@lukeed/ms/-/ms-2.0.2.tgz) | MIT | runtime |
| [`@oxc-project/types@0.154.0`](https://registry.npmjs.org/@oxc-project/types/-/types-0.154.0.tgz) | MIT | build/test |
| [`@pinojs/redact@0.4.0`](https://registry.npmjs.org/@pinojs/redact/-/redact-0.4.0.tgz) | MIT | runtime |
| [`@rolldown/binding-android-arm-eabi@1.2.14`](https://registry.npmjs.org/@rolldown/binding-android-arm-eabi/-/binding-android-arm-eabi-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-android-arm64@1.2.14`](https://registry.npmjs.org/@rolldown/binding-android-arm64/-/binding-android-arm64-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-darwin-arm64@1.2.14`](https://registry.npmjs.org/@rolldown/binding-darwin-arm64/-/binding-darwin-arm64-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-darwin-x64@1.2.14`](https://registry.npmjs.org/@rolldown/binding-darwin-x64/-/binding-darwin-x64-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-freebsd-x64@1.2.14`](https://registry.npmjs.org/@rolldown/binding-freebsd-x64/-/binding-freebsd-x64-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-arm-gnueabihf@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/-/binding-linux-arm-gnueabihf-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-arm64-gnu@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/-/binding-linux-arm64-gnu-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-arm64-musl@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/-/binding-linux-arm64-musl-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-ppc64-gnu@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/-/binding-linux-ppc64-gnu-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-s390x-gnu@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/-/binding-linux-s390x-gnu-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-x64-gnu@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/-/binding-linux-x64-gnu-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-linux-x64-musl@1.2.14`](https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/-/binding-linux-x64-musl-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-openharmony-arm64@1.2.14`](https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/-/binding-openharmony-arm64-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-win32-arm64-msvc@1.2.14`](https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/-/binding-win32-arm64-msvc-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/binding-win32-x64-msvc@1.2.14`](https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.2.14.tgz) | MIT | build/test, optional/platform |
| [`@rolldown/pluginutils@1.0.1`](https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz) | MIT | build/test |
| [`@types/better-sqlite3@9.6.0`](https://registry.npmjs.org/@types/better-sqlite3/-/better-sqlite3-9.6.0.tgz) | MIT | build/test |
| [`@types/chai@5.2.3`](https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz) | MIT | build/test |
| [`@types/deep-eql@4.0.2`](https://registry.npmjs.org/@types/deep-eql/-/deep-eql-4.0.2.tgz) | MIT | build/test |
| [`@types/estree@1.0.9`](https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz) | MIT | build/test |
| [`@types/node@24.19.2`](https://registry.npmjs.org/@types/node/-/node-24.19.2.tgz) | MIT | build/test |
| [`@types/react@19.3.0`](https://registry.npmjs.org/@types/react/-/react-19.3.0.tgz) | MIT | build/test |
| [`@types/react-dom@19.3.0`](https://registry.npmjs.org/@types/react-dom/-/react-dom-19.3.0.tgz) | MIT | build/test |
| [`@typescript/typescript-aix-ppc64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-aix-ppc64/-/typescript-aix-ppc64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-darwin-arm64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-darwin-arm64/-/typescript-darwin-arm64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-darwin-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-darwin-x64/-/typescript-darwin-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-freebsd-arm64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-freebsd-arm64/-/typescript-freebsd-arm64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-freebsd-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-freebsd-x64/-/typescript-freebsd-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-arm@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-arm/-/typescript-linux-arm-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-arm64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-arm64/-/typescript-linux-arm64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-loong64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-loong64/-/typescript-linux-loong64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-mips64el@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-mips64el/-/typescript-linux-mips64el-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-ppc64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-ppc64/-/typescript-linux-ppc64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-riscv64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-riscv64/-/typescript-linux-riscv64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-s390x@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-s390x/-/typescript-linux-s390x-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-linux-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-linux-x64/-/typescript-linux-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-netbsd-arm64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-netbsd-arm64/-/typescript-netbsd-arm64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-netbsd-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-netbsd-x64/-/typescript-netbsd-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-openbsd-arm64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-openbsd-arm64/-/typescript-openbsd-arm64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-openbsd-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-openbsd-x64/-/typescript-openbsd-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-sunos-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-sunos-x64/-/typescript-sunos-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-win32-arm64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-win32-arm64/-/typescript-win32-arm64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@typescript/typescript-win32-x64@7.0.2`](https://registry.npmjs.org/@typescript/typescript-win32-x64/-/typescript-win32-x64-7.0.2.tgz) | Apache-2.0 | build/test, optional/platform |
| [`@vitest/mocker@5.0.5`](https://registry.npmjs.org/@vitest/mocker/-/mocker-5.0.5.tgz) | MIT | build/test |
| [`@vitest/spy@5.0.5`](https://registry.npmjs.org/@vitest/spy/-/spy-5.0.5.tgz) | MIT | build/test |
| [`abstract-logging@2.0.1`](https://registry.npmjs.org/abstract-logging/-/abstract-logging-2.0.1.tgz) | MIT | runtime |
| [`ajv@8.20.0`](https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz) | MIT | runtime |
| [`ajv-formats@3.0.1`](https://registry.npmjs.org/ajv-formats/-/ajv-formats-3.0.1.tgz) | MIT | runtime |
| [`fast-uri@3.1.9`](https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.9.tgz) | BSD-3-Clause | runtime |
| [`assertion-error@2.0.1`](https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz) | MIT | build/test |
| [`atomic-sleep@1.0.0`](https://registry.npmjs.org/atomic-sleep/-/atomic-sleep-1.0.0.tgz) | MIT | runtime |
| [`avvio@9.3.1`](https://registry.npmjs.org/avvio/-/avvio-9.3.1.tgz) | MIT | runtime |
| [`balanced-match@4.0.4`](https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz) | MIT | runtime |
| [`better-sqlite3@13.0.3`](https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-13.0.3.tgz) | MIT | runtime |
| [`brace-expansion@5.0.12`](https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz) | MIT | runtime |
| [`chai@6.3.0`](https://registry.npmjs.org/chai/-/chai-6.3.0.tgz) | MIT | build/test |
| [`content-disposition@3.0.0`](https://registry.npmjs.org/content-disposition/-/content-disposition-3.0.0.tgz) | MIT | runtime |
| [`cookie@2.0.1`](https://registry.npmjs.org/cookie/-/cookie-2.0.1.tgz) | MIT | runtime |
| [`csstype@3.2.3`](https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz) | MIT | build/test |
| [`depd@2.0.0`](https://registry.npmjs.org/depd/-/depd-2.0.0.tgz) | MIT | runtime |
| [`dequal@2.0.3`](https://registry.npmjs.org/dequal/-/dequal-2.0.3.tgz) | MIT | runtime |
| [`detect-libc@2.1.2`](https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz) | Apache-2.0 | build/test |
| [`es-module-lexer@2.3.2`](https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.3.2.tgz) | MIT | build/test |
| [`escape-html@1.0.3`](https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz) | MIT | runtime |
| [`estree-walker@3.0.3`](https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz) | MIT | build/test |
| [`expect-type@1.4.0`](https://registry.npmjs.org/expect-type/-/expect-type-1.4.0.tgz) | Apache-2.0 | build/test |
| [`fast-decode-uri-component@1.0.1`](https://registry.npmjs.org/fast-decode-uri-component/-/fast-decode-uri-component-1.0.1.tgz) | MIT | runtime |
| [`fast-deep-equal@3.1.3`](https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz) | MIT | runtime |
| [`fast-json-stringify@7.1.3`](https://registry.npmjs.org/fast-json-stringify/-/fast-json-stringify-7.1.3.tgz) | MIT | runtime |
| [`fast-querystring@1.1.2`](https://registry.npmjs.org/fast-querystring/-/fast-querystring-1.1.2.tgz) | MIT | runtime |
| [`fast-uri@4.2.3`](https://registry.npmjs.org/fast-uri/-/fast-uri-4.2.3.tgz) | BSD-3-Clause | runtime |
| [`fastify@5.12.7`](https://registry.npmjs.org/fastify/-/fastify-5.12.7.tgz) | MIT | runtime |
| [`fastify-plugin@6.0.1`](https://registry.npmjs.org/fastify-plugin/-/fastify-plugin-6.0.1.tgz) | MIT | runtime |
| [`fastq@1.20.3`](https://registry.npmjs.org/fastq/-/fastq-1.20.3.tgz) | ISC | runtime |
| [`fdir@6.5.0`](https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz) | MIT | build/test |
| [`find-my-way@9.10.0`](https://registry.npmjs.org/find-my-way/-/find-my-way-9.10.0.tgz) | MIT | runtime |
| [`fsevents@2.3.3`](https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz) | MIT | build/test, optional/platform |
| [`glob@13.0.6`](https://registry.npmjs.org/glob/-/glob-13.0.6.tgz) | BlueOak-1.0.0 | runtime |
| [`http-errors@2.0.1`](https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz) | MIT | runtime |
| [`inherits@2.0.4`](https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz) | ISC | runtime |
| [`ipaddr.js@2.5.0`](https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-2.5.0.tgz) | MIT | runtime |
| [`json-schema-ref-resolver@3.0.1`](https://registry.npmjs.org/json-schema-ref-resolver/-/json-schema-ref-resolver-3.0.1.tgz) | MIT | runtime |
| [`json-schema-traverse@1.0.0`](https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz) | MIT | runtime |
| [`light-my-request@6.8.0`](https://registry.npmjs.org/light-my-request/-/light-my-request-6.8.0.tgz) | BSD-3-Clause | runtime |
| [`lightningcss@1.33.0`](https://registry.npmjs.org/lightningcss/-/lightningcss-1.33.0.tgz) | MPL-2.0 | build/test |
| [`lightningcss-android-arm64@1.33.0`](https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-darwin-arm64@1.33.0`](https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-darwin-x64@1.33.0`](https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-freebsd-x64@1.33.0`](https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-linux-arm-gnueabihf@1.33.0`](https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-linux-arm64-gnu@1.33.0`](https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-linux-arm64-musl@1.33.0`](https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-linux-x64-gnu@1.33.0`](https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-linux-x64-musl@1.33.0`](https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-win32-arm64-msvc@1.33.0`](https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lightningcss-win32-x64-msvc@1.33.0`](https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.33.0.tgz) | MPL-2.0 | build/test, optional/platform |
| [`lru-cache@11.5.3`](https://registry.npmjs.org/lru-cache/-/lru-cache-11.5.3.tgz) | BlueOak-1.0.0 | runtime |
| [`magic-string@1.4.3`](https://registry.npmjs.org/magic-string/-/magic-string-1.4.3.tgz) | MIT | build/test |
| [`mime@3.0.0`](https://registry.npmjs.org/mime/-/mime-3.0.0.tgz) | MIT | runtime |
| [`minimatch@10.2.6`](https://registry.npmjs.org/minimatch/-/minimatch-10.2.6.tgz) | BlueOak-1.0.0 | runtime |
| [`minipass@7.1.3`](https://registry.npmjs.org/minipass/-/minipass-7.1.3.tgz) | BlueOak-1.0.0 | runtime |
| [`nanoid@3.3.20`](https://registry.npmjs.org/nanoid/-/nanoid-3.3.20.tgz) | MIT | build/test |
| [`node-addon-api@8.9.2`](https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.9.2.tgz) | MIT | runtime |
| [`obug@3.0.0`](https://registry.npmjs.org/obug/-/obug-3.0.0.tgz) | MIT | build/test |
| [`on-exit-leak-free@2.1.2`](https://registry.npmjs.org/on-exit-leak-free/-/on-exit-leak-free-2.1.2.tgz) | MIT | runtime |
| [`path-scurry@2.0.2`](https://registry.npmjs.org/path-scurry/-/path-scurry-2.0.2.tgz) | BlueOak-1.0.0 | runtime |
| [`picocolors@1.1.1`](https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz) | ISC | build/test |
| [`picomatch@4.0.7`](https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz) | MIT | build/test |
| [`pino@10.4.0`](https://registry.npmjs.org/pino/-/pino-10.4.0.tgz) | MIT | runtime |
| [`pino-abstract-transport@3.0.0`](https://registry.npmjs.org/pino-abstract-transport/-/pino-abstract-transport-3.0.0.tgz) | MIT | runtime |
| [`pino-std-serializers@7.1.0`](https://registry.npmjs.org/pino-std-serializers/-/pino-std-serializers-7.1.0.tgz) | MIT | runtime |
| [`postcss@8.5.31`](https://registry.npmjs.org/postcss/-/postcss-8.5.31.tgz) | MIT | build/test |
| [`process-warning@5.1.1`](https://registry.npmjs.org/process-warning/-/process-warning-5.1.1.tgz) | MIT | runtime |
| [`quick-format-unescaped@4.0.4`](https://registry.npmjs.org/quick-format-unescaped/-/quick-format-unescaped-4.0.4.tgz) | MIT | runtime |
| [`react@19.3.1`](https://registry.npmjs.org/react/-/react-19.3.1.tgz) | MIT | runtime |
| [`react-dom@19.3.1`](https://registry.npmjs.org/react-dom/-/react-dom-19.3.1.tgz) | MIT | runtime |
| [`real-require@1.0.0`](https://registry.npmjs.org/real-require/-/real-require-1.0.0.tgz) | MIT | runtime |
| [`require-from-string@2.0.2`](https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz) | MIT | runtime |
| [`ret@0.5.1`](https://registry.npmjs.org/ret/-/ret-0.5.1.tgz) | MIT | runtime |
| [`reusify@1.1.0`](https://registry.npmjs.org/reusify/-/reusify-1.1.0.tgz) | MIT | runtime |
| [`rfdc@1.4.1`](https://registry.npmjs.org/rfdc/-/rfdc-1.4.1.tgz) | MIT | runtime |
| [`rolldown@1.2.14`](https://registry.npmjs.org/rolldown/-/rolldown-1.2.14.tgz) | MIT | build/test |
| [`safe-regex2@5.1.2`](https://registry.npmjs.org/safe-regex2/-/safe-regex2-5.1.2.tgz) | MIT | runtime |
| [`safe-stable-stringify@2.5.0`](https://registry.npmjs.org/safe-stable-stringify/-/safe-stable-stringify-2.5.0.tgz) | MIT | runtime |
| [`scheduler@0.28.0`](https://registry.npmjs.org/scheduler/-/scheduler-0.28.0.tgz) | MIT | runtime |
| [`secure-json-parse@4.1.1`](https://registry.npmjs.org/secure-json-parse/-/secure-json-parse-4.1.1.tgz) | BSD-3-Clause | runtime |
| [`semver@7.8.5`](https://registry.npmjs.org/semver/-/semver-7.8.5.tgz) | ISC | runtime |
| [`set-cookie-parser@3.2.1`](https://registry.npmjs.org/set-cookie-parser/-/set-cookie-parser-3.2.1.tgz) | MIT | runtime |
| [`setprototypeof@1.2.0`](https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz) | ISC | runtime |
| [`sonic-boom@4.2.1`](https://registry.npmjs.org/sonic-boom/-/sonic-boom-4.2.1.tgz) | MIT | runtime |
| [`source-map-js@1.2.2`](https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz) | BSD-3-Clause | build/test |
| [`split2@4.2.0`](https://registry.npmjs.org/split2/-/split2-4.2.0.tgz) | ISC | runtime |
| [`statuses@2.0.2`](https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz) | MIT | runtime |
| [`std-env@4.3.0`](https://registry.npmjs.org/std-env/-/std-env-4.3.0.tgz) | MIT | build/test |
| [`thread-stream@4.2.0`](https://registry.npmjs.org/thread-stream/-/thread-stream-4.2.0.tgz) | MIT | runtime |
| [`tinybench@6.2.2`](https://registry.npmjs.org/tinybench/-/tinybench-6.2.2.tgz) | MIT | build/test |
| [`tinyexec@1.3.1`](https://registry.npmjs.org/tinyexec/-/tinyexec-1.3.1.tgz) | MIT | build/test |
| [`tinyglobby@0.2.17`](https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz) | MIT | build/test |
| [`toad-cache@3.7.4`](https://registry.npmjs.org/toad-cache/-/toad-cache-3.7.4.tgz) | MIT | runtime |
| [`toidentifier@1.0.1`](https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz) | MIT | runtime |
| [`typescript@7.0.2`](https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz) | Apache-2.0 | build/test |
| [`undici-types@7.24.6`](https://registry.npmjs.org/undici-types/-/undici-types-7.24.6.tgz) | MIT | build/test |
| [`vite@8.3.5`](https://registry.npmjs.org/vite/-/vite-8.3.5.tgz) | MIT | build/test |
| [`vitest@5.0.5`](https://registry.npmjs.org/vitest/-/vitest-5.0.5.tgz) | MIT | build/test |
| [`why-is-node-running@3.2.1`](https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-3.2.1.tgz) | MIT | build/test |

### Provider CLI lock

| Exact package | Declared terms | Distribution role |
|---|---|---|
| [`@anthropic-ai/claude-code@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.306.tgz) | SEE LICENSE IN README.md | runtime |
| [`@anthropic-ai/claude-code-darwin-arm64@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-darwin-arm64/-/claude-code-darwin-arm64-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-darwin-x64@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-darwin-x64/-/claude-code-darwin-x64-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-linux-arm64@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-arm64/-/claude-code-linux-arm64-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-linux-arm64-musl@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-arm64-musl/-/claude-code-linux-arm64-musl-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-linux-x64@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-linux-x64-musl@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64-musl/-/claude-code-linux-x64-musl-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-win32-arm64@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-win32-arm64/-/claude-code-win32-arm64-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@anthropic-ai/claude-code-win32-x64@2.1.306`](https://registry.npmjs.org/@anthropic-ai/claude-code-win32-x64/-/claude-code-win32-x64-2.1.306.tgz) | SEE LICENSE IN LICENSE.md | runtime, optional/platform |
| [`@openai/codex@0.163.0`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0.tgz) | Apache-2.0 | runtime |
| [`@openai/codex-darwin-arm64@0.163.0-darwin-arm64`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-darwin-arm64.tgz) | Apache-2.0 | runtime, optional/platform |
| [`@openai/codex-darwin-x64@0.163.0-darwin-x64`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-darwin-x64.tgz) | Apache-2.0 | runtime, optional/platform |
| [`@openai/codex-linux-arm64@0.163.0-linux-arm64`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-linux-arm64.tgz) | Apache-2.0 | runtime, optional/platform |
| [`@openai/codex-linux-x64@0.163.0-linux-x64`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-linux-x64.tgz) | Apache-2.0 | runtime, optional/platform |
| [`@openai/codex-win32-arm64@0.163.0-win32-arm64`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-win32-arm64.tgz) | Apache-2.0 | runtime, optional/platform |
| [`@openai/codex-win32-x64@0.163.0-win32-x64`](https://registry.npmjs.org/@openai/codex/-/codex-0.163.0-win32-x64.tgz) | Apache-2.0 | runtime, optional/platform |

## Locked Python distribution inventory

Exact-version PyPI metadata was checked on 23 October 2026. “Declared terms” is
`license_expression`, otherwise the declared licence/classifier label, not a new
licence grant. **Not declared** means the metadata was incomplete; inspect the
actual installed distribution's full notices before redistribution. The locks and
recipes remain the source of installation hashes and CUDA-wheel identities; PyPI
base-version metadata does not replace a `+cu128`/`+cu130` wheel's bundled terms.
Dependencies may bundle further third-party code/binaries not individually named
in metadata. This table covers all three committed requirements locks, not later
user/agent-installed tools.

| Exact package | Tool environments | Declared terms | Exact metadata source |
|---|---|---|---|
| `accelerate@1.13.0` | yue2 | Apache | [PyPI](https://pypi.org/pypi/accelerate/1.13.0/json) |
| `aiohappyeyeballs@2.7.1` | comfyui | PSF-2.0 | [PyPI](https://pypi.org/pypi/aiohappyeyeballs/2.7.1/json) |
| `aiohttp@3.14.5` | comfyui | Apache-2.0 AND MIT | [PyPI](https://pypi.org/pypi/aiohttp/3.14.5/json) |
| `aiosignal@1.4.0` | comfyui | Apache 2.0 | [PyPI](https://pypi.org/pypi/aiosignal/1.4.0/json) |
| `alembic@1.20.0` | comfyui | MIT | [PyPI](https://pypi.org/pypi/alembic/1.20.0/json) |
| `annotated-types@0.8.0` | comfyui | MIT | [PyPI](https://pypi.org/pypi/annotated-types/0.8.0/json) |
| `attrs@26.1.0` | comfyui | MIT | [PyPI](https://pypi.org/pypi/attrs/26.1.0/json) |
| `audioread@3.1.0` | analysis | MIT | [PyPI](https://pypi.org/pypi/audioread/3.1.0/json) |
| `av@19.0.2` | comfyui | BSD-3-Clause | [PyPI](https://pypi.org/pypi/av/19.0.2/json) |
| `blake3@1.0.11` | comfyui | CC0-1.0 OR Apache-2.0 | [PyPI](https://pypi.org/pypi/blake3/1.0.11/json) |
| `certifi@2026.10.19` | comfyui, yue2, analysis | MPL-2.0 | [PyPI](https://pypi.org/pypi/certifi/2026.10.19/json) |
| `cffi@2.1.1` | yue2, analysis | MIT-0 | [PyPI](https://pypi.org/pypi/cffi/2.1.1/json) |
| `charset-normalizer@3.5.2` | comfyui, yue2, analysis | MIT | [PyPI](https://pypi.org/pypi/charset-normalizer/3.5.2/json) |
| `cloudpickle@3.1.2` | analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/cloudpickle/3.1.2/json) |
| `comfy-aimdo@0.5.6` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/comfy-aimdo/0.5.6/json) |
| `comfy-angle@0.1.1` | comfyui | BSD-3-Clause | [PyPI](https://pypi.org/pypi/comfy-angle/0.1.1/json) |
| `comfy-kitchen@0.2.39` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/comfy-kitchen/0.2.39/json) |
| `comfyui-embedded-docs@0.5.14` | comfyui | GPL-3.0 | [PyPI](https://pypi.org/pypi/comfyui-embedded-docs/0.5.14/json) |
| `comfyui-frontend-package@1.57.1` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/comfyui-frontend-package/1.57.1/json) |
| `comfyui-workflow-templates@0.11.93` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates/0.11.93/json) |
| `comfyui-workflow-templates-core@0.3.384` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-core/0.3.384/json) |
| `comfyui-workflow-templates-json@0.1.119` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-json/0.1.119/json) |
| `comfyui-workflow-templates-media-api@0.3.84` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-media-api/0.3.84/json) |
| `comfyui-workflow-templates-media-assets-01@0.1.48` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-media-assets-01/0.1.48/json) |
| `comfyui-workflow-templates-media-assets-02@0.1.20` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-media-assets-02/0.1.20/json) |
| `comfyui-workflow-templates-media-image@0.3.160` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-media-image/0.3.160/json) |
| `comfyui-workflow-templates-media-other@0.3.229` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-media-other/0.3.229/json) |
| `comfyui-workflow-templates-media-video@0.3.101` | comfyui | MIT | [PyPI](https://pypi.org/pypi/comfyui-workflow-templates-media-video/0.3.101/json) |
| `cuda-bindings@12.9.4` | yue2 | LicenseRef-NVIDIA-SOFTWARE-LICENSE | [PyPI](https://pypi.org/pypi/cuda-bindings/12.9.4/json) |
| `cuda-bindings@13.4.4` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/cuda-bindings/13.4.4/json) |
| `cuda-pathfinder@1.8.3` | comfyui, yue2 | Apache-2.0 | [PyPI](https://pypi.org/pypi/cuda-pathfinder/1.8.3/json) |
| `cuda-toolkit@13.0.3.0` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/cuda-toolkit/13.0.3.0/json) |
| `decorator@5.3.1` | analysis | BSD-2-Clause | [PyPI](https://pypi.org/pypi/decorator/5.3.1/json) |
| `einops@0.8.2` | comfyui | MIT | [PyPI](https://pypi.org/pypi/einops/0.8.2/json) |
| `filelock@4.1.0` | yue2 | MIT | [PyPI](https://pypi.org/pypi/filelock/4.1.0/json) |
| `filelock@4.2.4` | comfyui | MIT | [PyPI](https://pypi.org/pypi/filelock/4.2.4/json) |
| `frozenlist@1.8.0` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/frozenlist/1.8.0/json) |
| `fsspec@2026.9.0` | comfyui, yue2 | BSD-3-Clause | [PyPI](https://pypi.org/pypi/fsspec/2026.9.0/json) |
| `hf-xet@1.7.0` | comfyui, yue2 | Apache-2.0 | [PyPI](https://pypi.org/pypi/hf-xet/1.7.0/json) |
| `huggingface-hub@0.36.2` | comfyui, yue2 | Apache | [PyPI](https://pypi.org/pypi/huggingface-hub/0.36.2/json) |
| `idna@3.20` | comfyui, yue2, analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/idna/3.20/json) |
| `jinja2@3.1.6` | comfyui, yue2 | OSI Approved :: BSD License | [PyPI](https://pypi.org/pypi/jinja2/3.1.6/json) |
| `joblib@1.6.0` | analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/joblib/1.6.0/json) |
| `kornia@0.8.3` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/kornia/0.8.3/json) |
| `kornia-rs@0.2.0` | comfyui | OSI Approved :: Apache Software License | [PyPI](https://pypi.org/pypi/kornia-rs/0.2.0/json) |
| `lazy-loader@0.6` | analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/lazy-loader/0.6/json) |
| `librosa@0.11.0` | analysis | ISC | [PyPI](https://pypi.org/pypi/librosa/0.11.0/json) |
| `llvmlite@0.50.0` | analysis | BSD-2-Clause AND Apache-2.0 WITH LLVM-exception | [PyPI](https://pypi.org/pypi/llvmlite/0.50.0/json) |
| `mako@1.4.3` | comfyui | MIT | [PyPI](https://pypi.org/pypi/mako/1.4.3/json) |
| `markupsafe@3.0.4` | comfyui, yue2 | BSD-3-Clause | [PyPI](https://pypi.org/pypi/markupsafe/3.0.4/json) |
| `mpmath@1.3.0` | comfyui, yue2 | BSD | [PyPI](https://pypi.org/pypi/mpmath/1.3.0/json) |
| `msgpack@1.2.3` | analysis | Apache-2.0 | [PyPI](https://pypi.org/pypi/msgpack/1.2.3/json) |
| `multidict@7.1.0` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/multidict/7.1.0/json) |
| `narwhals@2.27.1` | analysis | MIT | [PyPI](https://pypi.org/pypi/narwhals/2.27.1/json) |
| `networkx@3.4.2` | yue2 | OSI Approved :: BSD License | [PyPI](https://pypi.org/pypi/networkx/3.4.2/json) |
| `networkx@3.7` | comfyui | BSD-3-Clause | [PyPI](https://pypi.org/pypi/networkx/3.7/json) |
| `numba@0.68.0` | analysis | BSD | [PyPI](https://pypi.org/pypi/numba/0.68.0/json) |
| `numpy@2.2.6` | yue2 | Copyright (c) 2005-2024, NumPy Developers. | [PyPI](https://pypi.org/pypi/numpy/2.2.6/json) |
| `numpy@2.5.4` | comfyui, analysis | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | [PyPI](https://pypi.org/pypi/numpy/2.5.4/json) |
| `nvidia-cublas@13.1.1.3` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cublas/13.1.1.3/json) |
| `nvidia-cublas-cu12@12.8.4.1` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cublas-cu12/12.8.4.1/json) |
| `nvidia-cuda-cupti@13.0.85` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cuda-cupti/13.0.85/json) |
| `nvidia-cuda-cupti-cu12@12.8.90` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cuda-cupti-cu12/12.8.90/json) |
| `nvidia-cuda-nvrtc@13.0.88` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cuda-nvrtc/13.0.88/json) |
| `nvidia-cuda-nvrtc-cu12@12.8.93` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cuda-nvrtc-cu12/12.8.93/json) |
| `nvidia-cuda-runtime@13.0.96` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/nvidia-cuda-runtime/13.0.96/json) |
| `nvidia-cuda-runtime-cu12@12.8.90` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cuda-runtime-cu12/12.8.90/json) |
| `nvidia-cudnn-cu12@9.10.2.21` | yue2 | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cudnn-cu12/9.10.2.21/json) |
| `nvidia-cudnn-cu13@9.20.0.48` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/nvidia-cudnn-cu13/9.20.0.48/json) |
| `nvidia-cufft@12.0.0.61` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cufft/12.0.0.61/json) |
| `nvidia-cufft-cu12@11.3.3.83` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cufft-cu12/11.3.3.83/json) |
| `nvidia-cufile@1.15.1.6` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cufile/1.15.1.6/json) |
| `nvidia-cufile-cu12@1.13.1.3` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cufile-cu12/1.13.1.3/json) |
| `nvidia-curand@10.4.0.35` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-curand/10.4.0.35/json) |
| `nvidia-curand-cu12@10.3.9.90` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-curand-cu12/10.3.9.90/json) |
| `nvidia-cusolver@12.0.4.66` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cusolver/12.0.4.66/json) |
| `nvidia-cusolver-cu12@11.7.3.90` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cusolver-cu12/11.7.3.90/json) |
| `nvidia-cusparse@12.6.3.3` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-cusparse/12.6.3.3/json) |
| `nvidia-cusparse-cu12@12.5.8.93` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cusparse-cu12/12.5.8.93/json) |
| `nvidia-cusparselt-cu12@0.7.1` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cusparselt-cu12/0.7.1/json) |
| `nvidia-cusparselt-cu13@0.8.1` | comfyui | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-cusparselt-cu13/0.8.1/json) |
| `nvidia-nccl-cu12@2.27.5` | yue2 | BSD-3-Clause | [PyPI](https://pypi.org/pypi/nvidia-nccl-cu12/2.27.5/json) |
| `nvidia-nccl-cu13@2.29.7` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/nvidia-nccl-cu13/2.29.7/json) |
| `nvidia-nvjitlink@13.4.92` | comfyui | LicenseRef-NVIDIA-Proprietary | [PyPI](https://pypi.org/pypi/nvidia-nvjitlink/13.4.92/json) |
| `nvidia-nvjitlink-cu12@12.8.93` | yue2 | NVIDIA Proprietary Software | [PyPI](https://pypi.org/pypi/nvidia-nvjitlink-cu12/12.8.93/json) |
| `nvidia-nvshmem-cu12@3.4.5` | yue2 | Not declared | [PyPI](https://pypi.org/pypi/nvidia-nvshmem-cu12/3.4.5/json) |
| `nvidia-nvshmem-cu13@3.4.5` | comfyui | Not declared | [PyPI](https://pypi.org/pypi/nvidia-nvshmem-cu13/3.4.5/json) |
| `nvidia-nvtx@13.0.85` | comfyui | Apache 2.0 | [PyPI](https://pypi.org/pypi/nvidia-nvtx/13.0.85/json) |
| `nvidia-nvtx-cu12@12.8.90` | yue2 | Apache 2.0 | [PyPI](https://pypi.org/pypi/nvidia-nvtx-cu12/12.8.90/json) |
| `packaging@26.3` | comfyui, yue2, analysis | Apache-2.0 OR BSD-2-Clause | [PyPI](https://pypi.org/pypi/packaging/26.3/json) |
| `pillow@13.0.0` | comfyui | MIT-CMU | [PyPI](https://pypi.org/pypi/pillow/13.0.0/json) |
| `pip@25.3` | comfyui, yue2, analysis | MIT | [PyPI](https://pypi.org/pypi/pip/25.3/json) |
| `platformdirs@4.13.5` | analysis | MIT | [PyPI](https://pypi.org/pypi/platformdirs/4.13.5/json) |
| `pooch@1.9.0` | analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/pooch/1.9.0/json) |
| `propcache@0.5.4` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/propcache/0.5.4/json) |
| `psutil@7.2.2` | comfyui, yue2 | BSD-3-Clause | [PyPI](https://pypi.org/pypi/psutil/7.2.2/json) |
| `pycparser@3.11` | yue2, analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/pycparser/3.11/json) |
| `pydantic@2.14.1` | comfyui | MIT | [PyPI](https://pypi.org/pypi/pydantic/2.14.1/json) |
| `pydantic-core@2.50.1` | comfyui | MIT | [PyPI](https://pypi.org/pypi/pydantic-core/2.50.1/json) |
| `pydantic-settings@2.16.1` | comfyui | MIT | [PyPI](https://pypi.org/pypi/pydantic-settings/2.16.1/json) |
| `pyopengl@3.1.10` | comfyui | OSI Approved :: BSD License | [PyPI](https://pypi.org/pypi/pyopengl/3.1.10/json) |
| `python-dotenv@1.2.4` | comfyui | BSD-3-Clause | [PyPI](https://pypi.org/pypi/python-dotenv/1.2.4/json) |
| `pyyaml@6.0.3` | comfyui, yue2 | MIT | [PyPI](https://pypi.org/pypi/pyyaml/6.0.3/json) |
| `regex@2026.9.29` | comfyui, yue2 | Apache-2.0 AND CNRI-Python | [PyPI](https://pypi.org/pypi/regex/2026.9.29/json) |
| `requests@2.34.2` | comfyui, yue2, analysis | Apache-2.0 | [PyPI](https://pypi.org/pypi/requests/2.34.2/json) |
| `safetensors@0.7.0` | yue2 | OSI Approved :: Apache Software License | [PyPI](https://pypi.org/pypi/safetensors/0.7.0/json) |
| `safetensors@0.8.0` | comfyui | OSI Approved :: Apache Software License | [PyPI](https://pypi.org/pypi/safetensors/0.8.0/json) |
| `scikit-learn@1.9.1` | analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/scikit-learn/1.9.1/json) |
| `scipy@1.18.1` | comfyui, analysis | Copyright (c) 2001-2002 Enthought, Inc. 2003, SciPy Developers. | [PyPI](https://pypi.org/pypi/scipy/1.18.1/json) |
| `sentencepiece@0.2.2` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/sentencepiece/0.2.2/json) |
| `setuptools@80.9.0` | comfyui, yue2, analysis | MIT | [PyPI](https://pypi.org/pypi/setuptools/80.9.0/json) |
| `simpleeval@1.0.8` | comfyui | MIT | [PyPI](https://pypi.org/pypi/simpleeval/1.0.8/json) |
| `soundfile@0.13.1` | yue2 | BSD 3-Clause License | [PyPI](https://pypi.org/pypi/soundfile/0.13.1/json) |
| `soundfile@0.14.0` | analysis | BSD 3-Clause License | [PyPI](https://pypi.org/pypi/soundfile/0.14.0/json) |
| `soxr@1.1.0` | analysis | LGPL-2.1-or-later | [PyPI](https://pypi.org/pypi/soxr/1.1.0/json) |
| `spandrel@0.4.2` | comfyui | MIT | [PyPI](https://pypi.org/pypi/spandrel/0.4.2/json) |
| `sqlalchemy@2.1.5` | comfyui | MIT | [PyPI](https://pypi.org/pypi/sqlalchemy/2.1.5/json) |
| `sympy@1.14.0` | comfyui, yue2 | BSD | [PyPI](https://pypi.org/pypi/sympy/1.14.0/json) |
| `threadpoolctl@3.7.0` | analysis | BSD-3-Clause | [PyPI](https://pypi.org/pypi/threadpoolctl/3.7.0/json) |
| `tiktoken@0.12.0` | yue2 | MIT License | [PyPI](https://pypi.org/pypi/tiktoken/0.12.0/json) |
| `tokenizers@0.22.2` | comfyui, yue2 | OSI Approved :: Apache Software License | [PyPI](https://pypi.org/pypi/tokenizers/0.22.2/json) |
| `torch@2.10.0` | yue2 | BSD-3-Clause | [PyPI](https://pypi.org/pypi/torch/2.10.0/json) |
| `torch@2.13.0` | comfyui | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT | [PyPI](https://pypi.org/pypi/torch/2.13.0/json) |
| `torchsde@0.2.6` | comfyui | OSI Approved :: Apache Software License | [PyPI](https://pypi.org/pypi/torchsde/0.2.6/json) |
| `torchvision@0.28.0` | comfyui | BSD | [PyPI](https://pypi.org/pypi/torchvision/0.28.0/json) |
| `tqdm@4.70.1` | comfyui, yue2 | MPL-2.0 AND MIT | [PyPI](https://pypi.org/pypi/tqdm/4.70.1/json) |
| `trampoline@0.1.2` | comfyui | MIT | [PyPI](https://pypi.org/pypi/trampoline/0.1.2/json) |
| `transformers@4.57.6` | comfyui, yue2 | Apache 2.0 License | [PyPI](https://pypi.org/pypi/transformers/4.57.6/json) |
| `triton@3.6.0` | yue2 | OSI Approved :: MIT License | [PyPI](https://pypi.org/pypi/triton/3.6.0/json) |
| `triton@3.7.1` | comfyui | OSI Approved :: MIT License | [PyPI](https://pypi.org/pypi/triton/3.7.1/json) |
| `typing-extensions@4.16.0` | comfyui, yue2, analysis | PSF-2.0 | [PyPI](https://pypi.org/pypi/typing-extensions/4.16.0/json) |
| `typing-inspection@0.4.4` | comfyui | MIT | [PyPI](https://pypi.org/pypi/typing-inspection/0.4.4/json) |
| `urllib3@2.8.0` | comfyui, yue2, analysis | MIT | [PyPI](https://pypi.org/pypi/urllib3/2.8.0/json) |
| `wheel@0.45.1` | comfyui, yue2, analysis | OSI Approved :: MIT License | [PyPI](https://pypi.org/pypi/wheel/0.45.1/json) |
| `yarl@1.25.1` | comfyui | Apache-2.0 | [PyPI](https://pypi.org/pypi/yarl/1.25.1/json) |
