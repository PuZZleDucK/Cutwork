# Slice 3 — browser clips, sequence and export

23 October 2026. **Mechanically verified; integrated learner feedback pending.**
This is prepared-host evidence on Dundee, not a clean-install demonstration or
completion of the later editing, recovery, lifecycle and packaging slices.

## What now works

- Describe a clip against the selected song, with video-only project style.
  The request freezes song identity/audio, timing, provider and random seed.
- Server-owned music/video scheduling, persistent placeholders and reservations;
  successful clips join their submitted location exactly once.
- Adaptive earliest-free beat presets, integer 24 fps boundary controls, warning
  markers, waveform/beat display and coverage. Pending work reserves time but
  does not count as coverage. Basic place/remove/move controls retain originals.
- Complete pre-encode PNG batches, native overshoot and expandable generation
  inputs/settings/history. Default source players are muted; the sequence uses
  the original song.
- Revision-bound CPU preview/export, black gaps, post-song duration and immutable
  media plans. The same verified H.264/AAC file is previewed and downloaded.
  Stale renders remain playable as old previews, not current downloads.
- ComfyUI and H3 indicators describe the same actual native activity lane. This
  final mapping has a regression test; no extra inference was spent just to
  exercise the label after deployment.

## Mechanical checks

**846 tests across 43 files**, typechecking and production build pass locally
and on Dundee using Node 24. Fixture tests do not call paid providers or models.
The pre-native candidate passed 845 tests; one final status regression accounts
for the difference. Independent focused review covered capture, migration,
render/cache integrity and failure cleanup.

A final staging invocation initially failed because npm itself used pinned
Node 24 while its child scripts resolved Dundee's old Node 22 from PATH. The
live application already selected the correct pinned Node. We preserved the
failed run, corrected only the staging harness PATH, asserted the child's exact
executable/version, and reran the entire suite successfully. No assertions,
deadlines or application dependencies were weakened to obtain a pass.

## Actual browser generation

A separate **Clockwork Light** project preserved the user's earlier work.
A browser-submitted instrumental completed through Codex/YuE2 and analysis.
Its original is **83.5586667 seconds / 4,010,816 samples per channel / 48 kHz
stereo**. The creative brief asked for 20–30 seconds at 120 BPM: these requests
were not achieved as exact constraints. The complete output is retained rather
than silently shortened. Librosa's estimate, about 59.8 BPM, is not ground truth.

Three actual H3 requests were submitted through the browser with the same brass
robot/workshop visual style and original-song conditioning:

| Request | Submitted/placed frame interval | Original frames retained | Recorded seed |
|---|---|---:|---|
| 7 | [0,48) | 56 | 1274088241629532149 |
| 8 | [48,96) | 56 | 4422057178083799672 |
| 9 | [120,168) | 56 | 6218195118812757183 |

All three succeeded without generation retries. Refresh during queued/running
work preserved identities, seeds and reservations. With all pending, coverage
remained 0% and the next suggestion correctly filled only the gap [96,120).
Completed coverage is **7.180583702%**, displayed as 7.2%. This is deliberately
a sparse verification sequence, not a finished full-length artistic video.
Two-second native tests do not establish default eight-second workload capacity.

## Independent picture and audio checks

Final render `4a8ad16d-802f-4960-a327-52e72eca3ac6`, arrangement revision 7:

- H.264/yuv420p **640×480, 24 fps, 2,006 frames / 83.5833333 seconds**;
  AAC stereo 48 kHz / 192 kbps encoding setting.
- All **168 native frames** checked against saved original PNGs and successful
  native history; exact request/style/seed/source/conditioning bindings checked.
- Independent fixed interval mapping, not the renderer's compiler, checked all
  **144 placed frames**. Maximum lossy RGB MSE 12.2145, under the predeclared
  threshold of 100. Near-identical frames cannot be uniquely ordered by MSE;
  retained native history establishes recorded original order.
- All **1,862 gap/tail frames** were exactly RGB black: [96,120), [168,2006).
- Each 112,000-sample conditioning segment matched the exact original song slice.
  All **3,919 AAC packet hashes/timings/padding** matched an independent encoding
  of the original song with **1,184 silence-padding samples**.
- Separate complete audio/video decoding of the export and all three native
  MP4s passed without errors. All 216 audited input hashes remained unchanged.
- Export SHA256:
  `8502de3630b6ae3fa09c7e0fd6c91d689da442483deab34edd42dd69e8c36d49`.

The audit used bounded CPU work (26.2 seconds, about 79 MiB peak), not another
model run or a new model-weight rehash. It makes no listening/artistic-quality
claim or guarantee that actions landed musically on the requested beats.

## Browser, export and stale-render behavior

- Native source playback and final assembled playback advanced with readyState 4
  and no media errors. Final playback passed 19 seconds; the preview was then
  paused and returned to its beginning through normal controls.
- An ordinary **Download MP4** link click saved the file in the browser's Downloads
  directory. Its bytes match the registered render and separate HTTP 200 download.
  A convenience automation download method had canceled; normal link-click
  behavior succeeded without bypassing any browser security warning.
- Actual VLC played the same bytes to EOF and exited 0 using headless dummy
  audio/video outputs. This is VLC decode/playback proof, **not GUI observation
  or human listening**; the learner checkpoint includes normal VLC playback.
- During a real render, the first clip was temporarily moved back from frame
  2400 to frame 0. A saved API snapshot shows revision 5 while the revision-4
  render was still running. That old render later succeeded but its current
  download route returned **409 STUDIO_CONFLICT**. Original placements were
  restored before the final independent audit.
- Narrow viewport inspection at 390×844 found no horizontal overflow (content
  and scroll width both 375 px); the override was reset. Final desktop screenshot
  records actual generated picture, completed render and download controls.

## Deployment, preservation and resources

The final update used a new, hash-verified 187-file source directory, preserved
the original native-task source, and passed idle gates before stopping only the
studio application. Consistent SQLite backups were retained. The entire test
project snapshot remained exactly equal across restart. All five tools returned
to ready/idle. A browser request to render the unchanged sequence reused the
same verified export without adding another render. A separate **57/57**
read-only audit verifies both earlier projects and all five earlier songs,
including file hashes, drafts, selections and stored generation records.

Owned native work released the GPU lane and left no held call. Personal ComfyUI
kept its original PID/start time throughout. TTS was paused with explicit user
permission and an automatic restoration backstop, then explicitly restored;
its UI endpoint returned HTTP 200. The backstop timer was canceled after restore.
The product itself never stops unrelated applications.

## Evidence and remaining boundary

Private receipts, logs, snapshots, source manifests and screenshots are under
ignored `.local-evidence/slice-3/`. The independently copied audit includes its
checker hash, all commands, per-frame comparisons, packet comparisons and full
A/V decode logs. These files are not publication-ready repository assets.

Exact linked beat/second/frame editing, trim/dominance/clip audio, continuation,
recovery controls, archive/delete and novice-facing release packaging remain the
approved later slices. Final visual polish and Kirsty font packaging are also
outstanding. This checkpoint does not claim the full proof of concept is done.
