# Making a music video

[Back to Cutwork](../README.md)

## The creative loop

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
   **↑ Continue** on a particular clip uses its last retained original PNG,
   not a re-decoded video frame. Native extra tail frames remain available but do
   not silently lengthen the planned edit.
6. Use the live preview immediately; no render step is needed. **Export MP4**
   renders a downloadable file from the current edit. Preview and export use the same arrangement.
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
the actual result. [Real three-clip loop](../devpost/slice-3-live-evidence.md).

### Recovery, archive and deletion

- Failed work shows details and **Retry** / **Restore parameters**. Retry (and
  Restart of cancelled work) reuses the recorded seed/captured call; restoring
  editable parameters and submitting anew gives a new recorded seed. Same seed
  aids reproducibility but is not a cross-version byte-identical-output guarantee.
- Cancel waits for owned work to stop before reporting cancelled, then offers
  Restart, Discard or Restore parameters. Unknown/unregistered external work is
  not certified stopped. Discarding a placeholder does not erase history.
- **Remove** only removes a placement. **Archive** hides the artifact
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
