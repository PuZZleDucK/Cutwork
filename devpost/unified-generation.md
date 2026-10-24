# Unified generation workspace

## Request
Combine music and video in one Generate tab, with Generate Music above Generate Video. Remove the redundant soundtrack dropdown. Show a fixed-height scrollable generated-song list before the selected player; duration above BPM, two-line titles, no generation date, and Archive above Delete at the far right.

## Decisions and boundaries
- Keep Archive and History, project-switch tab persistence, and existing song-selection/draft/arrangement semantics.
- Generate has the combined active song/clip count. Its existing guidance still distinguishes needing a soundtrack from needing a first video.
- A 240px song list with 96px rows exposes two full versions and part of the next. Full titles remain available by tooltip and accessible button name.
- Unknown BPM is shown as an em dash, not a guessed tempo. Delete still opens the existing confirmation.
- No generator, installer, service, model, or stored media changes.

## Checklist
- [x] Add failing navigation, composition, and compact-song-list tests.
- [x] Implement unified page and song layout.
- [x] Run tests, typecheck and build.
- [x] Check interaction and desktop/narrow layout in a disposable browser fixture.
- [x] Deploy frontend only to Dundee and verify live layout without changing media.
- [x] Update PRD/spec/checklist and commit verified changes.

## Verification
- Red phase: six focused assertions failed before the implementation.
- Final suite: **1,477 tests in 110 files pass**; TypeScript checking and production build pass.
- Disposable real-store/API fixture: four songs, long titles, unknown BPM, song selection restoring prompt/lyrics and placements, list-scroll/focus retention, Archive remaining selected through project switching, and the empty-project Generate guidance.
- Desktop and 390px-wide browser checks: 240px list / 96px rows, titles no more than two lines, duration above BPM, lifecycle buttons vertically stacked on the right, and no page overflow at the narrow breakpoint.
- Delete opens the full irreversible-deletion disclosure; Cancel keeps the media. No deletion was confirmed.
- Cross-song Continue from selects its original song, prepares frame 97 through exclusive frame 193 and the retained frame-96 image, then focuses the video prompt on Generate. No generator was run.
- Frontend-only Dundee deployment: all ten served build files match local bytes. The running service PID and both real project snapshots are unchanged. Live headings appear in order: Generate Music, Soundtracks, Generate Video, Preview / Export, Sequence, Library.
- Private evidence: `.local-evidence/unified-generation/` contains the red/final test logs, browser checks, screenshots, deployment hashes and before/after project snapshots.

## Learner check
Refresh Cutwork. Generate now contains music above video. Scroll the generated-song list, select an older song, and confirm its inputs and sequence return. Archive and History remain separate tabs. The overall final learner review remains open.
