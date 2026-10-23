import {expect,test} from 'vitest';
import {priorityTimeline} from './priority-timeline.ts';

const clip=(id:string,startFrame:number,endFrame:number,priority:number)=>({id,startFrame,endFrame,priority,reserved:false as const});
const pending=(id:string,startFrame:number,endFrame:number)=>({id,startFrame,endFrame,reserved:true as const});

test('top timeline row is the actually dominant picture throughout an overlap chain',()=>{
 const result=priorityTimeline([clip('long',0,10,2),clip('earlier',0,5,1),clip('later',5,10,3)]);
 expect(result.laneCount).toBe(2);
 expect(result.items.map(x=>[x.id,x.segmentStartFrame,x.segmentEndFrame,x.lane,x.abovePlacementId])).toEqual([
  ['long',0,5,0,null],['earlier',0,5,1,'long'],['later',5,10,0,null],['long',5,10,1,'later'],
 ]);
});

test('nonoverlapping clips return to the first row and unchanged spans merge',()=>{
 const result=priorityTimeline([clip('top',0,20,3),clip('low',5,10,1),clip('after',20,30,4)]);
 expect(result.laneCount).toBe(2);
 expect(result.items.find(x=>x.id==='top')).toMatchObject({segmentStartFrame:0,segmentEndFrame:20,lane:0,abovePlacementId:null});
 expect(result.items.filter(x=>x.id==='top')).toHaveLength(1);
 expect(result.items.find(x=>x.id==='after')?.lane).toBe(0);
});

test('move-up target is the immediately higher overlapping placement, not a disjoint lane occupant',()=>{
 const result=priorityTimeline([clip('low',0,20,1),clip('middle-a',0,10,2),clip('middle-b',10,20,3),clip('top',0,20,4)]);
 expect(result.laneCount).toBe(3);
 expect(result.items.filter(x=>x.id==='low').map(x=>[x.segmentStartFrame,x.segmentEndFrame,x.abovePlacementId])).toEqual([[0,10,'middle-a'],[10,20,'middle-b']]);
});

test('reservations occupy rows but never become the picture or acquire priority controls',()=>{
 const result=priorityTimeline([pending('pending',0,20),clip('picture',5,15,1)]);
 expect(result.items.find(x=>x.id==='picture')?.lane).toBe(0);
 expect(result.items.filter(x=>x.id==='pending').every(x=>x.abovePlacementId===null)).toBe(true);
 expect(result.laneCount).toBe(2);
});

test('swapping saved priorities changes only presentation rank, never interval geometry',()=>{
 const original=[clip('a',0,20,1),clip('b',5,15,2)];
 const before=structuredClone(original),first=priorityTimeline(original),after=priorityTimeline(original.map(x=>({...x,priority:x.id==='a'?2:1})));
 expect(original).toEqual(before);
 expect(first.items.find(x=>x.id==='a'&&x.segmentStartFrame===5)?.lane).toBe(1);
 expect(after.items.find(x=>x.id==='a')?.lane).toBe(0);
 for(const piece of [...first.items,...after.items])expect([piece.startFrame,piece.endFrame]).toEqual(piece.id==='a'?[0,20]:[5,15]);
});

test('invalid, repeated identities and ambiguous placed priorities are rejected',()=>{
 expect(()=>priorityTimeline([clip('a',0,4,1),clip('a',4,8,2)])).toThrow();
 expect(()=>priorityTimeline([clip('a',4,4,1)])).toThrow();
 expect(()=>priorityTimeline([clip('a',0,4,1),clip('b',2,8,1)])).toThrow();
 expect(priorityTimeline([])).toEqual({laneCount:0,items:[]});
});

test('every populated time slice keeps exact maximum concurrency, top dominance and unique segment keys',()=>{
 const original=[clip('a',0,12,2),clip('b',3,7,6),clip('c',6,20,1),clip('d',12,18,5),clip('e',19,24,4),pending('queued',4,15)];
 const result=priorityTimeline(original);
 expect(new Set(result.items.map(x=>x.segmentKey)).size).toBe(result.items.length);
 let maximum=0;
 for(let frame=0;frame<24;frame++){
  const active=original.filter(x=>x.startFrame<=frame&&frame<x.endFrame),shown=result.items.filter(x=>x.segmentStartFrame<=frame&&frame<x.segmentEndFrame).sort((a,b)=>a.lane-b.lane);
  maximum=Math.max(maximum,active.length);
  expect(shown.map(x=>x.id).sort()).toEqual(active.map(x=>x.id).sort());
  expect(shown.map(x=>x.lane)).toEqual(active.map((_,lane)=>lane));
  const highest=active.filter((x):x is ReturnType<typeof clip>=>!x.reserved).sort((a,b)=>b.priority-a.priority)[0];
  if(highest)expect(shown[0]?.id).toBe(highest.id);
 }
 expect(result.laneCount).toBe(maximum);
});
