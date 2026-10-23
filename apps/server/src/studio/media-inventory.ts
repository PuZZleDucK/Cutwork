/** Immutable deletion inventory for supported managed media. Never follows links
 * or erases whole run/workspace trees. Text provenance remains readable. */
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mkdir,lstat,readFile} from 'node:fs/promises';import {join,extname} from 'node:path';
import type {ArtifactRef,ManagedMediaEntry,ManagedMediaInventory,RetainedThumbnail} from '../../../../packages/core/src/contracts/lifecycle.ts';
import type {StudioStore} from './store-contract.ts';
import type {StudioAttempt} from '../../../../packages/core/src/contracts/studio.ts';
export {verifyRetainedThumbnail} from './media-thumbnail.ts';
import {hashBytes,token,projectRoot,managedPath,inspectFile,verifyEntry,walkFiles,readJson,durableJson} from './media-files.ts';
import {createHistoryThumbnail} from './media-thumbnail.ts';
export interface PreparedArtifactDeletion {inventory:ManagedMediaInventory;manifestPath:string;thumbnail?:RetainedThumbnail}
function canonical(v:unknown):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v!==null&&typeof v==='object')return '{'+Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(v);}
export function inventoryDigest(inventory:Omit<ManagedMediaInventory,'digest'>|ManagedMediaInventory):string{const {digest:_,...body}=inventory as ManagedMediaInventory;return hashBytes(canonical(body));}
export function validateInventory(inventory:ManagedMediaInventory):void{assert.equal(inventory.version,1);token(inventory.projectId);token(inventory.artifact.id);assert.ok(['song','clip'].includes(inventory.artifact.kind));assert.equal(inventory.digest,inventoryDigest(inventory),'Managed inventory digest changed');assert.equal(new Set(inventory.entries.map(e=>e.id)).size,inventory.entries.length,'Duplicate inventory entry');assert.equal(new Set(inventory.entries.map(e=>e.path)).size,inventory.entries.length,'Duplicate inventory path');for(const e of inventory.entries){assert.equal(e.id,hashBytes(e.path),'Inventory entry identity differs');assert.ok(e.identity===null?(e.sha256===null&&e.bytes===null):(/^[a-f0-9]{64}$/.test(e.sha256??'')&&Number.isSafeInteger(e.bytes)&&e.bytes!>=0),'Invalid media inventory entry');}}
/** Confirmation-time revalidation performs no unlink. Missing previously present
 * media is a change here; the resumable purge separately permits absence. */
export async function verifyManagedMediaInventory(o:{runtime:string;inventory:ManagedMediaInventory;signal?:AbortSignal}):Promise<void>{const inventory=structuredClone(o.inventory);validateInventory(inventory);const project=await projectRoot(o.runtime,inventory.projectId);for(const e of inventory.entries){const present=await verifyEntry(project,e,o.signal);assert.ok(present||e.identity===null,'Managed media disappeared since deletion preparation');}}
/** Optional registration for known agent/wrapper-derived copies. No agent tool
 * limitation: unknown unregistered external copies are outside managed recall. */
export async function registerManagedMediaCopy(o:{runtime:string;projectId:string;artifact:ArtifactRef;path:string;role:string;signal?:AbortSignal}):Promise<void>{const project=await projectRoot(o.runtime,o.projectId);token(o.artifact.id);assert.ok(['song','clip'].includes(o.artifact.kind));assert.ok(o.role&&o.role.length<=200);const file=await inspectFile(project,o.path,o.signal);assert.ok(file.identity,'Registered media copy is missing');const dir=join(project,'managed-media');await managedPath(project,dir);await mkdir(dir,{recursive:true,mode:0o700});await durableJson(join(dir,randomUUID()+'.json'),{version:1,projectId:o.projectId,artifact:o.artifact,role:o.role,...file},true);}
const media=/\.(wav|flac|mp3|ogg|opus|m4a|aac|mp4|mov|mkv|webm|avi|png|jpg|jpeg|webp|bmp|gif|npy|npz|safetensors|pt|pth|f32le|s16le|pcm|raw|bin)(?:\.partial|\.tmp)?$/i;
const text=/\.(json|jsonl|txt|log|md|py|ts|js|sh|abc|yaml|yml|toml|lock|csv)$/i;
const beneath=(base:string,path:string)=>path===base||path.startsWith(base+'/');
export async function prepareArtifactDeletion(o:{runtime:string;store:StudioStore;projectId:string;ref:ArtifactRef;signal?:AbortSignal}):Promise<PreparedArtifactDeletion>{
 // Snapshot authoritative metadata before the first await. Runtime binds it to
 // deletionContext revisions and holds the acceptance/input-use barrier.
 const snapshot=structuredClone(o.store.project(o.projectId)),assets=structuredClone(o.store.assets(o.projectId)),ref=structuredClone(o.ref);
 token(ref.id);assert.ok(['song','clip'].includes(ref.kind));const target=ref.kind==='song'?snapshot.songs.find(s=>s.id===ref.id):snapshot.clips.find(c=>c.id===ref.id);assert.ok(target,'Artifact does not belong to this project');
 const project=await projectRoot(o.runtime,o.projectId),entries=new Map<string,ManagedMediaEntry>(),expected=new Map<string,string>(),protectedPaths=new Set<string>(),protectedRoots:string[]=[];
 const targetAssetIds=new Set<string>(ref.kind==='song'?[target.assetId]:[target.assetId,...('audioAssetId' in target&&target.audioAssetId?[target.audioAssetId]:[]),...('rawFrames' in target?target.rawFrames.map(f=>f.assetId):[])]);
 const affectedRenders=snapshot.renders.filter(r=>ref.kind==='song'?r.songId===ref.id:r.snapshot.clips.some(c=>c.id===ref.id));const affectedRenderIds=affectedRenders.map(r=>r.id).sort();for(const r of affectedRenders)if(r.assetId)targetAssetIds.add(r.assetId);
 const byAsset=new Map(assets.map(a=>[a.id,a]));
 for(const a of assets){if(targetAssetIds.has(a.id))expected.set(a.path,a.sha256);else protectedPaths.add(a.path);}
 for(const r of snapshot.renders)if(!affectedRenderIds.includes(r.id))protectedRoots.push(join(project,'renders',token(r.id)));
 const declaredRecords:any[]=[];for(const path of await walkFiles(project,join(project,'managed-media'),o.signal)){if(extname(path)!=='.json')continue;const record=await readJson(project,path);assert.ok(record?.version===1&&record.projectId===o.projectId&&record.artifact&&typeof record.path==='string','Malformed managed media ownership record');await managedPath(project,record.path);if(record.artifact.kind===ref.kind&&record.artifact.id===ref.id)declaredRecords.push(record);else protectedPaths.add(record.path);}
 for(const path of expected.keys())assert.ok(!protectedPaths.has(path),'An independent artifact shares this managed path; resolve ownership before deletion');
 // Protect unregistered native tails/intermediates belonging to independent
 // outputs as well, even if their bytes coincide with a target frame/song.
 for(const song of snapshot.songs)if(ref.kind!=='song'||song.id!==ref.id){const a=snapshot.attempts.find(a=>a.id===song.attemptId);if(a)protectedRoots.push(join(project,'runs',token(a.nativeCallId),'receipt-artifacts'));}
 for(const clip of snapshot.clips)if(ref.kind!=='clip'||clip.id!==ref.id){const a=snapshot.videoAttempts.find(a=>a.id===clip.attemptId);if(a){const run=join(project,'runs',token(a.nativeCallId));protectedRoots.push(join(run,'comfy-base/output'),join(run,'comfy-base/temp'));protectedPaths.add(join(run,'decoded-audio.f32le'));}}
 const taskPlans=new Map<string,any>();
 for(const a of [...snapshot.attempts,...snapshot.videoAttempts]){const input=join(project,'inputs',token(a.id)),run=join(project,'runs',token(a.nativeCallId));const planPath=typeof a.details.planPath==='string'?a.details.planPath:join(input,'captured-task.json');const plan=await readJson(project,planPath);if(typeof a.details.planSha256==='string'){assert.ok(plan,'Captured task disappeared');assert.equal(hashBytes(await readFile(planPath)),a.details.planSha256,'Captured task hash changed');}if(plan?.attempt?.id)assert.equal(plan.attempt.id,a.id,'Captured task belongs to another attempt');taskPlans.set(a.id,plan);
  if(!('song' in a))continue;
  const unrelated=ref.kind==='song'?a.song.id!==ref.id:a.continuation?.clipId!==ref.id;
  if(unrelated){const paths=ref.kind==='song'?[join(input,'source-song.wav'),join(run,'inputs/source-song.wav'),join(run,'inputs/conditioning.wav'),join(run,'comfy-base/input/conditioning.wav'),plan?.replaySong?.path,plan?.song?.path]:[join(input,'continuation.png'),join(run,'inputs/continuation.png'),join(run,'comfy-base/input/continuation.png'),plan?.firstFrame?.path];for(const path of paths)if(typeof path==='string')protectedPaths.add(path);}
 }
 const protectedFile=(path:string)=>protectedPaths.has(path)||protectedRoots.some(root=>beneath(root,path))||beneath(join(project,'history-thumbnails'),path);
 async function add(path:string,role:string,sha?:string){o.signal?.throwIfAborted();await managedPath(project,path);assert.ok(!protectedFile(path),`Managed candidate is an independent artifact: ${path}`);const old=entries.get(path);if(old){if(sha&&old.sha256)assert.equal(old.sha256,sha,'Recorded managed media hash changed');return;}
  const info=await inspectFile(project,path,o.signal);if(info.sha256&&(sha??expected.get(path)))assert.equal(info.sha256,sha??expected.get(path),'Recorded managed media hash changed');entries.set(path,{id:hashBytes(path),role,...info});
 }
 async function scanMedia(directory:string,role:string){for(const path of await walkFiles(project,directory,o.signal))if(media.test(path)&&!protectedFile(path))await add(path,role);}
 for(const id of targetAssetIds){const a=byAsset.get(id);assert.ok(a,'Registered artifact media reference is missing');await add(a.path,'registered-output',a.sha256);}
 const family=ref.kind==='song'?snapshot.attempts:snapshot.videoAttempts;let ancestor=family.find(a=>a.id===target.attemptId);assert.ok(ancestor,'Original generation provenance is missing');const lineage=new Set<string>();
 while(ancestor){assert.ok(!lineage.has(ancestor.id),'Cyclic generation recovery provenance');lineage.add(ancestor.id);const run=join(project,'runs',token(ancestor.nativeCallId));
  if(ref.kind==='song')await scanMedia(run,'native-song-output');else{await scanMedia(join(run,'comfy-base/output'),'native-clip-output');await scanMedia(join(run,'comfy-base/temp'),'native-clip-partial');await add(join(run,'decoded-audio.f32le'),'native-decoded-audio');}
  const parentId:string|undefined=ancestor.recovery?.parentAttemptId;if(!parentId)break;const parent:StudioAttempt|undefined=family.find(a=>a.id===parentId);assert.ok(parent,'Recovery ancestor provenance is missing');const independent='song' in parent?parent.clipId:parent.songId;if(independent&&independent!==ref.id)break;ancestor=parent;
 }
 const related=snapshot.videoAttempts.filter(a=>ref.kind==='song'?a.song.id===ref.id:a.continuation?.clipId===ref.id);
 for(const a of related){const input=join(project,'inputs',token(a.id)),run=join(project,'runs',token(a.nativeCallId));const plan=taskPlans.get(a.id);
  if(plan!==null){assert.ok(plan&&typeof plan==='object'&&!Array.isArray(plan),'Invalid captured task');if(ref.kind==='song'){for(const item of [plan.replaySong,plan.song,plan.replayCall?.request?.song])if(item?.path)await add(item.path,'captured-song',item.sha256);}else if(plan.firstFrame?.path)await add(plan.firstFrame.path,'captured-reference',plan.firstFrame.sha256);}
  if(ref.kind==='song'){
   for(const path of [join(input,'source-song.wav'),join(run,'inputs/source-song.wav'),join(run,'inputs/conditioning.wav'),join(run,'comfy-base/input/conditioning.wav')])await add(path,'song-conditioning');
   // Includes interrupted writer suffixes before a native receipt exists.
   for(const directory of [input,join(run,'inputs'),join(run,'comfy-base/input')])for(const path of await walkFiles(project,directory,o.signal))if(/\/(?:source-song|conditioning)\.[^/]+$/.test(path)&&!protectedFile(path))await add(path,'song-conditioning-partial');
  }else{for(const path of [join(input,'continuation.png'),join(run,'inputs/continuation.png'),join(run,'comfy-base/input/continuation.png')])await add(path,'continuation-reference');
   for(const directory of [input,join(run,'inputs'),join(run,'comfy-base/input')])for(const path of await walkFiles(project,directory,o.signal))if(/\/continuation\.[^/]+$/.test(path)&&!protectedFile(path))await add(path,'continuation-reference-partial');
  }
 }
 for(const r of affectedRenders)await scanMedia(join(project,'renders',token(r.id)),'assembled-render-or-scratch');
 // Explicit derivative records cover changed encodings/crops that cannot be
 // safely attributed from a filename, hash coincidence or prompt alone.
 for(const record of declaredRecords)await add(record.path,String(record.role),record.sha256);
 // Legacy generic call snapshots and known workspace copies may have arbitrary
 // labels/no extension. Match exact bytes, never delete independent outputs.
 const knownHashes=new Set([...expected.values(),...[...entries.values()].flatMap(e=>e.sha256?[e.sha256]:[])]);
 // Captured execution/call manifests explicitly distinguish a file input from
 // ordinary text evidence even when the input label ends in .txt or .json.
 const declaredInputs:any[]=[];for(const plan of taskPlans.values())if(plan?.executionSource?.files)declaredInputs.push(...plan.executionSource.files);
 for(const directory of ['inputs','workspace'])for(const path of await walkFiles(project,join(project,directory),o.signal))if(path.endsWith('/call.json')){const call=await readJson(project,path);if(call?.files&&typeof call.files==='object')declaredInputs.push(...Object.values(call.files));}
 for(const item of declaredInputs){const path=item?.snapshotPath??item?.path;if(typeof path==='string'&&typeof item.sha256==='string'&&knownHashes.has(item.sha256)&&!protectedFile(path))await add(path,'registered-captured-media',item.sha256);}
 const signatures=new Map<number,Set<string>>();for(const e of entries.values())if(e.bytes!==null&&e.sha256){const set=signatures.get(e.bytes)??new Set<string>();set.add(e.sha256);signatures.set(e.bytes,set);}
 const missingOriginal=[...expected.values()].some(sha=>![...entries.values()].some(e=>e.sha256===sha));
 for(const directory of ['inputs','runs','workspace','workspaces','agent','artifacts','renders'])for(const path of await walkFiles(project,join(project,directory),o.signal)){
  if(entries.has(path)||protectedFile(path)||text.test(path))continue;
  const stat=await lstat(path);if(!missingOriginal&&!signatures.has(stat.size))continue;const info=await inspectFile(project,path,o.signal);if(info.sha256&&knownHashes.has(info.sha256))entries.set(path,{id:hashBytes(path),role:'exact-managed-copy',...info});
 }
 let thumbnail:RetainedThumbnail|undefined;
 if(ref.kind==='clip'&&'rawFrames' in target){const frame=target.rawFrames[0],asset=frame&&byAsset.get(frame.assetId),entry=asset&&entries.get(asset.path);if(entry?.identity)thumbnail=await createHistoryThumbnail({project,source:entry,...(o.signal?{signal:o.signal}:{})});}
 const inventory:ManagedMediaInventory={version:1,projectId:o.projectId,artifact:ref,entries:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path)),affectedAssetIds:[...targetAssetIds].sort(),affectedRenderIds,digest:''};inventory.digest=inventoryDigest(inventory);validateInventory(inventory);
 const directory=join(project,'deletion-plans');await managedPath(project,directory);await mkdir(directory,{recursive:true,mode:0o700});const manifestPath=join(directory,randomUUID()+'.json');await durableJson(manifestPath,{inventory,...(thumbnail?{thumbnail}:{})},true);
 return{inventory,manifestPath,...(thumbnail?{thumbnail}:{})};
}
