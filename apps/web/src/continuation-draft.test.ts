import {expect,it} from 'vitest';
import type {ClipDraft,ContinuationCapture} from '../../../packages/core/src/contracts/studio.ts';
import {acceptedClipDraft,acknowledgeClipDraft,clipDraftEqual,clipDraftValues,receiveClipDraft,restoreClipDraft,preparedClipRecovery} from './clip-draft-state.ts';
const continuation:ContinuationCapture={contextId:'00000000-0000-4000-8000-000000000001',contextRevision:2,clipId:'00000000-0000-4000-8000-000000000002',songId:'00000000-0000-4000-8000-000000000003',sourceOriginFrame:-5,sourceStartFrame:5,sourceEndFrame:75,endFrame:70,frame:{assetId:'00000000-0000-4000-8000-000000000004',sha256:'a'.repeat(64),pixelSha256:'b'.repeat(64),index:74,bytes:123}};
const base:ClipDraft={projectId:'00000000-0000-4000-8000-000000000005',songId:continuation.songId,revision:4,clipPrompt:'my next shot',timingIntent:{start:{unit:'rational',value:{numerator:'35',denominator:'12'}},end:{unit:'seconds',value:'6.9166666666667'}},continuation};
it('preserves the exact prepared image/context in saved draft values and tab recovery',()=>{
 expect(clipDraftValues(base)).toEqual({clipPrompt:base.clipPrompt,timingIntent:base.timingIntent,continuation});
 const value={clipPrompt:'new thought',timingIntent:base.timingIntent,continuation};
 expect(restoreClipDraft(base,JSON.stringify({revision:4,value,conflict:false}))).toMatchObject({value,conflict:false});
});
it('treats continuation changes as dirty even if prompt/timing stayed identical',()=>{
 const old={clipPrompt:base.clipPrompt,timingIntent:base.timingIntent,continuation};
 expect(clipDraftEqual(old,{...old,continuation:null})).toBe(false);
 expect(clipDraftEqual(old,{...old,continuation:{...continuation,contextRevision:3}})).toBe(false);
 expect(clipDraftEqual({clipPrompt:old.clipPrompt,timingIntent:old.timingIntent},{...old,continuation:null})).toBe(true);
});
it('a stale save acknowledgement cannot erase a newer chosen frame',()=>{
 const previous={clipPrompt:base.clipPrompt,timingIntent:base.timingIntent,continuation};const next={...previous,continuation:{...continuation,contextRevision:3}};
 expect(acknowledgeClipDraft({base,value:next,conflict:false},previous,{...base,revision:5}).value).toEqual(next);
});
it('a remote choice conflicts with a different local reference, not just text',()=>{
 const value={clipPrompt:base.clipPrompt,timingIntent:base.timingIntent,continuation:{...continuation,contextRevision:3}};
 expect(receiveClipDraft({base,value,conflict:false},{...base,revision:5,continuation:null})).toMatchObject({value,conflict:true});
});
it('invalid recovered frame geometry cannot masquerade as an accepted reference',()=>{
 const bad={...continuation,frame:{...continuation.frame,index:75}};
 expect(restoreClipDraft(base,JSON.stringify({revision:4,value:{clipPrompt:'bad',timingIntent:base.timingIntent,continuation:bad},conflict:false}))).toMatchObject({value:{clipPrompt:base.clipPrompt,continuation},conflict:false});
});

it('accepted generation clears its own binding but preserves a newer prompt, timing or frame choice',()=>{
 const submitted=clipDraftValues(base);expect(acceptedClipDraft(submitted,submitted)).toMatchObject({clipPrompt:'',timingIntent:null,continuation:null});
 for(const current of [{...submitted,clipPrompt:'new shot'},{...submitted,timingIntent:{start:{unit:'frames' as const,value:'99'},end:{unit:'frames' as const,value:'199'}}},{...submitted,continuation:{...continuation,contextRevision:3}}])expect(acceptedClipDraft(current,submitted).continuation).toEqual(current.continuation);
});

it('accepting an old capture preserves the complete newer continuation draft',()=>{
 const submitted=clipDraftValues(base),current={...submitted,continuation:{...continuation,contextRevision:3}};
 expect(acceptedClipDraft(current,submitted)).toEqual(current);
});
it('preparing an explicitly selected other-song continuation advances clean session recovery',()=>{
 const previous={...base,revision:3,continuation:null};
 const raw=JSON.stringify({revision:3,value:clipDraftValues(previous),conflict:false});
 const updated=preparedClipRecovery(previous,base,raw,raw);
 expect(updated).not.toBeNull();
 expect(restoreClipDraft(base,updated)).toEqual({base,value:clipDraftValues(base),conflict:false});
});
it('preparation preserves dirty or concurrently changed target-song recovery',()=>{
 const previous={...base,revision:3,continuation:null};
 const dirty=JSON.stringify({revision:3,value:{...clipDraftValues(previous),clipPrompt:'unsaved thought'},conflict:false});
 expect(preparedClipRecovery(previous,base,dirty,dirty)).toBeNull();
 const clean=JSON.stringify({revision:3,value:clipDraftValues(previous),conflict:false});
 expect(preparedClipRecovery(previous,base,clean,dirty)).toBeNull();
 expect(preparedClipRecovery(previous,base,null,dirty)).toBeNull();
});
it('a remote prompt or timing edit preserves the complete associated continuation after older acceptance',()=>{
 const submitted=clipDraftValues(base);
 for(const current of [{...submitted,clipPrompt:'new remote idea'},{...submitted,timingIntent:{start:{unit:'seconds' as const,value:'7.5'},end:{unit:'seconds' as const,value:'9.5'}}}])expect(acceptedClipDraft(current,submitted)).toEqual(current);
});
it('ordinary no-image acceptance still clears unchanged fields independently',()=>{
 const submitted={clipPrompt:'submitted',timingIntent:base.timingIntent};
 expect(acceptedClipDraft({...submitted,clipPrompt:'next shot'},submitted)).toEqual({clipPrompt:'next shot',timingIntent:null});
});
