import {expect,test} from 'vitest';
import {priorityTimeline} from './priority-timeline.ts';

const clip=(id:string,startFrame:number,endFrame:number,priority:number)=>({id,startFrame,endFrame,priority,reserved:false as const});
const pending=(id:string,startFrame:number,endFrame:number)=>({id,startFrame,endFrame,reserved:true as const});
const overlaps=(a:{startFrame:number;endFrame:number},b:{startFrame:number;endFrame:number})=>a.startFrame<b.endFrame&&b.startFrame<a.endFrame;

test('four placements stay four whole clips even when three overlap at different boundaries',()=>{
 // Geometry of the reported four-clip project; no private media or prompts.
 const input=[clip('second',108,216,3),clip('fourth',200,254,4),clip('third',178,219,2),clip('first',0,108,5)];
 const result=priorityTimeline(input);
 expect(result.items).toHaveLength(4);
 expect(result.laneCount).toBe(3);
 for(const original of input)expect(result.items.filter(x=>x.id===original.id)).toEqual([expect.objectContaining(original)]);
 expect(Object.fromEntries(result.items.map(x=>[x.id,x.lane]))).toEqual({first:0,fourth:0,second:1,third:2});
 expect(result.items.filter(x=>x.abovePlacementId).map(x=>[x.id,x.abovePlacementId])).toEqual([['second','fourth'],['third','second']]);
});

test('an overlap chain never splits a clip to reduce row count',()=>{
 const result=priorityTimeline([clip('long',0,10,2),clip('earlier',0,5,1),clip('later',5,10,3)]);
 expect(result.items.map(x=>[x.id,x.startFrame,x.endFrame,x.lane,x.abovePlacementId])).toEqual([
  ['later',5,10,0,null],['long',0,10,1,'later'],['earlier',0,5,2,'long'],
 ]);
 expect(result.laneCount).toBe(3);
});

test('nonoverlapping and touching clips reuse the top row',()=>{
 const result=priorityTimeline([clip('top',0,20,3),clip('low',5,10,1),clip('after',20,30,4)]);
 expect(result.laneCount).toBe(2);
 expect(result.items.find(x=>x.id==='top')).toMatchObject({startFrame:0,endFrame:20,lane:0,abovePlacementId:null});
 expect(result.items.find(x=>x.id==='after')?.lane).toBe(0);
});

test('one move-up target lifts the whole clip even if the row above has multiple neighbours',()=>{
 const input=[clip('low',0,20,1),clip('middle-a',0,10,2),clip('middle-b',10,20,3),clip('top',0,20,4)];
 const result=priorityTimeline(input),low=result.items.find(x=>x.id==='low')!;
 expect(result.items).toHaveLength(input.length);
 expect(low).toMatchObject({lane:2,abovePlacementId:'middle-b'});
 const after=priorityTimeline(input.map(x=>({...x,priority:x.id==='low'?3:x.id==='middle-b'?1:x.priority})));
 expect(after.items.find(x=>x.id==='low')).toMatchObject({lane:1,startFrame:0,endFrame:20});
});

test('reservations remain whole and below overlapping pictures, without priority controls',()=>{
 const result=priorityTimeline([pending('pending',0,20),clip('picture',5,15,1)]);
 expect(result.items).toHaveLength(2);
 expect(result.items.find(x=>x.id==='picture')?.lane).toBe(0);
 expect(result.items.find(x=>x.id==='pending')).toMatchObject({lane:1,abovePlacementId:null,startFrame:0,endFrame:20});
});

test('invalid, repeated identities and ambiguous placed priorities are rejected',()=>{
 expect(()=>priorityTimeline([clip('a',0,4,1),clip('a',4,8,2)])).toThrow();
 expect(()=>priorityTimeline([clip('a',4,4,1)])).toThrow();
 expect(()=>priorityTimeline([clip('a',0,4,1),clip('b',2,8,1)])).toThrow();
 expect(priorityTimeline([])).toEqual({laneCount:0,items:[]});
});

test('all priority permutations preserve one whole interval, truthful dominance and an effective move-up',()=>{
 const geometry=[clip('a',0,12,0),clip('b',3,7,0),clip('c',6,20,0),clip('d',12,18,0),clip('e',19,24,0)];
 function permutations(xs:number[]):number[][]{return xs.length?xs.flatMap((n,i)=>permutations(xs.filter((_,j)=>j!==i)).map(rest=>[n,...rest])):[[]];}
 for(const priorities of permutations([1,2,3,4,5])){
  const input=geometry.map((x,i)=>({...x,priority:priorities[i]!})),before=structuredClone(input),result=priorityTimeline(input);
  expect(result.items).toHaveLength(input.length);
  expect(priorityTimeline([...input].reverse())).toEqual(result);
  expect(input).toEqual(before);
  for(const item of result.items){
   expect(item).toMatchObject(input.find(x=>x.id===item.id)!);
   for(const other of result.items)if(other.id!==item.id&&overlaps(item,other)){
    expect(item.lane===other.lane).toBe(false);
    expect(item.lane<other.lane).toBe(item.priority>other.priority);
   }
   if(item.abovePlacementId){
    const target=result.items.find(x=>x.id===item.abovePlacementId)!;
    expect(target.lane).toBe(item.lane-1);expect(overlaps(item,target)).toBe(true);
    const moved=priorityTimeline(input.map(x=>({...x,priority:x.id===item.id?target.priority:x.id===target.id?item.priority:x.priority})));
    expect(moved.items.find(x=>x.id===item.id)!.lane).toBeLessThan(item.lane);
   }
  }
 }
});
