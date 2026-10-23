import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {DebugDisclosure,debugCanConfirm} from './DebugControl.tsx';
import type {DebugRecord} from '../../../packages/core/src/contracts/debug.ts';
const record={id:'record',tool:'analysis',state:'disclosed',plan:{summary:'Repair analysis',warning:'Full access outside the working directory.',provider:'codex',model:'model',expiresAt:'2026-10-23T02:10:00Z',digest:'a'.repeat(64),readableCommand:'/exact/node /exact/cli',prelaunchActions:['Create working folder'],launch:{cwd:'/runtime/tools/analysis',stdin:'EXACT PROMPT\n<not markup>',executable:'/exact/node',argv:['/exact/cli'],shell:false}}} as DebugRecord;
test('confirmation requires the exact disclosed unexpired plan, never a running or terminal repair',()=>{
 expect(debugCanConfirm(record,Date.parse('2026-10-23T02:00:00Z'))).toBe(true);
 expect(debugCanConfirm(record,Date.parse('2026-10-23T02:10:00Z'))).toBe(false);
 for(const state of ['cancelled','expired','stale','confirmed','running','checking','succeeded','failed','reconciling'] as const)expect(debugCanConfirm({...record,state},0)).toBe(false);
 expect(debugCanConfirm({...record,plan:{...record.plan,expiresAt:'bad'}},0)).toBe(false);
});
test('disclosure renders summary, full prompt, exact command, provider, cwd and preparatory changes as text',()=>{
 const html=renderToStaticMarkup(createElement(DebugDisclosure,{record}));
 for(const text of ['Repair analysis','Full access outside','EXACT PROMPT','&lt;not markup&gt;','/exact/node /exact/cli','/runtime/tools/analysis','codex','model','Create working folder','Complete prompt'])expect(html).toContain(text);
 expect(html).not.toContain('<not markup>');expect(html).not.toContain('<iframe');
});
