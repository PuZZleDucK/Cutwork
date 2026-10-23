import {useEffect,useMemo,useRef,useState} from 'react';
import type {SongArrangement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import {buildLivePreviewPlan,livePreviewPoint,LiveMediaSynchronizer,previewClock,formatPreviewTime,PREVIEW_FPS,type PreviewMedia} from './live-preview-state.ts';

const asset=(id:string)=>`/api/assets/${encodeURIComponent(id)}`;
export interface LivePreviewProps {song:StudioSong;arrangement:SongArrangement;clips:readonly StudioClip[];active?:boolean}

/** Browser-only edit playback. Export remains the independently verified full render.
 * At most two source clips are mounted/prewarmed. The authoritative wall clock
 * covers black gaps and post-song silence, without concatenating or downloading
 * every raw frame. Each audio switch selects one source; there is no mixing.
 */
export function LivePreview({song,arrangement,clips,active=true}:LivePreviewProps){
 const plan=useMemo(()=>buildLivePreviewPlan(song,arrangement.placements,clips),[song,arrangement.placements,clips]);
 const [position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[volume,setVolume]=useState(.5),[muted,setMuted]=useState(false),[failure,setFailure]=useState<string|null>(null);
 const clock=useRef(previewClock()),songAudio=useRef<HTMLAudioElement>(null),videos=useRef(new Map<string,HTMLVideoElement>()),clipAudios=useRef(new Map<string,HTMLAudioElement>());
 const synchronizer=useRef<LiveMediaSynchronizer|null>(null),syncNow=useRef<()=>void>(()=>{}),pauseNow=useRef<()=>void>(()=>{});
 const point=livePreviewPoint(plan,position);
 const visibleClips=[...new Map([point.video?.clip,point.nextClip].filter((clip):clip is StudioClip=>!!clip).map(clip=>[clip.assetId,clip])).values()];
 const stop=()=>{clock.current.pause(performance.now(),plan.durationSeconds);setPosition(clock.current.read(performance.now(),plan.durationSeconds));setPlaying(false);};
 pauseNow.current=stop;
 syncNow.current=()=>{
  const sync=synchronizer.current;if(!sync)return;
  const current=livePreviewPoint(plan,clock.current.read(performance.now(),plan.durationSeconds));
  const running=clock.current.running&&active&&!current.ended;
  const retained=new Set<PreviewMedia>();
  if(songAudio.current){
   retained.add(songAudio.current);
   sync.update(songAudio.current,current.timeSeconds<plan.songSeconds?{seconds:current.timeSeconds,playing:running,audible:!muted&&current.audio.kind==='song',volume}:null);
  }
  for(const [id,video]of videos.current){
   retained.add(video);
   sync.update(video,current.video?.assetId===id?{seconds:current.video.sourceSeconds,playing:running,audible:false,volume}:null);
  }
  for(const [id,audio]of clipAudios.current){
   retained.add(audio);
   sync.update(audio,current.audio.kind==='clip'&&current.audio.assetId===id?{seconds:current.audio.sourceSeconds,playing:running,audible:!muted,volume}:null);
  }
  sync.retain(retained);
 };
 useEffect(()=>{
  synchronizer.current=new LiveMediaSynchronizer(()=>{pauseNow.current();setFailure('Playback could not start. Press Play to retry.');});
  clock.current=previewClock();setPosition(0);setPlaying(false);setFailure(null);syncNow.current();
  return()=>{clock.current.pause(performance.now(),Number.POSITIVE_INFINITY);synchronizer.current?.dispose();synchronizer.current=null;};
 },[song.id]);
 useEffect(()=>{if(!active){pauseNow.current();syncNow.current();}},[active]);
 useEffect(()=>{
  const hidden=()=>{if(document.hidden){pauseNow.current();syncNow.current();}};
  document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);
 },[]);
 useEffect(()=>{
  if(position>plan.durationSeconds){clock.current.seek(plan.durationSeconds,performance.now());pauseNow.current();}
  syncNow.current();
 },[plan,position,playing,volume,muted,active]);
 useEffect(()=>{
  if(!playing||!active)return;
  let frame=0;
  const tick=()=>{
   const next=clock.current.read(performance.now(),plan.durationSeconds);
   setPosition(next);
   if(next>=plan.durationSeconds){pauseNow.current();syncNow.current();return;}
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,active,plan.durationSeconds]);
 const toggle=()=>{
  if(playing){stop();syncNow.current();return;}
  setFailure(null);
  if(clock.current.read(performance.now(),plan.durationSeconds)>=plan.durationSeconds){clock.current.seek(0,performance.now());setPosition(0);}
  clock.current.play(performance.now());setPlaying(true);
  // Start audible media in this user gesture, not only a later React effect.
  syncNow.current();
 };
 const seek=(seconds:number)=>{const value=Math.max(0,Math.min(plan.durationSeconds,seconds));clock.current.seek(value,performance.now());setPosition(value);setFailure(null);syncNow.current();};
 const mediaFailure=()=>{pauseNow.current();syncNow.current();setFailure('A source could not be loaded for preview. Check the connection and try Play again.');};
 return <div className="live-preview" role="group" aria-label="Live sequence preview">
  <div className="live-preview-picture" style={{position:'relative',background:'#000',aspectRatio:'4 / 3',overflow:'hidden'}} title="Live draft playback uses the current edit immediately. Uncovered time is black; export renders the full-quality sequence.">
   {!point.video&&<span className="live-preview-black" role="img" aria-label="Uncovered sequence — black frames"/>}
   {visibleClips.map(clip=><video key={clip.assetId} ref={node=>{if(node)videos.current.set(clip.assetId,node);else videos.current.delete(clip.assetId);}} src={asset(clip.assetId)} preload="auto" playsInline muted aria-hidden="true" tabIndex={-1} data-live-clip={clip.id} hidden={point.video?.assetId!==clip.assetId} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}} onLoadedMetadata={()=>syncNow.current()} onCanPlay={()=>syncNow.current()} onError={()=>{if(point.video?.assetId===clip.assetId)mediaFailure();}}/>)}
  </div>
  <audio ref={songAudio} src={asset(song.assetId)} preload="auto" aria-hidden="true" onLoadedMetadata={()=>syncNow.current()} onCanPlay={()=>syncNow.current()} onError={mediaFailure}/>
  {visibleClips.filter(clip=>clip.audioAssetId).map(clip=><audio key={clip.audioAssetId!} ref={node=>{if(node)clipAudios.current.set(clip.audioAssetId!,node);else clipAudios.current.delete(clip.audioAssetId!);}} src={asset(clip.audioAssetId!)} preload="auto" aria-hidden="true" onLoadedMetadata={()=>syncNow.current()} onCanPlay={()=>syncNow.current()} onError={()=>{if(point.audio.kind==='clip'&&point.audio.assetId===clip.audioAssetId)mediaFailure();}}/>)}
  <div className="live-preview-transport">
   <button type="button" className="button secondary small" onClick={toggle} disabled={!active||plan.durationSeconds===0} aria-label={playing?'Pause live preview':'Play live preview'}>{playing?'Pause':'Play'}</button>
   <input className="live-preview-seek" aria-label="Seek live preview" aria-valuetext={`${formatPreviewTime(point.timeSeconds)} of ${formatPreviewTime(plan.durationSeconds)}`} type="range" min="0" max={plan.durationSeconds} step={1/PREVIEW_FPS} value={point.timeSeconds} onChange={event=>seek(Number(event.target.value))}/>
   <output className="live-preview-time" aria-label="Live preview position" title="Minutes:seconds:frames at 24 fps">{formatPreviewTime(point.timeSeconds)} / {formatPreviewTime(plan.durationSeconds)}</output>
   <button type="button" className="text-button live-preview-mute" onClick={()=>setMuted(!muted)} aria-label={muted?'Unmute live preview':'Mute live preview'} aria-pressed={muted}>{muted?'Unmute':'Mute'}</button>
   <input className="live-preview-volume" aria-label="Live preview volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event=>setVolume(Number(event.target.value))}/>
  </div>
  {failure&&<p className="warning small-copy" role="status">{failure}</p>}
 </div>;
}
