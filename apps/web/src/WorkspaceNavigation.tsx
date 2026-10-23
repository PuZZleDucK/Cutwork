import {useEffect,useRef,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {formatDuration} from './studio-state.ts';
import type {StudioSong} from '../../../packages/core/src/contracts/studio.ts';
export function soundtrackOption(song:StudioSong){const title=Array.from(song.title);return `${formatDuration(song.durationSeconds)} · ${song.analysis.estimatedBpm?.toFixed(1)??'—'} BPM · ${title.length>80?title.slice(0,79).join('')+'…':song.title}`;}
export type WorkspacePanel='music'|'video'|'archive'|'history';
export const workspacePanels:WorkspacePanel[]=['music','video','archive','history'];
export function WorkspaceNavigation({panel,onSelect,counts}:{panel:WorkspacePanel;onSelect:(panel:WorkspacePanel)=>void;counts:Record<WorkspacePanel,number>}){
 return <div className="workspace-tabs" role="tablist" aria-label="Project workspace">{workspacePanels.map((key,index)=><button type="button" role="tab" id={`workspace-tab-${key}`} className={(key==='music'&&counts.music===0)||(key==='video'&&counts.music>0&&counts.video===0)?'needs-attention':undefined} title={key==='music'&&counts.music===0?'Start here: generate your soundtrack':key==='video'&&counts.music>0&&counts.video===0?'Next: generate your first video clip':undefined} aria-selected={panel===key} aria-controls={`workspace-pane-${key}`} tabIndex={panel===key?0:-1} key={key} onClick={()=>onSelect(key)} onKeyDown={event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const next=event.key==='ArrowRight'?workspacePanels[(index+1)%4]:event.key==='ArrowLeft'?workspacePanels[(index+3)%4]:event.key==='Home'?'music':event.key==='End'?'history':null;
  if(next){event.preventDefault();onSelect(next);document.getElementById(`workspace-tab-${next}`)?.focus();}
 }}>{key==='music'?'Music':key==='video'?'Video':key==='archive'?'Archive':'History'} <span>{counts[key]}</span></button>)}</div>;
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
