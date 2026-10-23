/** Immutable files consumed by the supported native helpers. Model weights stay
 * in their pinned shared installation and are rehashed by the native helper. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile,mkdir,realpath,stat,constants} from 'node:fs/promises';
import {isAbsolute,join,resolve,relative} from 'node:path';
export interface ReplayFile {path:string;sha256:string;bytes:number}
export interface ExecutionSource {root:string;files:ReplayFile[]}
export async function fileHash(path:string):Promise<string>{const h=createHash('sha256');for await(const b of createReadStream(path,{signal:AbortSignal.timeout(300000)}))h.update(b);return h.digest('hex');}
async function regular(path:string){assert.ok(isAbsolute(path)&&resolve(path)===path,'Absolute normalized snapshot path required');assert.equal(await realpath(path),path,'Linked snapshot is unavailable');const s=await stat(path);assert.ok(s.isFile(),'Snapshot must be a regular file');return s;}
export async function captureReplayFile(source:string,path:string,expectedHash?:string):Promise<ReplayFile>{
 await regular(source);await mkdir(join(path,'..'),{recursive:true,mode:0o700});await copyFile(source,path,constants.COPYFILE_EXCL);
 const captured={path,sha256:await fileHash(path),bytes:(await regular(path)).size};assert.match(captured.sha256,/^[a-f0-9]{64}$/);
 if(expectedHash!==undefined)assert.equal(captured.sha256,expectedHash,'Captured input hash changed');return captured;
}
export async function verifyReplayFile(file:ReplayFile):Promise<string>{assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.equal((await regular(file.path)).size,file.bytes,'Captured input size changed');assert.equal(await fileHash(file.path),file.sha256,'Captured input hash changed');return file.path;}
export async function captureExecutionSource(source:string,root:string,tool:'yue2'|'h3'):Promise<ExecutionSource>{
 assert.ok(isAbsolute(source)&&isAbsolute(root));await mkdir(root,{mode:0o700});
 const names=tool==='yue2'?['integrations/yue2/generate.py','integrations/yue2/models.json']:['integrations/h3/generate.py','integrations/h3/workflow.py','integrations/h3/media.py','integrations/h3/models.json','integrations/comfyui/recipe.json','integrations/comfyui/requirements.lock'];
 const files:ReplayFile[]=[];for(const name of names)files.push(await captureReplayFile(join(source,name),join(root,name)));return{root,files};
}
export async function verifyExecutionSource(manifest:ExecutionSource):Promise<string>{
 assert.ok(isAbsolute(manifest.root)&&resolve(manifest.root)===manifest.root&&Array.isArray(manifest.files)&&manifest.files.length>=2,'Missing execution source snapshot');
 const paths=new Set<string>();for(const f of manifest.files){const r=relative(manifest.root,f.path);assert.ok(r&&!r.startsWith('../')&&r!=='..'&&!isAbsolute(r),'Snapshot escaped its source root');assert.ok(!paths.has(f.path),'Duplicate execution source');paths.add(f.path);await verifyReplayFile(f);}return manifest.root;
}
