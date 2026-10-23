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
