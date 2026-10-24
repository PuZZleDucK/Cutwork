import {useEffect,useRef,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
export type WorkspacePanel='generate'|'archive'|'history';
export const workspacePanels:WorkspacePanel[]=['generate','archive','history'];
type WorkspaceCounts={music:number;video:number;archive:number;history:number};
export function WorkspaceNavigation({panel,onSelect,counts}:{panel:WorkspacePanel;onSelect:(panel:WorkspacePanel)=>void;counts:WorkspaceCounts}){
 const guidance=counts.music===0?'Start here: generate your soundtrack':counts.video===0?'Next: generate your first video clip':undefined;
 return <div className="workspace-tabs" role="tablist" aria-label="Project workspace">{workspacePanels.map((key,index)=><button type="button" role="tab" id={`workspace-tab-${key}`} className={key==='generate'&&guidance?'needs-attention':undefined} title={key==='generate'?guidance:undefined} aria-selected={panel===key} aria-controls={`workspace-pane-${key}`} tabIndex={panel===key?0:-1} key={key} onClick={()=>onSelect(key)} onKeyDown={event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const length=workspacePanels.length;
  const next=event.key==='ArrowRight'?workspacePanels[(index+1)%length]:event.key==='ArrowLeft'?workspacePanels[(index+length-1)%length]:event.key==='Home'?'generate':event.key==='End'?'history':null;
  if(next){event.preventDefault();onSelect(next);document.getElementById(`workspace-tab-${next}`)?.focus();}
 }}>{key==='generate'?'Generate':key==='archive'?'Archive':'History'} <span>{key==='generate'?counts.music+counts.video:counts[key]}</span></button>)}</div>;
}
/** Keep unsaved input state mounted; hidden editors cannot receive keyboard focus. */
export function WorkspacePane({name,active,children}:{name:WorkspacePanel;active:WorkspacePanel;children:ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(active!==name)root.current?.querySelectorAll('video,audio').forEach(element=>(element as HTMLMediaElement).pause());},[active,name]);
 return <div ref={root} id={`workspace-pane-${name}`} role="tabpanel" aria-labelledby={`workspace-tab-${name}`} hidden={active!==name} className={`workspace-pane pane-${name}`}>{children}</div>;
}
export function openWorkspaceInput(panel:WorkspacePanel,onSelect:((panel:WorkspacePanel)=>void)|undefined,id:string){
 if(onSelect)flushSync(()=>onSelect(panel));
 requestAnimationFrame(()=>{
  const input=document.getElementById(id);if(!input||input.matches(':disabled')||input.closest('[hidden]'))return;
  input.focus({preventScroll:true});input.scrollIntoView({block:'nearest',behavior:'auto'});
 });
}
