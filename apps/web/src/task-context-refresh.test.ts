import {expect,test} from 'vitest';
import {ContextRefreshGate,mergeTaskContextRead,taskContextSetupKey} from './task-context-refresh.ts';
import type {ToolStatus} from '../../../packages/core/src/contracts/studio.ts';
import type {TaskContextConfiguration} from '../../../packages/core/src/contracts/task-contexts.ts';
const config=(revision=0,ready=false):TaskContextConfiguration=>({settings:{revision,overrides:{music:null,'video-text':null,'video-image':null}},contexts:[{id:'video-text',title:'Video',text:ready?'complete pinned guide':'incomplete',sha256:'a'.repeat(64),sources:[],error:ready?null:'not installed'}]});
const tool=(id:ToolStatus['id'],patch:Partial<ToolStatus>={}):ToolStatus=>({id,label:id,state:'ready',installed:true,active:false,queued:0,jobId:null,checkedAt:null,log:'',detail:'',...patch});
test('setup transition invalidates mounted defaults without ordinary activity/log polling churn',()=>{
 const before=[tool('agent'),tool('yue2'),tool('comfyui'),tool('h3',{state:'installing',installed:false,jobId:'one'})];
 const after=before.map(t=>t.id==='h3'?{...t,state:'ready' as const,installed:true}:t);
 expect(taskContextSetupKey(before)).not.toBe(taskContextSetupKey(after));
 expect(taskContextSetupKey(after)).toBe(taskContextSetupKey(after.map(t=>({...t,active:true,queued:2,log:'new progress',checkedAt:'later',detail:'Idle'})).reverse()));
 expect(taskContextSetupKey(after)).not.toBe(taskContextSetupKey(after.map(t=>t.id==='h3'?{...t,jobId:'two'}:t)));
 expect(taskContextSetupKey(after)).toBe(taskContextSetupKey(after.map(t=>t.id==='agent'?{...t,state:'checking',installed:false}:t)));
});
test('automatic read replaces stale unavailable defaults and accepts current saved settings when clean',()=>{
 const old=config(),incoming=config(1,true);incoming.settings.overrides.music='Saved guide';
 const state={data:old,value:{...old.settings.overrides}};const result=mergeTaskContextRead(state,incoming,true);
 expect(result.data).toEqual(incoming);expect(result.value).toEqual(incoming.settings.overrides);expect(old.contexts[0]!.error).toBe('not installed');
 expect(mergeTaskContextRead({data:null,value:null},incoming,true)).toEqual(result);
});
test('automatic response preserves edits made before or during the request and the old CAS baseline',()=>{
 const old=config(3),incoming=config(4,true),value={...old.settings.overrides,'video-text':'UNSAVED user guide'};
 const result=mergeTaskContextRead({data:old,value},incoming,true);
 expect(result.value).toEqual(value);expect(result.data!.settings).toEqual(old.settings);expect(result.data!.contexts[0]!.error).toBeNull();expect(result.data!.contexts[0]!.text).toBe('complete pinned guide');
 expect(old.contexts[0]!.error).toBe('not installed');expect(incoming.settings.revision).toBe(4);
});
test('reset-to-default draft stays null and does not become an implicit saved override',()=>{
 const old=config(3);old.settings.overrides['video-text']='saved custom';const value={...old.settings.overrides,'video-text':null};
 const result=mergeTaskContextRead({data:old,value},config(4,true),true);
 expect(result.value!['video-text']).toBeNull();expect(result.data!.settings.revision).toBe(3);expect(result.data!.settings.overrides['video-text']).toBe('saved custom');
});
test('explicit Reload discards context drafts and loads current revision',()=>{
 const old=config(3),incoming=config(4,true);const result=mergeTaskContextRead({data:old,value:{...old.settings.overrides,music:'unsaved'}},incoming,false);
 expect(result.data).toEqual(incoming);expect(result.value).toEqual(incoming.settings.overrides);
});
test('setup changes during read or save coalesce into one follow-up refresh, without concurrent calls',()=>{
 const gate=new ContextRefreshGate();expect(gate.begin()).toBe(true);
 expect(gate.begin(true)).toBe(false);expect(gate.begin(true)).toBe(false);expect(gate.begin()).toBe(false);
 expect(gate.end()).toBe(true);expect(gate.begin()).toBe(true);expect(gate.end()).toBe(false);
 expect(gate.begin(true)).toBe(true);expect(gate.end()).toBe(false);
});
