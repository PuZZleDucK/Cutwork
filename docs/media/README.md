# Documentation media

These are actual Cutwork interface captures and generated demonstration output,
not concept mockups. They are deliberately curated for this repository; full
project storage, raw recordings and private execution logs are not included.

## Screenshots

Captured on 24 October 2026 from the built Cutwork UI (`08a6b5a`) with the completed
**Night Shift Garden** demo. A read-only local documentation view selected that
existing project's snapshot and served its real assets, without changing the
active server's shared project selection or accepting any mutations. Other active
project data was not included. No successful job or generated image was fabricated.

- `video-workspace.png` — visual style, native live preview and whole-clip overlap
  lanes, with music coverage and the next proposed range.
- `music-workspace.png` — original music brief/lyrics and selected soundtrack.
- `clip-library.png` — real retained clips; placed/unplaced styling and edit controls.
- `creative-history.png` — captured provider/model, recorded seed and edit events.

Only the webpage viewport is captured, not unrelated tabs, desktop or credentials.
Images have not been retouched to change the app's displayed state.

## Film and animation

`night-shift-garden.mp4` is the **unchanged 28-second Cutwork export**:
H.264/AAC, 640×480, 24 fps, 672 video frames, 4,522,988 bytes.

SHA-256: `027f234296294b041537f083c3331904167b275b2c4a7c96a800b601b61d8965`

The Night project used Codex, YuE2 music and H3 video via ComfyUI. Its six placements
include four raw-frame continuations and an overlapping macro insert; its visual
tail extends beyond the song. See [the recorded evidence](../../devpost/recorded-demo-v2.md)
for the generation/edit sequence and limitations. This sample is not the edited
hackathon submission video.

`night-shift-garden.gif` is a **silent eight-second excerpt** from seconds 8–16 of
that export, reduced to 360×270, 8 fps and a 128-colour palette for a small inline
preview. It is not representative of the full export's frame rate or image quality.
The original MP4 retains audio and the native output dimensions/frame rate.

## Rights and provenance

The interface and original clapperboard mark are project-authored. The sample's
music and pictures are AI-generated for the demonstration. The application's MIT
licence does not relicense model weights, third-party tools or fonts, or establish
a blanket output-rights guarantee. Consult [third-party notices](../../THIRD_PARTY_NOTICES.md)
and the linked upstream terms before reusing generated media commercially. No model
weights, source film/song uploads, private provider transcripts or third-party
character artwork are included here.

## Owner-supplied submission assets — 25 October 2026

- [`Cutwork Demo.webm`](Cutwork%20Demo.webm): the developer's narrated demo,
  supplied for publication after submission. Unchanged 201.7-second WebM,
  1920×1080, 30 fps, VP8 video and Opus audio; 96,964,626 bytes (92.5 MiB).
  It is separate from the generated 28-second film above and from the raw
  clean-install recordings, which remain outside this repository.
- [`../../devpost/Cutwork.gif`](../../devpost/Cutwork.gif): owner-supplied animated
  Cutwork submission artwork, unchanged 900×600 GIF, 4,332,590 bytes. It does not
  replace the application's existing clapperboard SVG.
- [`../../devpost/submission-info.md`](../../devpost/submission-info.md): the
  developer's own submission answers, published by explicit request without
  rewriting or copy editing. This intentional public artifact is distinct from
  the ignored private learner profile.

The owner confirms the video and repository are public and included in the
submitted entry. No public app deployment is planned for the submission. These
files are supplied as-is; existing third-party/output-rights boundaries still apply.

Publication checks: both supplied media files decode to the end. FFmpeg exits 0
for the WebM but emits one `Error parsing Opus packet header` diagnostic; no
re-encoding or audio repair was applied. Sampled video frames and the GIF were
visually reviewed. This is not a full human watch/listen or an exhaustive privacy
audit; the owner confirms these are the public submission assets to publish.
