import {useEffect,useRef,useState} from 'react';
import type {DebugRecord} from '../../../packages/core/src/contracts/debug.ts';
import type {ToolStatus} from '../../../packages/core/src/contracts/studio.ts';
import type {useStudio} from './useStudio.ts';
import {request} from './api.ts';
import './debug.css';
export const debugCanConfirm=(record:DebugRecord,now:number)=>record.state==='disclosed'&&Date.parse(record.plan.expiresAt)>now;
export function DebugDisclosure({record}:{record:DebugRecord}){
 const p=record.plan;
 return <><p>{p.summary}</p><p className="debug-warning" role="note">{p.warning}</p><dl className="provenance"><div><dt>Provider / model</dt><dd>{p.provider} / {p.model}</dd></div><div><dt>Working directory</dt><dd><code>{p.launch.cwd}</code></dd></div><div><dt>Consent expires</dt><dd>{p.expiresAt}</dd></div></dl>
  <details><summary>Complete prompt, command and preparation</summary><h4>Exact command</h4><pre>{p.readableCommand}</pre><h4>Exact prompt sent on standard input</h4><pre>{p.launch.stdin}</pre><h4>Preparation before launch</h4><ul>{p.prelaunchActions.map((step,i)=><li key={i}>{step}</li>)}</ul><h4>Structured launch record (not an agent response constraint)</h4><pre>{JSON.stringify(p.launch,null,2)}</pre><p className="micro">DISCLOSURE SHA256 / {p.digest}</p></details></>;
}
const active=(r:DebugRecord)=>['confirmed','running','checking','reconciling'].includes(r.state);
export function DebugControl({tool,studio,onOpenChange}:{tool:ToolStatus;studio:ReturnType<typeof useStudio>;onOpenChange?:((tool:ToolStatus['id'],open:boolean)=>void)|undefined}){
 const [records,setRecords]=useState<DebugRecord[]>([]),[record,setRecord]=useState<DebugRecord|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[now,setNow]=useState(Date.now);
 useEffect(()=>{onOpenChange?.(tool.id,record!==null);return()=>onOpenChange?.(tool.id,false);},[tool.id,record?.id,onOpenChange]);
 const dialog=useRef<HTMLDialogElement>(null),flight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;let ended=false,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const rows=await request<DebugRecord[]>('/api/debug');if(ended)return;const own=rows.filter(r=>r.tool===tool.id).reverse();setRecords(own);setRecord(previous=>previous?own.find(r=>r.id===previous.id)??previous:null);}catch{/* The main studio connection notice handles offline state. */}finally{if(!ended)timer=setTimeout(()=>void poll(),2000);}};void poll();return()=>{ended=true;mounted.current=false;clearTimeout(timer);};},[tool.id]);
 useEffect(()=>{if(!record)return;dialog.current?.showModal();const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[record?.id]);
 const execute=async(work:()=>Promise<void>)=>{if(flight.current)return;flight.current=true;setBusy(true);setError(null);try{await work();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Debug request failed. No automatic retry was made.');}finally{flight.current=false;if(mounted.current)setBusy(false);}};
 const prepare=()=>execute(async()=>{const next=await request<DebugRecord>(`/api/setup/${tool.id}/debug`,{});if(mounted.current){setRecord(next);setNow(Date.now());setRecords(rows=>[next,...rows]);}});
 const close=()=>execute(async()=>{if(record?.state==='disclosed'){await request(`/api/debug/${record.id}/cancel`,{});}dialog.current?.close();setRecord(null);});
 const confirm=()=>execute(async()=>{if(!record||!debugCanConfirm(record,Date.now()))throw new Error('This disclosure has expired. Request a new plan and review it before confirming.');const next=await request<DebugRecord>(`/api/debug/${record.id}/confirm`,{digest:record.plan.digest});if(mounted.current)setRecord(next);await studio.refresh().catch(()=>{});});
 return <div className="debug-control">
  {['error','missing'].includes(tool.state)&&<button type="button" className="button secondary small" disabled={busy||studio.busy||tool.active} onClick={()=>void prepare()}>Debug with agent…</button>}
  {error&&!record&&<p className="error-copy" role="alert">{error}</p>}
  {!!records.length&&<details className="debug-history"><summary>Setup repair record ({records.length})</summary>{records.slice(0,10).map(r=><button type="button" key={r.id} className="button secondary small" onClick={()=>{setError(null);setRecord(r);}}>{r.state.replaceAll('_',' ')} · {new Date(r.createdAt).toLocaleString()}</button>)}</details>}
  {record&&<dialog className="debug-dialog" ref={dialog} aria-labelledby={`debug-title-${tool.id}`} onCancel={e=>{e.preventDefault();if(!busy)void close();}}><div className="debug-heading"><div><span className="eyebrow">SHARED TOOL REPAIR / {record.state.toUpperCase()}</span><h2 id={`debug-title-${tool.id}`}>Debug {tool.label}</h2></div><button className="icon-button" disabled={busy} aria-label="Close Debug dialog" onClick={()=>void close()}>×</button></div>
   <DebugDisclosure record={record}/>
   {error&&<p className="error-copy" role="alert">{error} Check the recorded status before taking further action; a lost response does not prove no launch occurred.</p>}
   {record.error&&<p className="error-copy">{record.error}</p>}
   {active(record)&&<p className="debug-warning" role="status">{record.state==='reconciling'?'Repair ownership needs review. Shared work remains blocked; nothing will be silently replayed.':'The confirmed repair is running on the server. New shared work is held until independent checks finish. Closing this view does not stop it.'}</p>}
   {record.outcome&&<section aria-label="Debug outcome"><h3>Repair report and independent check</h3><p>{record.outcome.readiness?.detail??'No independent readiness result recorded.'}</p><p className="small-copy muted">{record.outcome.boundary}</p><details open><summary>Agent report</summary><pre>{record.outcome.provider?.report||'No provider report available.'}{record.outcome.provider?.reportTruncated?'\n[Report truncated; full evidence retained on server.]':''}</pre></details></section>}
   {record.state==='disclosed'&&!debugCanConfirm(record,now)&&<p className="warning">This disclosure has expired. Close it and request a fresh plan.</p>}
   <div className="row-actions debug-actions"><button type="button" className="button secondary" autoFocus disabled={busy} onClick={()=>void close()}>{record.state==='disclosed'?'Cancel — do not launch':'Close record'}</button>{record.state==='disclosed'&&<button type="button" className="button primary" disabled={busy||!debugCanConfirm(record,now)} onClick={()=>void confirm()}>Confirm full-access repair</button>}</div>
  </dialog>}
 </div>;
}
