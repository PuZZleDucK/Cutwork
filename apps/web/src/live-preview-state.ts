import type {ClipPlacement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';

export const PREVIEW_FPS=24;
export interface LivePreviewSpan {startFrame:number;endFrame:number;placement:ClipPlacement|null;clip:StudioClip|null}
export interface LivePreviewPlan {song:StudioSong;songSeconds:number;frameCount:number;durationSeconds:number;spans:LivePreviewSpan[]}
export interface LivePreviewPicture {placementId:string;clipId:string;assetId:string;sourceSeconds:number;clip:StudioClip}
export type LivePreviewAudio={kind:'song'|'clip';assetId:string;sourceSeconds:number}|{kind:'silence'};
export interface LivePreviewPoint {timeSeconds:number;ended:boolean;video:LivePreviewPicture|null;audio:LivePreviewAudio;nextClip:StudioClip|null}

/** The same half-open intervals / greatest-priority winner as the export compiler.
 * Encoded source playback is intentionally a fast approximation, not a render.
 * No raw-frame downloads or server jobs are necessary to inspect an edit. */
export function buildLivePreviewPlan(song:StudioSong,placements:readonly ClipPlacement[],clips:readonly StudioClip[]):LivePreviewPlan {
 const byId=new Map(clips.map(clip=>[clip.id,clip]));
 const samples=BigInt(song.sampleCount),rate=BigInt(song.sampleRate);
 const songFrames=Number((samples*24n+rate-1n)/rate);
 const frameCount=Math.max(songFrames,...placements.map(placement=>placement.endFrame));
 const boundaries=[...new Set([0,frameCount,...placements.flatMap(p=>[p.startFrame,p.endFrame])])].sort((a,b)=>a-b);
 const spans:LivePreviewSpan[]=[];
 for(let i=1;i<boundaries.length;i++){
  const startFrame=boundaries[i-1]!,endFrame=boundaries[i]!;
  const placement=placements.filter(p=>p.startFrame<=startFrame&&p.endFrame>=endFrame).sort((a,b)=>b.priority-a.priority)[0]??null;
  const prior=spans.at(-1);
  if(prior?.placement?.id===placement?.id&&prior){prior.endFrame=endFrame;continue;}
  spans.push({startFrame,endFrame,placement,clip:placement?byId.get(placement.clipId)??null:null});
 }
 return {song,songSeconds:Number(samples)/song.sampleRate,frameCount,durationSeconds:frameCount/PREVIEW_FPS,spans};
}

export function livePreviewPoint(plan:LivePreviewPlan,requestedSeconds:number):LivePreviewPoint {
 const timeSeconds=Math.min(plan.durationSeconds,Math.max(0,Number.isFinite(requestedSeconds)?requestedSeconds:0));
 const ended=timeSeconds>=plan.durationSeconds;
 // The small epsilon only compensates binary float roundoff at an exact frame boundary.
 const frame=Math.floor(timeSeconds*PREVIEW_FPS+1e-8);
 const spanIndex=plan.spans.findIndex(span=>span.startFrame<=frame&&span.endFrame>frame);
 const span=plan.spans[spanIndex],p=span?.placement,c=span?.clip;
 const video:LivePreviewPicture|null=p&&c?{placementId:p.id,clipId:c.id,assetId:c.assetId,sourceSeconds:(p.sourceStartFrame-p.startFrame)/PREVIEW_FPS+timeSeconds,clip:c}:null;
 let audio:LivePreviewAudio={kind:'silence'};
 if(!ended){
  if(p?.audioSource==='clip'){
   if(video&&c?.audioAssetId)audio={kind:'clip',assetId:c.audioAssetId,sourceSeconds:video.sourceSeconds};
  }else if(timeSeconds<plan.songSeconds)audio={kind:'song',assetId:plan.song.assetId,sourceSeconds:timeSeconds};
 }
 const nextClip=ended?null:plan.spans.slice(Math.max(0,spanIndex+1)).find(next=>next.clip&&next.clip.assetId!==video?.assetId)?.clip??null;
 return {timeSeconds,ended,video,audio,nextClip};
}

export interface PreviewMedia {
 currentTime:number;duration:number;readyState:number;paused:boolean;muted:boolean;volume:number;
 play():Promise<void>;pause():void;
}
export interface PreviewMediaTarget {seconds:number;playing:boolean;audible:boolean;volume:number}
/** Own every pending play promise. A pause/unmount always wins over a late play.
 * Paused scrubs seek precisely; running playback only corrects meaningful drift.
 * Source audio shorter than the edit stays silent, matching export zero-padding. */
export class LiveMediaSynchronizer {
 private states=new Map<PreviewMedia,{target:PreviewMediaTarget|null;pending:boolean;request:number}>();
 private disposed=false;
 constructor(private onFailure:(error:unknown)=>void=()=>{}){}
 update(media:PreviewMedia,target:PreviewMediaTarget|null){
  if(this.disposed){media.muted=true;media.pause();return;}
  let state=this.states.get(media);if(!state){state={target,pending:false,request:0};this.states.set(media,state);}state.target=target;
  const exhausted=!!target&&Number.isFinite(media.duration)&&target.seconds>=media.duration;
  media.muted=!target?.audible||exhausted;
  if(target)media.volume=Math.max(0,Math.min(1,target.volume));
  if(!target||!target.playing||exhausted){if(state.pending){state.request++;state.pending=false;}media.pause();}
  if(!target)return;
  if(media.readyState>=1){
   const position=Math.min(target.seconds,Number.isFinite(media.duration)?Math.max(0,media.duration-1e-6):target.seconds);
   const tolerance=target.playing ? .12 : 1e-6;
   if(Math.abs(media.currentTime-position)>tolerance){try{media.currentTime=position;}catch{/* Metadata/source transitions retry on readiness. */}}
  }
  if(!target.playing||exhausted||!media.paused||state.pending)return;
  state.pending=true;
  const request=++state.request;
  try{
   void media.play().then(()=>{
    if(request===state.request)state.pending=false;
    if(this.disposed||!state.target?.playing){media.muted=true;media.pause();}
   },error=>{
    if(request!==state.request)return;
    state.pending=false;
    if(!this.disposed&&state.target?.playing){media.muted=true;media.pause();this.onFailure(error);}
   });
  }catch(error){state.pending=false;media.pause();this.onFailure(error);}
 }
 retain(media:ReadonlySet<PreviewMedia>){for(const item of this.states.keys())if(!media.has(item)){this.update(item,null);this.states.delete(item);}}
 dispose(){this.disposed=true;for(const [media,state]of this.states){state.target=null;media.muted=true;media.pause();}this.states.clear();}
}

export function previewClock(){
 let position=0,epoch=0,running=false;
 const read=(now:number,duration:number)=>Math.max(0,Math.min(duration,position+(running?Math.max(0,now-epoch)/1000:0)));
 return {read,play:(now:number)=>{epoch=now;running=true;},pause:(now:number,duration:number)=>{position=read(now,duration);epoch=now;running=false;},seek:(seconds:number,now:number)=>{position=Math.max(0,seconds);epoch=now;},get running(){return running;}};
}
export function formatPreviewTime(seconds:number):string {
 const frame=Math.max(0,Math.floor(seconds*PREVIEW_FPS+1e-8)),whole=Math.floor(frame/PREVIEW_FPS);
 const hours=Math.floor(whole/3600),minutes=Math.floor(whole/60)%60,sec=whole%60,sub=frame%PREVIEW_FPS,pad=(n:number)=>String(n).padStart(2,'0');
 return `${hours?`${hours}:${pad(minutes)}`:minutes}:${pad(sec)}:${pad(sub)}`;
}
