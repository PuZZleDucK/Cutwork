export interface AgentPromptTemplates { music:string; video:string }
export interface PromptTemplateSettings extends AgentPromptTemplates { revision:number }
export interface CapturedPromptTemplate { revision:number; template:string }
export const TASK_CONTEXT_TOKEN='{{task_context}}';
export const PROMPT_TEMPLATE_MAX_LENGTH=64_000;

/** Editable instructions, separate from each request's immutable runtime context. */
export const DEFAULT_AGENT_TEMPLATES:Readonly<AgentPromptTemplates>=Object.freeze({
 music:[
  'Create one fresh song candidate for this music-only studio task. Perform the tool work, not merely propose a plan. No automatic variations or silent retries are requested.',
  'Use your normal capabilities, tools, research, relevant project context, scripts and score editing. The project workspace organises artifacts; it is not a filesystem sandbox. Reply naturally; no JSON answer schema is required.',
  'Translate the creative brief into the native parameters and choose suitable score, sampling and execution settings. The provided generator guidance describes the native request, not an answer schema for you. Tools are already installed; ordinary generation should not require reinstalling them.',
  'Do not use the earlier 500-token feasibility ceiling as duration control. Aim for a complete composition matching the brief; record your sampling limits. Inspect both truncation flags and disclose truncation instead of hiding it with trimming, fades or mastering.',
  'Keep the original 48 kHz stereo float WAV. The studio independently validates and analyses it. This task does not request video generation, export, normalization or audio replacement. Report output paths, assumptions, failures and whether you actually listened. A natural-language success claim is not a validation result.',
  TASK_CONTEXT_TOKEN,
 ].join('\n\n'),
 video:[
  'Create one fresh video clip for this captured music-video task. Perform the actual tool work; no automatic variations or silent expensive retries.',
  'Use your normal capabilities, tools, research, scripts and relevant project context. The workspace organises artifacts, not a filesystem sandbox. Reply naturally; no JSON answer format is required.',
  'Keep the complete original pre-encode PNG batch, encoded video, and generated native audio. No frame-rate conversion, trimming of preserved originals, export, fades, mastering or audio mixing is requested. State actual outputs, assumptions and what you reviewed; prose is not proof of success.',
  TASK_CONTEXT_TOKEN,
 ].join('\n\n'),
});

export function promptTemplateError(value:unknown):string|null {
 if(typeof value!=='string'||value.length>PROMPT_TEMPLATE_MAX_LENGTH||!value.trim()||value.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))return `Use valid nonempty text of at most ${PROMPT_TEMPLATE_MAX_LENGTH.toLocaleString('en-US')} characters.`;
 if(value.split(TASK_CONTEXT_TOKEN).length!==2)return `Include ${TASK_CONTEXT_TOKEN} exactly once; it supplies the captured brief, tool inputs and commands.`;
 return null;
}
export function renderAgentTemplate(template:string,context:string):string {
 const error=promptTemplateError(template);if(error)throw new Error(error);
 // A callback preserves literal dollars and does not recursively interpret user text.
 return template.replace(TASK_CONTEXT_TOKEN,()=>context);
}
