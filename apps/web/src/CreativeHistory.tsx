import { useMemo } from 'react';
import type { MusicAttempt, MusicDraft, ProjectEvent, ProjectSnapshot, StudioRender, StudioSong, VideoAttempt } from '../../../packages/core/src/contracts/studio.ts';
import type { useStudio } from './useStudio.ts';
import { formatDuration, historySong, legacyMusicVisualStyle, stateLabel, waveformEnvelope } from './studio-state.ts';
import './creative-history.css';
import {artifactLifecycle,artifactMediaAvailable,artifactState,renderMediaAvailable} from './artifact-lifecycle.ts';
import { PreviewVideo } from './PreviewVideo.tsx';
import { GenerationActions } from './GenerationActions.tsx';

type Studio = ReturnType<typeof useStudio>;
interface HistoryBase { id: string; timestamp: string; kind: string; sequence: number; order: number }
export type CreativeHistoryRow = HistoryBase & (
  { source: 'event'; record: ProjectEvent } | { source: 'project-record'; record: ProjectSnapshot['project'] } |
  { source: 'music'; record: MusicAttempt; phase: 'request' | 'result' } |
  { source: 'video'; record: VideoAttempt; phase: 'request' | 'result' } |
  { source: 'render'; record: StudioRender; phase: 'request' | 'result' }
);
/** Derived record timestamps are facts, not a backfill of unrecorded edits. */
export function creativeHistoryRows(snapshot: ProjectSnapshot): CreativeHistoryRow[] {
  const projectId = snapshot.project.id, rows: CreativeHistoryRow[] = [];
  for (const event of snapshot.events.filter(e => e.projectId === projectId)) rows.push({ id: `event:${event.id}`, timestamp: event.createdAt,
    kind: event.kind, sequence: event.sequence, order: event.kind === 'project.created' ? 0 : 2, source: 'event', record: event });
  if (!snapshot.events.some(e => e.projectId === projectId && e.kind === 'project.created')) rows.push({ id: `project:${projectId}:created`,
    timestamp: snapshot.project.createdAt, kind: 'project.created', sequence: 0, order: 0, source: 'project-record', record: snapshot.project });
  for (const attempt of snapshot.attempts.filter(a => a.projectId === projectId)) {
    rows.push({ id: `music:${attempt.id}:request`, timestamp: attempt.createdAt, kind: 'music.requested', sequence: attempt.sequence, order: 1, source: 'music', record: attempt, phase: 'request' });
    if (['succeeded', 'failed','cancelled'].includes(attempt.state)) rows.push({ id: `music:${attempt.id}:result`, timestamp: attempt.updatedAt, kind: `music.${attempt.state}`, sequence: attempt.sequence, order: 3, source: 'music', record: attempt, phase: 'result' });
  }
  for (const attempt of snapshot.videoAttempts.filter(a => a.projectId === projectId)) {
    rows.push({ id: `video:${attempt.id}:request`, timestamp: attempt.createdAt, kind: 'video.requested', sequence: attempt.sequence, order: 1, source: 'video', record: attempt, phase: 'request' });
    if (['succeeded', 'failed','cancelled'].includes(attempt.state)) rows.push({ id: `video:${attempt.id}:result`, timestamp: attempt.updatedAt, kind: `video.${attempt.state}`, sequence: attempt.sequence, order: 3, source: 'video', record: attempt, phase: 'result' });
  }
  for (const render of snapshot.renders.filter(r => r.projectId === projectId)) {
    rows.push({ id: `render:${render.id}:request`, timestamp: render.createdAt, kind: 'render.requested', sequence: 0, order: 1, source: 'render', record: render, phase: 'request' });
    if (['succeeded', 'failed'].includes(render.state)) rows.push({ id: `render:${render.id}:result`, timestamp: render.updatedAt, kind: `render.${render.state}`, sequence: 0, order: 3, source: 'render', record: render, phase: 'result' });
  }
  // Millisecond ties have deterministic ordering; no invented sub-millisecond times.
  return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.order - a.order || b.sequence - a.sequence || b.id.localeCompare(a.id));
}
export function restoreMusicDraft(draft: MusicDraft, attempt: MusicAttempt): MusicDraft {
  return { ...draft, musicPrompt: attempt.input.musicPrompt, lyrics: attempt.input.lyrics };
}
const asset = (id: string) => `/api/assets/${encodeURIComponent(id)}`;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const labels: Record<string, string> = {
  'artifact.archived':'Media archived', 'artifact.restored':'Archived media restored', 'artifact.deletion_requested':'Media deletion accepted', 'artifact.deleted':'Full media deleted', 'artifact.purge_failed':'Media purge needs attention', 'clip.retargeted':'Clip edit retargeted',
  'attempt.cancel_requested':'Cancellation requested', 'attempt.cancelled':'Cancellation confirmed', 'attempt.recovered':'Generation recovery accepted', 'attempt.restored':'Generation parameters restored', 'attempt.discarded':'Placeholder discarded',
  'project.created': 'Project created', 'project.selected': 'Project opened', 'draft.saved': 'Music inputs saved', 'style.changed': 'Visual style changed',
  'clip_draft.saved': 'Clip inputs saved', 'clip.trimmed':'Source trim changed', 'clip.moved':'Clip position changed', 'clip.audio_changed':'Soundtrack source changed', 'placement.priority_swapped':'Visual priority swapped', 'song.selected': 'Soundtrack selected', 'placement.added': 'Clip placed', 'placement.moved': 'Clip moved', 'placement.removed': 'Clip removed from sequence',
  'analysis.updated': 'Audio analysis updated', 'render.reused': 'Existing render reused', 'render.cache_invalidated': 'Render cache invalidated',
  'music.requested': 'Music requested', 'music.succeeded': 'Music generated', 'music.failed': 'Music generation failed', 'music.cancelled':'Cancelled music record',
  'video.requested': 'Video requested', 'video.succeeded': 'Video generated', 'video.failed': 'Video generation failed', 'video.cancelled':'Cancelled video record',
  'render.requested': 'Preview / export requested', 'render.succeeded': 'Preview / export rendered', 'render.failed': 'Preview / export failed',
};
function HistoryWaveform({ song,playable=true }: { song: StudioSong;playable?:boolean }) {
  const peaks = useMemo(() => waveformEnvelope(song.analysis.peaks, 240), [song.analysis.peaks]);
  return <section className="history-output" aria-label="Generated music output"><div className="history-output-heading"><strong>{song.title}</strong><span className="duration">{formatDuration(song.durationSeconds)}</span></div>
    {peaks.length ? <svg className="waveform" viewBox="0 0 960 130" preserveAspectRatio="none" role="img" aria-label={`Audio waveform with ${song.analysis.sampleIndices.length} estimated beats`}>
      <line x1="0" x2="960" y1="65" y2="65" className="wave-axis" />{song.analysis.sampleIndices.length <= 1000 && song.analysis.sampleIndices.map((sample, i) => <line key={i} x1={Number(sample) / Number(song.sampleCount) * 960} x2={Number(sample) / Number(song.sampleCount) * 960} y1="8" y2="122" className="beat-line" />)}
      {peaks.map((peak, i) => <rect key={i} x={i / peaks.length * 960} y={65 - Math.max(.7, peak * 48)} width={Math.max(1, 960 / peaks.length - 1.7)} height={Math.max(1.4, peak * 96)} className="wave-bar" />)}
    </svg> : <p className="small-copy muted">{song.analysis.state === 'pending' ? 'Audio analysis pending.' : playable?'Waveform unavailable; original audio remains available.':'Waveform unavailable; full media has been removed.'}</p>}
    {playable?<audio controls preload="none" src={asset(song.assetId)} aria-label={`History output: ${song.title}`} />:<p className="history-media-tombstone">Full song media deleted or being removed. This waveform and the generation record are retained, not playable audio.</p>}
  </section>;
}
function Provenance({ attempt, tool }: { attempt: MusicAttempt | VideoAttempt; tool: string }) {
  return <><dl className="provenance"><div><dt>Provider / model</dt><dd>{attempt.provider} / {attempt.model}</dd></div><div><dt>Generation tool</dt><dd>{tool}</dd></div><div><dt>Attempt</dt><dd>{attempt.id}</dd></div><div><dt>Native call</dt><dd>{attempt.nativeCallId}</dd></div></dl>
    {attempt.recovery&&<p className="small-copy">{attempt.recovery.action==='retry'?'Retry':'Restart'} of {attempt.recovery.parentAttemptId}; original seeds retained.</p>}<details><summary>Recorded seeds</summary><pre>{json(attempt.seeds)}</pre></details></>;
}
function WorkDetails({ details, error }: { details: Record<string, unknown>; error: string | null }) {
  return <><details><summary>Agent work, actual tool settings & logs</summary><pre>{Object.keys(details).length ? json(details) : 'No details reported yet.'}</pre></details>{error && <p className="error-copy">{error}</p>}</>;
}
export function CreativeHistory({ studio,onRestoreVideo,onRestoreMusic }: { studio: Studio;onRestoreMusic?:()=>void;onRestoreVideo?:(attempt:VideoAttempt)=>Promise<unknown> }) {
  const snapshot = studio.snapshot;
  if (!snapshot) return null;
  const rows = creativeHistoryRows(snapshot);
  const restore = async (attempt:MusicAttempt) => { if(await studio.restoreMusic(attempt.id)){if(onRestoreMusic)onRestoreMusic();else document.getElementById('music-prompt')?.focus();} };
  return <section className="panel history-panel creative-history" aria-label="Combined creative history"><div className="panel-heading"><div><span className="eyebrow">THE CREATIVE RECORD</span><h2>One project. Every step.</h2></div><span className="micro">NEWEST FIRST</span></div>
    <p className="panel-intro">Music, visuals, saved direction and sequence edits together. Your inputs, the agent’s settings and generated outputs stay expandable.</p>
    <p className="small-copy muted history-provenance-note">Generation times come from their original records. Saved project edits are recorded from this version onward; earlier edits were not recorded and are not reconstructed.</p>
    <div className="history-list">{rows.map(row => <details key={row.id} className={`history-row history-${row.source}`}><summary><span className="history-type">{row.source === 'music' ? 'YUE2' : row.source === 'video' ? 'H3' : row.source === 'render' ? 'RENDER' : 'PROJECT'}</span><strong>{labels[row.kind] ?? row.kind}</strong><time dateTime={row.timestamp} title={row.timestamp}>{new Date(row.timestamp).toLocaleString()}</time></summary>
      <div className="history-content">
        {row.source === 'project-record' && <><p>Creation time retained in the original project record.</p><pre>{json({ id: row.record.id, name: row.record.name, createdAt: row.record.createdAt })}</pre></>}
        {row.source === 'event' && <><p className="micro">COMMITTED PROJECT EVENT / {row.record.sequence}</p>{row.record.kind === 'style.changed' ? <div className="history-style-diff"><div><h4>Before</h4><pre>{String(row.record.data.before) || '(No visual style)'}</pre></div><div><h4>After</h4><pre>{String(row.record.data.after) || '(No visual style)'}</pre></div></div> : <pre>{json(row.record.data)}</pre>}</>}
        {row.source === 'music' && <>
          <div className="history-input"><h4>Your original music description</h4><p>{row.record.input.musicPrompt}</p>{row.record.input.lyrics && <details><summary>Your original lyrics</summary><pre>{row.record.input.lyrics}</pre></details>}{legacyMusicVisualStyle(row.record.input) && <details><summary>Historical visual style (legacy music input)</summary><pre>{legacyMusicVisualStyle(row.record.input)}</pre></details>}</div>
          <Provenance attempt={row.record} tool="YuE2" />
          {row.phase === 'result' ? <>{historySong(row.record, snapshot.songs) && <HistoryWaveform song={historySong(row.record, snapshot.songs)!} playable={artifactMediaAvailable(snapshot,{kind:'song',id:historySong(row.record,snapshot.songs)!.id})} />}<WorkDetails details={row.record.details} error={row.record.error} /></> : <><p className="small-copy muted">Current request status: {stateLabel(row.record.state)} · {row.record.stage}</p>{!['succeeded','failed'].includes(row.record.state) && <WorkDetails details={row.record.details} error={row.record.error} />}<GenerationActions studio={studio} attempt={row.record} onRestore={()=>restore(row.record)}/></>}
        </>}
        {row.source === 'video' && <>
          {row.phase === 'result' && (() => { const clip=snapshot.clips.find(c=>c.attemptId===row.record.id);if(!clip)return null;const ref={kind:'clip' as const,id:clip.id},playable=artifactMediaAvailable(snapshot,ref),thumbnail=artifactLifecycle(snapshot,ref)?.thumbnailAssetId??(playable?clip.rawFrames[0]?.assetId:undefined);return <section className="history-output"><strong>{clip.title}</strong>{thumbnail?<img className="creative-history-thumbnail" src={asset(thumbnail)} loading="lazy" alt={playable?'Generated clip thumbnail':'Retained small generation thumbnail; full media deleted'}/>:<p className="small-copy muted">Retained thumbnail unavailable.</p>}{playable?<PreviewVideo controls preload="none" src={asset(clip.assetId)} poster={thumbnail?asset(thumbnail):undefined} aria-label={`History clip output: ${clip.title}`}/>:<p className="history-media-tombstone">Full clip media {artifactState(snapshot,ref)==='deleted'?'deleted':'being removed'}. Its generation record and text remain; there is no media restore.</p>}</section>;})()}
          {row.phase==='request'&&<GenerationActions studio={studio} attempt={row.record} onRestore={onRestoreVideo?()=>onRestoreVideo(row.record):undefined}/>}
          <h4>Your original video inputs</h4><pre>{json(row.record.input)}</pre><Provenance attempt={row.record} tool="H3" /><details><summary>Captured song and exact timing</summary><pre>{json({ song: row.record.song, ...(row.record.timingResolution ? { timingResolution: row.record.timingResolution } : {}) })}</pre></details>
          {row.phase === 'result' || !['succeeded','failed'].includes(row.record.state) ? <WorkDetails details={row.record.details} error={row.record.error} /> : <p className="small-copy muted">Current request status: {stateLabel(row.record.state)}</p>}
        </>}
        {row.source === 'render' && <>
          <p>Song {row.record.songId} · arrangement revision {row.record.revision}</p>{row.phase === 'result' && row.record.assetId && (renderMediaAvailable(snapshot,row.record)?<PreviewVideo controls preload="none" src={asset(row.record.assetId)} aria-label="Historical rendered output" />:<p className="history-media-tombstone">Managed render media unavailable after artifact deletion. The captured edit and receipt remain below; previously downloaded files are independent.</p>)}
          <details><summary>Captured arrangement, media and render settings</summary><pre>{json({ revision: row.record.revision, snapshotHash: row.record.snapshotHash, planHash: row.record.planHash, snapshot: row.record.snapshot, details: row.record.details })}</pre></details>{row.record.error && <p className="error-copy">{row.record.error}</p>}
          <p className="small-copy muted">This is the historical render record, not an assertion that it matches the current edit.</p>
        </>}
      </div>
    </details>)}</div>
  </section>;
}
