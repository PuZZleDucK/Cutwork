const writers=new Map<string,symbol>();
/** Unmounted saves may finish, but cannot overwrite a successor mount's recovery. */
export function draftWriter(key:string){
 const token=Symbol(key),observed=writers.get(key);
 return {claim:()=>{writers.set(key,token);},claimIfUnchanged:()=>{if(writers.get(key)!==observed)return false;writers.set(key,token);return true;},isCurrent:()=>writers.get(key)===token};
}
/** A delayed recovery action may only replace the edits it actually observed. */
export function draftResolutionGuard(){
 let generation=0;
 return {begin:()=>++generation,edited:()=>{generation++;},isCurrent:(captured:number)=>generation===captured};
}
