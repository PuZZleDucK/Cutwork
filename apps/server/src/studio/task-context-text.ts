import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export interface TaskGuidance {name:string;sourcePath:string;sha256:string;text:string}
export const contextHash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
export async function readProductGuidance(source:string,kind:'music'|'video'):Promise<TaskGuidance[]>{
 return Promise.all(['README.md',`${kind}.md`].map(async name=>{const sourcePath=`integrations/knowledge/${name}`,bytes=await readFile(join(source,sourcePath));return{name,sourcePath,text:bytes.toString('utf8'),sha256:contextHash(bytes)};}));
}
/** Single pass: user text resembling a placeholder or replacement pattern stays literal. */
export function formatTaskContext(template:string,values:Record<string,string>,guidance:TaskGuidance[]):string{
 const text=template.replace(/\{\{([a-z_][a-z0-9_]*)\}\}/g,(_token,key:string)=>{const value=values[key];if(value===undefined)throw new Error(`Missing task context value: ${key}`);return value;});
 return [text,...guidance.map(g=>`Product guidance ${g.sourcePath}; SHA256 ${g.sha256}:\n\n${g.text}`)].join('\n\n');
}
export function contextPlaceholders(template:string):Record<string,string>{return Object.fromEntries([...template.matchAll(/\{\{([a-z_][a-z0-9_]*)\}\}/g)].map(m=>[m[1]!,m[0]]));}

export const MUSIC_CONTEXT=`Project: {{project_id}}
Parent attempt: {{attempt_id}}
Captured native YuE2 call ID: {{native_call_id}}
Provider/model: {{provider_model}}

Music description:
{{music_description}}

Optional user lyrics (preserve supplied words):
{{lyrics}}

Integration source: {{source_root}}
STUDIO_DATA_ROOT: {{data_root}}
Workspace: {{workspace}}
Run directory: {{run_directory}}

Assigned exact decimal stage seeds: {{stage_seeds_json}}. With generated planning use abc, semantic and nar; with a supplied score/planning off use semantic and nar. Do not allocate replacements or round seeds.

Write the native request to {{agent_request_path}}. It must have schemaVersion:1 and attemptId:{{native_call_id}}. Submit it through the running studio coordinator using:
{{native_client_command}}
The server captures the exact request and writes {{receipt_path}}. Save client output and inspect the actual receipt and stage artifacts.

This cooperative helper registers native work with the shared GPU queue. It waits for owned process and CUDA release; a helper receipt alone is insufficient. Wait for client state succeeded. If failed, cancelled or reconciling, retain the evidence and explain; do not bypass a held lease or stop unrelated applications.`;

export const VIDEO_CONTINUATION_CONTEXT='Continue from the selected last retained original PNG: {{first_frame_path}}; source frame {{source_frame_number}}, SHA256 {{first_frame_sha256}}. Inspect this supplied image with your normal tools and preserve its visual continuity. It is the first-frame input, not a replacement for the captured song audio. Do not use an MP4 extraction or the discarded untrimmed ending. The user may edit prepared times; the immutable interval below is authoritative. No seamless-motion guarantee or automatic chain is requested.';
export const VIDEO_CONTEXT=`Project {{project_id}}; parent attempt {{attempt_id}}; native H3 call {{native_call_id}}; captured song {{song_id}}.

Persistent VISUAL style:
{{visual_style}}

Individual clip brief:
{{clip_description}}

Requested interval is [{{start_frame}}, {{end_frame}}) at exactly 24 fps ({{requested_frames}} frames). Native generation is {{native_frames}} frames, beginning at the same start. Preserve all original frames; initial placement includes only the {{requested_frames}} requested frames. Do not stretch or retime. Durations over 15 seconds are advisory warnings, not a cap.

{{continuation}}

{{direction}}

Create {{agent_request_path}} using these immutable native inputs, adding your translated tool prompt in the native "prompt" field:
{{native_inputs_json}}
The helper conditions every native frame with the matching original song samples and pads only beyond the actual song. Do not replace the song, borrow the current UI selection, generate a new song or use the two-second proof convenience builder.

Use the existing helper through the running queue:
{{native_client_command}}
It captures the actual tool request and owns only its own Comfy service. Wait for client state succeeded and inspect {{receipt_path}}. Never bypass a held lease or stop another application. If failed or uncertain, retain the evidence and explain.

Source {{source_root}}; STUDIO_DATA_ROOT {{data_root}}; workspace {{workspace}}; run directory {{run_directory}}. Exact assigned H3 seed is the decimal string {{h_seed}}; never round it through a JavaScript Number or allocate a replacement.`;

/** User overrides replace the complete context; provenance never labels edited bytes as upstream-verified. */
export function configuredContextGuidance(captured:import('../../../../packages/core/src/contracts/task-contexts.ts').CapturedTaskContext|undefined):TaskGuidance[]|null{
 if(captured?.template==null)return null;
 return[{name:`Configured ${captured.id} task context`,sourcePath:`config/task-contexts/${captured.id}/revision/${captured.revision}`,sha256:contextHash(captured.template),text:captured.template}];
}
export function renderCapturedTaskContext(defaultTemplate:string,values:Record<string,string>,guidance:TaskGuidance[],captured:import('../../../../packages/core/src/contracts/task-contexts.ts').CapturedTaskContext|undefined):string{
 return captured?.template!=null?formatTaskContext(captured.template,values,[]):formatTaskContext(defaultTemplate,values,guidance);
}
