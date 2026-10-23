/** Real store/HTTP with fake dispatch: no provider/native generation. */
import { afterEach,expect,test,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import { registerStudioApi } from '../../apps/server/src/studio/api.ts';
import type { StudioRuntime } from '../../apps/server/src/studio/runtime-contract.ts';
const clean:(()=>unknown|Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'studio-recovery-api-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}));
 const store=openStudioStore(join(dir,'studio.sqlite')),queue=openGpuQueue(join(dir,'queue.sqlite'));clean.push(()=>{store.close();queue.close();});
 const project=store.createProject('Recovery'),attempt=store.submitMusic(project.id,randomUUID(),{musicPrompt:'Original prompt',lyrics:'Original lyrics'});
 store.patchAttempt(attempt.id,{state:'failed',error:'Controlled fixture failure'});
 const recoverAttempt=vi.fn(async(id:string,mode:'retry'|'restart',key:string)=>store.recoverAttempt(id,mode,key));
 const runtime={recoverAttempt} as unknown as StudioRuntime;
 const app=createNativeApi({queue,allowedHosts:['studio.local:9122'],validateSubmission(){},hasAttempt:()=>false});clean.push(()=>app.close());
 await registerStudioApi(app,{store,runtime,dataRoot:dir,webRoot:null});
 const request=(action:string,body:unknown,pid=project.id)=>app.inject({method:'POST',url:`/api/projects/${pid}/attempts/${attempt.id}/${action}`,headers:{host:'studio.local:9122','content-type':'application/json'},payload:JSON.stringify(body)});
 return {store,project,attempt,recoverAttempt,request};
}
test('retry dispatch is project-bound, idempotent and retains original seeds',async()=>{
 const f=await fixture(),body={idempotencyKey:randomUUID()},response=await f.request('retry',body);
 expect(response.statusCode).toBe(202);expect(response.json().seeds).toEqual(f.attempt.seeds);
 expect(response.json().recovery).toEqual({parentAttemptId:f.attempt.id,action:'retry'});
 expect((await f.request('retry',body)).json().id).toBe(response.json().id);expect(f.store.attempts()).toHaveLength(2);
 const other=f.store.createProject('Other');expect((await f.request('retry',{idempotencyKey:randomUUID()},other.id)).statusCode).toBe(404);
 expect(f.recoverAttempt).toHaveBeenCalledTimes(2);
});
test('restore starts no work, checks revision and preserves failure history',async()=>{
 const f=await fixture(),before=f.store.attempts().length;
 expect((await f.request('restore-parameters',{projectRevision:99})).statusCode).toBe(409);
 expect(f.store.attempt(f.attempt.id)?.placeholderDiscardedAt).toBeUndefined();
 const response=await f.request('restore-parameters',{projectRevision:f.project.revision});expect(response.statusCode).toBe(200);
 expect(response.json().project.draft).toMatchObject(f.attempt.input);expect(response.json().attempt.placeholderDiscardedAt).toBeTruthy();
 expect(f.store.attempts()).toHaveLength(before);expect(f.store.attempt(f.attempt.id)?.error).toBe('Controlled fixture failure');expect(f.recoverAttempt).not.toHaveBeenCalled();
});
test('discard hides only the stopped placeholder and restart cannot replace a failed retry',async()=>{
 const f=await fixture();expect((await f.request('restart',{idempotencyKey:randomUUID()})).statusCode).toBe(409);
 expect((await f.request('discard',{})).statusCode).toBe(200);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');
 expect(f.store.attempt(f.attempt.id)?.placeholderDiscardedAt).toBeTruthy();expect(f.store.project(f.project.id).events.some(e=>e.kind==='attempt.discarded')).toBe(true);
});
test('strict schemas refuse extra commands, seeds and malformed revisions before dispatch',async()=>{
 const f=await fixture();
 for(const body of [{},{idempotencyKey:'bad'},{idempotencyKey:randomUUID(),seed:'1'}])expect((await f.request('retry',body)).statusCode).toBe(400);
 for(const body of [{},{projectRevision:'0'},{projectRevision:0,command:'not accepted'},{projectRevision:0,clipDraftRevision:-1}])expect((await f.request('restore-parameters',body)).statusCode).toBe(400);
 expect((await f.request('discard',{force:true})).statusCode).toBe(400);expect(f.recoverAttempt).not.toHaveBeenCalled();
});
