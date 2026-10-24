import {expect,test,vi} from 'vitest';
import {persistClipEdit,acknowledgeClipEdit} from './clip-edit-persistence.ts';
import {ApiError} from './api.ts';
import type {ClipEditContext,ProjectSnapshot} from '../../../packages/core/src/contracts/studio.ts';
const context={id:'edit',projectId:'p',songId:'s',clipId:'clip',revision:3} as ClipEditContext;
const arrangement={projectId:'p',songId:'s',revision:5,placements:[]};
const patch={sourceStartFrame:2,sourceEndFrame:30};
const result={context:{...context,revision:4},arrangement:{...arrangement,revision:7}};
const snapshot={project:{id:'p'},editContexts:[context],arrangements:[arrangement]} as unknown as ProjectSnapshot;
test('only an unchanged context permits retrying a stale arrangement revision',async()=>{
 const send=vi.fn().mockRejectedValueOnce(new ApiError('Arrangement changed',409,'CONFLICT')).mockResolvedValueOnce({...snapshot,arrangements:[{...arrangement,revision:6}]}).mockResolvedValueOnce(result);
 expect(await persistClipEdit(context,5,patch,send)).toEqual(result);
 expect(send.mock.calls[2]).toEqual(['/api/projects/p/edit-contexts/edit',{revision:3,arrangementRevision:6,edit:patch},'PUT']);
});
test('changed contexts, missing contexts and unknown transport results are never blindly replayed',async()=>{
 for(const fresh of [{...snapshot,editContexts:[result.context]},{...snapshot,editContexts:[]}]){
  const send=vi.fn().mockRejectedValueOnce(new ApiError('Changed',409,'CONFLICT')).mockResolvedValueOnce(fresh);
  await expect(persistClipEdit(context,5,patch,send)).rejects.toThrow();expect(send).toHaveBeenCalledTimes(2);
 }
 const send=vi.fn().mockRejectedValue(new Error('Lost response'));await expect(persistClipEdit(context,5,patch,send)).rejects.toThrow('Lost response');expect(send).toHaveBeenCalledOnce();
});
test('arrangement retry is bounded and keeps the original context revision',async()=>{
 const send=vi.fn().mockRejectedValueOnce(new ApiError('Changed',409,'CONFLICT')).mockResolvedValueOnce({...snapshot,arrangements:[{...arrangement,revision:6}]}).mockRejectedValueOnce(new ApiError('Changed again',409,'CONFLICT'));
 await expect(persistClipEdit(context,5,patch,send)).rejects.toThrow('Changed again');expect(send).toHaveBeenCalledTimes(3);
});
test('accepted edits update sequence immediately without following project navigation or rolling revisions back',()=>{
 const next=acknowledgeClipEdit(snapshot,result)!;expect(next.editContexts[0]).toEqual(result.context);expect(next.arrangements[0]).toEqual(result.arrangement);
 expect(acknowledgeClipEdit(next,{context,arrangement})).toEqual(next);
 const other={...snapshot,project:{...snapshot.project,id:'other'}};expect(acknowledgeClipEdit(other,result)).toBe(other);expect(acknowledgeClipEdit(null,result)).toBe(null);
});
