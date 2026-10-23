import { useEffect, useRef, useState } from 'react';
import type { ClipPlacement, SongArrangement, StudioSong } from '../../../packages/core/src/contracts/studio.ts';
import { request } from './api.ts';
import { useStudio } from './useStudio.ts';
import { attemptIsActive } from './studio-state.ts';
import { automaticRenderAllowed, mustReplaceRenderKey, clipSuggestion, renderForRevision, submissionIdentity } from './video-state.ts';
import { ClipForm, useClipDraft } from './ClipComposer.tsx';
import { VideoTimeline } from './VideoTimeline.tsx';
import { PreviewVideo } from './PreviewVideo.tsx';
import { orderedClipLibrary } from './clip-library-order.ts';
import './video.css';
type Studio = ReturnType<typeof useStudio>;
const asset = (id:string) => `/api/assets/${encodeURIComponent(id)}`;
function PlacementControls({studio,song,arrangement,placement}:{studio:Studio;song:StudioSong;arrangement:SongArrangement;placement:ClipPlacement}){
 const [start,setStart]=useState(String(placement.startFrame));const [editing,setEditing]=useState(false);
 useEffect(()=>{if(!editing)setStart(String(placement.startFrame));},[placement.startFrame,editing]);
 const path=`/api/projects/${song.projectId}/songs/${song.id}/placements/${placement.id}`;
 return <div className="placement-controls"><span className="micro">IN SEQUENCE / {placement.startFrame} → {placement.endFrame}</span><label>Start boundary<input aria-label={`Placement start ${placement.id}`} inputMode="numeric" value={start} onChange={e=>{setEditing(true);setStart(e.target.value);}} /></label><button className="text-button" disabled={studio.busy||!/^\d+$/.test(start)||!Number.isSafeInteger(Number(start))||Number(start)===placement.startFrame} onClick={()=>void studio.perform(async()=>{await request(path,{revision:arrangement.revision,startFrame:Number(start)},'PUT');setEditing(false);},'Clip moved. Previous preview is now stale.')}>Move</button><button className="text-button" disabled={studio.busy} onClick={()=>void studio.perform(async()=>{await request(path,{revision:arrangement.revision},'DELETE');},'Removed from this sequence. The original clip remains in your library.')}>Remove from sequence</button></div>;
}
function ClipLibrary({studio,song,arrangement}:{studio:Studio;song:StudioSong;arrangement:SongArrangement}){
 const clips=studio.snapshot!.clips,attempts=studio.snapshot!.videoAttempts;
 const entries=orderedClipLibrary(clips,attempts,arrangement.placements);
 return <section className="clip-library" aria-label="Generated clip library"><div className="video-section-heading"><h2>Your takes.</h2><span className="micro">{clips.length} CLIPS / PROJECT LIBRARY</span></div>
  {!entries.length&&<p className="empty-video">No clips yet. Describe the first shot; its successful result will join the sequence automatically.</p>}
  <div className="clip-shelf">{entries.map(entry=>{if(entry.kind==='attempt'){const a=entry.attempt;return <article className={`clip-card clip-pending ${attemptIsActive(a.state)?'working':''}`} key={entry.id} data-start-frame={entry.startFrame}><span className="eyebrow">H3 / {a.state.replaceAll('_',' ').toUpperCase()}</span><h3>{a.input.clipPrompt}</h3><p className="small-copy">{a.stage}</p><span className="micro">{a.input.startFrame} → {a.input.endFrame} / {a.input.songId===song.id?'THIS SONG':'OTHER SONG'}</span>{a.error&&<details><summary className="warning">Failure details</summary><pre>{a.error}</pre></details>}</article>;} const clip=entry.clip;const placements=arrangement.placements.filter(p=>p.clipId===clip.id).sort((a,b)=>a.startFrame-b.startFrame);return <article className="clip-card" key={entry.id} data-start-frame={entry.startFrame??undefined}><PreviewVideo controls preload="none" src={asset(clip.assetId)} poster={clip.rawFrames[0]?asset(clip.rawFrames[0].assetId):undefined} aria-label={`Preview clip ${clip.title}`} /><div className="clip-card-body"><h3>{clip.title}</h3><p className="micro">{clip.requestedFrames} REQUESTED FRAMES / {clip.nativeFrames} ORIGINALS · 24 FPS</p><p className="small-copy muted">Preview starts at 50% volume. Your sequence uses the original song.</p>{placements.map(p=><PlacementControls key={p.id} studio={studio} song={song} arrangement={arrangement} placement={p} />)}{!placements.length&&<button className="button secondary small" disabled={studio.busy} onClick={()=>void studio.perform(async()=>{const next=clipSuggestion(song,arrangement.placements,studio.snapshot!.reservations);const startFrame=next?.startFrame??Math.max(0,...arrangement.placements.map(p=>p.endFrame));await request(`/api/projects/${song.projectId}/songs/${song.id}/placements`,{revision:arrangement.revision,clipId:clip.id,startFrame});},'Clip placed in the selected song sequence.')}>Place in sequence</button>}<details><summary>Preserved original frames</summary><p className="small-copy">All {clip.rawFrames.length} decoded PNGs are retained before lossy video encoding; native extra frames are not automatically placed.</p><div className="raw-frame-links">{clip.rawFrames.map(f=><a key={f.index} href={asset(f.assetId)} target="_blank" rel="noreferrer" title={`SHA256 ${f.sha256}`}>{f.index}</a>)}</div></details></div></article>;})}
  </div>
 </section>;
}
function Preview({studio,song,arrangement}:{studio:Studio;song:StudioSong;arrangement:SongArrangement}){
 const {current,playable}=renderForRevision(studio.snapshot!.renders,song.id,arrangement.revision);
 const [auto,setAuto]=useState(false);const flight=useRef<string|null>(null),identity=useRef<{signature:string;key:string}|null>(null);
 const stale=playable&&playable.revision!==arrangement.revision;
 const render=async()=>{
  identity.current=submissionIdentity(identity.current,{projectId:song.projectId,songId:song.id,revision:arrangement.revision});
  const key=identity.current.key;flight.current=`${song.id}:${arrangement.revision}`;setAuto(true);
  const ok=await studio.perform(async()=>{try{await request(`/api/projects/${song.projectId}/songs/${song.id}/renders`,{revision:arrangement.revision,idempotencyKey:key});}catch(error){if(mustReplaceRenderKey(error))identity.current=null;throw error;}},'Preview render queued. The verified MP4 is also your export.');
  if(ok)identity.current=null;return ok;
 };
 // Once requested, debounce regeneration after an edit. Never auto-retry failures.
 useEffect(()=>{const key=`${song.id}:${arrangement.revision}`;if(!automaticRenderAllowed(auto,!!current,studio.busy,studio.connection,key,flight.current))return;const timer=setTimeout(()=>{flight.current=key;void render();},1000);return()=>clearTimeout(timer);},[auto,current?.id,song.id,arrangement.revision,studio.busy,studio.connection]);
 return <section className="video-preview" aria-label="Preview and export"><div className="video-section-heading"><div><span className="section-code">05 / SCREEN</span><h2>Watch it come together.</h2></div><span className="micro">640 × 480 / 24 FPS / H.264 + AAC</span></div><div className="screen-and-controls"><div className="screen">{playable?.assetId?<PreviewVideo key={playable.id} controls preload="metadata" src={asset(playable.assetId)} aria-label="Assembled music video preview" />:<div className="screen-empty"><span>ASSEMBLY / SCREENING ROOM</span><strong>Your first cut goes here.</strong><p>Render the sequence to preview it with the original song.</p></div>}</div><div className="render-controls">{stale&&<p className="warning" role="status">Previous revision — this preview is stale and cannot be exported as the current edit.</p>}<p className="small-copy muted">Black frames fill uncovered time. The full song is kept; placed clips can extend the video beyond it. Preview and export use the same verified file.</p><button className="button primary" disabled={studio.busy||['queued','running'].includes(current?.state??'')} onClick={()=>void render()}>{current?.state==='succeeded'?'Render current preview':current?.state==='failed'?'Retry preview render':'Render preview'}</button>{current&&<div className="render-status" role="status"><strong>{current.state.toUpperCase()}</strong><p>{current.stage}</p>{current.error&&<details><summary className="warning">Render details</summary><pre>{current.error}</pre></details>}</div>}{current?.state==='succeeded'&&current.assetId&&<a className="button secondary" href={`/api/projects/${song.projectId}/renders/${current.id}/download`} download>Download MP4 ↓</a>}<label className="auto-render"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} /> Update preview after edits</label><span className="micro">ARRANGEMENT REVISION {arrangement.revision}</span></div></div></section>;
}
export function VideoStudio({studio}:{studio:Studio}) {
 const snapshot=studio.snapshot!,song=snapshot.songs.find(s=>s.id===snapshot.project.selectedSongId);
 if(!song)return <section className="video-workspace empty-video"><span className="section-code">03 / DIRECT</span><h2>A soundtrack opens the picture.</h2><p>Create or select a song above to describe clips, arrange a sequence and export your music video.</p></section>;
 const arrangement=snapshot.arrangements.find(a=>a.songId===song.id)??{songId:song.id,projectId:song.projectId,revision:0,placements:[]};
 return <VideoWorkspace key={song.id} studio={studio} song={song} arrangement={arrangement} />;
}
function VideoWorkspace({studio,song,arrangement}:{studio:Studio;song:StudioSong;arrangement:SongArrangement}) {
 const draft=useClipDraft(studio,song,arrangement);
 return <div className="video-workspace"><ClipForm studio={studio} song={song} draft={draft}/><VideoTimeline studio={studio} song={song} arrangement={arrangement} draft={draft}/><ClipLibrary studio={studio} song={song} arrangement={arrangement}/><Preview studio={studio} song={song} arrangement={arrangement}/></div>;
}
