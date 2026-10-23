import type { ClipTimingIntent, TimingValue } from '../../../packages/core/src/time/linked-timing.ts';
export const clipSessionKey=(projectId:string,songId:string,kind:'timing'|'submission'|'prompt')=>`assembly:clip-${kind}:${projectId}:${songId}`;
export function readSession(key:string):string|null {try{return sessionStorage.getItem(key);}catch{return null;}}
export function writeSession(key:string,value:string|null):void {try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,value);}catch{/* Open-page state still works when storage is unavailable. */}}
export function decodeClipTiming(raw:string|null):ClipTimingIntent|null {
 try{
  const value=JSON.parse(raw??'null');
  const point=(p:unknown):p is TimingValue=>{
   if(!p||typeof p!=='object'||!('unit' in p)||!('value' in p))return false;
   if(['frames','beats','seconds'].includes(String(p.unit)))return typeof p.value==='string'&&p.value.length<=1000;
   if(p.unit!=='rational'||!p.value||typeof p.value!=='object')return false;
   const f=p.value as Record<string,unknown>;
   return typeof f.numerator==='string'&&/^(0|[1-9][0-9]*)$/.test(f.numerator)&&f.numerator.length<=1000&&typeof f.denominator==='string'&&/^[1-9][0-9]*$/.test(f.denominator)&&f.denominator.length<=1000;
  };
  return value&&point(value.start)&&point(value.end)?{start:value.start,end:value.end}:null;
 }catch{return null;}
}
export function decodeSubmission(raw:string|null):{signature:string;key:string}|null {
 try{const value=JSON.parse(raw??'null');return value&&typeof value.signature==='string'&&typeof value.key==='string'&&/^[a-f0-9-]{36}$/.test(value.key)?{signature:value.signature,key:value.key}:null;}catch{return null;}
}
/** Compare-and-remove prevents a late acceptance clearing a newer draft. */
export function clearMatchingSession(key:string,expected:string):void {if(readSession(key)===expected)writeSession(key,null);}
