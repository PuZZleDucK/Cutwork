import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {PromptTemplateEditor} from './PromptTemplateSettings.tsx';
import {DEFAULT_AGENT_TEMPLATES} from '../../../packages/core/src/contracts/prompt-templates.ts';

test('Config exposes both actual template editors, explicit save/defaults, and request capture behavior',()=>{
 const html=renderToStaticMarkup(createElement(PromptTemplateEditor,{value:{music:'MUSIC CUSTOM {{task_context}}',video:'VIDEO CUSTOM {{task_context}}'},busy:false,dirty:true,error:null,status:null,onChange:()=>{},onSave:()=>{},onDefaults:()=>{},onReload:()=>{}}));
 expect(html).toContain('MUSIC CUSTOM');expect(html).toContain('VIDEO CUSTOM');
 expect(html).toContain('Music agent template');expect(html).toContain('Video agent template');expect(html).toContain('Save templates');
 expect(html).toContain('Use defaults');expect(html).toContain('Queued and running requests');expect(html).toContain('{{task_context}}');
 expect(html).not.toMatch(/<details/);
 expect(html).toContain('editable templates, not the complete task prompts');
 expect(html).toContain('H3 directing guidance');expect(html).toContain('pinned official base guide');
 expect(html).toContain('does not replace your saved templates or historical task captures');
});
test('invalid template blocks Save and exposes corrective information without losing draft text',()=>{
 const html=renderToStaticMarkup(createElement(PromptTemplateEditor,{value:{...DEFAULT_AGENT_TEMPLATES,music:'KEEP MY INCOMPLETE EDIT'},busy:false,dirty:true,error:null,status:null,onChange:()=>{},onSave:()=>{},onDefaults:()=>{},onReload:()=>{}}));
 expect(html).toContain('KEEP MY INCOMPLETE EDIT');expect(html).toContain('exactly once');expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save templates/);
});
