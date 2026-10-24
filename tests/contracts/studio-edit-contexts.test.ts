/** Durable edit instances; metadata fixtures only, no native media generation. */
import { afterEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore, StudioStoreError } from '../../apps/server/src/studio/store.ts';
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
const cleanup: (()=>void)[]=[];
afterEach(()=>{for(const f of cleanup.splice(0).reverse())f();});
function open(path:string){const s=openStudioStore(path);cleanup.push(()=>s.close());return s;}
function addSong(s:StudioStore,p:string){const a=s.submitMusic(p,randomUUID(),{musicPrompt:'Fixture',lyrics:''});return s.finishMusic(a.id,{title:'Song',assetId:randomUUID(),assetPath:`/managed/${p}/${randomUUID()}.wav`,sha256:'a'.repeat(64),sampleCount:'480000',sampleRate:48000,channels:2,durationSeconds:10,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000','48000'],waveformBucketSamples:1,peaks:[1],error:null,version:'fixture'}},{});}
function addClip(s:StudioStore,p:string,songId:string,startFrame=0,count=80,audio=true){const a=s.submitVideo(p,randomUUID(),{songId,clipPrompt:'Fixture video',style:'Captured',startFrame,endFrame:startFrame+count});const asset=(ext:string)=>({assetId:randomUUID(),path:`/managed/${p}/${randomUUID()}.${ext}`,sha256:'b'.repeat(64)});return s.finishVideo(a.id,{title:'Clip',video:asset('mp4'),audio:audio?{...asset('flac'),sampleCount:'160000',sampleRate:48000,channels:2}:null,frames:Array.from({length:count},(_,index)=>({...asset('png'),index,pixelSha256:'c'.repeat(64),bytes:100})),frameCount:count,width:640,height:480,fps:'24/1'},{originalToolSettings:'unchanged'});}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-edit-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'studio.sqlite'),s=open(path),p=s.createProject('Edit'),song=addSong(s,p.id),clip=addClip(s,p.id,song.id);return{s,p,song,clip,path};}
function status(fn:()=>unknown,code:number){try{fn();}catch(e){expect(e).toBeInstanceOf(StudioStoreError);expect(e).toMatchObject({statusCode:code});return;}throw Error('Expected rejection');}
function context(s:StudioStore,p:string,id?:string){const all=s.project(p).editContexts;return id?all.find(c=>c.id===id)!:all[0]!;}

test('source1–80 trimmed6–75 preserves origin, leaves both five-frame holes and survives reopen without rewriting generation',()=>{
 const {s,p,song,clip,path}=fixture(),before=s.project(p.id),c=context(s,p.id),arr=s.arrangement(p.id,song.id);
 expect(c).toMatchObject({id:arr.placements[0]!.id,placementId:arr.placements[0]!.id,revision:0,sourceOriginFrame:0,sourceStartFrame:0,sourceEndFrame:80,audioSource:'song',placementIntent:null,trimIntent:null});
 const edited=s.editClipContext(p.id,c.id,0,arr.revision,{sourceStartFrame:5,sourceEndFrame:75});
 expect(edited.context).toMatchObject({revision:1,sourceOriginFrame:0,sourceStartFrame:5,sourceEndFrame:75});expect(edited.arrangement.placements[0]).toMatchObject({startFrame:5,endFrame:75,sourceStartFrame:5});
 expect(edited.context.trimIntent).toEqual({start:{unit:'rational',value:{numerator:'5',denominator:'24'}},end:{unit:'rational',value:{numerator:'25',denominator:'8'}}});
 expect(s.project(p.id).videoAttempts).toEqual(before.videoAttempts);expect(s.clip(clip.id)).toEqual(clip);s.close();const r=open(path);expect(context(r,p.id)).toEqual(edited.context);expect(r.arrangement(p.id,song.id)).toEqual(edited.arrangement);
});

test('move is independent from trim, accepts negative source origin, preserves exact last-edited intent and one-frame trims',()=>{
 const {s,p,song}=fixture(),c=context(s,p.id),trim=s.editClipContext(p.id,c.id,0,1,{sourceStartFrame:5,sourceEndFrame:75});
 const moved=s.editClipContext(p.id,c.id,trim.context.revision,trim.arrangement.revision,{startFrame:0,placementIntent:{unit:'seconds',value:'0.0000000000000000001'}});
 expect(moved.context).toMatchObject({sourceOriginFrame:-5,sourceStartFrame:5,sourceEndFrame:75,trimIntent:null,placementIntent:{unit:'seconds',value:'0.0000000000000000001'}});expect(moved.arrangement.placements[0]).toMatchObject({startFrame:0,endFrame:70});
 const one=s.editClipContext(p.id,c.id,moved.context.revision,moved.arrangement.revision,{sourceStartFrame:6,sourceEndFrame:7});expect(one.arrangement.placements[0]).toMatchObject({startFrame:1,endFrame:2,sourceStartFrame:6});expect(one.context.sourceOriginFrame).toBe(-5);expect(one.context.placementIntent).toBeNull();
 expect(s.arrangement(p.id,song.id).placements).toHaveLength(1);
});

test('beat/seconds trim intent is exact, realises against original origin, rejects mismatches and never drifts on reanalysis',()=>{
 const {s,p,song}=fixture(),c=context(s,p.id),intent={start:{unit:'seconds' as const,value:'0.20833333333333333334'},end:{unit:'beats' as const,value:'7.25'}};
 const edited=s.editClipContext(p.id,c.id,0,1,{sourceStartFrame:5,sourceEndFrame:75,trimIntent:intent});expect(edited.context.trimIntent).toEqual(intent);expect(edited.context.sourceOriginFrame).toBe(0);
 const before=s.project(p.id);status(()=>s.editClipContext(p.id,c.id,1,2,{sourceStartFrame:6,sourceEndFrame:75,trimIntent:intent}),400);expect(s.project(p.id)).toEqual(before);
 s.setAnalysis(song.id,{...song.analysis,estimatedBpm:60,sampleIndices:['0','48000','96000']});expect(context(s,p.id)).toEqual(edited.context);
});

test('unplace preserves context and contributes no coverage; unplaced edits and re-place reuse stable identity without resetting audio or trim',()=>{
 const {s,p,song}=fixture(),c=context(s,p.id),trim=s.editClipContext(p.id,c.id,0,1,{sourceStartFrame:5,sourceEndFrame:75}),audio=s.editClipContext(p.id,c.id,1,2,{audioSource:'clip'}),removed=s.setContextPlacement(p.id,c.id,2,3,false);
 expect(removed.context).toMatchObject({id:c.id,placementId:null,sourceStartFrame:5,sourceEndFrame:75,audioSource:'clip',revision:3});expect(removed.arrangement.placements).toEqual([]);expect(s.listProjects()[0]!.coveragePercent).toBe(0);
 const move=s.editClipContext(p.id,c.id,3,4,{startFrame:24});expect(move.arrangement).toEqual(removed.arrangement);expect(move.context.sourceOriginFrame).toBe(19);
 const back=s.setContextPlacement(p.id,c.id,4,4,true);expect(back.context.placementId).toBe(c.id);expect(back.arrangement.placements).toEqual([expect.objectContaining({id:c.id,startFrame:24,endFrame:94,sourceStartFrame:5,audioSource:'clip'})]);expect(back.arrangement.songId).toBe(song.id);expect(trim.context.sourceOriginFrame).toBe(0);expect(audio.context.audioSource).toBe('clip');
});

test('each reuse has its own audio/timing context; original song and origin remain available for alignment warnings',()=>{
 const {s,p,song,clip}=fixture(),original=context(s,p.id),second=addSong(s,p.id),reuse=s.addPlacement(p.id,second.id,0,{clipId:clip.id,startFrame:30,sourceStartFrame:2,frameCount:30}),id=reuse.placements[0]!.id;
 const enabled=s.editClipContext(p.id,id,0,1,{audioSource:'clip'});expect(enabled.context).toMatchObject({songId:second.id,sourceOriginFrame:28,audioSource:'clip'});expect(context(s,p.id,original.id)).toEqual(original);
 expect(s.clip(clip.id)).toMatchObject({songId:song.id,attemptId:clip.attemptId});expect(s.videoAttempt(clip.attemptId)!.input.startFrame).toBe(0);
 const render=s.enqueueRender(p.id,second.id,2,randomUUID());expect(render.snapshot.arrangement.placements[0]!.audioSource).toBe('clip');
 s.editClipContext(p.id,id,1,2,{audioSource:'song'});expect(s.render(render.id)).toEqual(render);expect(s.arrangement(p.id,song.id).placements[0]!.audioSource??'song').toBe('song');
});

test('three overlapping clips swap only chosen priorities and preserve timing/source/audio',()=>{
 const {s,p,song}=fixture();addClip(s,p.id,song.id,0,80);addClip(s,p.id,song.id,0,80);const before=s.arrangement(p.id,song.id),[a,b,c]=before.placements;
 const swapped=s.swapPlacementPriority(p.id,song.id,before.revision,a!.id,c!.id);
 expect(swapped.placements).toEqual(before.placements.map(x=>({...x,priority:x.id===a!.id?c!.priority:x.id===c!.id?a!.priority:x.priority})));expect(swapped.placements[1]).toEqual(b);
 status(()=>s.swapPlacementPriority(p.id,song.id,before.revision,a!.id,c!.id),409);
 const moved=s.movePlacement(p.id,song.id,swapped.revision,b!.id,100);status(()=>s.swapPlacementPriority(p.id,song.id,moved.revision,a!.id,b!.id),400);
});

test('invalid bounds, empty/action-combined patches, unavailable audio, stale revisions and foreign identities roll back context/arrangement/events',()=>{
 const {s,p,song}=fixture(),c=context(s,p.id),other=s.createProject('Other');const before=s.project(p.id);
 for(const edit of [{sourceStartFrame:-1},{sourceEndFrame:81},{sourceStartFrame:80,sourceEndFrame:80},{sourceStartFrame:0.1},{startFrame:-1},{startFrame:10,sourceStartFrame:2},{audioSource:'clip',startFrame:10},{},{placementIntent:{unit:'seconds',value:'0'}},{startFrame:1,placementIntent:{unit:'seconds',value:'0'}}])status(()=>s.editClipContext(p.id,c.id,0,1,edit as Parameters<StudioStore['editClipContext']>[4]),400);
 status(()=>s.editClipContext(p.id,c.id,1,1,{startFrame:1}),409);status(()=>s.editClipContext(p.id,c.id,0,0,{startFrame:1}),409);status(()=>s.editClipContext(other.id,c.id,0,1,{startFrame:1}),404);expect(s.project(p.id)).toEqual(before);
 const silent=addClip(s,p.id,song.id,100,1,false),silentContext=s.project(p.id).editContexts.find(x=>x.clipId===silent.id)!;status(()=>s.editClipContext(p.id,silentContext.id,0,2,{audioSource:'clip'}),400);
 const latest=s.project(p.id);status(()=>s.setContextPlacement(p.id,c.id,1,2,false),409);expect(s.project(p.id)).toEqual(latest);
});

test('legacy move/remove remain compatible and retain stable unplaced edit context; duplicate completions never recreate placement',()=>{
 const {s,p,song,clip,path}=fixture(),c=context(s,p.id),moved=s.movePlacement(p.id,song.id,1,c.id,40);expect(context(s,p.id)).toMatchObject({id:c.id,sourceOriginFrame:40,revision:1});
 s.removePlacement(p.id,song.id,moved.revision,c.id);expect(context(s,p.id)).toMatchObject({id:c.id,placementId:null,sourceOriginFrame:40,revision:2});expect(s.clip(clip.id)).toEqual(clip);
 const db=new Database(path,{readonly:true}),row=db.prepare('SELECT completion_json FROM studio_video_attempts WHERE id=?').get(clip.attemptId) as {completion_json:string};db.close();const before=s.project(p.id);expect(s.finishVideo(clip.attemptId,JSON.parse(row.completion_json),{ignored:'duplicate'})).toEqual(clip);expect(s.project(p.id)).toEqual(before);
});

test('schema4 migration derives placement and unplaced contexts without changing any existing creative rows or render snapshots',()=>{
 const {s,p,song,clip,path}=fixture(),unplaced=addClip(s,p.id,song.id,100,2),remove=s.arrangement(p.id,song.id).placements.find(x=>x.clipId===unplaced.id)!;s.removePlacement(p.id,song.id,2,remove.id);s.enqueueRender(p.id,song.id,3,randomUUID());s.close();
 const db=new Database(path),tables=['studio_projects','studio_attempts','studio_songs','studio_assets','studio_video_attempts','studio_clips','studio_arrangements','studio_renders','studio_events','studio_clip_drafts'],rows=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));
 db.exec('DROP TABLE IF EXISTS studio_edit_contexts; UPDATE studio_meta SET version=4');db.close();const r=open(path),check=new Database(path,{readonly:true});
 expect(check.prepare('SELECT version FROM studio_meta').get()).toEqual({version:10});for(const t of tables)expect(check.prepare(`SELECT * FROM ${t}`).all(),t).toEqual(rows[t]);check.close();
 const contexts=r.project(p.id).editContexts;expect(contexts).toHaveLength(2);expect(contexts.find(c=>c.clipId===clip.id)).toMatchObject({placementId:r.arrangement(p.id,song.id).placements[0]!.id,sourceOriginFrame:0,sourceStartFrame:0,sourceEndFrame:80,audioSource:'song',revision:0});expect(contexts.find(c=>c.clipId===unplaced.id)).toMatchObject({placementId:null,sourceOriginFrame:100,sourceStartFrame:0,sourceEndFrame:2,revision:0});
 r.close();const twice=open(path);expect(twice.project(p.id).editContexts).toEqual(contexts);
});


test('profile-v1 successful render remains immutable on replay but a fresh key cannot reuse it under v2',()=>{
 const {s,p,song,path}=fixture(),key=randomUUID(),r=s.enqueueRender(p.id,song.id,1,key);
 const complete=s.finishRender(r.id,{assetId:randomUUID(),path:`/managed/${p.id}/${randomUUID()}.mp4`,sha256:'d'.repeat(64),frameCount:240,planHash:'e'.repeat(64),receiptPath:`/managed/${p.id}/old-receipt.json`},{profileVersion:1});s.close();
 const profile={version:1,width:640,height:480,fps:'24/1',sampleRate:48000,channels:2,videoCodec:'libx264',pixelFormat:'yuv420p',crf:18,preset:'veryfast',audioCodec:'aac',audioBitrate:'192k',movieTimescale:48000};
 const canonical=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>`${JSON.stringify(k)}:${canonical(value)}`).join(',')}}`;
 const legacy={...complete,snapshotHash:createHash('sha256').update(canonical({profile,snapshot:complete.snapshot})).digest('hex')};
 const db=new Database(path),stored=JSON.stringify(legacy);db.prepare('UPDATE studio_renders SET data=? WHERE id=?').run(stored,r.id);db.close();
 const reopened=open(path);expect(reopened.enqueueRender(p.id,song.id,1,key)).toEqual(legacy);
 const fresh=reopened.enqueueRender(p.id,song.id,1,randomUUID());expect(fresh.id).not.toBe(r.id);expect(fresh.snapshotHash).not.toBe(legacy.snapshotHash);expect(fresh.state).toBe('queued');expect(reopened.enqueueRender(p.id,song.id,1,randomUUID()).id).toBe(fresh.id);
 const check=new Database(path,{readonly:true});expect(check.prepare('SELECT data FROM studio_renders WHERE id=?').get(r.id)).toEqual({data:stored});check.close();
});

test('moves and new placements reject a retained end whose containing-frame label cannot be represented safely',()=>{
 const {s,p,song,clip}=fixture(),c=context(s,p.id),before=s.project(p.id),unsafeStart=Number.MAX_SAFE_INTEGER-80;
 status(()=>s.editClipContext(p.id,c.id,0,1,{startFrame:unsafeStart}),400);
 status(()=>s.movePlacement(p.id,song.id,1,c.id,unsafeStart),400);
 status(()=>s.addPlacement(p.id,song.id,1,{clipId:clip.id,startFrame:unsafeStart}),400);
 expect(s.project(p.id)).toEqual(before);
 const trim=s.editClipContext(p.id,c.id,0,1,{sourceEndFrame:79});
 const safe=s.editClipContext(p.id,c.id,trim.context.revision,trim.arrangement.revision,{startFrame:unsafeStart});expect(safe.arrangement.placements[0]!.endFrame).toBe(Number.MAX_SAFE_INTEGER-1);
 status(()=>s.editClipContext(p.id,c.id,safe.context.revision,safe.arrangement.revision,{sourceEndFrame:80}),400);expect(context(s,p.id)).toEqual(safe.context);
});
