/** In-process HTTP and actual SQLite; callback is injected, no process is stopped. */
import { afterEach,expect,test,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNativeApi } from '../../apps/server/src/http/native-api.ts';
import { openGpuQueue } from '../../apps/server/src/jobs/gpu-queue.ts';
const clean:(()=>Promise<unknown>|unknown)[]=[];
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
function fixture(cancelAttempt:(id:string)=>unknown){
 const dir=mkdtempSync(join(tmpdir(),'studio-cancel-route-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}));
 const queue=openGpuQueue(join(dir,'queue.sqlite'));clean.push(()=>queue.close());
 const call={id:'native',attemptId:'parent',projectId:'project',tool:'h3' as const,request:{seed:'123'}};queue.submit(call);
 const app=createNativeApi({queue,allowedHosts:['studio.local:9122'],validateSubmission(){},hasAttempt:id=>id==='parent',cancelAttempt});clean.push(()=>app.close());
 return {queue,app,request:(url='/api/attempts/parent/cancel',payload?:unknown)=>app.inject({method:'POST',url,headers:{host:'studio.local:9122',...(payload!==undefined?{'content-type':'application/json'}:{})},...(payload!==undefined?{payload:JSON.stringify(payload)}:{})})};
}
test('composed cancellation delegates to the studio lifecycle rather than queue-only stop',async()=>{
 const callback=vi.fn(async(id:string)=>({id,state:'cancel_requested'}));const f=fixture(callback);
 const response=await f.request();expect(response.statusCode).toBe(202);expect(response.json()).toEqual({id:'parent',state:'cancel_requested'});
 expect(callback).toHaveBeenCalledExactlyOnceWith('parent');expect(f.queue.get('native')?.state).toBe('queued');
});
test('unknown attempts and unexpected bodies never invoke cancellation',async()=>{
 const callback=vi.fn();const f=fixture(callback);
 expect((await f.request('/api/attempts/missing/cancel')).statusCode).toBe(404);
 expect((await f.request('/api/attempts/parent/cancel',{})).statusCode).toBe(400);
 expect(callback).not.toHaveBeenCalled();expect(f.queue.get('native')?.state).toBe('queued');
});
test('callback failure is private and does not silently fall back to partial cancellation',async()=>{
 const f=fixture(async()=>{throw Error('private failure details /secret/path');});const result=await f.request();
 expect(result.statusCode).toBe(500);expect(result.body).not.toMatch(/private|secret/);expect(f.queue.get('native')?.state).toBe('queued');
});
