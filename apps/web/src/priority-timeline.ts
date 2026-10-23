import {layoutIntervalLanes,type LaneInterval} from '../../../packages/core/src/time/linked-timing.ts';

export type PriorityInterval=LaneInterval&({reserved:false;priority:number}|{reserved:true});
export type PriorityItem<T extends PriorityInterval>=T&{lane:number;abovePlacementId:string|null};
const overlaps=(a:LaneInterval,b:LaneInterval)=>a.startFrame<b.endFrame&&b.startFrame<a.endFrame;

/** One uninterrupted block per placement. Higher-priority overlaps stay above
 * lower-priority ones for their entire duration. Reuse rows for disjoint clips,
 * but never split a clip merely to minimise rows. No saved edit data is changed.
 */
export function priorityTimeline<T extends PriorityInterval>(input:readonly T[]):{laneCount:number;items:PriorityItem<T>[]} {
 layoutIntervalLanes(input); // Shared interval/identity validation, not its lane ordering.
 const priorities=new Set<number>();
 for(const item of input)if(!item.reserved){
  if(!Number.isSafeInteger(item.priority)||item.priority<0||priorities.has(item.priority))throw new Error('Placed priorities must be unique nonnegative whole numbers');
  priorities.add(item.priority);
 }
 const ordered=[...input].sort((a,b)=>{
  if(a.reserved!==b.reserved)return a.reserved?1:-1;
  if(!a.reserved&&!b.reserved)return b.priority-a.priority;
  return a.startFrame-b.startFrame||a.endFrame-b.endFrame||(a.id<b.id?-1:a.id>b.id?1:0);
 });
 const items:PriorityItem<T>[]=[];let laneCount=0;
 for(const item of ordered){
  const above=items.filter(other=>overlaps(item,other));
  const lane=above.reduce((next,other)=>Math.max(next,other.lane+1),0);
  // If several disjoint neighbours share the row above, its highest priority
  // is the one swap that lifts this whole clip, rather than only part of it.
  const target=above.find(other=>other.lane===lane-1&&!other.reserved);
  items.push({...item,lane,abovePlacementId:item.reserved?null:target?.id??null});
  laneCount=Math.max(laneCount,lane+1);
 }
 return {laneCount,items};
}
