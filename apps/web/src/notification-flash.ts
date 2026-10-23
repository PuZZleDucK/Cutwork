/** Each occurrence gets one five-second announcement, never renewed by polling. */
export function notificationFlashes(changed:(ids:string[])=>void){
 let seen=new Set<string>();const showing=new Set<string>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const emit=()=>changed([...showing]);
 const dismiss=(ids:string[])=>{for(const id of ids){showing.delete(id);clearTimeout(timers.get(id));timers.delete(id);}emit();};
 return {
  sync(ids:string[]){const next=new Set(ids);for(const id of seen)if(!next.has(id)){showing.delete(id);clearTimeout(timers.get(id));timers.delete(id);}
   for(const id of next)if(!seen.has(id)){showing.add(id);timers.set(id,setTimeout(()=>{showing.delete(id);timers.delete(id);emit();},5000));}
   seen=next;emit();},dismiss,
  dispose(){for(const timer of timers.values())clearTimeout(timer);timers.clear();}
 };
}
