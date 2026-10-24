import {expect,test,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ToolId,ToolStatus} from '../../../packages/core/src/contracts/studio.ts';
const {state}=vi.hoisted(()=>({state:{current:null as any}}));
vi.mock('./useStudio.ts',()=>({useStudio:()=>state.current}));
vi.mock('./DebugControl.tsx',()=>({DebugControl:()=>null}));
vi.mock('./PromptTemplateSettings.tsx',()=>({PromptTemplateSettings:()=>null}));
import {App} from './App.tsx';
const ids:ToolId[]=['agent','yue2','comfyui','h3','analysis'];
function render(states:Partial<Record<ToolId,ToolStatus['state']>>={},signedIn=true){
 const tools=ids.map(id=>({id,label:id,installed:states[id]==='ready'||states[id]==='checking',state:states[id]??'missing',detail:'Fixture',active:false,queued:0,log:'',jobId:null,checkedAt:null}));
 const agent=tools[0]!;
 state.current={overview:{projects:[],selectedProjectId:null,tools,provider:{provider:'codex',model:'test',installed:agent.installed,auth:signedIn?'signed-in':'sign-in-required',detail:'Fixture'},warnings:[]},snapshot:null,busy:false,connection:null};
 return renderToStaticMarkup(createElement(App));
}
function indicators(html:string){return html.split('aria-label="Shared tool status"')[1]!.split('</header>')[0]!;}
function panel(html:string,id:ToolId){return html.match(new RegExp(`<(?:article|section)[^>]*data-setup-tool="${id}"[^>]*>`))?.[0];}
function indicator(html:string,id:ToolId){return indicators(html).match(new RegExp(`<button[^>]*data-tool="${id}"[^>]*>`))?.[0];}
const ready=Object.fromEntries(ids.map(id=>[id,'ready'])) as Record<ToolId,ToolStatus['state']>;
test('all tool indicators and every setup panel exist before installation',()=>{
 const html=render({},false);
 for(const id of ids){expect(panel(html,id)).toContain('setup-todo');expect(indicator(html,id)).toContain('disabled=""');}
 expect(html).not.toContain('setup-installing');expect(indicators(html)).not.toContain('Idle');
});
test('completed steps stay in the shared setup row while later tools are pending',()=>{
 const html=render({agent:'ready',yue2:'ready',comfyui:'installing',h3:'queued',analysis:'missing'});
 for(const id of ids)expect(panel(html,id)).toBeDefined();
 for(const id of ['agent','yue2'] as const){expect(panel(html,id)).not.toContain('setup-todo');expect(indicator(html,id)).not.toContain('disabled');}
 expect(panel(html,'comfyui')).toContain('setup-installing');expect(indicator(html,'comfyui')).toContain('setup-installing');
 for(const id of ['h3','analysis'] as const){expect(panel(html,id)).toContain('setup-todo');expect(panel(html,id)).not.toContain('setup-installing');}
 expect(html).not.toContain('retiring');
});
test.each(['queued','checking','error','reconciling'] as const)('%s does not animate hazard stripes or dismiss completed panels',status=>{
 const html=render({...ready,h3:status});for(const id of ids)expect(panel(html,id)).toBeDefined();
 expect(panel(html,'h3')).toContain('setup-todo');expect(html).not.toContain('setup-installing');
});
test('provider installation is the only animated step while the others wait',()=>{
 const html=render({agent:'installing',yue2:'queued',comfyui:'queued',h3:'queued',analysis:'queued'},false);
 expect(panel(html,'agent')).toContain('setup-installing');expect(indicator(html,'agent')).toContain('setup-installing');
 expect(html.match(/setup-installing/g)).toHaveLength(2);
});
test('all-ready clears the complete setup area together but keeps every enabled indicator',()=>{
 const html=render(ready);expect(html).not.toContain('aria-label="Shared tool setup"');
 for(const id of ids){expect(indicator(html,id)).toBeDefined();expect(indicator(html,id)).not.toContain('disabled');}
});
test('installed provider still needing sign-in keeps the complete setup row available',()=>{
 const html=render(ready,false);for(const id of ids)expect(panel(html,id)).toBeDefined();
 expect(panel(html,'agent')).toContain('setup-todo');expect(indicator(html,'agent')).not.toContain('disabled');
});
