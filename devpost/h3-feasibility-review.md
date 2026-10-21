# H3 feasibility review — proceed decision recorded

21 October 2026. Slice 1 remains incomplete. The learner chose to proceed with H3 after reviewing the concern. This is not an installed-video or legal-clearance claim.

## Technical findings

- Inspected ComfyUI **0.42.0**, revision `f5c611e3849ff7219dfb7d7b251092ab8a9b51dc`. Its official archive SHA256 is `a8b098364547eaba668eff2245eb2e53c03f789b9a04e4bb0339977846afee74` (locally computed, not an upstream signature).
- The source includes H3 image-to-video, audio-guide and reference nodes. Audio-guide conditioning can reach the sampler; frame generation uses the native `17k+5` grid. The planned raw-frame branch and actual two-second request still need execution proof.
- Inspected official repackaged model revision `e5eb578a89295337b8ff433a035929ce0279e0b6`, public/ungated at this check. A small candidate set comprises the files below; at this initial inspection none had been downloaded for this product. Subsequent download/output-probe progress is recorded in [slice-1 progress](slice-1-progress.md); these initial findings are not the current installation status.

| Candidate file | Bytes |
|---|---:|
| `diffusion_models/minimax_h3_fl2va_pruned_w6a8.safetensors` | 15,983,746,636 |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15,687,142,551 |
| `vae/minimax_h3_video_vae_int8_convrot.safetensors` | 2,811,065,184 |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | 605,254,808 |
| **Total, excluding environment/source/outputs** | **35,087,209,179** |

File size is not peak GPU/host memory. This set still needs measured CPU/GPU offloading and compatibility on Dundee; it does not establish 16 GB operation. No optional acceleration plugins, turbo LoRAs or alternative model families have been selected.

Sources: [pinned ComfyUI source](https://github.com/Comfy-Org/ComfyUI/tree/f5c611e3849ff7219dfb7d7b251092ab8a9b51dc), [pinned model files](https://huggingface.co/Comfy-Org/MiniMax-H3/tree/e5eb578a89295337b8ff433a035929ce0279e0b6), [official H3 integration guide](https://docs.comfy.org/tutorials/video/minimax/minimax-h3). Local source/API evidence is under ignored `.local-evidence/slice-1/research/comfy/`.

## Licence finding requiring a product decision

The upstream licence excludes the EU, UK, Republic of Korea and USA from its territorial grant. Section V.4 explicitly addresses outputs as well as model works. V.2/V.5 impose recipient/access obligations. VI.4's statement about output ownership does not remove those separate conditions. These need review against public sharing and third-party access; this is not a legal-compliance determination. [Pinned upstream licence](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/LICENSE)

Evidence identity: `MiniMaxAI/MiniMax-H3` revision `42ed227ee7df40d41602854ae760620d6eb651fe`; licence SHA256 `59b99642b95ea21630e311198ddbfffbfe05aadba0c2f5d884cbdf4efcc90f44`, 17,604 bytes, checked against upstream Git blob `c389b45855337ccec8ddeb389f4fe902abcd0b19`. The repackaged model card links to this upstream agreement rather than supplying a replacement licence.

## Action and boundary

- **Decision recorded:** the learner explicitly approved continuing with H3 for the Australian-hosted prototype and install-on-demand distribution, retaining the planned licensing-information page. Resume H3 setup; do not silently choose another backend.
- No alternative investigation is requested at this point. Any later switch still needs review: song conditioning, short clips, raw frames, continuation, seeds, 16 GB operation and cancellation must still meet the agreed requirements, or receive an explicit reviewed change.
- Do not add unrequested agent restrictions, accounts, filters or territorial enforcement. Do not claim that a noncommercial demo, the application's own FOSS licence, or the server's location settles model/output terms.
- No approved scope/PRD/spec choice has been silently rewritten. A read-only review confirmed this is a suitable decision pause, not a legal verdict.

## Initial investigation, before the proceed decision

At the initial decision pause, only local research files, downloaded ComfyUI source and project documentation had been added. Dundee was inspected read-only for hardware/disk/source-version context; the transient version-check process exited normally. No new Comfy environment/service, H3 model weights, provider task or video generation was started. Existing personal services and the prior YuE2 proof remain untouched. No application code or tests changed in this investigation.

## Decision rationale and release boundary

The learner distinguishes distributing installation instructions/automation from redistributing the installed tools and cited a recent launcher/codec-packaging analogy. That analogy has not been independently verified here and is not treated as a legal precedent. Record this as the learner's implementation decision, not a conclusion that an information page or packaging approach settles every licence obligation. Keep the already planned separation of application, tool, model and output terms; licence presentation and public-release suitability remain review items. No unrequested accounts, agent sandboxing or tool restrictions are added.
