# Slice 6 — Continuation evidence

**Mechanically verified and deployed, 23 October 2026.** Synthetic media is not
claimed as H3 output. Final perceptual learner review remains separate.

## Source and deterministic checks

- Full suite: **1,133/1,133** in the first local and Dundee deployment. The final
  associated-intent regression brings both hosts to **1,135/1,135** in the
  UI-only follow-up source; TypeScript
  typecheck and production build pass. Native helper diagnostics: **42/42** Python
  tests. Focused native transport/capture/recovery contracts: **102/102**.
- Store/API tests cover trimmed, moved, unplaced and cross-song contexts; stale
  revision rejection; idempotent accepted-request replay; raw native overshoot;
  one-frame trims; missing-analysis manual end; metadata-only schema 5→6.
- The shared timing helper retains exact rational starts/ends and adaptive
  eight/four/two/one-beat durations without ordinary gap search or beat snapping.
- Independent review reproduced and repaired clean cross-song recovery hiding a
  prepared frame, late acceptance clearing a newer capture's timing, an
  acknowledgment stealing a successor draft writer, and same-image remote edits
  losing associated prompt/timing during an older request acceptance. New regressions failed
  before repair; source, byte and ownership guards now pass.

## Browser — isolated synthetic CPU fixture

No provider, GPU or user project was involved in these checks.

1. Trim source frames 1–80 to 6–75. Continue is disabled until Apply.
2. Move the 70 retained frames to zero-based boundary 29, then unplace them.
3. Continue uses source PNG index 74 (inclusive label 75), exact adjacent boundary
   99, and proposes [99,195): eight beats/four seconds at 120 BPM. No placement,
   generation or coverage is added by preparation.
4. Existing next-shot description survives; image/context/timing survive reload.
5. Manually change end to 8.25 seconds and Generate: one synthetic request captures
   [99,198), source PNG/hash/context revision unchanged; prompt and binding clear
   only after acceptance. This is an accepted fixture request, not native inference.
6. Switch to a second song and use the explicitly labelled first-song continuation.
   The original song is selected with the new prepared image and no false conflict.
7. Reuse the same clip in a second-song context with unavailable analysis. Continue
   uses that context's source frame 80/end80 and leaves end entry blank.
8. Simulate another editor changing the predecessor. Generate reports a stale
   context and retains the full form. Removing the image preserves timing.
9. A 16⅔-second request shows the long-duration warning and is accepted into the
   synthetic queue; the warning is not a product cap or an inference-success claim.

10. Hold an accepted synthetic HTTP submission response; save a newer same-image
    prompt from a separate API client while the UI is busy. Polling displays the
    newer draft. Release the old response: prompt, PNG index74 and exact [99,195)
    timing all remain intact, with no extra draft revision. The accepted attempt
    is unchanged. This directly exercises the final late-acceptance fix in Chrome.

Private evidence: `.local-evidence/slice-6/{browser,native,timing,deploy}/` and
local test/build/typecheck logs. Generated media and machine-specific records
remain ignored by Git.

## Live deployment preservation

The schema5→6 update passed **46/46** independent preservation checks before
any proof-project writes. All **554** registered assets retain their exact bytes,
hashes, sizes, mtimes and inodes. Every prior creative row, saved draft, context,
render snapshot, native request/receipt/seed/session/status and sequence is
unchanged. No table or index was added; only metadata version and ordinary tool
readiness changed. The selected project/provider and unrelated services were
preserved. All five tool checks settled ready and the coordinator is idle.

The subsequent UI-only correction also passed **46/46** schema6→6 checks after
all proof work drained: all metadata, creative/native rows and **789 assets**
(including the new proof) remained exact. No backend, native helper, dependency
or model change was deployed in this follow-up. All five tool checks settled
ready; TTS and personal ComfyUI identities stayed unchanged across activation.

Chrome reload showed the completed clips/export and preserved draft. Preparing
another continuation from the final clip selected its retained frame48, began at
boundary324 (13.5 seconds), and suggested eight further beats with both post-song
advisories. It created no new generation or placement. The original user project
was then reopened with its music/lyrics/style, blank shot description, exact
timing fields and four placements unchanged. Deliberate post-audit preparation
and project-open events are not described as deployment-preservation evidence.

## Real native proof

The first continuation succeeded through the actual Codex/H3 path: a copied
predecessor was trimmed to source `[5,45)`, moved to `[140,180)`, and continued
using raw PNG index44. The request `[180,228)` covers 7.5–9.5 seconds of an
8-second copied song excerpt. It generated and preserved 56 native frames while
placing only the requested 48. Source conditioning contains the final 24,000
song samples plus 88,000 silent samples for the full native duration. Original
input and generated first/last retained stills have been inspected; no claim of
watching/listening or seamless motion follows from that.

The next two actual Codex/H3 continuations succeeded at `[228,276)` and
`[276,324)`, each taking the previous clip's retained PNG index47 rather than its
extra native frames. Each generated 56 originals and placed 48 requested frames.
Both receive exactly 112,000 silent conditioning samples/channel; the workflow's
image and audio guidance branches were independently checked against executed
Comfy history. Captured seeds, model/source hashes, original PNG bytes/pixels and
queue ownership/release receipts agree for all three jobs.

The third job temporarily put the host under substantial RAM and I/O pressure.
A read-only observer GET timed out while inference continued. The same request
subsequently succeeded; no resubmission, service restart or unrelated process
termination was used. The timeout and host-pressure evidence are retained. This
is a successful short-run proof on Dundee, not a broad hardware-capacity promise.

The imported song and predecessor are explicitly labelled copied prior real
media, not fresh YuE2/H3 generations. Subsequent clips are genuine new inference.
The independent audit checked **334 files**, with all **59 original source files**
unchanged. Both exported variants contain **324 frames / 13.5 seconds**, extending
5.5 seconds beyond the 8-second excerpt. Every encoded video and audio packet
matches a separately constructed reference edit:

- Song-only: 648,000 working samples/channel, exact zero samples after the song;
  decoded AAC steady-tail RMS is zero (8.25–13.25 seconds, excluding boundaries).
- Clip-audio: only enabled clip audio replaces the song over those intervals.
  Wholly post-song audio is nonzero but very quiet (decoded steady-tail RMS
  approximately 0.00001391); this is not a claim of perceptually useful foley.

The actual Chrome download matches the audited clip-audio export SHA256.
Headless VLC decoding/playback exits 0. Representative exported join frames and
the final retained frame were visually inspected. These are not human listening
or full-motion/seamlessness judgments; perceptual review stays in the final
learner checkpoint.

TTS was restored and verified active with its model-info endpoint returning 200
and the model loaded. Personal ComfyUI's PID/start identity remained unchanged.
All three native jobs released their owned resources and the shared queue is idle.
Private evidence is under `.local-evidence/slice-6/proof/`; the complete independent
audit also remains in Dundee's managed proof folder.

## Remaining review boundary

Try Continue From End on a saved trimmed/moved clip, inspect its starting image
and proposed times, then watch/listen to an extended export. Fast mode carries
this perceptual judgment into the final learner checkpoint rather than claiming
agent-side decoding proves artistic quality.
