import {useEffect,useRef,useState} from 'react';
import {request} from './api.ts';
import {TASK_CONTEXT_IDS,TASK_CONTEXT_FIELDS,TASK_CONTEXT_MAX_LENGTH,taskContextError,type TaskContextConfiguration,type TaskContextOverrides,type TaskContextSettings as Settings} from '../../../packages/core/src/contracts/task-contexts.ts';
interface Props {data:TaskContextConfiguration|null;value:TaskContextOverrides|null;loading:boolean;saving:boolean;error:string|null;status:string|null;onChange:(value:TaskContextOverrides)=>void;onSave:()=>void;onReload:()=>void}
export function taskContextsDirty(data:TaskContextConfiguration|null,value:TaskContextOverrides|null){return !!data&&!!value&&TASK_CONTEXT_IDS.some(id=>data.settings.overrides[id]!==value[id]);}
export function TaskContextsPanel({data,value,loading,saving,error,status,onChange,onSave,onReload}:Props){
 const dirty=taskContextsDirty(data,value),busy=loading||saving,invalid=!!value&&TASK_CONTEXT_IDS.some(id=>taskContextError(id,value[id]));
 return <section className="task-context-settings" aria-label="Generation task contexts">
 <div className="video-section-heading"><h2>Task contexts</h2><button type="button" className="button secondary small" disabled={busy} onClick={onReload}>{dirty?'Reload saved contexts (discard edits)':'Reload saved contexts'}</button></div>
 <p className="small-copy">Edit the complete text inserted at <code>{'{{task_context}}'}</code>, including prompting guides. Shared across projects; Save affects new requests only. Queued work and Retry/Restart keep their captured context. Use default restores the bundled context after saving.</p>
 <p className="small-copy">Named placeholders insert captured inputs, paths, seeds and timing. They are optional, but removing operational instructions can break generation. Changing these texts does not replace installed execution adapters. These editors are not historical task captures.</p>
 {loading&&<p role="status">Loading task contexts…</p>}{error&&<p role="alert" className="error-copy">{error} Your existing context edits are retained.</p>}{status&&<p role="status" className="small-copy">{status}</p>}
 {data&&value&&<form onSubmit={e=>{e.preventDefault();if(!busy&&dirty&&!invalid)onSave();}}>
 <p className="small-copy">Saved context revision {data.settings.revision}</p>
 {data.contexts.map(context=>{const id=context.id,custom=value[id]!==null,text=value[id]??context.text,validation=taskContextError(id,value[id]);return <details className="task-context-detail" key={id}><summary>{context.title} · {custom?'custom':context.error?'default incomplete':'default'}</summary>
  {context.error&&<p role="status" className="warning">Default reference unavailable: {context.error}{custom?' Your custom context remains usable.':''}</p>}
  <textarea aria-label={`${context.title} text`} spellCheck={false} rows={18} maxLength={TASK_CONTEXT_MAX_LENGTH} disabled={busy} value={text} onChange={e=>onChange({...value,[id]:e.target.value})}/>
  {validation&&<p role="alert" className="error-copy">{validation}</p>}
  <div className="row-actions"><button type="button" className="button secondary small" aria-label={`Use default ${context.title.toLowerCase()}`} disabled={busy||!custom} onClick={()=>onChange({...value,[id]:null})}>Use default</button><span className="small-copy">{custom?'Custom text replaces the whole context; embedded citations/hashes are user-provided.':'Using bundled guidance. Editing creates a saved override.'}</span></div>
  <details className="context-variables"><summary>Available placeholders</summary><p className="small-copy">Use exact names. Use single braces for literal text; inserted user text is never expanded again.</p><p>{TASK_CONTEXT_FIELDS[id].map(name=><code key={name}>{`{{${name}}} `}</code>)}</p></details>
  <details><summary>Default reference sources</summary><p className="small-copy">Default SHA256: <code>{context.sha256}</code>. These identify the bundled reference, not edited text.</p><ul className="context-sources">{context.sources.map(source=><li key={source.sourcePath}>{source.sourcePath.startsWith('https://')?<a href={source.sourcePath} target="_blank" rel="noreferrer">{source.name}</a>:<code>{source.sourcePath}</code>} <span title={`SHA256 ${source.sha256}`}>{source.sha256.slice(0,12)}</span></li>)}</ul></details>
 </details>;})}
 <div className="row-actions"><button type="submit" className="button primary" disabled={busy||!dirty||!!invalid}>{saving?'Saving contexts…':'Save contexts'}</button></div>
 </form>}
 </section>;
}
export function TaskContextSettings(){
 const[data,setData]=useState<TaskContextConfiguration|null>(null),[value,setValue]=useState<TaskContextOverrides|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[status,setStatus]=useState<string|null>(null);
 const mounted=useRef(false),flight=useRef(false);
 const read=async()=>{if(flight.current)return;flight.current=true;setLoading(true);setError(null);setStatus(null);
  try{const result=await request<TaskContextConfiguration>('/api/config/task-contexts');if(!result.settings)throw new Error('The server does not yet support editable task contexts.');if(mounted.current){setData(result);setValue({...result.settings.overrides});}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Unable to read task contexts.');}
  finally{flight.current=false;if(mounted.current)setLoading(false);}
 };
 useEffect(()=>{mounted.current=true;void read();return()=>{mounted.current=false;};},[]);
 const dirty=taskContextsDirty(data,value);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const save=async()=>{if(!data||!value||flight.current)return;flight.current=true;setSaving(true);setError(null);setStatus(null);
  try{const settings=await request<Settings>('/api/config/task-contexts',{revision:data.settings.revision,overrides:value},'PUT');if(mounted.current){setData({...data,settings});setValue({...settings.overrides});setStatus('Task contexts saved. New requests use these instructions.');}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Unable to save task contexts.');}
  finally{flight.current=false;if(mounted.current)setSaving(false);}
 };
 return <TaskContextsPanel data={data} value={value} loading={loading} saving={saving} error={error} status={status} onChange={next=>{setValue(next);setStatus(null);}} onSave={()=>void save()} onReload={()=>void read()}/>;
}
