# Slice 2 — browser integration evidence

Status: **mechanical checkpoint passed, 23 October 2026; early learner UI feedback pending**.

## What is usable

`http://dundee.local:9122/` serves the actual React/Fastify/SQLite studio, not a
fixture. Projects/Config, global setup/readiness, provider selection, saved music
and optional lyrics, server-owned generation, original-song playback, analysis
and expandable provenance are implemented. Video editing/export, archive/delete
and richer debug/cancel interactions belong to subsequent slices and are not
presented as working controls. Assembly branding is provisional; Kirsty is not
bundled and the current title fallback is not that font.

The app runs as the user-owned `music-video-studio.service` on Dundee. This is a
developer deployment, not yet boot-enabled newcomer installation packaging.

## Automated checks and repairs

- **718/718 default tests in 36 files passed locally and on Dundee**, with
  typechecking on both and a successful production Vite build locally.
- Tests exercise actual SQLite/Fastify/process fixtures with injected provider
  and setup operations. They do not authenticate, generate media or prove GPU
  behavior. Initial missing-module failures established ordering, not behavioral
  red proof; focused counterexample tests were used for subsequent repairs.
- Reviews repaired owned-child cleanup/shutdown ordering, stale provider checks,
  startup reconciliation, immutable submission/seed handling and API ingestion.
  No unknown ownership is silently declared stopped or automatically replayed.
- Direct Node loading found a TypeScript parameter property that transpiled tests
  had hidden. The repair now passes native Node loading and regression checks.
- Actual post-song analysis initially displayed Idle while running. The final
  repair sets Active around CPU execution, resets it on success/failure, and
  marks crash-interrupted pending analysis explicitly failed on restart while
  preserving the playable song. These added paths have fixture regressions;
  the real song analysis completed normally before that status/recovery repair.
- An initial remote typecheck failed because test-support files were omitted
  from the deployment copy. The full test tree was copied and the complete run
  then passed. The failed run remains a failure, not evidence of success.

## Actual browser journey

Chrome on a separate LAN machine used the deployed application to:

1. Create **First LAN Take**, save music/lyrics, reload and recover the draft.
2. Queue a real request, change the default Codex → Claude → Codex, and verify
   the existing immutable request still targeted Codex `gpt-6.1-sol`.
3. Create **Second workspace**, switch projects and reload during work. The
   second project remained empty and separate; the first generation continued.
4. Reload during both queued and native-running generation. Exactly one attempt,
   one native call and one selected song resulted; no duplicate submission.
5. Run managed analysis and ComfyUI setup verification from Config. Reload during
   the actual ComfyUI CPU probe: job `1c19c221-3c6c-4338-9ca3-55d5b0866a00` stayed
   the same and progressed from installing to ready. No personal service was used.
6. Play the original song through the browser's audio control; playback advanced
   beyond 16 seconds with no media error. Inspect waveform, estimated BPM and
   expandable actual inputs, tool settings, exact seeds, output and provider prose.
7. Inspect desktop and 390 × 844 responsive layout. The mobile content was
   single-column with no document-width overflow; the viewport override was reset.
   No browser warnings/errors were recorded during the successful journey.
8. Restart the idle studio service, reload, and recover exactly the same project
   API document: drafts, selected song, analysis and history were unchanged. No
   generation was automatically rerun; existing media remained accessible while
   startup readiness verification ran in the background.

First-use dependency ordering, Install all deduplication, missing-auth guidance,
draft conflicts and failure paths are automated/injected checks, not claims that
each destructive or error-producing case was manually repeated on Dundee.

## Real song and independent audit

| Item | Recorded result |
| --- | --- |
| Project | `c1ecd142-d2b4-48f4-aa85-4adcf59ae423` |
| Attempt | `318889f9-233d-4f6f-b474-6aa2a759cdc5` |
| Native YuE2 call | `7a31d330-c341-4d4f-bfbb-d745e315bbf9` |
| Selected song | `21cf267f-5149-4f58-a3eb-bdc4cc00fbe6` |
| Output | 33.5986666667 s; 1,612,736 samples/channel; 48 kHz stereo float WAV |
| WAV SHA-256 | `b9eb68fc69d6d0afe7069063aa2ed5241993a53dd176e8ef47f3989905ac2009` |
| Seeds | ABC `6408402150138170139`; semantic `5517707656245290285`; NAR `435441881378818276` |
| Analysis | 3,150 waveform buckets; 65 estimated beats; estimated 119.680851 BPM |
| Native helper elapsed | 117.566 s, excluding earlier setup queue wait and provider work |

An independent read-only audit passed **76 checks**: immutable inputs/provider/
seeds, exactly-once ingestion, all 20 native artifact hashes and saved stage
seeds, full FFmpeg decoding/ffprobe, bit-exact waveform recomputation, stored
beat/sample bounds and version/helper references, HTTP bytes matching original
WAV, and captured process/group/cgroup/GPU release observations. No additional
model was launched by the auditor. The final provider and native processes were
gone and the shared GPU lease was released.

ABC and semantic truncation flags were false. The brief requested about 20–30 s;
the actual song is 33.6 s, and the agent disclosed that overshoot rather than
pretending the request was an exact duration constraint. Playback/decoding does
not establish artistic quality, lyric intelligibility or musical beat accuracy.
Beat positions were checked against receipts and sample bounds, not redetected
by an independent musical algorithm. Provider identity reflects captured and
executed CLI configuration, not backend attestation.

## Retained evidence and boundaries

Private local evidence lives in ignored `.local-evidence/slice-2/`: final local
and Dundee test logs, source SHA-256 manifest/remote comparison, independent audit
and script, before/after setup and generation snapshots, before/after idle-restart
project documents, and actual desktop/mobile screenshots. Use
`studio-mobile-full.png`, not the earlier stale/scaled `studio-mobile.png` capture.
Runtime media and complete process/tool receipts remain in the project-specific
Dundee data root; none is committed to Git.

Trusted LAN only; no accounts. Full-access agents retain normal tools and the
service-account environment. Host/Origin/JSON/asset validation protects the web
application boundary; it is not a sandbox on creative agents. Native execution
has a visible configurable deadline. Python environments remain isolated.

TTS was restored after the preceding native-video tests and remained active for
this browser music test; no second pause was necessary. Personal ComfyUI was
unchanged. The studio never automatically stops unrelated services. Setup checks
on this already-prepared host are **not** a clean-host download/install proof;
newcomer packaging remains a later slice. Fresh full Claude media generation,
browser video/export and human listening feedback are not claimed here.
