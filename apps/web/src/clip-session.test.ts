import { expect,it } from 'vitest';
import { clipSessionKey,decodeClipTiming,decodeSubmission } from './clip-session.ts';
import { submissionIdentity } from './video-state.ts';
it('restores an uncertain per-song request after unmount without changing its key or exact interval',()=>{
 const intent={start:{unit:'seconds',value:'0.123456789'},end:{unit:'rational',value:{numerator:'25',denominator:'24'}}};
 const restored=decodeClipTiming(JSON.stringify(intent));expect(restored).toEqual(intent);
 const input={prompt:'Pending idea',timingIntent:restored};const identity=submissionIdentity(null,input,()=> '12345678-1234-1234-1234-123456789012');
 expect(submissionIdentity(decodeSubmission(JSON.stringify(identity)),input,()=> 'wrong')).toEqual(identity);
 expect(clipSessionKey('p','song1','timing')).not.toEqual(clipSessionKey('p','song2','timing'));
 expect(clipSessionKey('p','song1','submission')).not.toEqual(clipSessionKey('other','song1','submission'));
});
it('retains incomplete editable text but rejects corrupt stored endpoint structures',()=>{
 expect(decodeClipTiming(JSON.stringify({start:{unit:'seconds',value:''},end:{unit:'frames',value:'49'}}))?.start.value).toBe('');
 for(const value of ['broken','null','{}','{"start":{"unit":"rational","value":{"numerator":"1","denominator":"0"}},"end":{"unit":"frames","value":"49"}}'])expect(decodeClipTiming(value)).toBeNull();
 expect(decodeSubmission('{"signature":"x","key":"bad"}')).toBeNull();
});
it('retains same-page identity and draft when reads work but storage writes exceed quota',async()=>{
 const {readSession,writeSession,clearMatchingSession}=await import('./clip-session.ts');
 const {prepareMusicSubmission,clearMusicSubmission}=await import('./music-session.ts');
 const values=new Map<string,string>(), old=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:()=>{throw Error('QuotaExceededError');},removeItem:()=>{throw Error('disabled');}}});
 try{
  const key='quota-draft-test';writeSession(key,'new local draft');expect(readSession(key)).toBe('new local draft');
  const first=prepareMusicSubmission('quota-project',{musicPrompt:'riff',lyrics:''},()=> '11111111-1111-4111-8111-111111111111');
  expect(prepareMusicSubmission('quota-project',{musicPrompt:'riff',lyrics:''},()=> '22222222-2222-4222-8222-222222222222')).toEqual(first);
  values.set(key,'old persisted draft');clearMatchingSession(key,'new local draft');expect(readSession(key)).toBeNull();
  clearMusicSubmission('quota-project',first);expect(prepareMusicSubmission('quota-project',{musicPrompt:'riff',lyrics:''},()=> '33333333-3333-4333-8333-333333333333').key).not.toBe(first.key);
 }finally{if(old)Object.defineProperty(globalThis,'sessionStorage',old);else Reflect.deleteProperty(globalThis,'sessionStorage');}
});
