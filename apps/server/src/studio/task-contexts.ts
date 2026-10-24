import type {TaskContextPreview,TaskContextPreviews} from '../../../../packages/core/src/contracts/task-contexts.ts';
import {readH3PromptGuides,videoDirectionTemplate} from './h3-prompt-guidance.ts';
import {MUSIC_CONTEXT,VIDEO_CONTEXT,VIDEO_CONTINUATION_CONTEXT,formatTaskContext,contextPlaceholders,contextHash,readProductGuidance,type TaskGuidance} from './task-context-text.ts';
/** Read current source/runtime guides, not browser-bundled copies or another project's data.
 * This endpoint never prepares a generation, writes a capture, or downloads documents. */
export async function readTaskContexts(runtime:string,source:string):Promise<TaskContextPreviews>{
 const contexts:TaskContextPreview[]=[];
 for(const kind of ['music','video'] as const){
  let guidance:TaskGuidance[]=[],error:string|null=null;
  try{guidance=await readProductGuidance(source,kind);}catch{error=`${kind==='music'?'Music':'Video'} product guidance could not be read. This context is incomplete; check the installed application source.`;}
  if(kind==='video')try{guidance.push((await readH3PromptGuides(runtime,source))[0]!);}catch{error=[error,'H3 prompt guides are missing or unverifiable. This context is incomplete. Retry H3 setup to verify the pinned documentation.'].filter(Boolean).join(' ');}
  for(const image of kind==='video'?[false,true]:[false]){
   const template=kind==='music'?MUSIC_CONTEXT:VIDEO_CONTEXT,values=contextPlaceholders(template);
   if(kind==='video'){values.direction=videoDirectionTemplate(image);values.continuation=image?VIDEO_CONTINUATION_CONTEXT:'';}
   const text=formatTaskContext(template,values,guidance);
   contexts.push({id:kind==='music'?'music':image?'video-image':'video-text',title:kind==='music'?'Music task context':image?'Video task context — I2VA continuation':'Video task context — T2VA',text,sha256:contextHash(text),sources:guidance.map(({text:_text,...g})=>g),error});
  }
 }
 return{contexts};
}
