import {useEffect,useState} from 'react';
import {request} from './api.ts';
import type {TaskContextPreviews} from '../../../packages/core/src/contracts/task-contexts.ts';
interface Props {data:TaskContextPreviews|null;loading:boolean;error:string|null;onRefresh:()=>void}
export function TaskContextsPanel({data,loading,error,onRefresh}:Props){return <section className="task-context-settings" aria-label="Generation task contexts">
 <div className="video-section-heading"><h2>Task contexts</h2><button type="button" className="button secondary small" disabled={loading} onClick={onRefresh}>Refresh task contexts</button></div>
 <p className="small-copy">Current, read-only text inserted at <code>{'{{task_context}}'}</code>, built from the same instructions and guidance files as new generation tasks. Named placeholders stand for each task’s inputs, paths, seeds and timing; these previews are not historical task captures. Edit the templates above for additional direction.</p>
 {loading&&<p role="status">Loading task contexts…</p>}{error&&<p role="alert" className="error-copy">{error}</p>}
 {data?.contexts.map(context=><details className="task-context-detail" key={context.id}><summary>{context.title}{context.error?' · incomplete':''}</summary>
  {context.error&&<p role="alert" className="error-copy">{context.error}</p>}
  <p className="small-copy">Context SHA256: <code>{context.sha256}</code></p>
  <textarea aria-label={`${context.title} text`} readOnly spellCheck={false} rows={18} value={context.text}/>
  <ul className="context-sources" aria-label={`${context.title} sources`}>{context.sources.map(source=><li key={source.sourcePath}>{source.sourcePath.startsWith('https://')?<a href={source.sourcePath} target="_blank" rel="noreferrer">{source.name}</a>:<code>{source.sourcePath}</code>} <span title={`SHA256 ${source.sha256}`}>{source.sha256.slice(0,12)}</span></li>)}</ul>
 </details>)}
 </section>;}
export function TaskContextSettings(){
 const[data,setData]=useState<TaskContextPreviews|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setData(null);setError(null);
  void request<TaskContextPreviews>('/api/config/task-contexts').then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to read task contexts.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[revision]);
 return <TaskContextsPanel data={data} loading={loading} error={error} onRefresh={()=>setRevision(n=>n+1)}/>;
}
