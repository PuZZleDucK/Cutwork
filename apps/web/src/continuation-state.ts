import type {ContinuationCapture} from '../../../packages/core/src/contracts/studio.ts';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
/** Recovery is untrusted display state. Generation always resolves the server-owned reference. */
export function decodeContinuation(v:unknown):ContinuationCapture|null{
 if(!v||typeof v!=='object')return null;
 const c=v as Record<string,unknown>,f=c.frame as Record<string,unknown>|undefined;
 if(!uuid(c.contextId)||!uuid(c.clipId)||!uuid(c.songId)||!integer(c.contextRevision)||!integer(c.sourceOriginFrame,-Number.MAX_SAFE_INTEGER)||!integer(c.sourceStartFrame)||!integer(c.sourceEndFrame,1)||!integer(c.endFrame,1)||!f||typeof f!=='object')return null;
 if(c.sourceEndFrame<=c.sourceStartFrame||c.sourceOriginFrame+c.sourceStartFrame<0||c.sourceOriginFrame+c.sourceEndFrame!==c.endFrame||!Number.isSafeInteger(c.endFrame+1)||!uuid(f.assetId)||!digest(f.sha256)||!digest(f.pixelSha256)||f.index!==c.sourceEndFrame-1||!integer(f.bytes,1))return null;
 return {contextId:c.contextId as string,contextRevision:c.contextRevision,clipId:c.clipId as string,songId:c.songId as string,sourceOriginFrame:c.sourceOriginFrame,sourceStartFrame:c.sourceStartFrame,sourceEndFrame:c.sourceEndFrame,endFrame:c.endFrame,frame:{assetId:f.assetId as string,sha256:f.sha256 as string,pixelSha256:f.pixelSha256 as string,index:f.index as number,bytes:f.bytes}};
}
export const continuationRef=(c:ContinuationCapture|null|undefined)=>c?{contextId:c.contextId,contextRevision:c.contextRevision}:null;
/** Compare all displayed provenance, not object insertion order. */
export function continuationEqual(a:ContinuationCapture|null|undefined,b:ContinuationCapture|null|undefined):boolean{
 if(!a||!b)return !a&&!b;
 return a.contextId===b.contextId&&a.contextRevision===b.contextRevision&&a.clipId===b.clipId&&a.songId===b.songId&&a.sourceOriginFrame===b.sourceOriginFrame&&a.sourceStartFrame===b.sourceStartFrame&&a.sourceEndFrame===b.sourceEndFrame&&a.endFrame===b.endFrame&&a.frame.assetId===b.frame.assetId&&a.frame.sha256===b.frame.sha256&&a.frame.pixelSha256===b.frame.pixelSha256&&a.frame.index===b.frame.index&&a.frame.bytes===b.frame.bytes;
}
