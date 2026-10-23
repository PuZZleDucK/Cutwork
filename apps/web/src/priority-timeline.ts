import {layoutIntervalLanes,type LaneInterval} from '../../../packages/core/src/time/linked-timing.ts';

export type PriorityInterval=LaneInterval&({reserved:false;priority:number}|{reserved:true});
export type PrioritySegment<T extends PriorityInterval>=T&{
 lane:number;segmentStartFrame:number;segmentEndFrame:number;segmentKey:string;abovePlacementId:string|null;
};

/**
 * Presentation-only overlap segmentation. Whole clips cannot always retain a
 * fixed row while both top-row dominance and the minimum row count hold. Split
 * at overlap boundaries, sort the active placements by their saved priority,
 * and merge consecutive equivalent display segments. Source/edit bounds remain
 * untouched. A move-up swaps the two actual placement priorities globally.
 */
export function priorityTimeline<T extends PriorityInterval>(input:readonly T[]):{laneCount:number;items:PrioritySegment<T>[]} {
 layoutIntervalLanes(input); // Shared interval/identity validation, not its lane ordering.
 const priorities=new Set<number>();
 for(const item of input)if(!item.reserved){
  if(!Number.isSafeInteger(item.priority)||item.priority<0||priorities.has(item.priority))throw new Error('Placed priorities must be unique nonnegative whole numbers');
  priorities.add(item.priority);
 }
 const boundaries=[...new Set(input.flatMap(item=>[item.startFrame,item.endFrame]))].sort((a,b)=>a-b);
 const items:PrioritySegment<T>[]=[],previous=new Map<string,PrioritySegment<T>>();let laneCount=0;
 for(let i=0;i<boundaries.length-1;i++){
  const start=boundaries[i]!,end=boundaries[i+1]!;
  const active=input.filter(item=>item.startFrame<=start&&item.endFrame>=end).sort((a,b)=>{
   if(a.reserved!==b.reserved)return a.reserved?1:-1;
   if(!a.reserved&&!b.reserved)return b.priority-a.priority;
   return a.id<b.id?-1:a.id>b.id?1:0;
  });
  laneCount=Math.max(laneCount,active.length);
  active.forEach((item,lane)=>{
   const above=lane>0?active[lane-1]:undefined;
   const abovePlacementId=!item.reserved&&above&&!above.reserved?above.id:null;
   const prior=previous.get(item.id);
   if(prior&&prior.lane===lane&&prior.abovePlacementId===abovePlacementId&&prior.segmentEndFrame===start){prior.segmentEndFrame=end;return;}
   const segment={...item,lane,segmentStartFrame:start,segmentEndFrame:end,segmentKey:`${item.id}:${start}:${lane}`,abovePlacementId};
   items.push(segment);previous.set(item.id,segment);
  });
 }
 return {laneCount,items};
}
