import {useEffect,useRef,useState} from 'react';
import {request} from './api.ts';
import {promptTemplateError,PROMPT_TEMPLATE_MAX_LENGTH,type AgentPromptTemplates,type PromptTemplateSettings as Settings} from '../../../packages/core/src/contracts/prompt-templates.ts';

interface EditorProps {
 value:AgentPromptTemplates;busy:boolean;dirty:boolean;error:string|null;status:string|null;
 onChange:(value:AgentPromptTemplates)=>void;onSave:()=>void;onDefaults:()=>void;onReload:()=>void;
}
export function PromptTemplateEditor({value,busy,dirty,error,status,onChange,onSave,onDefaults,onReload}:EditorProps){
 const validation=(['music','video'] as const).map(kind=>{const problem=promptTemplateError(value[kind]);return problem?`${kind==='music'?'Music':'Video'}: ${problem}`:null;}).filter(Boolean);
 return <section className="prompt-template-settings" aria-label="Agent prompt templates">
  <h2>Agent prompt templates</h2>
  <p className="small-copy">Shared across projects. Queued and running requests keep their captured instructions; retries keep the original template. Saving changes affects new generations only.</p>
  <p className="small-copy">Keep <code>{'{{task_context}}'}</code> once in each template. It inserts the captured user inputs, exact timing/seeds, tool commands and usage guidance. Everything around it is editable agent instruction.</p>
  <form onSubmit={event=>{event.preventDefault();if(!busy&&dirty&&!validation.length)onSave();}}>
   <fieldset disabled={busy}>
    {(['music','video'] as const).map(kind=><div className="prompt-template-field" key={kind}>
     <label htmlFor={`agent-template-${kind}`}>{kind==='music'?'Music':'Video'} agent template</label>
     <textarea id={`agent-template-${kind}`} rows={12} spellCheck={false} maxLength={PROMPT_TEMPLATE_MAX_LENGTH} value={value[kind]} onChange={event=>onChange({...value,[kind]:event.target.value})}/>
    </div>)}
   </fieldset>
   {validation.map(problem=><p className="error-copy" key={problem}>{problem}</p>)}
   {error&&<p role="alert" className="error-copy">{error} Your edits remain in the fields above.</p>}
   {status&&<p role="status" className="small-copy">{status}</p>}
   <div className="row-actions">
    <button className="button primary" disabled={busy||!dirty||validation.length>0}>Save templates</button>
    <button className="button secondary" type="button" disabled={busy} onClick={onDefaults} title="Load the original templates into these fields. Save to apply them.">Use defaults</button>
    <button className="button secondary small" type="button" disabled={busy} onClick={onReload}>{dirty?'Reload saved templates (discard edits)':'Reload saved templates'}</button>
   </div>
  </form>
 </section>;
}

export function PromptTemplateSettings(){
 const[saved,setSaved]=useState<Settings|null>(null),[defaults,setDefaults]=useState<AgentPromptTemplates|null>(null),[value,setValue]=useState<AgentPromptTemplates|null>(null);
 const[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[status,setStatus]=useState<string|null>(null);
 const mounted=useRef(false),flight=useRef(false);
 const read=async()=>{
  if(flight.current)return;flight.current=true;setBusy(true);setError(null);
  try{const result=await request<{current:Settings;defaults:AgentPromptTemplates}>('/api/config/prompt-templates');if(mounted.current){setSaved(result.current);setDefaults(result.defaults);setValue({music:result.current.music,video:result.current.video});setStatus(null);}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Unable to load prompt templates.');}
  finally{flight.current=false;if(mounted.current)setBusy(false);}
 };
 useEffect(()=>{mounted.current=true;void read();return()=>{mounted.current=false;};},[]);
 const dirty=!!value&&!!saved&&(value.music!==saved.music||value.video!==saved.video);
 useEffect(()=>{
  if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 const save=async()=>{
  if(!value||!saved||flight.current)return;flight.current=true;setBusy(true);setError(null);setStatus(null);
  try{const next=await request<Settings>('/api/config/prompt-templates',{revision:saved.revision,templates:value},'PUT');if(mounted.current){setSaved(next);setValue({music:next.music,video:next.video});setStatus('Templates saved. New generations will use these instructions.');}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Unable to save prompt templates.');}
  finally{flight.current=false;if(mounted.current)setBusy(false);}
 };
 if(!value||!defaults)return <section className="prompt-template-settings" aria-label="Agent prompt templates"><h2>Agent prompt templates</h2>{error?<><p role="alert" className="error-copy">{error}</p><button className="button secondary" disabled={busy} onClick={()=>void read()}>Retry loading templates</button></>:<p role="status">Loading templates…</p>}</section>;
 return <PromptTemplateEditor value={value} busy={busy} dirty={dirty} error={error} status={status} onChange={next=>{setValue(next);setStatus(null);}} onSave={()=>void save()} onReload={()=>void read()} onDefaults={()=>{setValue({...defaults});setError(null);setStatus('Defaults loaded into the editor. Save templates to apply them.');}}/>;
}
