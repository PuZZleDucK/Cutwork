import {formatTaskContext} from './task-context-text.ts';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';

const digest=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex');
const names=['docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md','docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md','LICENSE'];
interface Manifest {schemaVersion:number;models:{repository:string;revision:string;files:{path:string;bytes:number;sha256:string}[]}[]}
export interface PromptGuide {name:string;sourcePath:string;text:string;sha256:string}

/** Small upstream documents have their own installation identity. Updating them
 * never invalidates the large weight manifest or mutates an earlier task capture. */
export async function readH3PromptGuides(runtime:string,source:string):Promise<PromptGuide[]>{
 try{
  const bytes=await readFile(join(source,'integrations/h3/prompt-guides.json'));
  const manifest=JSON.parse(bytes.toString('utf8')) as Manifest;
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.models.length,1);
  const model=manifest.models[0]!;
  assert.equal(model.repository,'MiniMaxAI/MiniMax-H3');assert.match(model.revision,/^[a-f0-9]{40}$/);
  assert.deepEqual(model.files.map(f=>f.path),names);
  const directory=join(runtime,'references/h3/MiniMax-H3',model.revision),marker=join(directory,'.studio-model-manifest');
  assert.equal(await realpath(directory),resolve(directory));assert.ok(!(await lstat(marker)).isSymbolicLink());
  assert.equal((await readFile(marker,'utf8')).trim(),digest(bytes));
  return await Promise.all(model.files.map(async file=>{
   assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=256000);
   const path=join(directory,file.path);assert.equal(await realpath(path),resolve(path));
   const info=await lstat(path);assert.ok(info.isFile());assert.equal(info.size,file.bytes);
   const content=await readFile(path);assert.equal(content.length,file.bytes);assert.equal(digest(content),file.sha256);
   return{name:basename(file.path),sourcePath:`https://huggingface.co/${model.repository}/blob/${model.revision}/${file.path}`,text:content.toString('utf8'),sha256:file.sha256};
  }));
 }catch(error){throw new Error(`H3 prompt guides are missing or unverifiable. Retry H3 setup to install/verify the pinned documentation (no weight re-download). ${error instanceof Error?error.message:String(error)}`);}
}

interface VideoDirectionInput {requestedFrames:number;nativeFrames:number;startSample:number;sampleIndices:string[];hasFirstFrame:boolean}
export function videoDirectionContext(input:VideoDirectionInput):string{
 return formatTaskContext(videoDirectionTemplate(input.hasFirstFrame),videoDirectionValues(input),[]);
}
export function videoDirectionValues(input:VideoDirectionInput):Record<string,string>{
 const {requestedFrames,nativeFrames}=input;
 const retainedSamples=BigInt(requestedFrames)*2000n,nativeSamples=BigInt(nativeFrames)*2000n;
 const beats=input.sampleIndices.map((sample,i)=>({beat:i+1,sample,relativeSamples:(BigInt(sample)-BigInt(input.startSample)).toString()}));
 const inRange=(start:bigint,end:bigint)=>beats.filter(b=>BigInt(b.relativeSamples)>=start&&BigInt(b.relativeSamples)<end);
 return {
  retained_samples:String(retainedSamples),requested_frames:String(requestedFrames),last_retained_frame:String(requestedFrames-1),native_frames:String(nativeFrames),
  retained_beat_anchors:JSON.stringify(inRange(0n,retainedSamples)),native_tail_beat_anchors:JSON.stringify(inRange(retainedSamples,nativeSamples)),
 };
}

/** Same directing text as actual tasks; Config leaves only measured values as placeholders. */
export function videoDirectionTemplate(hasFirstFrame:boolean):string{
 return[
  hasFirstFrame
   ? 'Mode: I2VA (captured first-frame image plus separate original-song conditioning). Begin the native prompt with this official alignment line, then a blank line and the three base-guide fields:\nFor the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.'
   : 'Mode: T2VA (no image reference; separate original-song conditioning). Begin the native prompt directly with the three base-guide fields; do not invent an image alignment header.',
  'The base fields are integrated_multimodal_description, overall_soundscape, non_diegetic_music. The full official base guide is included below. Its model syntax governs the native prompt, not your final response or use of tools. The current graph has no last-frame or arbitrary full-reference inputs; actual audio conditioning alone does not make this Ref2VA.',
  `Initially retained local interval: [0, {{retained_samples}}) samples at 48000 Hz, or [0, {{requested_frames}}/24) seconds. The last visible retained frame starts at {{last_retained_frame}}/24 seconds. Native duration is {{native_frames}}/24 seconds. Resolve essential actions by the last retained frame, not in the extra native tail; let any tail maintain the resolved state. Keep all generated frames available for later editing.`,
  `Retained beat anchors: {{retained_beat_anchors}}\nNative-tail-only beat anchors: {{native_tail_beat_anchors}}`,
  'Exact local event time is relativeSamples / 48000 seconds. Beat anchors are analysis estimates, not guaranteed visual sync. Select a few meaningful gestures from the retained anchors when useful; do not narrate every beat or schedule the payoff only on a native-tail beat. With no retained anchors, direct a duration-appropriate action without inventing beat measurements.',
  'Translate the brief into observable action progression: establish the scene, develop a compatible action or reaction, and reach a readable final state. Describe camera motion with direction, speed and extent when useful. Short clips usually benefit from one coherent action/shot; cuts are available when the idea needs them. Preserve user intent, exact dialogue and supplied reference identity; these are creative defaults, not restrictions on your normal research or tools.',
 ].join('\n\n');
}
