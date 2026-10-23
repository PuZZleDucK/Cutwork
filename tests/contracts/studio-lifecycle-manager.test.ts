/** Durable confirmation/purge orchestration with controlled filesystem hooks. */
import {afterEach,expect,test,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStudioStore} from '../../apps/server/src/studio/store.ts';
import {createLifecycleManager} from '../../apps/server/src/studio/lifecycle-manager.ts';
import type {ManagedMediaInventory} from '../../packages/core/src/contracts/lifecycle.ts';
const cleanup:(()=>unknown|Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'lifecycle-manager-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}));
 const store=openStudioStore(join(root,'studio.sqlite'));cleanup.push(()=>store.close());
 const project=store.createProject('Disposable lifecycle'),attempt=store.submitMusic(project.id,randomUUID(),{musicPrompt:'Fixture',lyrics:''});
 const song=store.finishMusic(attempt.id,{title:'Named song',assetId:randomUUID(),assetPath:join(root,'projects',project.id,'song.wav'),sha256:'a'.repeat(64),sampleCount:'48000',sampleRate:48000,channels:2,durationSeconds:1,truncated:false,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0'],waveformBucketSamples:48000,peaks:[.5],error:null,version:'fixture'}},{});
 const ref={kind:'song' as const,id:song.id};
 const inventory:ManagedMediaInventory={version:1,projectId:project.id,artifact:ref,entries:[{id:createHash('sha256').update(join(root,'projects',project.id,'song.wav')).digest('hex'),path:join(root,'projects',project.id,'song.wav'),role:'fixture',sha256:null,bytes:null,identity:null}],affectedAssetIds:[song.assetId],affectedRenderIds:[],digest:'c'.repeat(64)};
 let clock=Date.now(),external=false;
 const prepare=vi.fn(async()=>({inventory,manifestPath:join(root,'manifest.json')})),verify=vi.fn(async()=>{});
 const purge=vi.fn(async()=>({completedEntryIds:inventory.entries.map(e=>e.id)}));
 const options={runtime:root,store,prepare,verify,purge,now:()=>clock,externalBlockers:()=>external?[{kind:'reservation' as const,id:'native-owned',state:'held',detail:'Native ownership unresolved'}]:[]};
 const manager=createLifecycleManager(options);cleanup.push(()=>manager.close());
 return {root,store,project,song,ref,inventory,prepare,verify,purge,options,manager,advance(){clock+=600001;},hold(){external=true;}};
}
test('preparation/cancel-without-confirm preserves creative state and starts no purge',async()=>{
 const f=fixture(),before=f.store.project(f.project.id),plan=await f.manager.prepareDelete(f.project.id,f.ref);
 expect(plan.title).toBe(f.song.title);expect(plan.limitations.join(' ')).toMatch(/external|downloaded/i);
 expect(f.store.project(f.project.id)).toEqual(before);expect(f.purge).not.toHaveBeenCalled();
});
test('exact confirmation is durable/idempotent even after expiry, refresh and purge completion',async()=>{
 const f=fixture(),plan=await f.manager.prepareDelete(f.project.id,f.ref),body={planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()};
 const accepted=await f.manager.confirmDelete(f.project.id,f.ref,body);await f.manager.idle();
 expect(f.store.deletion(accepted.id)?.state).toBe('succeeded');expect(f.store.lifecycle(f.project.id,f.ref).state).toBe('deleted');
 await f.manager.close();f.advance();const restarted=createLifecycleManager(f.options);cleanup.push(()=>restarted.close());
 expect((await restarted.confirmDelete(f.project.id,f.ref,body)).id).toBe(accepted.id);expect(f.purge).toHaveBeenCalledOnce();
});
test('expired or stale plans reject before destructive acceptance',async()=>{
 const f=fixture(),plan=await f.manager.prepareDelete(f.project.id,f.ref);f.advance();
 await expect(f.manager.confirmDelete(f.project.id,f.ref,{planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'DELETE_PLAN_EXPIRED'});
 const fresh=await f.manager.prepareDelete(f.project.id,f.ref);f.store.archiveArtifact(f.project.id,f.ref,0);
 await expect(f.manager.confirmDelete(f.project.id,f.ref,{planId:fresh.id,digest:fresh.digest,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'DELETE_PLAN_STALE'});expect(f.purge).not.toHaveBeenCalled();
});
test('new native ownership and changed inventory deny acceptance without removing placements',async()=>{
 const f=fixture(),plan=await f.manager.prepareDelete(f.project.id,f.ref),body={planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()};f.hold();
 await expect(f.manager.confirmDelete(f.project.id,f.ref,body)).rejects.toMatchObject({code:'STUDIO_MEDIA_BUSY'});expect(f.store.deletions()).toHaveLength(0);
 const g=fixture(),other=await g.manager.prepareDelete(g.project.id,g.ref);g.verify.mockRejectedValueOnce(new Error('File changed'));
 await expect(g.manager.confirmDelete(g.project.id,g.ref,{planId:other.id,digest:other.digest,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'DELETE_PLAN_CHANGED'});expect(g.store.deletions()).toHaveLength(0);
});
test('purge failure stays deleting, retry uses same durable operation and never restores media',async()=>{
 const f=fixture(),plan=await f.manager.prepareDelete(f.project.id,f.ref);f.purge.mockRejectedValueOnce(new Error('Controlled disk failure'));
 const accepted=await f.manager.confirmDelete(f.project.id,f.ref,{planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()});await f.manager.idle();
 expect(f.store.deletion(accepted.id)?.state).toBe('failed');expect(f.store.lifecycle(f.project.id,f.ref).state).toBe('deleting');expect(f.store.asset(f.song.assetId)).toBeNull();
 await f.manager.retryPurge(f.project.id,accepted.id);await f.manager.idle();expect(f.store.deletion(accepted.id)?.state).toBe('succeeded');expect(f.store.deletions()).toHaveLength(1);
});
test('wrong project/ref/digest cannot confirm a plan or reuse an accepted key',async()=>{
 const f=fixture(),plan=await f.manager.prepareDelete(f.project.id,f.ref),body={planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()};
 await expect(f.manager.confirmDelete(f.project.id,f.ref,{...body,digest:'0'.repeat(64)})).rejects.toMatchObject({code:'DELETE_PLAN_STALE'});
 const other=f.store.createProject('Other');await expect(f.manager.confirmDelete(other.id,f.ref,body)).rejects.toMatchObject({statusCode:404});expect(f.store.deletions()).toHaveLength(0);
});

test('accepted confirmation survives loss of its disclosure file and does not become a false stale rejection',async()=>{
 const f=fixture(),plan=await f.manager.prepareDelete(f.project.id,f.ref),body={planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()};
 const accepted=await f.manager.confirmDelete(f.project.id,f.ref,body);await f.manager.idle();
 unlinkSync(join(f.root,'projects',f.project.id,'lifecycle-plans',`${plan.id}.json`));
 expect((await f.manager.confirmDelete(f.project.id,f.ref,body)).id).toBe(accepted.id);
 expect(f.purge).toHaveBeenCalledOnce();
});

test('startup serializes multiple durable purges in one project instead of failing the second',async()=>{
 const f=fixture(),attempt=f.store.submitMusic(f.project.id,randomUUID(),{musicPrompt:'Another independent song',lyrics:''});
 const second=f.store.finishMusic(attempt.id,{title:'Second',assetId:randomUUID(),assetPath:join(f.root,'projects',f.project.id,'second.wav'),sha256:'d'.repeat(64),sampleCount:'48000',sampleRate:48000,channels:2,durationSeconds:1,truncated:false,analysis:f.song.analysis},{}),ref={kind:'song' as const,id:second.id};
 const inventory={...f.inventory,artifact:ref,affectedAssetIds:[second.assetId],entries:[{...f.inventory.entries[0]!,id:'second-entry',path:join(f.root,'projects',f.project.id,'second.wav')}]};
 const one=f.store.acceptDeletion(f.project.id,f.ref,{contextDigest:f.store.deletionContext(f.project.id,f.ref).digest,idempotencyKey:randomUUID(),inventory:f.inventory});
 const two=f.store.acceptDeletion(f.project.id,ref,{contextDigest:f.store.deletionContext(f.project.id,ref).digest,idempotencyKey:randomUUID(),inventory});
 let active=0,maximum=0;
 const manager=createLifecycleManager({...f.options,purge:async o=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;return {completedEntryIds:o.inventory.entries.map(e=>e.id)};}});cleanup.push(()=>manager.close());
 manager.start();await manager.idle();expect(maximum).toBe(1);expect([one,two].map(r=>f.store.deletion(r.id)?.state)).toEqual(['succeeded','succeeded']);
});
test('missing retained thumbnail rejects confirmation before media is marked deleting',async()=>{
 const f=fixture();f.prepare.mockImplementationOnce(async()=>({inventory:f.inventory,manifestPath:join(f.root,'manifest.json'),thumbnail:{assetId:randomUUID(),path:join(f.root,'projects',f.project.id,'history-thumbnails','missing.png'),sha256:'e'.repeat(64),bytes:100,width:160,height:120}}));
 const plan=await f.manager.prepareDelete(f.project.id,f.ref);
 await expect(f.manager.confirmDelete(f.project.id,f.ref,{planId:plan.id,digest:plan.digest,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'DELETE_PLAN_CHANGED'});
 expect(f.store.deletions()).toEqual([]);expect(f.store.lifecycle(f.project.id,f.ref).state).toBe('active');expect(f.purge).not.toHaveBeenCalled();
});
