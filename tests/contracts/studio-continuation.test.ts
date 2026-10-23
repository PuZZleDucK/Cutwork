/** Continuation capture/draft tests use synthetic registered metadata, never generation. */
import { afterEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore, StudioStoreError } from '../../apps/server/src/studio/store.ts';
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { VideoInput } from '../../packages/core/src/contracts/studio.ts';
const cleanup:(()=>void)[]=[];
afterEach(()=>{for(const f of cleanup.splice(0).reverse())f();});
function open(path:string){const s=openStudioStore(path);cleanup.push(()=>s.close());return s;}
function song(s:StudioStore,p:string){const attempt=s.submitMusic(p,randomUUID(),{musicPrompt:'Synthetic music',lyrics:''});return s.finishMusic(attempt.id,{title:'Fixture',assetId:randomUUID(),assetPath:`/managed/${p}/${randomUUID()}.wav`,sha256:'a'.repeat(64),sampleCount:'480000',sampleRate:48000,channels:2,durationSeconds:10,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000'],waveformBucketSamples:1,peaks:[1.25],error:null,version:'fixture'}},{});}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-continuation-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'studio.sqlite'),s=open(path),p=s.createProject('Continue'),audio=song(s,p.id),attempt=s.submitVideo(p.id,randomUUID(),{songId:audio.id,clipPrompt:'Original prompt not to copy',style:'Original style',startFrame:0,endFrame:80});
 const asset=(ext:string)=>({assetId:randomUUID(),path:`/managed/${p.id}/${randomUUID()}.${ext}`,sha256:'b'.repeat(64)}),clip=s.finishVideo(attempt.id,{title:'Fixture clip',video:asset('mp4'),audio:null,frames:Array.from({length:81},(_,index)=>({...asset('png'),index,pixelSha256:index.toString(16).padStart(64,'0'),bytes:100+index})),frameCount:81,width:640,height:480,fps:'24/1'},{});return{s,p,audio,clip,path,context:s.project(p.id).editContexts[0]!};}
function status(fn:()=>unknown,code:number){try{fn();}catch(e){expect(e).toBeInstanceOf(StudioStoreError);expect(e).toMatchObject({statusCode:code});return;}throw Error('Expected rejection');}

test('per-card preparation follows retained raw frame/current end even unplaced and unselected, saves exact draft only',()=>{
 const f=fixture(),{s,p,audio,clip,context}=f;const trim=s.editClipContext(p.id,context.id,0,1,{sourceStartFrame:5,sourceEndFrame:75}),move=s.editClipContext(p.id,context.id,trim.context.revision,trim.arrangement.revision,{startFrame:29}),removed=s.setContextPlacement(p.id,context.id,move.context.revision,move.arrangement.revision,false);
 s.saveClipDraft(p.id,audio.id,0,{clipPrompt:'New scene request',timingIntent:null});const newer=song(s,p.id),other=s.createProject('Other'),before=s.project(p.id),prepared=s.prepareContinuation(p.id,context.id,removed.context.revision,1);
 expect(prepared.presetBeatCount).toBe(8);expect(prepared.draft).toMatchObject({songId:audio.id,clipPrompt:'New scene request',revision:2});
 expect(prepared.draft.continuation).toEqual({contextId:context.id,contextRevision:removed.context.revision,clipId:clip.id,songId:audio.id,sourceOriginFrame:24,sourceStartFrame:5,sourceEndFrame:75,endFrame:99,frame:clip.rawFrames[74]});
 expect(prepared.draft.timingIntent).toEqual({start:{unit:'rational',value:{numerator:'33',denominator:'8'}},end:{unit:'rational',value:{numerator:'65',denominator:'8'}}});
 expect(s.selectedProject()).toBe(other.id);expect(s.project(p.id).project).toEqual(before.project);expect(before.project.selectedSongId).toBe(newer.id);expect(s.project(p.id).arrangements).toEqual(before.arrangements);expect(s.project(p.id).videoAttempts).toEqual(before.videoAttempts);expect(s.project(p.id).reservations).toEqual([]);expect(s.project(p.id).editContexts).toEqual(before.editContexts);expect(s.clip(clip.id)).toEqual(clip);
});

test('fresh submission captures immutable continuation and idempotent replay ignores later predecessor/provider/selection changes',()=>{
 const {s,p,audio,clip,context,path}=fixture(),prepared=s.prepareContinuation(p.id,context.id,0,0),key=randomUUID(),input:VideoInput={songId:audio.id,clipPrompt:'Next shot',style:'Current style',startFrame:80,endFrame:176,timingIntent:prepared.draft.timingIntent!,continuation:{contextId:context.id,contextRevision:0}},accepted=s.submitVideo(p.id,key,input);
 expect(accepted.continuation).toEqual(prepared.draft.continuation);expect(accepted.continuation!.frame).toEqual(clip.rawFrames[79]);expect(accepted.continuation!.frame).not.toEqual(clip.rawFrames[80]);
 s.editClipContext(p.id,context.id,0,1,{sourceEndFrame:70});s.setProvider('claude');song(s,p.id);s.close();const r=open(path);expect(r.submitVideo(p.id,key,input)).toEqual(accepted);expect(r.videoAttempt(accepted.id)).toEqual(accepted);
 const before=r.project(p.id);status(()=>r.submitVideo(p.id,randomUUID(),input),409);expect(r.project(p.id)).toEqual(before);
});

test('preparation rejects stale context/draft and cross-project identity atomically; same-song instances use their own edited end',()=>{
 const {s,p,audio,clip,context}=fixture(),other=s.createProject('Other'),added=s.addPlacement(p.id,audio.id,1,{clipId:clip.id,startFrame:200,sourceStartFrame:10,frameCount:30}),second=s.project(p.id).editContexts.find(c=>c.id===added.placements[1]!.id)!;
 const before=s.project(p.id);status(()=>s.prepareContinuation(p.id,context.id,1,0),409);status(()=>s.prepareContinuation(p.id,context.id,0,1),409);status(()=>s.prepareContinuation(other.id,context.id,0,0),404);expect(s.project(p.id)).toEqual(before);
 const prepared=s.prepareContinuation(p.id,second.id,0,0);expect(prepared.draft.continuation).toMatchObject({contextId:second.id,endFrame:230,sourceStartFrame:10,sourceEndFrame:40,frame:clip.rawFrames[39]});
 expect(prepared.draft.timingIntent!.start).toEqual({unit:'rational',value:{numerator:'115',denominator:'12'}});
});

test('missing beat analysis retains frame/start and requires an explicit end instead of inventing a duration',()=>{
 const {s,p,audio,context}=fixture();s.setAnalysis(audio.id,{...audio.analysis,state:'failed',estimatedBpm:null,sampleIndices:[],error:'No beat map'});
 const result=s.prepareContinuation(p.id,context.id,0,0);expect(result.presetBeatCount).toBeNull();expect(result.draft.timingIntent).toEqual({start:{unit:'rational',value:{numerator:'10',denominator:'3'}},end:{unit:'seconds',value:''}});
 const input:VideoInput={songId:audio.id,clipPrompt:'Next',style:'',startFrame:80,endFrame:104,timingIntent:result.draft.timingIntent!,continuation:{contextId:context.id,contextRevision:0}};
 status(()=>s.submitVideo(p.id,randomUUID(),input),400);expect(s.submitVideo(p.id,randomUUID(),{...input,timingIntent:{start:result.draft.timingIntent!.start,end:{unit:'rational',value:{numerator:'13',denominator:'3'}}}}).continuation).toEqual(result.draft.continuation);
});

test('adaptive slow-song defaults and off-beat post-song continuation remain full windows, not gap suggestions or song caps',()=>{
 const {s,p,audio,context}=fixture();s.setAnalysis(audio.id,{...audio.analysis,estimatedBpm:15,sampleIndices:['0','192000','384000']});const moved=s.editClipContext(p.id,context.id,0,1,{startFrame:301});
 const prepared=s.prepareContinuation(p.id,context.id,moved.context.revision,0);expect(prepared.presetBeatCount).toBe(2);expect(prepared.draft.continuation!.endFrame).toBe(381);
 expect(prepared.draft.timingIntent).toEqual({start:{unit:'rational',value:{numerator:'127',denominator:'8'}},end:{unit:'rational',value:{numerator:'191',denominator:'8'}}});
});

test('draft autosave preserves an unchanged stale binding, explicit clear removes it, new references validate context/song',()=>{
 const {s,p,audio,context,path}=fixture(),prepared=s.prepareContinuation(p.id,context.id,0,0),reference={contextId:context.id,contextRevision:0};s.editClipContext(p.id,context.id,0,1,{sourceEndFrame:70});
 const saved=s.saveClipDraft(p.id,audio.id,prepared.draft.revision,{clipPrompt:'Edited after predecessor changed',timingIntent:prepared.draft.timingIntent,continuation:reference});expect(saved.continuation).toEqual(prepared.draft.continuation);
 const omitted=s.saveClipDraft(p.id,audio.id,saved.revision,{clipPrompt:'More edits',timingIntent:saved.timingIntent});expect(omitted.continuation).toEqual(prepared.draft.continuation);
 const second=song(s,p.id);status(()=>s.saveClipDraft(p.id,second.id,0,{clipPrompt:'Wrong song',timingIntent:null,continuation:reference}),404);
 const cleared=s.saveClipDraft(p.id,audio.id,omitted.revision,{clipPrompt:omitted.clipPrompt,timingIntent:omitted.timingIntent,continuation:null});expect(cleared.continuation).toBeNull();status(()=>s.saveClipDraft(p.id,audio.id,cleared.revision,{clipPrompt:'Cannot resurrect stale reference',timingIntent:null,continuation:reference}),409);
 s.close();const r=open(path);expect(r.project(p.id).clipDrafts.find(d=>d.songId===audio.id)).toEqual(cleared);
});

test('foreign/changed asset registration or forged continuation metadata cannot produce a captured image request',()=>{
 const {s,p,audio,clip,context,path}=fixture(),input={songId:audio.id,clipPrompt:'Next',style:'',startFrame:80,endFrame:176,continuation:{contextId:context.id,contextRevision:0}},before=s.project(p.id);
 for(const continuation of [{contextId:context.id,contextRevision:0,frame:clip.rawFrames[79]},{contextId:context.id,contextRevision:-1},{contextId:randomUUID(),contextRevision:0}])status(()=>s.submitVideo(p.id,randomUUID(),{...input,continuation}),'frame' in continuation||continuation.contextRevision<0?400:404);
 expect(s.project(p.id)).toEqual(before);const db=new Database(path);db.prepare('UPDATE studio_assets SET sha256=? WHERE id=?').run('d'.repeat(64),clip.rawFrames[79]!.assetId);db.close();
 status(()=>s.prepareContinuation(p.id,context.id,0,0),409);status(()=>s.submitVideo(p.id,randomUUID(),input),409);expect(s.project(p.id)).toEqual(before);
});

test('schema5 to current does not rewrite legacy drafts, requests, render snapshots or creative rows',()=>{
 const {s,p,audio,path}=fixture();s.saveClipDraft(p.id,audio.id,0,{clipPrompt:'Preserved unsent legacy draft',timingIntent:{start:{unit:'beats',value:'1.333333333333'},end:{unit:'seconds',value:''}}});const render=s.enqueueRender(p.id,audio.id,1,randomUUID());s.finishRender(render.id,{assetId:randomUUID(),path:`/managed/${p.id}/${randomUUID()}.mp4`,sha256:'d'.repeat(64),frameCount:240,planHash:'e'.repeat(64),receiptPath:`/managed/${p.id}/receipt.json`},{nativeVersion:'fixture'});s.enqueueRender(p.id,audio.id,1,randomUUID());s.close();const db=new Database(path);db.exec('UPDATE studio_meta SET version=5');const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name!='studio_meta' ORDER BY name").all() as {name:string}[]).map(r=>r.name),before=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()])),schema=db.prepare('SELECT * FROM sqlite_master ORDER BY name').all();db.close();
 const r=open(path),check=new Database(path,{readonly:true});expect(check.prepare('SELECT version FROM studio_meta').get()).toEqual({version:8});expect(check.prepare('SELECT * FROM sqlite_master ORDER BY name').all()).toEqual(schema);for(const t of tables)expect(check.prepare(`SELECT * FROM ${t}`).all(),t).toEqual(before[t]);check.close();expect(r.project(p.id).clipDrafts[0]).not.toHaveProperty('continuation');
});


test('cross-song clip reuse continues with the target song while native parent/frame identity stays original',()=>{
 const {s,p,audio,clip}=fixture(),target=song(s,p.id),arr=s.addPlacement(p.id,target.id,0,{clipId:clip.id,startFrame:48,sourceStartFrame:10,frameCount:1}),context=s.project(p.id).editContexts.find(c=>c.id===arr.placements[0]!.id)!;
 const prepared=s.prepareContinuation(p.id,context.id,0,0);expect(prepared.draft.continuation).toMatchObject({songId:target.id,clipId:clip.id,sourceStartFrame:10,sourceEndFrame:11,endFrame:49,frame:clip.rawFrames[10]});
 expect(clip.songId).toBe(audio.id);const accepted=s.submitVideo(p.id,randomUUID(),{songId:target.id,clipPrompt:'Reuse with different track',style:'',startFrame:49,endFrame:145,timingIntent:prepared.draft.timingIntent!,continuation:{contextId:context.id,contextRevision:0}});expect(accepted.song.id).toBe(target.id);expect(accepted.continuation!.frame).toEqual(clip.rawFrames[10]);
});

test('a foreign project PNG registration cannot be captured even when all hashes match',()=>{
 const {s,p,clip,context,path}=fixture(),other=s.createProject('Foreign media'),before=s.project(p.id),db=new Database(path);db.prepare('UPDATE studio_assets SET project_id=? WHERE id=?').run(other.id,clip.rawFrames[79]!.assetId);db.close();
 status(()=>s.prepareContinuation(p.id,context.id,0,0),409);expect(s.project(p.id)).toEqual(before);
});
