import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';import {join} from 'node:path';
import type {ManagedMediaInventory} from '../../../../packages/core/src/contracts/lifecycle.ts';
import {validateInventory} from './media-inventory.ts';
import {projectRoot,token,managedPath,readJson,durableJson,unlinkVerified,inspectFile} from './media-files.ts';
/** Runtime serializes this per project and has already durably accepted deletion.
 * A checkpoint is written after verified absence, before notifying the store.
 * Restart rechecks every path: claimed completion never bypasses verification. */
export async function runArtifactPurge(o:{runtime:string;purgeId:string;inventory:ManagedMediaInventory;completedEntryIds?:string[];onProgress?:(entryId:string)=>void|Promise<void>;signal?:AbortSignal}):Promise<{completedEntryIds:string[]}>{
 const inventory=structuredClone(o.inventory);validateInventory(inventory);token(o.purgeId);o.signal?.throwIfAborted();const project=await projectRoot(o.runtime,inventory.projectId),directory=join(project,'media-purges');await managedPath(project,directory);await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,o.purgeId+'.json');
 const previous=await readJson(project,path);if(previous)assert.equal(previous.inventoryDigest,inventory.digest,'Purge identity belongs to a different inventory');
 const completedEntryIds:string[]=[];const checkpoint=()=>durableJson(path,{version:1,purgeId:o.purgeId,inventoryDigest:inventory.digest,completedEntryIds});if(!previous)await durableJson(path,{version:1,purgeId:o.purgeId,inventoryDigest:inventory.digest,completedEntryIds},true);
 // Preflight the entire inventory before first destructive action, so a known
 // changed unrelated replacement cannot cause an avoidable half-complete purge.
 for(const e of inventory.entries){o.signal?.throwIfAborted();const current=await inspectFile(project,e.path,o.signal);if(current.identity){assert.deepEqual(current.identity,e.identity,'Managed media identity changed');assert.equal(current.sha256,e.sha256,'Managed media contents changed');}}
 for(const e of inventory.entries){await unlinkVerified(project,e,o.signal);completedEntryIds.push(e.id);await checkpoint();await o.onProgress?.(e.id);}
 for(const e of inventory.entries){assert.equal((await inspectFile(project,e.path,o.signal)).identity,null,'Managed media reappeared during purge');}
 return{completedEntryIds};
}
