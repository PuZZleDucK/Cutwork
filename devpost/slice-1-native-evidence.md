# Slice 1 — native evidence map

## Verification structure, 23 October 2026

The initial twelve-case acceptance sketch never acquired an implementation
binding. Keep it as `tests/reference/slice1-native-acceptance.ts`, **not a
passing suite**. The actual implementation was verified through narrower,
independently inspectable live suites and native provider runs. This map replaces
the missing aggregate driver, not its assertions. No synthetic result is promoted
to a live pass; failed runs remain failed. The revision changes internal test
organisation, not the product, stack, permissions or acceptance boundary.

This avoids regenerating already verified songs/clips merely to obtain an
aggregate test count. Fresh runs remain available through the commands below.
The clean provider chain and independent file, codec, queue, native-session,
image-content and audio-content checks now **pass**. This completes slice 1’s
developer-facing proof, not the browser product or all later G1–G6 scenarios.

## Original assertions and concrete evidence

| Assertion | Actual evidence | Status / boundary |
|---|---|---|
| Three distinct isolated Python environments; native media binaries | Version-pinned prepare scripts, repeat installations, import/readiness probes and host-Python snapshots in `slice-1-progress.md`; actual YuE2, Comfy/H3 and analysis execution | Passed on Dundee. Not yet a fresh Ubuntu installation demonstration. |
| Codex ordinary research/script/score tools, actual requested model, project cwd and native session | Fresh `provider-smoke.ts` attempt `4742f041-74b6-4798-8701-18b2d6346f3a`, native session `01a16548-4774-7ff1-9d5d-118bafd51ba9`, independently executed artifacts | Passed; `gpt-6.1-sol`, native CLI session evidence, not server-side model attestation. |
| Claude equivalent capability | Attempt `415004cc-d39d-4eb8-85d4-b7880dd143c6`, native session `55b8aa24-7719-4e4c-8b71-2c2017376379`, independently executed artifacts | Passed; `claude-opus-5-5`. This is not a second complete media generation. |
| Fresh provider → real song → song-conditioned H3, 24 fps, 640×480, two-second placement and native overshoot | `scripts/provider-media-proof.ts`, then independent `verify-media-proof.ts` and `verify-media-content.py`; current parent attempt `038bad51-603b-452f-9f1e-54da89d85d36` | **Passed**, including the independent media-content audit. |
| Every ordered original PNG, exact bytes and pre-encode provenance | Same independent checks: actual manifest, all hashes/pixels, saved graph, Comfy history and PNG metadata | **Passed for the fresh chain.** PNGs are original saved 8-bit images, not floating-point VAE tensors. |
| Full-song sparse export, exact frame count, H.264/AAC and unchanged source audio | Same checks: decode all media, compare first 48 frames to original PNGs, verify remaining black frames and reference AAC packets | **Passed.** The sparse two-second visual proof is intentionally not a finished music video. |
| Actual failed-call replay preserves inputs/settings/seeds | `tests/live/gpu-failed-replay.test.ts`, actual OOM-failed `6858b949-31fe-4775-877a-d905d35f6898` → successful `7055217e-2c09-4cc0-b1e1-2a9b0c90f932`, HTTP coordinator and native helper | **1/1 passed.** Reproducible inputs do not promise byte-identical model output. Token-bounded feasibility audio remains labelled truncated. |
| YuE2 queued cancellation, never launches | Actual SQLite queued records in model-lane run; focused `gpu-queued-cancel.test.ts` adds monotonic timing and reopen/no-dispatch assertions | **1/1 focused scenario passed for both tools.** YuE2 durable cancellation: **386.74 ms**; no native launch. |
| H3 queued cancellation, never launches | Same durable-queue check; separately verified native Comfy pending-prompt cancellation in real CPU integration | Same passing focused scenario: H3 durable cancellation **380.28 ms**. A pre-dispatch studio job differs from an already submitted Comfy prompt; neither is called running-inference proof. |
| YuE2 running cancellation and release | `gpu-model-lane.test.ts`, unfinished semantic-stage progress + owned CUDA PID, call `d95891f3-8345-4ba7-8709-8a676b57aab8` | This operation and its assertions passed: about **1.693 s** to confirmed release. The containing multi-operation test later failed at a different H3 observation. |
| H3 running cancellation and release | Focused `gpu-model-lane.test.ts` mode, call `d692b734-78cc-47a9-abc4-5dec4bd99190`; unfinished native inference and identity-bound running prompt | **1/1 passed**, about **3.425 s** to confirmed release. No hard latency SLA inferred. |
| Music → video → music dispatch only after release | Three sequential native successes and release receipts in `gpu-model-retry.e5aac7af-42ac-468d-8b37-ae6deea49b37`; independently audited queue and process evidence | All three operations/ordering passed. The enclosing later H3-cancellation telemetry failure is retained, not relabelled as an aggregate pass. |

## Retained failures and limits

- The initial return-to-music call was killed by systemd-oomd under system RAM
  pressure. Dundee has 22 GiB RAM; this was not evidence of a VRAM-only failure.
  The user authorised pausing the separate roughly 6 GiB TTS service for tests,
  with restoration afterward. Personal Comfy was not stopped.
- A later H3 cancellation succeeded but its progress observer raced the departing
  owner. The failing harness result was retained; the fixed focused run passed.
- Native release observations were clear on their first valid query. The new
  lingering-NVML-row settling branch has synthetic coverage, not a naturally
  occurring native pass. Query errors still retain reconciliation.
- Ownership evidence covers ordinary registered unit descendants/direct host
  CUDA PIDs, not arbitrary unregistered work, MPS or hidden PID namespaces.
- Restart reconciliation, full first-use setup, browser behaviour, continuation,
  post-song generation, editing and final newcomer demonstration belong to later
  slices. Initial G1–G4 evidence does not complete all of those gates.
- Media decoding and source comparison do not establish listening quality.
  The learner previously played and liked the earlier validation video; the
  fresh output is separately identified, not substituted for that feedback.

## Repeatable commands

Run on Dundee with pinned Node 24 and the installed isolated tools. Each native
command is opt-in and may consume provider credits/GPU time. Use new private
output directories; never overwrite a previous failed proof. No unrelated
services are automatically stopped.

```sh
# Source checkout containing the pinned dependencies; actual verified GPU UUID.
STUDIO_LIVE=1 STUDIO_GPU_UUID=GPU-... \
  node scripts/provider-media-proof.ts codex --run
# Use the captured plan path printed above and the runtime's real queue DB.
node scripts/verify-media-proof.ts /absolute/captured-plan.json /absolute/gpu-queue.sqlite
/absolute/runtime/tools/comfyui/venv/bin/python -I scripts/verify-media-content.py \
  --plan /absolute/captured-plan.json --output /absolute/new-content-audit

# Separate real-model lane; for focused H3 cancellation also provide the
# absolute retained request via STUDIO_MODEL_H3_CANCEL_INPUT.
STUDIO_LIVE=1 STUDIO_MODEL_LANE=1 STUDIO_LIVE_RUNTIME=/absolute/runtime \
  STUDIO_MODEL_LANE_OUTPUT=/absolute/new-proof STUDIO_GPU_UUID=GPU-... \
  node node_modules/vitest/vitest.mjs run --config vitest.live.config.ts \
  tests/live/gpu-model-lane.test.ts

# Queued cancellation: no model or GPU query is supposed to launch.
STUDIO_LIVE=1 STUDIO_QUEUED_CANCEL=1 \
  STUDIO_QUEUED_CANCEL_OUTPUT=/absolute/new-queued-proof STUDIO_GPU_UUID=GPU-... \
  node node_modules/vitest/vitest.mjs run --config vitest.live.config.ts \
  tests/live/gpu-queued-cancel.test.ts
```

Machine paths, complete transcripts, generated media, raw database copies and
credentials remain outside Git. Public documentation records run identity and
verification boundaries, not private prompt/history dumps.

## Queued-cancellation execution note

The focused scenario passed from snapshot `queued-cancel-v2.OiuSlKsD` with
persisted cancelled rows surviving reopen, zero command resolutions and no
native-unit directory. Those timings were measured while the unrelated H3 proof
was running; they are observations, not a performance budget. An earlier test
collection command accidentally treated a positional filename as Vitest's JSON
output path and replaced the new test with a listing. That retained run failed
with no tests; the authored file was restored and executed correctly. No model
was started by either queued-check invocation.

## TTS restoration

After both native helpers succeeded and the actual shared lease was empty,
`chatterbox-tts.service` was restarted at **07:52:34 AEDT, 23 October**. Its new
invocation loaded its model successfully, completed startup, listened on port
8004 and returned HTTP 200. The temporary automatic-restore timer was stopped
after the service was active. Personal Comfy's original process identity and
port were retained. This restores the user's service; it is not app behaviour.

## Clean provider-chain result

Source `78079ae`; parent `038bad51-603b-452f-9f1e-54da89d85d36`;
Codex native session `01a16559-5a50-7cd3-97aa-8eb5a1ce99d0`.
The native session records `gpt-6.1-sol`, CLI 0.163.0, the expected project cwd,
normal full-access invocation and 33 actual tool calls. No provider response
schema or tool restriction was added. Source/session/receipt/media hashes are
retained privately; 153 copied evidence files were independently rehashed.

- YuE2 `f1a0299b-d0ea-4546-b06a-d3198be82db1`: **46.0386667 s**, 2,209,856
  stereo samples at 48 kHz, ABC and semantic truncation both false. The rough
  15–25-second creative request was not exact duration control. Helper 126.30 s;
  unit 128.90 s / 8.8 GiB peak RAM. Torch peak allocation 8,509,751,808 bytes
  is a different metric from total GPU occupancy.
- H3 `e77acfd7-ace2-4199-a37d-ca7c783c4d5d`: **56 native PNGs/frames**, 24 fps,
  640×480. All original hashes/pixels, saved graph, actual native history and PNG
  conditioning fingerprint agree. Independently decoded first 112,000 original
  song samples per channel exactly equal the conditioning PCM.
- H3 helper 425.30 s; native prompt log 208.90 s; sampled owned GPU peak
  **15,298 MiB**, process high-water RSS **18,835,556 KiB**, sampled process swap
  **3,588,280 KiB**. Unit accounting separately reports 18 GiB peak RAM / 3.5 GiB
  peak swap. These are narrow observed results, not an 8 GB or VRAM-only promise.
- Export: **1,105 frames / 46.0416667 s**. First 48 frames match the original
  images within measured lossy-encoding error; all 1,057 remaining frames are
  black (maximum decoded RGB value 1). Native-frame maximum RGB MSE 16.02;
  export placed-frame maximum 25.59, both below the declared threshold 100.
  Visual similarity alone cannot uniquely order nearly identical images;
  native history/manifest ordering is checked independently.
- **2,160 AAC packet hashes and timing/padding records exactly match** an
  independent FFmpeg native-AAC 192-kbit/s encoding of the unchanged original
  song plus 144 samples/channel of final frame-boundary silence. This is stronger
  than codec/profile validation, not a claim of mastering or listening quality.
- Both native calls succeeded through HTTP/SQLite and released their owned
  units/CUDA resources. The actual queue has no held lease; all 48 remembered
  helper/query PIDs and the provider process/group were independently absent.
  Personal Comfy's identity was unchanged. The outer provider unit exited 0.
- Original song, native clip, raw frames and export occupy about 70 MB of logical
  evidence files for this run (excluding shared models and duplicate audit copies).

The independent content checker itself passed **13 synthetic CPU diagnostics**
in the isolated Comfy environment, including wrong pictures/audio, black placed
frames, nonblack gaps, altered provenance and wrong AAC settings. Its actual
media audit then passed in 7.106 s with 71.4 MiB peak RAM and no swap. These
fixture counts and the native audit are reported separately. Final local
TypeScript verification: typecheck and **579/579 default tests** pass.

An original generated frame was visually inspected and shows the requested
small robot/music-machine workshop. Neither agent claims to have listened to
this new song or watched the entire video. The next planned hands-on checkpoint
is the first browser studio, not another approval of this internal proof.
