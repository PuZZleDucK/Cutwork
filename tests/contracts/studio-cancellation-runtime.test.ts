/** Studio cancellation integration with SQLite and explicit fake task boundaries. No native processes. */
import {afterEach,expect,test,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {openStudioStore} from '../../apps/server/src/studio/store.ts';
import {openGpuQueue} from '../../apps/server/src/jobs/gpu-queue.ts';
import {createStudioRuntime} from '../../apps/server/src/studio/runtime.ts';
import {providerModels} from '../../apps/server/src/providers/launch.ts';
import type {Provider} from '../../packages/core/src/contracts/studio.ts';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve};}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'studio-cancel-runtime-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));const store=openStudioStore(join(root,'studio.sqlite')),queue=openGpuQueue(join(root,'gpu.sqlite'));cleanup.push(async()=>{store.close();queue.close();});const prepare=vi.fn(async()=>({planPath:'/fixture/captured.json'})),run=vi.fn(async()=>{});let maintenance=false;let signedIn=true;
const runtime=createStudioRuntime({store,queue,runtime:root,source:root,origin:'http://127.0.0.1:9122',pollMs:5,hasExternalMaintenance:()=>maintenance,setupAdapter:{checkProvider:async(p:Provider)=>({provider:p,model:providerModels[p],installed:true,auth:signedIn?'signed-in' as const:'sign-in-required' as const,detail:'FAKE',signInCommand:'FAKE'}),probe:async()=>({installed:true,ready:true,detail:'FAKE'}),install:async()=>({installed:true,ready:true,detail:'FAKE'})},prepareMusic:prepare,runMusic:run});cleanup.push(()=>runtime.close());return{root,store,queue,runtime,prepare,run,setMaintenance:(v:boolean)=>{maintenance=v;},setSignedIn:(v:boolean)=>{signedIn=v;}};}
test('queued cancellation freezes future native calls and never invokes provider',async()=>{const f=await fixture(),p=f.store.createProject('Queued');const a=await f.runtime.submitMusic(p.id,randomUUID(),{musicPrompt:'one',lyrics:''});const result=await f.runtime.cancelAttempt(a.id);expect(result.state).toBe('cancelled');expect(()=>f.queue.submit({id:a.nativeCallId,attemptId:a.id,projectId:p.id,tool:'yue2',request:{}})).toThrow(/stopped/i);await f.runtime.start();await new Promise(r=>setTimeout(r,25));expect(f.run).not.toHaveBeenCalled();expect(f.store.attempt(a.id)?.state).toBe('cancelled');});
test('cancel during immutable capture returns promptly and late capture cannot resurrect work',async()=>{const f=await fixture(),p=f.store.createProject('Capture'),gate=deferred();cleanup.push(async()=>gate.resolve());f.prepare.mockImplementationOnce(async()=>{await gate.promise;return{planPath:'/fixture/captured.json'};});const pending=f.runtime.submitMusic(p.id,randomUUID(),{musicPrompt:'one',lyrics:''});const a=f.store.attempts()[0]!;const result=await f.runtime.cancelAttempt(a.id);expect(result.state).toBe('cancel_requested');expect(f.run).not.toHaveBeenCalled();gate.resolve();await pending;await vi.waitFor(()=>expect(f.store.attempt(a.id)?.state).toBe('cancelled'));});
test('cancel unknown attempt rejects without freezing unrelated queue state',async()=>{const f=await fixture();await expect(f.runtime.cancelAttempt(randomUUID())).rejects.toThrow(/not found/i);expect(f.queue.list()).toEqual([]);});
test('external maintenance blocks new captures and creative dispatch without changing queued work',async()=>{const f=await fixture(),p=f.store.createProject('Maintenance');f.setMaintenance(true);await expect(f.runtime.submitMusic(p.id,randomUUID(),{musicPrompt:'one',lyrics:''})).rejects.toThrow(/maintenance|debug/i);expect(f.prepare).not.toHaveBeenCalled();expect(f.store.attempts()).toHaveLength(0);});
test('active-work view includes uncompleted capture and clears only after its settlement',async()=>{const f=await fixture(),p=f.store.createProject('Active'),gate=deferred();cleanup.push(async()=>gate.resolve());f.prepare.mockImplementationOnce(async()=>{await gate.promise;return{planPath:'/fixture/captured.json'};});const pending=f.runtime.submitMusic(p.id,randomUUID(),{musicPrompt:'one',lyrics:''});expect(f.runtime.hasActiveWork()).toBe(true);await f.runtime.cancelAttempt(f.store.attempts()[0]!.id);expect(f.runtime.hasActiveWork()).toBe(true);gate.resolve();await pending;await vi.waitFor(()=>expect(f.runtime.hasActiveWork()).toBe(false));});
test('retained external Debug maintenance prevents startup provider and tool probes',async()=>{const f=await fixture();f.setMaintenance(true);await f.runtime.start();expect(f.runtime.overview().provider.auth).toBe('unknown');expect(f.store.tool('yue2').state).toBe('missing');expect(f.queue.heldLease()).toBeNull();});
test('independent Debug provider result publishes without launching a second check',async()=>{const f=await fixture();f.setMaintenance(true);f.store.patchTool('agent',{state:'checking',active:true,detail:'Confirmed Debug'});const s={provider:'codex' as const,model:providerModels.codex,installed:true,auth:'signed-in' as const,detail:'Independent repair verified',signInCommand:'codex login'};f.runtime.applyProviderStatus(s);expect(f.runtime.overview().provider).toEqual(s);expect(f.store.tool('agent')).toMatchObject({state:'checking',active:true,detail:'Confirmed Debug'});});

test('exact resolved native replay does not require a new provider sign-in or interpretation',async()=>{const f=await fixture(),p=f.store.createProject('Resolved retry');const a=await f.runtime.submitMusic(p.id,randomUUID(),{musicPrompt:'original',lyrics:''});f.store.patchAttempt(a.id,{details:{...a.details,nativeReplayRequest:{schemaVersion:1,attemptId:a.nativeCallId}}});f.setSignedIn(false);await f.runtime.start();await vi.waitFor(()=>expect(f.run).toHaveBeenCalledTimes(1));});

test('resolved native replay is still active studio work but never provider activity or provider queue',async()=>{
 const f=await fixture(),p=f.store.createProject('Native-only replay');
 const queued=f.store.submitMusic(p.id,randomUUID(),{musicPrompt:'resolved queued replay',lyrics:''});
 const running=f.store.submitMusic(p.id,randomUUID(),{musicPrompt:'resolved running replay',lyrics:''});
 for(const a of [queued,running])f.store.patchAttempt(a.id,{details:{nativeReplayRequest:{schemaVersion:1,attemptId:a.nativeCallId}}});
 f.store.patchAttempt(running.id,{state:'running'});
 expect(f.runtime.overview().tools.find(t=>t.id==='agent')).toMatchObject({active:false,queued:0});
 expect(f.runtime.hasActiveWork()).toBe(true); // Still holds resources; only provider reporting changes.
 expect(f.run).not.toHaveBeenCalled();
});
test('normal queued and active provider requests remain counted alongside native-only replay',async()=>{
 const f=await fixture(),p=f.store.createProject('Mixed provider work'),other=f.store.createProject('Other project');
 const replay=f.store.submitMusic(p.id,randomUUID(),{musicPrompt:'native replay',lyrics:''});
 f.store.patchAttempt(replay.id,{state:'running',details:{nativeReplayRequest:{schemaVersion:1,attemptId:replay.nativeCallId}}});
 const queued=f.store.submitMusic(other.id,randomUUID(),{musicPrompt:'normal queued',lyrics:''});
 const running=f.store.submitMusic(other.id,randomUUID(),{musicPrompt:'normal active',lyrics:''});
 f.store.patchAttempt(queued.id,{details:{nativeReplayRequest:null}});
 f.store.patchAttempt(running.id,{state:'preparing'});
 const status=()=>f.runtime.overview().tools.find(t=>t.id==='agent');
 expect(status()).toMatchObject({active:true,queued:1});
 f.store.patchAttempt(running.id,{state:'failed',error:'Synthetic fixture stopped before native work'});
 expect(status()).toMatchObject({active:false,queued:1});
 f.store.patchAttempt(queued.id,{state:'failed',error:'Synthetic fixture stopped before native work'});
 expect(status()).toMatchObject({active:false,queued:0});
});
test.each(['installing','checking'] as const)('explicit shared agent %s activity survives replay exclusion',async state=>{
 const f=await fixture(),p=f.store.createProject('Explicit setup/Debug activity'),replay=f.store.submitMusic(p.id,randomUUID(),{musicPrompt:'native-only replay',lyrics:''});
 f.store.patchAttempt(replay.id,{state:'running',details:{nativeReplayRequest:{schemaVersion:1,attemptId:replay.nativeCallId}}});
 f.store.patchTool('agent',{state,active:true,detail:state==='installing'?'Explicit setup activity':'Confirmed Debug activity'});
 expect(f.runtime.overview().tools.find(t=>t.id==='agent')).toMatchObject({state,active:true,queued:0});
});
