export interface TaskContextPreview {
 id:'music'|'video-text'|'video-image';title:string;text:string;sha256:string;
 sources:{name:string;sourcePath:string;sha256:string}[];
 /** Non-null means the displayed context is incomplete; no placeholder guide is invented. */
 error:string|null;
}
export interface TaskContextPreviews {contexts:TaskContextPreview[]}

export const TASK_CONTEXT_IDS=['music','video-text','video-image'] as const;
export type TaskContextId=typeof TASK_CONTEXT_IDS[number];
export type TaskContextOverrides=Record<TaskContextId,string|null>;
export interface TaskContextSettings {revision:number;overrides:TaskContextOverrides}
export interface CapturedTaskContext {id:TaskContextId;revision:number;template:string|null}
export interface TaskContextConfiguration extends TaskContextPreviews {settings:TaskContextSettings}
export const TASK_CONTEXT_MAX_LENGTH=128_000;
export const DEFAULT_TASK_CONTEXT_OVERRIDES:Readonly<TaskContextOverrides>=Object.freeze({music:null,'video-text':null,'video-image':null});
const common=['project_id','attempt_id','native_call_id','source_root','data_root','workspace','run_directory','agent_request_path','native_client_command','receipt_path'];
const video=[...common,'song_id','visual_style','clip_description','start_frame','end_frame','requested_frames','native_frames','continuation','direction','native_inputs_json','h_seed','retained_samples','last_retained_frame','retained_beat_anchors','native_tail_beat_anchors'];
export const TASK_CONTEXT_FIELDS:Record<TaskContextId,readonly string[]>={
 music:[...common,'provider_model','music_description','lyrics','stage_seeds_json'],
 'video-text':video,'video-image':[...video,'first_frame_path','source_frame_number','first_frame_sha256'],
};
/** Wording and variables are optional; only malformed text and unknown variable names are rejected. */
export function taskContextError(id:TaskContextId,value:unknown):string|null{
 if(value===null)return null;
 if(typeof value!=='string'||!value.trim()||value.length>TASK_CONTEXT_MAX_LENGTH||value.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))return `Use nonempty valid text of at most ${TASK_CONTEXT_MAX_LENGTH.toLocaleString('en-US')} characters, or reset to the default.`;
 const unknown=[...value.matchAll(/\{\{([^{}]*)\}\}/g)].map(m=>m[1]!).filter(name=>!TASK_CONTEXT_FIELDS[id].includes(name));
 return unknown.length?`Unknown ${id} placeholder: {{${unknown[0]}}}. Use a listed placeholder, or single braces for literal text.`:null;
}
