import type {ToolStatus} from '../../../packages/core/src/contracts/studio.ts';
import {TASK_CONTEXT_IDS,type TaskContextConfiguration,type TaskContextOverrides} from '../../../packages/core/src/contracts/task-contexts.ts';

export interface TaskContextEditorState {data:TaskContextConfiguration|null;value:TaskContextOverrides|null}
export function taskContextsDirty(data:TaskContextConfiguration|null,value:TaskContextOverrides|null){return !!data&&!!value&&TASK_CONTEXT_IDS.some(id=>data.settings.overrides[id]!==value[id]);}

/** Installed references can change during setup, not ordinary activity/log polling. */
export function taskContextSetupKey(tools:readonly ToolStatus[]):string {
 return JSON.stringify(['yue2','comfyui','h3'].map(id=>{
  const tool=tools.find(t=>t.id===id);
  return [id,tool?.state??'missing',!!tool?.installed,tool?.jobId??null];
 }));
}

/** Called against the latest state when a response arrives, not a request-time draft. */
export function mergeTaskContextRead(current:TaskContextEditorState,incoming:TaskContextConfiguration,preserveEdits:boolean):TaskContextEditorState {
 if(preserveEdits&&current.data&&current.value&&taskContextsDirty(current.data,current.value)){
  // Refresh default references only. Keep the saved baseline/revision so a later
  // Save still detects concurrent edits instead of silently overwriting them.
  return {data:{...current.data,contexts:incoming.contexts},value:current.value};
 }
 return {data:incoming,value:{...incoming.settings.overrides}};
}

/** A setup transition during a read/save must not be lost or start overlapping I/O. */
export class ContextRefreshGate {
 private busy=false;
 private pending=false;
 begin(refresh=false):boolean {
  if(this.busy){this.pending ||= refresh;return false;}
  this.busy=true;return true;
 }
 end():boolean {this.busy=false;const pending=this.pending;this.pending=false;return pending;}
}
