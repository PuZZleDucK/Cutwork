/** Real disposable SQLite/files; injected provider/readiness. No actual agents/models/services. */
import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, access, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { runProvider as realRunProvider } from '../../apps/server/src/providers/run.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { createDebugManager } from '../../apps/server/src/studio/debug.ts';
import type { DebugContext } from '../../packages/core/src/contracts/debug.ts';
import type { ProviderLaunch } from '../../apps/server/src/providers/run.ts';
const cleanups: (()=>void|Promise<void>)[]=[];
afterEach(async()=>{for(const f of cleanups.splice(0).reverse())await f();});
const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'studio-debug-')),source=join(root,'source'),runtime=join(root,'runtime');await mkdir(join(source,'integrations'),{recursive:true});await mkdir(runtime);
 const manifest={node:{version:'24.22.0'},providers:{codex:{version:'0.163.0',model:'gpt-6.1-sol'},claude:{version:'2.1.306',model:'claude-opus-5-5'}}};await writeFile(join(source,'integrations/tool-manifest.json'),JSON.stringify(manifest));
 const queue=openGpuQueue(join(root,'gpu.sqlite'));cleanups.push(()=>queue.close());
 let now=Date.parse('2026-10-23T10:00:00Z'),busy=false;const context:DebugContext={provider:'codex',tool:{id:'analysis',state:'error',installed:true,detail:'Import contract failed',log:'API_KEY=secret-example\nAuthorization: Bearer abc.def\nhttps://name:password@example.test/error\nMissing sample config',jobId:null},setupJob:null};
 const checkProvider=vi.fn(async(provider:'codex'|'claude')=>({provider,model:manifest.providers[provider].model,installed:true,auth:'signed-in' as const,detail:'FAKE signed in',signInCommand:'FAKE sign-in'}));
 const probe=vi.fn(async()=>({installed:true,ready:true,detail:'FAKE independent CPU check passed'}));
 const run=vi.fn(async(launch:ProviderLaunch)=>{await mkdir(launch.runDirectory,{recursive:true});await writeFile(join(launch.runDirectory,'provider.stdout.log'),'Fixed the disposable tool.');await writeFile(join(launch.runDirectory,'provider-receipt.json'),JSON.stringify({succeeded:true,state:'exited',code:0,signal:null,inputDelivered:true}));return {succeeded:true,code:0,signal:null,inputDelivered:true,stdoutPath:join(launch.runDirectory,'provider.stdout.log'),stderrPath:join(launch.runDirectory,'provider.stderr.log'),receiptPath:join(launch.runDirectory,'provider-receipt.json'),owner:null};});
 const applyReadiness=vi.fn(),onRecord=vi.fn();
 const options={runtime,source,queue,context:()=>structuredClone(context),hasActiveWork:()=>busy,checkProvider,probe,applyReadiness,onRecord,runProvider:run,now:()=>now,ttlMs:600000};
 const manager=await createDebugManager(options);cleanups.push(()=>manager.close());
 return {root,runtime,source,queue,manager,options,context,checkProvider,probe,run,applyReadiness,onRecord,setBusy:(v:boolean)=>busy=v,advance:(n:number)=>now+=n};
}
async function done(f:Awaited<ReturnType<typeof fixture>>,id:string){await vi.waitFor(()=>expect(['succeeded','failed','reconciling']).toContain(f.manager.get(id)!.state));return f.manager.get(id)!;}

test('preparation and cancellation disclose exact sanitized context without a process, probe, directory or lease',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis');expect(r.state).toBe('disclosed');expect(r.plan.launch.cwd).toBe(join(f.runtime,'tools/audio-analysis'));expect(r.plan.launch.argv).toContain('--dangerously-bypass-approvals-and-sandbox');expect(r.plan.launch.argv).toContain(r.plan.launch.cwd);expect(r.plan.warning).toMatch(/outside/i);
 expect(r.plan.launch.stdin).toContain('Missing sample config');for(const secret of ['secret-example','abc.def','name:password'])expect(JSON.stringify(r)).not.toContain(secret);
 expect(f.run).not.toHaveBeenCalled();expect(f.probe).not.toHaveBeenCalled();expect(f.checkProvider).not.toHaveBeenCalled();await expect(access(r.plan.launch.runDirectory)).rejects.toThrow();
 const lease=f.queue.acquireMaintenance('h3')!;expect(lease).toBeTruthy();f.queue.releaseMaintenance(lease);
 expect(f.manager.cancel(r.id).state).toBe('cancelled');await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/cancel/i);expect(f.run).not.toHaveBeenCalled();
});
test.each(['codex','claude'] as const)('confirmation launches the exact immutable %s command once and verifies independently',async provider=>{
 const f=await fixture();f.context.provider=provider;const r=await f.manager.prepare('analysis'),hold=gate();f.run.mockImplementationOnce(async launch=>{await hold.promise;await mkdir(launch.runDirectory,{recursive:true});await writeFile(join(launch.runDirectory,'provider.stdout.log'),'fixed');await writeFile(join(launch.runDirectory,'provider-receipt.json'),JSON.stringify({state:'exited',code:0,signal:null,succeeded:true,inputDelivered:true}));return {succeeded:true,code:0,signal:null,inputDelivered:true,stdoutPath:join(launch.runDirectory,'provider.stdout.log'),stderrPath:'unused',receiptPath:join(launch.runDirectory,'provider-receipt.json'),owner:null};});
 const accepted=await f.manager.confirm(r.id,r.plan.digest);expect(['confirmed','running']).toContain(accepted.state);expect(f.manager.isBlocking()).toBe(true);expect(f.queue.acquireMaintenance('yue2')).toBeNull();expect(f.queue.acquireMaintenance('h3')).toBeNull();
 await f.manager.confirm(r.id,r.plan.digest);await vi.waitFor(()=>expect(f.run).toHaveBeenCalledTimes(1));expect(f.run.mock.calls[0]![0]).toEqual(r.plan.launch);f.context.provider=provider==='codex'?'claude':'codex';hold.resolve();const final=await done(f,r.id);expect(final.state).toBe('succeeded');expect(f.probe).toHaveBeenCalledWith('analysis',provider);expect(f.applyReadiness).toHaveBeenCalledOnce();expect(f.manager.isBlocking()).toBe(false);
});
test('wrong digest, expiry, provider change, changed failure and source pins each reject before launch',async()=>{
 const f=await fixture();let r=await f.manager.prepare('analysis');await expect(f.manager.confirm(r.id,'0'.repeat(64))).rejects.toThrow(/digest/i);
 f.advance(600001);await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/expir/i);
 r=await f.manager.prepare('analysis');f.context.provider='claude';await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/changed|stale/i);
 r=await f.manager.prepare('analysis');f.context.tool.log+='\nDifferent error';await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/changed|stale/i);
 r=await f.manager.prepare('analysis');await writeFile(join(f.source,'integrations/tool-manifest.json'),'{"changed":true}');await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow();expect(f.run).not.toHaveBeenCalled();
});
test('busy or unavailable maintenance confirmation launches nothing and releases only newly acquired locks',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis');f.setBusy(true);await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/busy|active/i);expect(f.manager.get(r.id)?.state).toBe('disclosed');f.setBusy(false);
 const other=f.queue.acquireMaintenance('h3')!;await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/maintenance|busy/i);expect(f.queue.acquireMaintenance('h3')).toBeNull();const free=f.queue.acquireMaintenance('yue2');expect(free).not.toBeNull();f.queue.releaseMaintenance(free!);f.queue.releaseMaintenance(other);expect(f.run).not.toHaveBeenCalled();
});
test('agent prose cannot declare readiness and provider failure is separate from a passed probe',async()=>{
 const f=await fixture();f.probe.mockResolvedValueOnce({installed:true,ready:false,detail:'FAKE remaining broken import'});const r=await f.manager.prepare('analysis');await f.manager.confirm(r.id,r.plan.digest);const result=await done(f,r.id);expect(result.state).toBe('failed');expect(result.outcome?.provider?.succeeded).toBe(true);expect(result.outcome?.readiness?.ready).toBe(false);
 const next=await f.manager.prepare('analysis');f.run.mockImplementationOnce(async launch=>{await mkdir(launch.runDirectory,{recursive:true});const receiptPath=join(launch.runDirectory,'provider-receipt.json');await writeFile(receiptPath,JSON.stringify({state:'failed',code:1,signal:null,succeeded:false,inputDelivered:true}));return {succeeded:false,code:1,signal:null,inputDelivered:true,stdoutPath:'missing',stderrPath:'missing',receiptPath,owner:null};});await f.manager.confirm(next.id,next.plan.digest);expect((await done(f,next.id)).state).toBe('failed');expect(f.applyReadiness.mock.calls.at(-1)?.[1].ready).toBe(true);
});
test('auth loss launches no repair agent and surfaces verified sign-in guidance',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis');f.checkProvider.mockResolvedValueOnce({...await f.checkProvider('codex'),auth:'sign-in-required' as 'signed-in',detail:'Sign in first',signInCommand:'provider.sh codex login --device-auth'});f.checkProvider.mockClear();await f.manager.confirm(r.id,r.plan.digest);const result=await done(f,r.id);expect(result.error).toContain('provider.sh codex login --device-auth');expect(f.run).not.toHaveBeenCalled();expect(f.manager.isBlocking()).toBe(false);
});
test('unknown provider cleanup retains maintenance and reconciliation rather than reporting fixed',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis');f.run.mockRejectedValueOnce(new Error('Owned provider cleanup unconfirmed'));await f.manager.confirm(r.id,r.plan.digest);expect((await done(f,r.id)).state).toBe('reconciling');expect(f.manager.isBlocking()).toBe(true);expect(f.probe).not.toHaveBeenCalled();expect(f.queue.acquireMaintenance('h3')).toBeNull();
});

test('concurrent confirmation consumes one disclosure and cancellation cannot affect an accepted repair',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis'),hold=gate();
 // Return a concrete captured-provider status after the gate, not a live selection.
 f.checkProvider.mockReset();f.checkProvider.mockImplementation(async p=>{await hold.promise;return {provider:p,model:p==='codex'?'gpt-6.1-sol':'claude-opus-5-5',installed:true,auth:'signed-in',detail:'FAKE',signInCommand:'FAKE'};});
 const accepted=await Promise.all([f.manager.confirm(r.id,r.plan.digest),f.manager.confirm(r.id,r.plan.digest)]);expect(accepted[0]!.id).toBe(accepted[1]!.id);expect(()=>f.manager.cancel(r.id)).toThrow(/unconfirmed/i);hold.resolve();await done(f,r.id);expect(f.run).toHaveBeenCalledTimes(1);
});
test('shutdown before auth completes never launches the agent and closed maintenance observation stays fail-closed',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis'),hold=gate();const status=await f.checkProvider('codex');f.checkProvider.mockImplementationOnce(async()=>{await hold.promise;return status;});await f.manager.confirm(r.id,r.plan.digest);const closing=f.manager.close();hold.resolve();await closing;expect(f.run).not.toHaveBeenCalled();expect(()=>f.manager.isBlocking()).not.toThrow();expect(f.manager.isBlocking()).toBe(true);
});
test('source/CLI identity changing during authentication fails before repair dispatch',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis'),hold=gate(),status=await f.checkProvider('codex');f.checkProvider.mockImplementationOnce(async()=>{await hold.promise;return status;});await f.manager.confirm(r.id,r.plan.digest);await writeFile(join(f.source,'integrations/tool-manifest.json'),JSON.stringify({node:{version:'24.22.0'},providers:{codex:{version:'0.164.0',model:'gpt-6.1-sol'},claude:{version:'2.1.306',model:'claude-opus-5-5'}}}));hold.resolve();expect((await done(f,r.id)).state).toBe('failed');expect(f.run).not.toHaveBeenCalled();
});
test('restart marks a persisted active repair reconciling and never clears its durable maintenance',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis');await f.manager.close();const leases=[f.queue.acquireMaintenance('yue2')!,f.queue.acquireMaintenance('h3')!];
 const db=new Database(join(f.runtime,'debug.sqlite'));const value=JSON.parse((db.prepare('SELECT data FROM debug_records WHERE id=?').get(r.id) as {data:string}).data);value.record.state='running';value.record.confirmedAt=r.createdAt;value.leases=leases;db.prepare('UPDATE debug_records SET data=? WHERE id=?').run(JSON.stringify(value),r.id);db.close();
 const reopened=await createDebugManager(f.options);cleanups.push(()=>reopened.close());expect(reopened.get(r.id)?.state).toBe('reconciling');expect(reopened.isBlocking()).toBe(true);expect(f.queue.acquireMaintenance('h3')).toBeNull();expect(f.run).not.toHaveBeenCalled();expect(f.probe).not.toHaveBeenCalled();
});
test('close reaps an actual owned CPU CLI child without touching other processes',async()=>{
 const f=await fixture();await f.manager.close();const binary=join(f.runtime,'tools/provider-cli/codex-0.163.0_claude-2.1.306/node_modules/.bin/codex'),pidPath=join(f.root,'owned.pid');await mkdir(dirname(binary),{recursive:true});await writeFile(binary,`#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{},1000);\n`);await chmod(binary,0o700);
 const closeChecks=vi.fn(),manager=await createDebugManager({...f.options,runProvider:realRunProvider,closeChecks});cleanups.push(()=>manager.close());const r=await manager.prepare('analysis');await manager.confirm(r.id,r.plan.digest);let pid=0;await vi.waitFor(async()=>{pid=Number(await readFile(pidPath,'utf8'));expect(pid).toBeGreaterThan(0);});await manager.close();expect(closeChecks).toHaveBeenCalledOnce();expect(()=>process.kill(pid,0)).toThrow();
 const db=new Database(join(f.runtime,'debug.sqlite'),{readonly:true});const result=JSON.parse((db.prepare('SELECT data FROM debug_records WHERE id=?').get(r.id) as {data:string}).data);db.close();expect(result.record.state).toBe('failed');expect(result.leases).toEqual([]);expect(f.probe).not.toHaveBeenCalled();
});
test('a pinned CLI symlink target changing invalidates the disclosed configuration',async()=>{
 const f=await fixture(),binary=join(f.runtime,'tools/provider-cli/codex-0.163.0_claude-2.1.306/node_modules/.bin/codex'),target=join(f.root,'cli-target');await mkdir(dirname(binary),{recursive:true});await writeFile(target,'original pinned CLI');await symlink(target,binary);const r=await f.manager.prepare('analysis');await writeFile(target,'a changed pinned CLI behind the same symlink');await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/changed|stale/i);expect(f.run).not.toHaveBeenCalled();
});
test('a finite CLI leader exit with a reconciling receipt never releases maintenance or probes',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis');f.run.mockImplementationOnce(async launch=>{await mkdir(launch.runDirectory,{recursive:true});const receiptPath=join(launch.runDirectory,'provider-receipt.json'),stdoutPath=join(launch.runDirectory,'provider.stdout.log');await writeFile(stdoutPath,'CLI leader ended, descendants uncertain');await writeFile(receiptPath,JSON.stringify({state:'reconciling',code:0,signal:null,succeeded:false,inputDelivered:true,cleanup:{cliStopped:false}}));return {succeeded:false,code:0,signal:null,inputDelivered:true,stdoutPath,stderrPath:'unused',receiptPath,owner:null};});await f.manager.confirm(r.id,r.plan.digest);expect((await done(f,r.id)).state).toBe('reconciling');expect(f.probe).not.toHaveBeenCalled();expect(f.queue.acquireMaintenance('yue2')).toBeNull();expect(f.queue.acquireMaintenance('h3')).toBeNull();
});
test('altered persisted disclosure bytes cannot launch under the original digest',async()=>{
 const f=await fixture(),r=await f.manager.prepare('analysis'),db=new Database(join(f.runtime,'debug.sqlite'));const value=JSON.parse((db.prepare('SELECT data FROM debug_records WHERE id=?').get(r.id) as {data:string}).data);value.record.plan.launch.stdin+='\nUndisclosed instruction';db.prepare('UPDATE debug_records SET data=? WHERE id=?').run(JSON.stringify(value),r.id);db.close();await expect(f.manager.confirm(r.id,r.plan.digest)).rejects.toThrow(/digest|disclos/i);expect(f.run).not.toHaveBeenCalled();
});
