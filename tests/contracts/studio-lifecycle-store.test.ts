import { afterEach, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { ArtifactRef, ManagedMediaInventory } from '../../packages/core/src/contracts/lifecycle.ts';
const clean:(()=>void)[]=[];afterEach(()=>{for(const f of clean.splice(0).reverse())f();});
function open(path:string){const s=openStudioStore(path);clean.push(()=>s.close());return s;}
function song(s:StudioStore,p:string,pending=false){const a=s.submitMusic(p,randomUUID(),{musicPrompt:'Original music',lyrics:'Words'});return s.finishMusic(a.id,{title:'Song',assetId:randomUUID(),assetPath:`/managed/${p}/${randomUUID()}.wav`,sha256:'a'.repeat(64),sampleCount:'480000',sampleRate:48000,channels:2,durationSeconds:10,truncated:false,analysis:{state:pending?'pending':'available',estimatedBpm:120,sampleIndices:['0','24000','48000'],waveformBucketSamples:1,peaks:[1],error:null,version:'fixture'}},{});}
function output(p:string){const asset=(ext:string)=>({assetId:randomUUID(),path:`/managed/${p}/${randomUUID()}.${ext}`,sha256:'b'.repeat(64)});return {title:'Clip',video:asset('mp4'),audio:{...asset('flac'),sampleCount:'48000',sampleRate:48000,channels:2},frames:Array.from({length:24},(_,index)=>({...asset('png'),index,pixelSha256:'c'.repeat(64),bytes:100})),frameCount:24,width:640,height:480,fps:'24/1' as const};}
function clip(s:StudioStore,p:string,songId:string,startFrame=0){const a=s.submitVideo(p,randomUUID(),{songId,clipPrompt:'Original video',style:'Style',startFrame,endFrame:startFrame+24});return s.finishVideo(a.id,output(p),{settings:'Preserve'});}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-lifecycle-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'studio.sqlite'),s=open(path),p=s.createProject('Lifecycle'),music=song(s,p.id),video=clip(s,p.id,music.id);return{s,p,music,video,path};}
function ref(kind:'song'|'clip',id:string):ArtifactRef{return {kind,id};}
function deletion(s:StudioStore,p:string,artifact:ArtifactRef,key=randomUUID()){
 const c=s.deletionContext(p,artifact),inventory:ManagedMediaInventory={version:1,projectId:p,artifact,entries:c.assetIds.map((id)=>({id,path:s.rawAsset(id)!.path,role:'original',sha256:s.rawAsset(id)!.sha256,bytes:100,identity:null})),affectedAssetIds:c.assetIds,affectedRenderIds:c.renderIds,digest:'d'.repeat(64)};
 const thumbnail=artifact.kind==='clip'?{assetId:randomUUID(),path:`/managed/${p}/thumbnails/${randomUUID()}.png`,sha256:'e'.repeat(64),bytes:10,width:160,height:120}:undefined;
 return {context:c,input:{contextDigest:c.digest,idempotencyKey:key,inventory,...(thumbnail?{thumbnail}:{})}};
}
const reject=(f:()=>unknown,code=409)=>expect(f).toThrowError(expect.objectContaining({statusCode:code}));

test('archive A across arrangements, place B, restore A unplaced; keep trims, audio, origin and original generation',()=>{
 const {s,p,music,video}=fixture(),other=song(s,p.id),c=s.project(p.id).editContexts[0]!;
 s.editClipContext(p.id,c.id,0,1,{sourceStartFrame:3,sourceEndFrame:20});s.editClipContext(p.id,c.id,1,2,{audioSource:'clip'});
 s.addPlacement(p.id,other.id,0,{clipId:video.id,startFrame:48});s.archiveArtifact(p.id,ref('song',other.id),0);
 const before=s.project(p.id),archived=s.archiveArtifact(p.id,ref('clip',video.id),0);
 expect(archived).toMatchObject({state:'archived',revision:1});expect(s.project(p.id).arrangements.every(a=>a.placements.length===0)).toBe(true);
 expect(s.project(p.id).editContexts[0]).toMatchObject({placementId:null,sourceStartFrame:3,sourceEndFrame:20,audioSource:'clip',sourceOriginFrame:0});
 expect(s.project(p.id).videoAttempts).toEqual(before.videoAttempts);expect(s.clip(video.id)).toEqual(video);expect(s.archiveArtifact(p.id,ref('clip',video.id),0)).toEqual(archived);
 const b=clip(s,p.id,music.id),placed=s.project(p.id).arrangements;s.restoreArtifact(p.id,ref('clip',video.id),1);expect(s.project(p.id).arrangements).toEqual(placed);expect(s.arrangement(p.id,music.id).placements.map(x=>x.clipId)).toEqual([b.id]);
 expect(s.project(p.id).events.filter(e=>e.kind==='artifact.archived'&&e.data.artifactId===video.id)).toHaveLength(1);
});

test('song archive deselects, preserves arrangement and accepted completion; restore stays unselected',()=>{
 const {s,p,music}=fixture(),a=s.submitVideo(p.id,randomUUID(),{songId:music.id,clipPrompt:'Accepted',style:'',startFrame:24,endFrame:48}),before=s.arrangement(p.id,music.id);
 s.archiveArtifact(p.id,ref('song',music.id),0);expect(s.project(p.id).project.selectedSongId).toBeNull();expect(s.arrangement(p.id,music.id)).toEqual(before);s.finishVideo(a.id,output(p.id),{});expect(s.arrangement(p.id,music.id).placements).toHaveLength(2);
 s.restoreArtifact(p.id,ref('song',music.id),1);expect(s.project(p.id).project.selectedSongId).toBeNull();s.selectSong(p.id,music.id,s.project(p.id).project.revision);expect(s.project(p.id).project.selectedSongId).toBe(music.id);
});

test('prepare is read-only; stale contexts and cross-project operations reject without mutation',()=>{
 const {s,p,music,video}=fixture(),r=ref('clip',video.id),before=s.project(p.id),d=deletion(s,p.id,r);expect(s.project(p.id)).toEqual(before);
 s.movePlacement(p.id,music.id,1,s.arrangement(p.id,music.id).placements[0]!.id,10);const edited=s.project(p.id);reject(()=>s.acceptDeletion(p.id,r,d.input));expect(s.project(p.id)).toEqual(edited);const other=s.createProject('Other');reject(()=>s.lifecycle(other.id,r),404);reject(()=>s.archiveArtifact(other.id,r,0),404);
});

test('delete immediately removes placements/read access, retains history; failure/restart cannot claim deleted early',()=>{
 const {s,p,music,video,path}=fixture(),r=ref('clip',video.id),before=s.project(p.id),d=deletion(s,p.id,r),purge=s.acceptDeletion(p.id,r,d.input);
 expect(purge.state).toBe('pending');expect(s.lifecycle(p.id,r)).toMatchObject({state:'deleting',deletionId:purge.id});expect(s.arrangement(p.id,music.id).placements).toEqual([]);for(const id of d.context.assetIds)expect(s.asset(id)).toBeNull();expect(s.asset(d.input.thumbnail!.assetId)).not.toBeNull();expect(s.rawAsset(video.assetId)).not.toBeNull();
 expect(s.project(p.id).videoAttempts).toEqual(before.videoAttempts);expect(s.project(p.id).clips).toEqual(before.clips);expect(s.acceptDeletion(p.id,r,d.input)).toEqual(purge);reject(()=>s.finishDeletion(purge.id));reject(()=>s.restoreArtifact(p.id,r,1));reject(()=>s.addPlacement(p.id,music.id,2,{clipId:video.id,startFrame:0}));
 s.patchDeletion(purge.id,{completedEntryIds:[purge.inventory.entries[0]!.id]});s.patchDeletion(purge.id,{error:'Injected failure'});expect(s.deletion(purge.id)).toMatchObject({state:'failed',error:'Injected failure'});expect(s.lifecycle(p.id,r).state).toBe('deleting');s.close();const reopened=open(path);expect(reopened.deletion(purge.id)!.completedEntryIds).toHaveLength(1);
 reopened.patchDeletion(purge.id,{completedEntryIds:purge.inventory.entries.map(x=>x.id),error:null});reopened.finishDeletion(purge.id);reopened.finishDeletion(purge.id);expect(reopened.lifecycle(p.id,r).state).toBe('deleted');expect(reopened.project(p.id).events.filter(e=>e.kind==='artifact.deleted')).toHaveLength(1);
});

test('delete song preserves independent clip; explicit unplaced retarget permits continuation without hidden placement',()=>{
 const {s,p,music,video}=fixture(),next=song(s,p.id),r=ref('song',music.id),d=deletion(s,p.id,r);s.acceptDeletion(p.id,r,d.input);expect(s.asset(video.assetId)).not.toBeNull();expect(s.clip(video.id)).toEqual(video);expect(s.arrangement(p.id,music.id).placements).toEqual([]);
 const c=s.project(p.id).editContexts.find(x=>x.clipId===video.id)!;expect(c.placementId).toBeNull();reject(()=>s.prepareContinuation(p.id,c.id,c.revision,0));const changed=s.retargetClipContext(p.id,c.id,c.revision,next.id);
 expect(changed).toMatchObject({songId:next.id,placementId:null,sourceOriginFrame:c.sourceOriginFrame,sourceStartFrame:c.sourceStartFrame,sourceEndFrame:c.sourceEndFrame});expect(s.arrangement(p.id,next.id).placements).toEqual([]);expect(s.prepareContinuation(p.id,changed.id,changed.revision,0).draft.songId).toBe(next.id);
 reject(()=>s.submitVideo(p.id,randomUUID(),{songId:music.id,clipPrompt:'No hidden copy',style:'',startFrame:0,endFrame:24}));reject(()=>s.selectSong(p.id,music.id,s.project(p.id).project.revision));
});

for(const state of ['queued','preparing','waiting_gpu','running','validating','reconciling','cancel_requested'] as const)test(`dependent ${state} blocks song and continuation-source deletion`,()=>{
 const {s,p,music,video}=fixture(),c=s.project(p.id).editContexts[0]!,a=s.submitVideo(p.id,randomUUID(),{songId:music.id,clipPrompt:'Dependent',style:'',startFrame:24,endFrame:48,continuation:{contextId:c.id,contextRevision:c.revision}});
 if(state==='cancel_requested')s.requestCancel(a.id);else if(state!=='queued')s.patchVideoAttempt(a.id,{state});for(const r of [ref('song',music.id),ref('clip',video.id)]){const d=deletion(s,p.id,r);expect(d.context.blockers).toEqual(expect.arrayContaining([expect.objectContaining({kind:'attempt',id:a.id,state})]));reject(()=>s.acceptDeletion(p.id,r,d.input));}
});

test('pending analysis/reservations block deletion; ownership is not cleared on restart',()=>{
 const {s,p,path}=fixture(),music=song(s,p.id,true),r=ref('song',music.id),d=deletion(s,p.id,r);expect(d.context.blockers).toEqual(expect.arrayContaining([expect.objectContaining({kind:'analysis',id:music.id})]));reject(()=>s.acceptDeletion(p.id,r,d.input));
 s.setAnalysis(music.id,{...music.analysis,state:'available'});const use=s.reserveArtifactUse(p.id,r,'native-owned','Known live owner');s.close();const reopened=open(path);reopened.markInterrupted();expect(reopened.artifactUses(p.id)).toEqual([use]);const current=deletion(reopened,p.id,r);reject(()=>reopened.acceptDeletion(p.id,r,current.input));reopened.releaseArtifactUse(use.id);const fresh=deletion(reopened,p.id,r);reopened.acceptDeletion(p.id,r,fresh.input);reject(()=>reopened.reserveArtifactUse(p.id,r,'late','Must not copy'));
});

test('render blocks deletion; old render aliases remain history but can never return purged bytes',()=>{
 const {s,p,music,video}=fixture(),key=randomUUID(),r=s.enqueueRender(p.id,music.id,1,key),artifact=ref('clip',video.id),d=deletion(s,p.id,artifact);expect(d.context.blockers).toEqual(expect.arrayContaining([expect.objectContaining({kind:'render',id:r.id,state:'queued'})]));reject(()=>s.acceptDeletion(p.id,artifact,d.input));
 const asset={assetId:randomUUID(),path:`/managed/${p.id}/output.mp4`,sha256:'f'.repeat(64),frameCount:240,planHash:'e'.repeat(64),receiptPath:`/managed/${p.id}/receipt.json`};s.finishRender(r.id,asset,{});const done=s.render(r.id)!,fresh=deletion(s,p.id,artifact);expect(fresh.context.assetIds).toContain(asset.assetId);s.acceptDeletion(p.id,artifact,fresh.input);
 expect(s.asset(asset.assetId)).toBeNull();expect(s.render(r.id)).toEqual(done);expect(s.enqueueRender(p.id,music.id,1,key)).toEqual(done);expect(s.enqueueRender(p.id,music.id,2,randomUUID()).snapshot.clips).toEqual([]);
});

test('recovery cannot use deleted source; old idempotency keys stay historical and archived new-use rejects',()=>{
 const {s,p,music,video}=fixture(),input={songId:music.id,clipPrompt:'Stopped',style:'',startFrame:24,endFrame:48},key=randomUUID(),a=s.submitVideo(p.id,key,input);s.patchVideoAttempt(a.id,{state:'failed',error:'Stopped'});
 s.archiveArtifact(p.id,ref('clip',video.id),0);reject(()=>s.addPlacement(p.id,music.id,2,{clipId:video.id,startFrame:24}));s.restoreArtifact(p.id,ref('clip',video.id),1);const d=deletion(s,p.id,ref('song',music.id));s.acceptDeletion(p.id,ref('song',music.id),d.input);expect(s.submitVideo(p.id,key,input).id).toBe(a.id);reject(()=>s.recoverAttempt(a.id,'retry',randomUUID()));
});

test('schema7 to8 adds tables without rewriting existing creative rows or optional metadata',()=>{
 const {s,p,path}=fixture();s.close();const db=new Database(path);for(const table of ['studio_artifact_lifecycle','studio_deletions','studio_artifact_uses'])db.exec(`DROP TABLE IF EXISTS ${table}`);db.exec('UPDATE studio_meta SET version=7');const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name!='studio_meta' ORDER BY name").all() as {name:string}[]).map(x=>x.name),before=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));db.close();const reopened=open(path),check=new Database(path,{readonly:true});expect(check.prepare('SELECT version FROM studio_meta').get()).toEqual({version:8});for(const t of tables)expect(check.prepare(`SELECT * FROM ${t}`).all(),t).toEqual(before[t]);check.close();expect(reopened.project(p.id).deletions).toEqual([]);expect(reopened.project(p.id).artifactLifecycles).toHaveLength(2);expect(reopened.project(p.id).artifactLifecycles!.every(x=>x.state==='active'&&x.revision===0)).toBe(true);
});

test('late completed work stales inventory; uppercase asset IDs cannot bypass tombstones; deleted analysis cannot restart',()=>{
 const {s,p,music,video}=fixture(),r=ref('song',music.id),old=deletion(s,p.id,r);clip(s,p.id,music.id,48);reject(()=>s.acceptDeletion(p.id,r,old.input));const fresh=deletion(s,p.id,r),purged=s.acceptDeletion(p.id,r,fresh.input);expect(s.asset(music.assetId.toUpperCase())).toBeNull();reject(()=>s.setAnalysis(music.id,{...music.analysis,state:'pending'}));expect(s.deletionForKey(p.id,fresh.input.idempotencyKey)).toEqual(purged);expect(s.asset(video.assetId)).not.toBeNull();
});

test('confirmation completeness/progress validation fail atomically, without losing media or thumbnail',()=>{
 const {s,p,music,video}=fixture(),r=ref('clip',video.id),d=deletion(s,p.id,r),before=s.project(p.id);
 reject(()=>s.acceptDeletion(p.id,r,{...d.input,inventory:{...d.input.inventory,entries:d.input.inventory.entries.slice(1)}}));reject(()=>s.acceptDeletion(p.id,r,{...d.input,inventory:{...d.input.inventory,affectedAssetIds:[...d.input.inventory.affectedAssetIds,music.assetId]}}));reject(()=>s.acceptDeletion(p.id,r,{...d.input,thumbnail:{...d.input.thumbnail!,path:d.input.inventory.entries[0]!.path}}),400);
 expect(s.project(p.id)).toEqual(before);expect(s.rawAsset(d.input.thumbnail!.assetId)).toBeNull();const purge=s.acceptDeletion(p.id,r,d.input);reject(()=>s.patchDeletion(purge.id,{completedEntryIds:['unknown']}),400);expect(s.deletion(purge.id)).toEqual(purge);
});

test('accepted confirmation identity survives restart for lost-ack replay without relying on disclosure file',()=>{
 const {s,p,video,path}=fixture(),r=ref('clip',video.id),d=deletion(s,p.id,r),confirmation={planId:randomUUID(),digest:'f'.repeat(64)},input={...d.input,confirmation},accepted=s.acceptDeletion(p.id,r,input);expect(accepted.confirmation).toEqual(confirmation);expect(accepted.retainedThumbnail).toEqual(input.thumbnail);s.close();const reopened=open(path);expect(reopened.deletionForKey(p.id,input.idempotencyKey)).toEqual(accepted);expect(reopened.acceptDeletion(p.id,r,input)).toEqual(accepted);reject(()=>reopened.acceptDeletion(p.id,r,{...input,confirmation:{...confirmation,digest:'a'.repeat(64)}}));
});
