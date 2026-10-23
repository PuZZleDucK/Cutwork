import assert from 'node:assert/strict';
import {readFile,realpath,stat} from 'node:fs/promises';
import {isAbsolute,join,relative,resolve} from 'node:path';
import type {GpuCall,GpuQueue} from '../jobs/gpu-queue-contract.ts';
const record=(v:unknown):Record<string,unknown>=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;};
/** Verify the retained native worker's release, never infer it from provider exit. */
export async function verifyNativeRelease(call:GpuCall,queue:GpuQueue,runtime:string):Promise<void>{
 assert.notEqual(queue.heldLease()?.callId,call.id,'Native GPU lease remains held');
 const owner=record(call.owner),release=record(call.release);assert.equal(owner.kind,'systemd-unit');assert.equal(typeof owner.directory,'string');
 const directory=String(owner.directory),path=join(directory,'release.json'),rel=relative(join(runtime,'jobs/native-units'),path);
 assert.ok(isAbsolute(path)&&resolve(path)===path&&rel&&rel!=='..'&&!rel.startsWith('../')&&!isAbsolute(rel),'Release is outside owned native units');assert.equal(await realpath(path),path);assert.ok((await stat(path)).isFile());assert.ok((await stat(path)).size<=16000000);
 assert.deepEqual(release.owner,owner);assert.equal(release.cgroupEmptyBeforeAndAfterGpu,true);assert.equal(record(release.gpuSettling).state,'released');
 assert.ok(Array.isArray(release.rememberedPids)&&Array.isArray(record(release.gpu).processes));for(const p of record(release.gpu).processes as unknown[])assert.ok(!release.rememberedPids.includes(record(p).pid),'Owned CUDA PID remains');
 assert.deepEqual(JSON.parse(await readFile(path,'utf8')),release);
 if(call.state==='succeeded'){assert.equal(record(call.result).code,0);assert.equal(record(call.result).signal,null);const exit=JSON.parse(await readFile(join(directory,'exit.json'),'utf8'));assert.equal(exit.code,0);assert.equal(exit.signal,null);}
}
