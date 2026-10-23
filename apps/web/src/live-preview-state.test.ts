import {describe,expect,test,vi} from 'vitest';
import type {ClipPlacement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import {buildLivePreviewPlan,livePreviewPoint,LiveMediaSynchronizer,previewClock,formatPreviewTime} from './live-preview-state.ts';
import {compileRenderPlan,type RenderPlan} from '../../server/src/studio/render.ts';

const song={id:'song',assetId:'song-audio',sampleRate:48000,sampleCount:'240000',durationSeconds:5} as StudioSong;
const clip=(id:string,audio=true):StudioClip=>({id,assetId:`video-${id}`,audioAssetId:audio?`audio-${id}`:null,nativeFrames:240,rawFrames:[],projectId:'project',attemptId:id,songId:'song',songSha256:'a'.repeat(64),createdAt:'2026-10-23T00:00:00Z',title:id,sha256:'b'.repeat(64),fps:'24/1',width:640,height:480,requestedFrames:240});
const placement=(id:string,startFrame:number,endFrame:number,priority:number,extra:Partial<ClipPlacement>={}):ClipPlacement=>({id,clipId:id,startFrame,endFrame,sourceStartFrame:0,priority,...extra});
function media(){return {currentTime:0,duration:30,readyState:1,paused:true,muted:false,volume:1,play:vi.fn(function(this:{paused:boolean}){this.paused=false;return Promise.resolve();}),pause:vi.fn(function(this:{paused:boolean}){this.paused=true;})};}

describe('live edit-plan projection',()=>{
 test('has the entire song plus frame-rounded tail and no server render dependency',()=>{
  const plan=buildLivePreviewPlan({...song,sampleCount:'240001'},[],[]);
  expect(plan.frameCount).toBe(121);expect(plan.durationSeconds).toBe(121/24);
  expect(livePreviewPoint(plan,1)).toMatchObject({video:null,audio:{kind:'song',assetId:'song-audio',sourceSeconds:1}});
  expect(livePreviewPoint(plan,5.01)).toMatchObject({video:null,audio:{kind:'silence'}});
 });
 test('selects only greatest priority with half-open boundaries and resumes lower layer',()=>{
  const plan=buildLivePreviewPlan(song,[placement('a',0,96,1),placement('b',24,48,2)], [clip('a'),clip('b')]);
  expect(livePreviewPoint(plan,.999).video?.clipId).toBe('a');
  expect(livePreviewPoint(plan,1).video?.clipId).toBe('b');
  expect(livePreviewPoint(plan,2).video?.clipId).toBe('a');
  expect(livePreviewPoint(plan,4).video).toBeNull();
 });
 test('trim and movement map picture and selected audio to identical source offsets',()=>{
  const plan=buildLivePreviewPlan(song,[placement('a',48,96,1,{sourceStartFrame:36,audioSource:'clip'})],[clip('a')]);
  expect(livePreviewPoint(plan,2.25)).toMatchObject({video:{sourceSeconds:1.75},audio:{kind:'clip',assetId:'audio-a',sourceSeconds:1.75}});
 });
 test('a dominant song-audio clip suppresses clip audio below it',()=>{
  const plan=buildLivePreviewPlan(song,[placement('a',0,120,1,{audioSource:'clip'}),placement('b',24,48,2)],[clip('a'),clip('b')]);
  expect(livePreviewPoint(plan,1.5).audio).toEqual({kind:'song',assetId:'song-audio',sourceSeconds:1.5});
 });
 test('post-song extension uses selected clip audio or silence, never loops song',()=>{
  const placements=[placement('a',120,168,1),placement('b',168,192,2,{audioSource:'clip'})];
  const plan=buildLivePreviewPlan(song,placements,[clip('a'),clip('b')]);
  expect(plan.durationSeconds).toBe(8);
  expect(livePreviewPoint(plan,6)).toMatchObject({video:{clipId:'a'},audio:{kind:'silence'}});
  expect(livePreviewPoint(plan,7.25)).toMatchObject({video:{clipId:'b'},audio:{kind:'clip',sourceSeconds:.25}});
 });
 test('changing priority or placement produces immediately different projection',()=>{
  const clips=[clip('a'),clip('b')],placements=[placement('a',0,48,1),placement('b',0,48,2)];
  expect(livePreviewPoint(buildLivePreviewPlan(song,placements,clips),0).video?.clipId).toBe('b');
  expect(livePreviewPoint(buildLivePreviewPlan(song,placements.map(p=>({...p,priority:3-p.priority})),clips),0).video?.clipId).toBe('a');
 });
 test('gaps show black and prewarm only the next source',()=>{
  const plan=buildLivePreviewPlan(song,[placement('a',24,48,1),placement('b',72,96,2)],[clip('a'),clip('b')]);
  expect(livePreviewPoint(plan,0)).toMatchObject({video:null,nextClip:{id:'a'}});
  expect(livePreviewPoint(plan,1)).toMatchObject({video:{clipId:'a'},nextClip:{id:'b'}});
  expect(livePreviewPoint(plan,2)).toMatchObject({video:null,nextClip:{id:'b'}});
 });
 test('missing selected audio is silence instead of doubling or substituting the song',()=>{
  const plan=buildLivePreviewPlan(song,[placement('a',0,24,1,{audioSource:'clip'})],[clip('a',false)]);
  expect(livePreviewPoint(plan,0).audio.kind).toBe('silence');
 });
 test('clamps seeking and handles frame rounding without a trailing sample overrun',()=>{
  const plan=buildLivePreviewPlan(song,[placement('a',0,24,1)],[clip('a')]);
  expect(livePreviewPoint(plan,-2).timeSeconds).toBe(0);
  expect(livePreviewPoint(plan,999)).toMatchObject({timeSeconds:5,ended:true,audio:{kind:'silence'}});
  expect(livePreviewPoint(plan,NaN).timeSeconds).toBe(0);
 });
 test('every frame matches the actual export compiler through overlap, trim, gap and post-song audio',()=>{
  const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const placements=[placement(uuid(1),12,120,1,{sourceStartFrame:7,audioSource:'clip'}),placement(uuid(2),36,60,3),placement(uuid(3),144,168,2,{sourceStartFrame:10,audioSource:'clip'})];
  const sourceClips=placements.map(p=>clip(p.clipId));
  const plan=buildLivePreviewPlan({...song,sampleCount:'240001'},placements,sourceClips);
  const render:RenderPlan={schemaVersion:1,projectId:uuid(9),songId:uuid(8),revision:1,song:{path:'/fixture/song.flac',sha256:'a'.repeat(64),sampleRate:48000,channels:2,sampleCount:'240001'},placements:placements.map(p=>({...p,frames:Array.from({length:240},(_,index)=>({path:`/fixture/${p.clipId}/${index}.png`,sha256:'b'.repeat(64)})),audio:{path:`/fixture/${p.clipId}.flac`,sha256:'c'.repeat(64)}}))};
  const exported=compileRenderPlan(render);expect(plan.frameCount).toBe(exported.frameCount);
  for(let frame=0;frame<plan.frameCount;frame++){
   const live=livePreviewPoint(plan,frame/24),picture=exported.spans.find(span=>span.startFrame<=frame&&span.endFrame>frame)!;
   expect(live.video?.placementId??null).toBe(picture.placementId);
   if(picture.sourceStartFrame!==null)expect(live.video?.sourceSeconds).toBeCloseTo((picture.sourceStartFrame+frame-picture.startFrame)/24,10);
   const sample=BigInt(frame)*2000n,sound=exported.audioSpans.find(span=>BigInt(span.startSample)<=sample&&BigInt(span.endSample)>sample)!;
   expect(live.audio.kind).toBe(sound.source);
   if(sound.sourceStartSample!==null&&live.audio.kind!=='silence')expect(live.audio.sourceSeconds).toBeCloseTo(Number(BigInt(sound.sourceStartSample)+sample-BigInt(sound.startSample))/48000,10);
  }
 });
});

describe('media synchronization and transport',()=>{
 test('paused scrubbing seeks precisely and keeps media paused',()=>{
  const m=media(),sync=new LiveMediaSynchronizer();
  sync.update(m,{seconds:2.125,playing:false,audible:false,volume:.5});
  expect(m.currentTime).toBe(2.125);expect(m.muted).toBe(true);expect(m.volume).toBe(.5);expect(m.play).not.toHaveBeenCalled();
 });
 test('playback starts once, corrects drift, and never repeatedly seeks within tolerance',async()=>{
  const m=media(),sync=new LiveMediaSynchronizer();
  sync.update(m,{seconds:2,playing:true,audible:true,volume:.5});await Promise.resolve();
  expect(m.play).toHaveBeenCalledOnce();expect(m.muted).toBe(false);
  sync.update(m,{seconds:2.02,playing:true,audible:true,volume:.5});expect(m.currentTime).toBe(2);
  sync.update(m,{seconds:2.3,playing:true,audible:true,volume:.5});expect(m.currentTime).toBe(2.3);expect(m.play).toHaveBeenCalledOnce();
 });
 test('pausing or disposing wins even if an older play promise resolves later',async()=>{
  let finish!:()=>void;const m=media();m.play=vi.fn(()=>new Promise<void>(resolve=>{finish=()=>{m.paused=false;resolve();};}));
  const sync=new LiveMediaSynchronizer();sync.update(m,{seconds:0,playing:true,audible:true,volume:.5});
  sync.dispose();finish();await Promise.resolve();expect(m.paused).toBe(true);expect(m.muted).toBe(true);
 });
 test('a rejected play stops spinning and reports an actionable browser playback failure',async()=>{
  const error=vi.fn(),m=media();m.play=vi.fn(()=>Promise.reject(new Error('NotAllowedError')));
  const sync=new LiveMediaSynchronizer(error);sync.update(m,{seconds:0,playing:true,audible:true,volume:.5});await Promise.resolve();await Promise.resolve();
  expect(error).toHaveBeenCalledOnce();expect(m.paused).toBe(true);
 });
 test('rapid pause/resume ignores the aborted old play and starts a fresh request',async()=>{
  let rejectOld!:(error:Error)=>void;const error=vi.fn(),m=media();
  m.play=vi.fn().mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{rejectOld=reject;})).mockImplementation(()=>{m.paused=false;return Promise.resolve();});
  const sync=new LiveMediaSynchronizer(error);
  sync.update(m,{seconds:0,playing:true,audible:true,volume:.5});
  sync.update(m,{seconds:0,playing:false,audible:true,volume:.5});
  sync.update(m,{seconds:0,playing:true,audible:true,volume:.5});
  rejectOld(new Error('AbortError'));await Promise.resolve();await Promise.resolve();
  expect(m.play).toHaveBeenCalledTimes(2);expect(error).not.toHaveBeenCalled();expect(m.paused).toBe(false);
 });
 test('short source audio ends as silence rather than replaying its final sample',()=>{
  const m=media(),sync=new LiveMediaSynchronizer();m.duration=1;
  sync.update(m,{seconds:1.5,playing:true,audible:true,volume:.5});expect(m.muted).toBe(true);expect(m.play).not.toHaveBeenCalled();
 });
 test('metadata loading delays seek but applies exact target when metadata arrives',()=>{
  const m=media(),sync=new LiveMediaSynchronizer();m.readyState=0;
  sync.update(m,{seconds:3,playing:false,audible:false,volume:.5});expect(m.currentTime).toBe(0);
  m.readyState=1;sync.update(m,{seconds:3,playing:false,audible:false,volume:.5});expect(m.currentTime).toBe(3);
 });
 test('media absent from the current projection is stopped and muted',()=>{
  const m=media(),sync=new LiveMediaSynchronizer();m.paused=false;
  sync.update(m,null);expect(m.paused).toBe(true);expect(m.muted).toBe(true);
 });
 test('wall clock supports pause, seek while playing, and terminal clamping',()=>{
  const clock=previewClock();clock.seek(2,1000);clock.play(1000);expect(clock.read(1500,8)).toBe(2.5);
  clock.pause(2000,8);expect(clock.read(5000,8)).toBe(3);
  clock.play(5000);clock.seek(6,5500);expect(clock.read(6000,8)).toBe(6.5);
  expect(clock.read(9000,8)).toBe(8);clock.pause(9000,8);expect(clock.read(10000,8)).toBe(8);
 });
 test('transport time includes frame labels and supports hour-long projects',()=>{
  expect(formatPreviewTime(1+3/24)).toBe('0:01:03');expect(formatPreviewTime(3601)).toBe('1:00:01:00');
 });
});
