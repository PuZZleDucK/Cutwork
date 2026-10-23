import { expect,it } from 'vitest';
import { acknowledgeClipDraft, receiveClipDraft, restoreClipDraft, clipDraftEqual, type ClipDraftState } from './clip-draft-state.ts';
import type { ClipDraft } from '../../../packages/core/src/contracts/studio.ts';
const base:ClipDraft={projectId:'project',songId:'song',revision:2,clipPrompt:'saved',timingIntent:null};
const state=(prompt='saved'):ClipDraftState=>({base,value:{clipPrompt:prompt,timingIntent:null},conflict:false});
it('receives a newer saved draft only when local work is clean or identical',()=>{
 const newer={...base,revision:3,clipPrompt:'remote'};
 expect(receiveClipDraft(state(),newer)).toMatchObject({base:newer,value:{clipPrompt:'remote'},conflict:false});
 expect(receiveClipDraft(state('local'),newer)).toMatchObject({base:newer,value:{clipPrompt:'local'},conflict:true});
 expect(receiveClipDraft(state('remote'),newer).conflict).toBe(false);
});
it('acknowledges exactly the saved values while preserving typing during the request',()=>{
 const submitted={clipPrompt:'first edit',timingIntent:null};const saved={...base,...submitted,revision:3};
 expect(acknowledgeClipDraft(state('second edit'),submitted,saved)).toMatchObject({base:saved,value:{clipPrompt:'second edit'},conflict:false});
 expect(acknowledgeClipDraft(state('first edit'),submitted,saved).value).toEqual(submitted);
});
it('rejects old and foreign-project observations without overwriting local input',()=>{
 const local=state('local');expect(receiveClipDraft(local,{...base,revision:1})).toBe(local);
 expect(receiveClipDraft(local,{...base,projectId:'other',revision:3})).toBe(local);
 expect(acknowledgeClipDraft({...local,base:{...base,revision:4}},local.value,{...base,revision:3}).base.revision).toBe(4);
});
it('restores dirty recovery state with exact invalid text, but detects newer server conflicts',()=>{
 const value={clipPrompt:'local',timingIntent:{start:{unit:'seconds',value:''},end:{unit:'seconds',value:'12.3456789'}}};
 const raw=JSON.stringify({revision:2,value,conflict:false});
 expect(restoreClipDraft(base,raw)).toMatchObject({value,conflict:false});
 expect(restoreClipDraft({...base,revision:3},raw)).toMatchObject({value,conflict:true});
 expect(restoreClipDraft(base,'broken').value.clipPrompt).toBe('saved');
});
it('recognizes an ambiguous save already committed and preserves explicit conflicts across remounts',()=>{
 const value={clipPrompt:'saved',timingIntent:null};
 expect(restoreClipDraft(base,JSON.stringify({revision:1,value,conflict:false}))).toMatchObject({value,conflict:false});
 expect(restoreClipDraft(base,JSON.stringify({revision:2,value:{...value,clipPrompt:'different'},conflict:true})).conflict).toBe(true);
 expect(clipDraftEqual(value,{...value})).toBe(true);
});
it('compares exact draft fields independently of JSON object key order',()=>{
 const timing={start:{unit:'seconds' as const,value:'0.0'},end:{unit:'rational' as const,value:{numerator:'1',denominator:'3'}}};
 const reordered={end:{value:{denominator:'3',numerator:'1'},unit:'rational' as const},start:{value:'0.0',unit:'seconds' as const}};
 const local={clipPrompt:'local',timingIntent:timing},saved={...base,revision:3,clipPrompt:'local',timingIntent:reordered};
 expect(clipDraftEqual(local,{clipPrompt:'local',timingIntent:reordered})).toBe(true);
 expect(receiveClipDraft({...state(),value:local},saved)).toMatchObject({value:local,conflict:false});
 expect(restoreClipDraft(saved,JSON.stringify({revision:2,value:local,conflict:false}))).toMatchObject({value:local,conflict:false});
 expect(acknowledgeClipDraft({...state(),value:local},{clipPrompt:'local',timingIntent:reordered},saved)).toMatchObject({base:saved,value:local,conflict:false});
 expect(clipDraftEqual(local,{clipPrompt:'local',timingIntent:{...timing,start:{unit:'seconds',value:'0'}}})).toBe(false);
});
it('restores every bounded rational draft string without dropping its associated prompt',()=>{
 for(const fraction of [{numerator:'',denominator:''},{numerator:'-',denominator:'0'},{numerator:'01',denominator:' 2 '}]){
  const value={clipPrompt:'unsaved idea',timingIntent:{start:{unit:'rational',value:fraction},end:{unit:'frames',value:'49'}}};
  expect(restoreClipDraft(base,JSON.stringify({revision:2,value,conflict:false}))).toMatchObject({value,conflict:false});
 }
});
