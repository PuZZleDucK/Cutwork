import { expect,it } from 'vitest';
import { renderForRevision,submissionIdentity,videoInput } from './video-state.ts';
import type { StudioRender } from '../../../packages/core/src/contracts/studio.ts';
it('rejects fractional, negative, unsafe, empty or reversed frame ranges',()=>{
 for(const [s,e] of [['1.5','5'],['-1','5'],['4','4'],['9007199254740992','9007199254740993'],['','8']])expect(()=>videoInput('s','idea','style',s!,e!)).toThrow();
 expect(videoInput('s','idea','style','0','1')).toMatchObject({startFrame:0,endFrame:1,style:'style'});
});
it('retains accepted or uncertain submission identity until inputs change',()=>{
 const p=submissionIdentity(null,{prompt:'one'},()=> 'key1');expect(submissionIdentity(p,{prompt:'one'},()=> 'key2')).toBe(p);
 expect(submissionIdentity(p,{prompt:'two'},()=> 'key2').key).toBe('key2');
});
it('separates a stale playable preview from the current render, including failures',()=>{
 const r=(id:string,revision:number,state:StudioRender['state'])=>({id,songId:'song',revision,state,assetId:state==='succeeded'?'asset':null}) as StudioRender;
 const old=r('old',1,'succeeded'),current=r('new',2,'running');expect(renderForRevision([old,current],'song',2)).toEqual({playable:old,current});
 expect(renderForRevision([old,r('fail',2,'failed')],'song',2).current?.state).toBe('failed');
 expect(renderForRevision([old],'different',1)).toEqual({playable:undefined,current:undefined});
});
import { latestReadGuard,automaticRenderAllowed } from './video-state.ts';
it('a slow old polling response or error cannot replace a newer accepted read',()=>{
 const guard=latestReadGuard(),old=guard.begin(),fresh=guard.begin();expect(guard.isCurrent(fresh)).toBe(true);expect(guard.isCurrent(old)).toBe(false);
});
it('does not automatically repeat an ambiguous render submission for the same revision',()=>{
 expect(automaticRenderAllowed(true,false,false,null,'song:2','song:2')).toBe(false);
 expect(automaticRenderAllowed(true,false,false,null,'song:3','song:2')).toBe(true);
 expect(automaticRenderAllowed(true,true,false,null,'song:3',null)).toBe(false);
});
it('retains the manually frozen request signature when polling advances a suggestion',()=>{
 const submitted=videoInput('song','one','style','0','48');const previous=submissionIdentity(null,submitted,()=> 'same');
 // Form freezes these captured boundaries, rather than consuming a newly advanced suggestion.
 expect(submissionIdentity(previous,videoInput('song','one','style',String(submitted.startFrame),String(submitted.endFrame)),()=> 'wrong')).toBe(previous);
});
import { mustReplaceRenderKey } from './video-state.ts';
it('only abandons a render key on the explicit terminal unavailable response',()=>{
 expect(mustReplaceRenderKey({code:'STUDIO_RENDER_UNAVAILABLE'})).toBe(true);
 expect(mustReplaceRenderKey(new Error('connection lost'))).toBe(false);
 expect(mustReplaceRenderKey({code:'REVISION_CONFLICT'})).toBe(false);
});
