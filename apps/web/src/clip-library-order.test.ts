import { expect, it } from 'vitest';
import type { StudioClip, VideoAttempt, ClipPlacement } from '../../../packages/core/src/contracts/studio.ts';
import { orderedClipLibrary } from './clip-library-order.ts';
const clip=(id:string)=>({id,attemptId:`a-${id}`} as StudioClip);
const attempt=(id:string,startFrame:number,state='succeeded')=>({id:`a-${id}`,state,input:{startFrame}} as VideoAttempt);
const place=(clipId:string,startFrame:number,priority=1)=>({id:`p-${clipId}-${startFrame}`,clipId,startFrame,priority} as ClipPlacement);
it('interleaves pending requests and completed clips by captured time, not completion order',()=>{
 const clips=[clip('late'),clip('early')],attempts=[attempt('late',96),attempt('early',0),attempt('pending',48,'running')];
 expect(orderedClipLibrary(clips,attempts,[]).map(e=>e.id)).toEqual(['clip:early','attempt:a-pending','clip:late']);
});
it('sorts by earliest current placement, preserving all source order and overlap priority',()=>{
 const clips=[clip('a'),clip('b')],attempts=[attempt('a',0),attempt('b',48)],placements=[place('a',200,9),place('a',100,4),place('b',50,8)];
 const before=JSON.stringify({clips,attempts,placements});
 expect(orderedClipLibrary(clips,attempts,placements).map(e=>[e.id,e.startFrame])).toEqual([['clip:b',50],['clip:a',100]]);
 expect(JSON.stringify({clips,attempts,placements})).toBe(before);
});
it('retains unplaced original times, puts missing origins last, and keeps equal starts stable',()=>{
 const clips=[clip('same-a'),clip('unknown'),clip('same-b')],attempts=[attempt('same-a',24),attempt('same-b',24),attempt('failed',0,'failed')];
 expect(orderedClipLibrary(clips,attempts,[]).map(e=>e.id)).toEqual(['attempt:a-failed','clip:same-a','clip:same-b','clip:unknown']);
});
it('returns an empty library without results and does not show a duplicate successful placeholder',()=>{
 expect(orderedClipLibrary([],[],[])).toEqual([]);
 expect(orderedClipLibrary([clip('one')],[attempt('one',0)],[])).toHaveLength(1);
});
