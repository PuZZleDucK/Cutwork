/** HTTP disclosure contract only; fake Debug launch, no provider or tool changes. */
import {afterEach,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeApi} from '../../apps/server/src/http/native-api.ts';
import {openGpuQueue} from '../../apps/server/src/jobs/gpu-queue.ts';
import {openStudioStore} from '../../apps/server/src/studio/store.ts';
import {registerStudioApi} from '../../apps/server/src/studio/api.ts';
import type {StudioRuntime} from '../../apps/server/src/studio/runtime-contract.ts';
import type {DebugManager} from '../../apps/server/src/studio/debug.ts';
const cleanup:(()=>unknown|Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function fixture(){
 const root=mkdtempSync(join(tmpdir(),'debug-api-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}));
 const store=openStudioStore(join(root,'studio.sqlite')),queue=openGpuQueue(join(root,'queue.sqlite'));cleanup.push(()=>{store.close();queue.close();});
 const id=randomUUID(),record={id,tool:'analysis',state:'disclosed',plan:{digest:'a'.repeat(64)}};
 const debug={prepare:vi.fn(async()=>record),confirm:vi.fn(async()=>({...record,state:'confirmed'})),cancel:vi.fn(()=>({...record,state:'cancelled'})),get:vi.fn((key:string)=>key===id?record:null),list:vi.fn(()=>[record])};
 const app=createNativeApi({queue,allowedHosts:['studio.local:9122'],hasAttempt:()=>false,validateSubmission(){}});cleanup.push(()=>app.close());
 await registerStudioApi(app,{store,runtime:{} as StudioRuntime,dataRoot:root,webRoot:null,debug:debug as unknown as DebugManager});
 const post=(url:string,payload:unknown)=>app.inject({method:'POST',url,headers:{host:'studio.local:9122','content-type':'application/json'},payload:JSON.stringify(payload)});
 return {app,id,debug,post};
}
test('preparation discloses without launch; confirm forwards exact digest and cancel stays separate',async()=>{
 const f=await fixture();expect((await f.post('/api/setup/analysis/debug',{})).statusCode).toBe(201);expect(f.debug.confirm).not.toHaveBeenCalled();
 const result=await f.post(`/api/debug/${f.id}/confirm`,{digest:'a'.repeat(64)});expect(result.statusCode).toBe(202);expect(f.debug.confirm).toHaveBeenCalledExactlyOnceWith(f.id,'a'.repeat(64));
 expect((await f.post(`/api/debug/${f.id}/cancel`,{})).statusCode).toBe(200);expect(f.debug.cancel).toHaveBeenCalledExactlyOnceWith(f.id);
});
test('readable records survive browser reopening and missing records return 404',async()=>{
 const f=await fixture();const get=(url:string)=>f.app.inject({method:'GET',url,headers:{host:'studio.local:9122'}});
 expect((await get('/api/debug')).json()).toHaveLength(1);expect((await get(`/api/debug/${f.id}`)).json().state).toBe('disclosed');expect((await get(`/api/debug/${randomUUID()}`)).statusCode).toBe(404);
});
test('client cannot replace prompt, command, provider or confirmation payload',async()=>{
 const f=await fixture();for(const body of [{command:'anything'},{prompt:'anything'},{provider:'claude'}])expect((await f.post('/api/setup/analysis/debug',body)).statusCode).toBe(400);
 for(const body of [{},{digest:'bad'},{digest:'a'.repeat(64),command:'anything'}])expect((await f.post(`/api/debug/${f.id}/confirm`,body)).statusCode).toBe(400);
 expect((await f.post('/api/setup/all/debug',{})).statusCode).toBe(400);expect((await f.post(`/api/debug/${f.id}/cancel`,{force:true})).statusCode).toBe(400);
 expect(f.debug.prepare).not.toHaveBeenCalled();expect(f.debug.confirm).not.toHaveBeenCalled();expect(f.debug.cancel).not.toHaveBeenCalled();
});
