import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test,vi} from 'vitest';
import {TaskContextsPanel,taskContextsDirty} from './TaskContextSettings.tsx';
import {DEFAULT_TASK_CONTEXT_OVERRIDES} from '../../../packages/core/src/contracts/task-contexts.ts';
const data={settings:{revision:3,overrides:{...DEFAULT_TASK_CONTEXT_OVERRIDES}},contexts:[{id:'music' as const,title:'Music task context',text:'COMPLETE MUSIC {{music_description}} <script>not HTML</script>',sha256:'a'.repeat(64),sources:[{name:'music.md',sourcePath:'integrations/knowledge/music.md',sha256:'b'.repeat(64)}],error:null},{id:'video-text' as const,title:'Video task context — T2VA',text:'COMPLETE VIDEO AND GUIDE',sha256:'c'.repeat(64),sources:[],error:'H3 prompt guides unavailable'}]};
const props=()=>({data,value:{...DEFAULT_TASK_CONTEXT_OVERRIDES},loading:false,saving:false,error:null,status:null,onChange:vi.fn(),onSave:vi.fn(),onReload:vi.fn()});
test('contexts are editable with save/reset and honest default-versus-custom provenance',()=>{
 const html=renderToStaticMarkup(createElement(TaskContextsPanel,{...props(),value:{...DEFAULT_TASK_CONTEXT_OVERRIDES,music:'CUSTOM {{music_description}} <script>not HTML</script>'}}));
 for(const text of ['Music task context','Video task context','CUSTOM','{{music_description}}','placeholders','historical','Default reference sources','H3 prompt guides unavailable','Save contexts','Use default','Retry/Restart','user-provided'])expect(html).toContain(text);
 expect(html).not.toContain('readOnly');expect(html).not.toContain('<script>');expect(html).toContain('Reload saved contexts (discard edits)');
 expect(html).toMatch(/<button type="submit" class="button primary">Save contexts/);
});
test('loading/fetch failures keep a reload, and invalid placeholders or unchanged settings block Save',()=>{
 expect(renderToStaticMarkup(createElement(TaskContextsPanel,{...props(),data:null,value:null,loading:true}))).toContain('Loading task contexts');
 const html=renderToStaticMarkup(createElement(TaskContextsPanel,{...props(),error:'Conflict',value:{...DEFAULT_TASK_CONTEXT_OVERRIDES,music:'{{typo}}'}}));expect(html).toContain('Conflict');expect(html).toContain('Unknown music placeholder');expect(html).toContain('edits are retained');expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save contexts/);
 expect(taskContextsDirty(data,{...DEFAULT_TASK_CONTEXT_OVERRIDES})).toBe(false);expect(taskContextsDirty(data,{...DEFAULT_TASK_CONTEXT_OVERRIDES,music:data.contexts[0]!.text})).toBe(true);
});
test('custom context remains editable and saveable when default guide files are missing',()=>{
 const html=renderToStaticMarkup(createElement(TaskContextsPanel,{...props(),value:{...DEFAULT_TASK_CONTEXT_OVERRIDES,'video-text':'My replacement guide'}}));
 expect(html).toContain('Your custom context remains usable');expect(html).toContain('My replacement guide');expect(html).toMatch(/<button type="submit" class="button primary">Save contexts/);
});
