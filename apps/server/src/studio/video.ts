import {VIDEO_CONTEXT,VIDEO_CONTINUATION_CONTEXT,formatTaskContext,readProductGuidance,configuredContextGuidance,renderCapturedTaskContext} from './task-context-text.ts';
import {readH3PromptGuides,videoDirectionContext,videoDirectionValues} from './h3-prompt-guidance.ts';
import {DEFAULT_AGENT_TEMPLATES,renderAgentTemplate} from '../../../../packages/core/src/contracts/prompt-templates.ts';
import assert from 'node:assert/strict';
import {captureExecutionSource,captureReplayFile,fileHash,verifyExecutionSource,type ExecutionSource,type ReplayFile} from './execution-snapshot.ts';
import {settleCancellation} from './cancellation.ts';
import {runReplayCall,type ReplayCall} from './replay.ts';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { providerLaunch } from '../providers/launch.ts';
import { runProvider, ProviderLaunchAbortedError, type ProviderLaunch } from '../providers/run.ts';
import { executeSetupCommand, type SetupExecutor } from './setup.ts';
import { planVideo } from '../../../../packages/core/src/time/video-plan.ts';
import type { VideoPlan } from '../../../../packages/core/src/contracts/generation.ts';
import type { VideoAttempt } from '../../../../packages/core/src/contracts/studio.ts';
import type { GpuCall, GpuQueue } from '../jobs/gpu-queue-contract.ts';
import type { StudioStore, VideoOutputInput } from './store-contract.ts';

interface VideoOptions { runtime:string; source:string; origin:string; attempt:VideoAttempt; store:StudioStore; signal?:AbortSignal }
interface RunOptions extends VideoOptions { queue:GpuQueue; signal?:AbortSignal }
export interface VideoTaskDependencies { provider?:typeof runProvider; execute?:SetupExecutor }
type Rec=Record<string,unknown>;
type CapturedAttempt=Pick<VideoAttempt,'id'|'nativeCallId'|'projectId'|'provider'|'model'|'input'|'seeds'|'song'|'continuation'|'promptTemplate'|'taskContext'>;
export interface TaskPlan {
 executionSource?:ExecutionSource; replaySong?:ReplayFile; replayCall?:ReplayCall;
 schemaVersion:1; runtime:string; source:string; origin:string; attempt:CapturedAttempt; nativePlan:VideoPlan;
 song:{path:string;sha256:string}; launch:ProviderLaunch;
 firstFrame?:{path:string;sha256:string;pixelSha256:string};
 firstFrameSource?:{path:string;assetId:string;index:number;sha256:string;pixelSha256:string;bytes:number};
 guidance:{name:string;sourcePath:string;text:string;sha256:string}[];
 sourceHashes:Record<string,string>; modelManifestSha256:string; verifiedModels:{path:string;sha256:string;bytes:number}[];
 recipeSha256:string; lockSha256:string; sourceRevision:string;
 paths:{planPath:string;nativeRequest:string;nativeReceipt:string;agentRequest:string;validation:string};
}
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const record=(v:unknown):Rec=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v),'Expected evidence object');return v as Rec;};
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,12000);
const quote=(v:string)=>`'${v.replaceAll("'","'\\''")}'`;
const captured=(a:VideoAttempt):CapturedAttempt=>structuredClone({id:a.id,nativeCallId:a.nativeCallId,projectId:a.projectId,provider:a.provider,model:a.model,input:a.input,seeds:a.seeds,song:a.song,...(a.promptTemplate?{promptTemplate:a.promptTemplate}:{}),...(a.taskContext?{taskContext:a.taskContext}:{}),...(a.continuation?{continuation:a.continuation}:{})});
function parse(text:string):unknown{return JSON.parse(text,(_k,v:unknown,c?:{source?:string})=>{if(typeof v==='number'&&Number.isInteger(v)&&!Number.isSafeInteger(v)){assert.ok(c?.source,'Node 24 lossless native JSON parsing required');return c.source;}return v;});}
async function json(path:string,max=16_000_000){assert.ok((await stat(path)).size<=max,'Evidence exceeds reader bound');return record(parse(await readFile(path,'utf8')));}
async function sha(path:string,signal?:AbortSignal){signal?.throwIfAborted();const h=createHash('sha256');for await(const b of createReadStream(path,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(300000)]):AbortSignal.timeout(300000)}))h.update(b);return h.digest('hex');}
async function managed(root:string,path:string){assert.ok(isAbsolute(path)&&resolve(path)===path,'Absolute normalized media path required');const r=relative(root,path);assert.ok(r&&r!=='..'&&!r.startsWith('../')&&!isAbsolute(r),'Media must belong to the captured project');assert.equal(await realpath(path),path,'Linked media not accepted');assert.ok((await stat(path)).isFile(),'Regular file required');}
function planPath(o:VideoOptions){return join(o.runtime,'projects',o.attempt.projectId,'inputs',o.attempt.id,'captured-task.json');}
/** Deterministic server-owned capture, never a path accepted from the browser. */
export function continuationFrameInput(runtime:string,attempt:Pick<VideoAttempt,'id'|'projectId'|'continuation'>){
 const c=attempt.continuation;return c?{path:join(runtime,'projects',attempt.projectId,'inputs',attempt.id,'continuation.png'),sha256:c.frame.sha256,pixelSha256:c.frame.pixelSha256}:undefined;
}
async function inspectFirstFrame(o:VideoOptions,path:string,execute:SetupExecutor,signal?:AbortSignal){
 const result=await execute({executable:join(o.runtime,'tools/comfyui/venv/bin/python'),args:['-I',join(o.source,'integrations/h3/media.py'),'--inspect-input-png',path],cwd:join(o.runtime,'projects',o.attempt.projectId),env:{...process.env,STUDIO_DATA_ROOT:o.runtime},timeoutMs:120000,...(signal?{signal}:{})});
 assert.equal(result.code,0,`Continuation PNG inspection failed: ${result.stderr.slice(-4000)}`);
 const decoded=record(parse(result.stdout)),frame=o.attempt.continuation!.frame;
 assert.deepEqual(decoded,{sha256:frame.sha256,pixelSha256:frame.pixelSha256,bytes:frame.bytes,width:640,height:480},'Continuation PNG pixels/identity differ from captured original');
}
/** Only native granularity; there is no four-second minimum or 15-second cap. */
export function nativeVideoPlan(attempt:Pick<VideoAttempt,'input'|'song'>):VideoPlan {
 const {startFrame,endFrame,requestedIntervalSeconds}=attempt.input;
 const n=endFrame-startFrame,native=5+17*Math.max(0,Math.ceil((n-5)/17));
 assert.equal(attempt.song.sampleRate,48000);assert.equal(attempt.song.channels,2);
 const samples=Number(attempt.song.sampleCount);assert.ok(Number.isSafeInteger(samples)&&samples>0);
 return planVideo({startFrame,endFrame,songSamples:samples,sampleRate:48000,supportedFrameCounts:[native],...(requestedIntervalSeconds?{requestedIntervalSeconds}:{})});
}
function validate(o:VideoOptions){
 assert.ok(isAbsolute(o.runtime)&&isAbsolute(o.source));const u=new URL(o.origin);
 assert.ok(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash,'Use loopback studio origin');
 for(const id of [o.attempt.id,o.attempt.nativeCallId,o.attempt.projectId,o.attempt.song.id,o.attempt.song.assetId])assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
 assert.equal(o.attempt.song.id,o.attempt.input.songId);assert.deepEqual(Object.keys(o.attempt.seeds),['h3']);assert.match(o.attempt.seeds.h3,/^(0|[1-9][0-9]*)$/);assert.ok(BigInt(o.attempt.seeds.h3)<2n**64n);
 const c=o.attempt.continuation;
 assert.equal(!!c,!!o.attempt.input.continuation,'Continuation reference/capture disagree');
 if(c){assert.deepEqual(o.attempt.input.continuation,{contextId:c.contextId,contextRevision:c.contextRevision});assert.equal(c.songId,o.attempt.song.id);
  assert.ok(Number.isSafeInteger(c.sourceOriginFrame)&&Number.isSafeInteger(c.sourceStartFrame)&&Number.isSafeInteger(c.sourceEndFrame)&&c.sourceStartFrame>=0&&c.sourceEndFrame>c.sourceStartFrame);
  assert.equal(c.endFrame,c.sourceOriginFrame+c.sourceEndFrame);assert.ok(Number.isSafeInteger(c.endFrame)&&c.endFrame>0);assert.equal(c.frame.index,c.sourceEndFrame-1);
  for(const h of [c.frame.sha256,c.frame.pixelSha256])assert.match(h,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(c.frame.bytes)&&c.frame.bytes>0&&c.frame.bytes<=32_000_000);
 }
 nativeVideoPlan(o.attempt);
}
export async function prepareVideoTask(o:VideoOptions,deps:Pick<VideoTaskDependencies,'execute'>={}):Promise<{planPath:string;planSha256?:string}>{
 o.signal?.throwIfAborted();validate(o);const {runtime,source,origin,attempt,store}=o,project=join(runtime,'projects',attempt.projectId);
 const asset=store.asset(attempt.song.assetId);assert.ok(asset&&asset.projectId===attempt.projectId&&asset.sha256===attempt.song.sha256,'Captured song asset not registered');
 await managed(project,asset.path);assert.equal(await sha(asset.path),attempt.song.sha256,'Captured song hash changed');
 const pins=await json(join(source,'integrations/tool-manifest.json')),providers=record(pins.providers),codex=record(providers.codex),claude=record(providers.claude);
 assert.equal(record(providers[attempt.provider]).model,attempt.model);
 const launch:ProviderLaunch=providerLaunch(runtime,{projectId:attempt.projectId,attemptId:attempt.id,songId:attempt.song.id,provider:attempt.provider,model:attempt.model,musicPrompt:'',lyrics:'',style:attempt.input.style,clipPrompt:attempt.input.clipPrompt,startFrame:attempt.input.startFrame,endFrame:attempt.input.endFrame,seeds:attempt.seeds});
 launch.executable=join(runtime,`tools/provider-cli/codex-${codex.version}_claude-${claude.version}/node_modules/.bin`,attempt.provider);
 const paths:TaskPlan['paths']={planPath:planPath(o),nativeRequest:join(project,'inputs/native-calls',attempt.nativeCallId,'request.json'),nativeReceipt:join(project,'runs',attempt.nativeCallId,'receipt.json'),agentRequest:join(launch.runDirectory,'video-request.json'),validation:join(project,'validation',attempt.id)};
 const customGuidance=configuredContextGuidance(attempt.taskContext);
 const guidance=customGuidance??await readProductGuidance(source,'video');
 if(!customGuidance)guidance.push((await readH3PromptGuides(runtime,source))[0]!); // Complete base guide covers both supported T2VA and I2VA.
 const sourceHashes=Object.fromEntries(await Promise.all(['generate.py','workflow.py','media.py'].map(async name=>[name,await sha(join(source,'integrations/h3',name))])));
 const models=await json(join(source,'integrations/h3/models.json')),recipe=await json(join(source,'integrations/comfyui/recipe.json'));
 assert.ok(Array.isArray(models.models));const verifiedModels=models.models.flatMap(m=>{const model=record(m);assert.ok(Array.isArray(model.files));return model.files.map(f=>{const file=record(f);return{path:join(runtime,'models/h3',String(model.repository).split('/')[1]!,String(model.revision),String(file.path)),sha256:String(file.sha256),bytes:Number(file.bytes)};});});
 const nativePlan=nativeVideoPlan(attempt),song={path:asset.path,sha256:asset.sha256};
 await mkdir(join(project,'inputs'),{recursive:true,mode:0o700});await mkdir(join(paths.planPath,'..'),{mode:0o700});
 const firstFrame=continuationFrameInput(runtime,attempt);let firstFrameSource:TaskPlan['firstFrameSource'];
 if(firstFrame){
  const c=attempt.continuation!,frameAsset=store.asset(c.frame.assetId),clip=store.project(attempt.projectId).clips.find(v=>v.id===c.clipId);
  assert.ok(frameAsset&&frameAsset.projectId===attempt.projectId&&frameAsset.mediaType==='image/png'&&frameAsset.sha256===c.frame.sha256,'Captured original PNG asset is not registered in this project');
  assert.ok(clip,'Captured predecessor source is missing');assert.deepEqual(clip.rawFrames.find(v=>v.index===c.frame.index),c.frame,'Captured original frame manifest differs');
  await managed(project,frameAsset.path);assert.equal((await stat(frameAsset.path)).size,c.frame.bytes);assert.equal(await sha(frameAsset.path),c.frame.sha256,'Captured continuation source hash changed');
  await writeFile(firstFrame.path,await readFile(frameAsset.path),{flag:'wx',mode:0o600});assert.equal(await sha(firstFrame.path),c.frame.sha256,'Continuation changed during capture');
  assert.equal(await sha(frameAsset.path),c.frame.sha256,'Original continuation changed during capture');await inspectFirstFrame(o,firstFrame.path,deps.execute??executeSetupCommand,o.signal);
  assert.equal(await sha(join(source,'integrations/h3/media.py')),sourceHashes['media.py'],'PNG inspector changed during capture');
  firstFrameSource={path:frameAsset.path,...c.frame};
 }
 const nativeTemplate={schemaVersion:1,attemptId:attempt.nativeCallId,projectId:attempt.projectId,song,plan:nativePlan,seed:attempt.seeds.h3,...(firstFrame?{firstFrame}:{})};
 const storedSong=store.project(attempt.projectId).songs.find(s=>s.id===attempt.song.id);assert.ok(storedSong,'Captured song is missing');
 const directionInput={requestedFrames:nativePlan.requestedFrames,nativeFrames:nativePlan.nativeFrames,startSample:nativePlan.conditioning.startSample,sampleIndices:storedSong.analysis.sampleIndices,hasFirstFrame:!!firstFrame};
 const direction=videoDirectionContext(directionInput);
 const command=[join(runtime,`tools/runtime/node-v${record(pins.node).version}-linux-x64/bin/node`),join(source,'scripts/native-call.ts'),origin,attempt.projectId,attempt.id,'h3',paths.agentRequest].map(quote).join(' ');
 launch.stdin=renderAgentTemplate(attempt.promptTemplate?.template??DEFAULT_AGENT_TEMPLATES.video,renderCapturedTaskContext(VIDEO_CONTEXT,{
  ...videoDirectionValues(directionInput),
  ...(firstFrame?{first_frame_path:firstFrame.path,source_frame_number:String(attempt.continuation!.frame.index+1),first_frame_sha256:firstFrame.sha256}:{}),
  project_id:attempt.projectId,attempt_id:attempt.id,native_call_id:attempt.nativeCallId,song_id:attempt.song.id,visual_style:attempt.input.style,clip_description:attempt.input.clipPrompt,
  start_frame:String(attempt.input.startFrame),end_frame:String(attempt.input.endFrame),requested_frames:String(nativePlan.requestedFrames),native_frames:String(nativePlan.nativeFrames),
  continuation:firstFrame?formatTaskContext(VIDEO_CONTINUATION_CONTEXT,{first_frame_path:firstFrame.path,source_frame_number:String(attempt.continuation!.frame.index+1),first_frame_sha256:firstFrame.sha256},[]):'',
  direction,agent_request_path:paths.agentRequest,native_inputs_json:JSON.stringify(nativeTemplate,null,2),native_client_command:command,receipt_path:paths.nativeReceipt,
  source_root:source,data_root:runtime,workspace:launch.cwd,run_directory:launch.runDirectory,h_seed:attempt.seeds.h3!,
 },guidance,attempt.taskContext));

  // Historical queued requests predate editable templates. Keep their original
  // instruction order rather than applying a later editable template. Already
  // captured tasks are replayed from their immutable plan, never rebuilt here.
  if (!attempt.promptTemplate && !attempt.taskContext) {
 launch.stdin=[
  'Create one fresh video clip for this captured music-video task. Perform the actual tool work; no automatic variations or silent expensive retries.',
  'Use your normal capabilities, tools, research, scripts and relevant project context. The workspace organises artifacts, not a filesystem sandbox. Reply naturally; no JSON answer format is required.',
  `Project ${attempt.projectId}; parent attempt ${attempt.id}; native H3 call ${attempt.nativeCallId}; captured song ${attempt.song.id}.`,
  `Persistent VISUAL style:\n${attempt.input.style}\n\nIndividual clip brief:\n${attempt.input.clipPrompt}`,
  `Requested interval is [${attempt.input.startFrame}, ${attempt.input.endFrame}) at exactly 24 fps (${nativePlan.requestedFrames} frames). Native generation is ${nativePlan.nativeFrames} frames, beginning at the same start. Preserve all original frames; initial placement includes only the ${nativePlan.requestedFrames} requested frames. Do not stretch or retime. Durations over 15 seconds are advisory warnings, not a cap.`,
  ...(firstFrame?[`Continue from the selected last retained original PNG: ${firstFrame.path}; source frame ${attempt.continuation!.frame.index+1}, SHA256 ${firstFrame.sha256}. Inspect this supplied image with your normal tools and preserve its visual continuity. It is the first-frame input, not a replacement for the captured song audio. Do not use an MP4 extraction or the discarded untrimmed ending. The user may edit prepared times; the immutable interval below is authoritative. No seamless-motion guarantee or automatic chain is requested.`]:[]),
  direction,
  `Create ${paths.agentRequest} using these immutable native inputs, adding your translated tool prompt in the native "prompt" field:\n${JSON.stringify(nativeTemplate,null,2)}\nThe helper conditions every native frame with the matching original song samples and pads only beyond the actual song. Do not replace the song, borrow the current UI selection, generate a new song or use the two-second proof convenience builder.`,
  `Use the existing helper through the running queue:\n${command}\nIt captures the actual tool request and owns only its own Comfy service. Wait for client state succeeded and inspect ${paths.nativeReceipt}. Never bypass a held lease or stop another application. If failed or uncertain, retain the evidence and explain.`,
  `Source ${source}; STUDIO_DATA_ROOT ${runtime}; workspace ${launch.cwd}; run directory ${launch.runDirectory}. Exact assigned H3 seed is the decimal string ${attempt.seeds.h3}; never round it through a JavaScript Number or allocate a replacement.`,
  'Keep the complete original pre-encode PNG batch, encoded video, and generated native audio. No frame-rate conversion, trimming of preserved originals, export, fades, mastering or audio mixing is requested. State actual outputs, assumptions and what you reviewed; prose is not proof of success.',
  ...guidance.map(g=>`Product guidance ${g.sourcePath}; SHA256 ${g.sha256}:\n\n${g.text}`),
 ].join('\n\n');
  }
 const plan:TaskPlan={schemaVersion:1,runtime,source,origin,attempt:captured(attempt),nativePlan,song,launch,...(firstFrame?{firstFrame,firstFrameSource:firstFrameSource!}:{}),guidance,sourceHashes,verifiedModels,modelManifestSha256:await sha(join(source,'integrations/h3/models.json')),recipeSha256:await sha(join(source,'integrations/comfyui/recipe.json')),lockSha256:await sha(join(source,'integrations/comfyui/requirements.lock')),sourceRevision:String(record(recipe.source).revision),paths};
 plan.executionSource=await captureExecutionSource(source,join(paths.planPath,'..','execution-source'),'h3');
 for(const [name,expected] of Object.entries(plan.sourceHashes))assert.equal(await fileHash(join(plan.executionSource.root,'integrations/h3',name)),expected,'Helper changed during capture');
 assert.equal(await fileHash(join(plan.executionSource.root,'integrations/h3/models.json')),plan.modelManifestSha256);assert.equal(await fileHash(join(plan.executionSource.root,'integrations/comfyui/recipe.json')),plan.recipeSha256);assert.equal(await fileHash(join(plan.executionSource.root,'integrations/comfyui/requirements.lock')),plan.lockSha256);
 plan.replaySong=await captureReplayFile(asset.path,join(paths.planPath,'..','source-song.wav'),asset.sha256);
 await mkdir(launch.cwd,{recursive:true,mode:0o700});
 await writeFile(paths.planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});return{planPath:paths.planPath,planSha256:await fileHash(paths.planPath)};
}
async function verifyRelease(call:GpuCall,queue:GpuQueue,runtime:string){
 assert.notEqual(queue.heldLease()?.callId,call.id,'Native GPU lease remains held');const owner=record(call.owner),release=record(call.release);assert.equal(owner.kind,'systemd-unit');assert.equal(typeof owner.directory,'string');
 const dir=String(owner.directory);await managed(join(runtime,'jobs/native-units'),join(dir,'release.json'));assert.deepEqual(release.owner,owner);assert.equal(release.cgroupEmptyBeforeAndAfterGpu,true);assert.equal(record(release.gpuSettling).state,'released');
 assert.ok(Array.isArray(release.rememberedPids)&&Array.isArray(record(release.gpu).processes));for(const p of record(release.gpu).processes as unknown[])assert.ok(!release.rememberedPids.includes(record(p).pid),'Owned CUDA PID remains');
 assert.deepEqual(await json(join(dir,'release.json')),release);if(call.state==='succeeded'){assert.equal(record(call.result).code,0);assert.equal(record(call.result).signal,null);const exit=await json(join(dir,'exit.json'));assert.equal(exit.code,0);assert.equal(exit.signal,null);}
}
function bounded(value:unknown,path:string,max=100000):unknown{const text=JSON.stringify(value);return Buffer.byteLength(text)<=max?value:{fullEvidencePath:path,sha256:hash(text),bytes:Buffer.byteLength(text),truncated:true,preview:text.slice(0,max/2)};}
async function tail(path:string){const f=await open(path,'r');try{const size=(await f.stat()).size,b=Buffer.alloc(Math.min(size,32768));await f.read(b,0,b.length,size-b.length);return{text:b.toString('utf8'),sourcePath:path,truncated:size>b.length};}finally{await f.close();}}
function duration(stream:Rec,rate:number){assert.match(String(stream.duration_ts),/^\d+$/);assert.match(String(stream.time_base),/^\d+\/[1-9]\d*$/);const[n,d]=String(stream.time_base).split('/').map(BigInt);const v=BigInt(String(stream.duration_ts))*n!*BigInt(rate);assert.equal(v%d!,0n,'Non-integral native duration');return v/d!;}
async function verifyVideo(plan:TaskPlan,call:GpuCall,execute:SetupExecutor,signal?:AbortSignal):Promise<{output:VideoOutputInput;details:Rec}>{
 const {attempt,runtime,paths,nativePlan}=plan,source=plan.executionSource?.root??plan.source,project=join(runtime,'projects',attempt.projectId),run=join(project,'runs',attempt.nativeCallId),outputRoot=join(run,'comfy-base/output');
 assert.equal(call.state,'succeeded');assert.equal(call.tool,'h3');assert.equal(call.id,attempt.nativeCallId);assert.equal(call.attemptId,attempt.id);assert.equal(call.projectId,attempt.projectId);
 const command=record(record(call.launch).command);assert.ok(Array.isArray(command.args));const args=command.args as string[];assert.equal(args[args.indexOf('--request')+1],paths.nativeRequest);assert.ok(args.includes('--run')&&!args.includes('--fixture'),'Native command cannot use synthetic output');
 await managed(project,paths.nativeRequest);await managed(project,paths.nativeReceipt);
 const request=await json(paths.nativeRequest),receipt=await json(paths.nativeReceipt);assert.deepEqual(request,call.request);assert.equal(request.schemaVersion,1);assert.equal(request.attemptId,attempt.nativeCallId);assert.equal(request.projectId,attempt.projectId);assert.deepEqual(request.song,plan.song);assert.deepEqual(request.plan,nativePlan);assert.equal(request.seed,attempt.seeds.h3);assert.deepEqual(request.firstFrame,plan.firstFrame);assert.ok(typeof request.prompt==='string'&&request.prompt.trim());
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.state,'succeeded');assert.equal(receipt.synthetic,false);assert.equal(receipt.attemptId,attempt.nativeCallId);assert.equal(receipt.projectId,attempt.projectId);assert.deepEqual(receipt.plan,nativePlan);
 assert.equal(receipt.requestSha256,await sha(paths.nativeRequest,signal));assert.equal(await sha(join(run,'request.json'),signal),receipt.requestSha256);
 assert.deepEqual(receipt.sourceHashes,plan.sourceHashes);assert.equal(receipt.modelManifestSha256,plan.modelManifestSha256);assert.deepEqual(receipt.verifiedModels,plan.verifiedModels);assert.equal(receipt.recipeSha256,plan.recipeSha256);assert.equal(receipt.lockSha256,plan.lockSha256);assert.equal(receipt.sourceRevision,plan.sourceRevision);assert.deepEqual(receipt.actualSeeds,attempt.seeds);
 assert.equal(receipt.ownedServiceExited,true);assert.equal(receipt.ownedGpuProcessAbsent,true);assert.equal(receipt.observerExited,true);
 if(plan.firstFrame){
  const frame=attempt.continuation!.frame,observed=record(receipt.firstFrame);
  assert.deepEqual(observed,{path:join(run,'inputs/continuation.png'),sourcePath:plan.firstFrame.path,sha256:frame.sha256,pixelSha256:frame.pixelSha256,bytes:frame.bytes,width:640,height:480});
  for(const path of [plan.firstFrame.path,String(observed.path),join(run,'comfy-base/input/continuation.png')]){await managed(project,path);assert.equal((await stat(path)).size,frame.bytes);assert.equal(await sha(path,signal),frame.sha256,'Continuation input copy changed');}
 }else assert.equal(receipt.firstFrame,undefined,'Unexpected continuation receipt');
 const condition=record(receipt.conditioning);assert.equal(condition.songPath,plan.song.path);assert.equal(condition.songSha256,plan.song.sha256);assert.equal(condition.songSamples,Number(attempt.song.sampleCount));assert.equal(condition.sampleRate,48000);assert.equal(condition.channels,2);assert.equal(condition.samples,nativePlan.conditioning.totalSamples);
 for(const[k,v]of Object.entries(nativePlan.conditioning))assert.equal(condition[k],v,`Conditioning ${k} differs`);
 assert.equal(condition.whollyPostSong,nativePlan.conditioning.availableSamples===0);
 const conditioning=join(run,'inputs/conditioning.wav'),snapshot=join(run,'inputs/source-song.wav');assert.equal(condition.path,conditioning);assert.equal(condition.sourceSnapshot,snapshot);
 for(const p of [plan.song.path,snapshot,conditioning,join(run,'comfy-base/input/conditioning.wav')])await managed(project,p);
 assert.equal(await sha(plan.song.path,signal),plan.song.sha256,'Original song changed');assert.equal(await sha(snapshot,signal),plan.song.sha256);assert.equal(await sha(conditioning,signal),condition.sha256);assert.equal(await sha(join(run,'comfy-base/input/conditioning.wav'),signal),condition.sha256);
 const graphPath=join(run,'workflow-api.json'),historyPath=join(run,'history.json');await managed(project,graphPath);await managed(project,historyPath);
 const graph=await json(graphPath),history=await json(historyPath);assert.equal(typeof receipt.promptId,'string');const promptId=String(receipt.promptId);assert.deepEqual(Object.keys(history),[promptId]);assert.equal((await json(join(run,'submission.json'))).prompt_id,promptId);
 const executed=record(history[promptId]);assert.ok(Array.isArray(executed.prompt));assert.equal(executed.prompt[1],promptId);assert.deepEqual(executed.prompt[2],graph);assert.equal(record(executed.status).completed,true);assert.equal(record(executed.status).status_str,'success');
 const node=(id:string,type:string)=>{const n=record(graph[id]);assert.equal(n.class_type,type);return record(n.inputs);};
 for(const [id,type,key,folder]of [['1','UNETLoader','unet_name','diffusion_models'],['2','CLIPLoader','clip_name','text_encoders'],['3','VAELoader','vae_name','vae'],['4','VAELoader','vae_name','vae']]){const filename=node(id!,type!)[key!];assert.ok(typeof filename==='string'&&plan.verifiedModels.some(m=>m.path.endsWith(`/${folder}/${filename}`)),'Graph model is not in the captured pinned manifest');}
 assert.deepEqual(node('5','MiniMaxH3ImageToVideo').clip,['2',0]);assert.deepEqual(node('5','MiniMaxH3ImageToVideo').vae,['3',0]);
 assert.deepEqual(node('7','MiniMaxH3AddGuide').latent,['5',1]);assert.deepEqual(node('7','MiniMaxH3AddGuide').audio_vae,['4',0]);assert.equal(node('7','MiniMaxH3AddGuide').frame_idx,0);
 assert.deepEqual(node('8','BasicGuider').model,['1',0]);assert.deepEqual(node('12','SamplerCustomAdvanced').noise,['9',0]);assert.deepEqual(node('13','VAEDecode').vae,['3',0]);assert.deepEqual(node('14','VAEDecodeAudio').vae,['4',0]);
 const visual=node('5','MiniMaxH3ImageToVideo');assert.equal(visual.length,nativePlan.nativeFrames);assert.equal(visual.prompt,request.prompt);assert.equal(visual.width,640);assert.equal(visual.height,480);assert.equal(visual.last_frame,undefined,'Unrequested ending image');
 if(plan.firstFrame){assert.deepEqual(visual.first_frame,['19',0]);assert.equal(node('19','LoadImage').image,'continuation.png');}else{assert.equal(visual.first_frame,undefined,'Unrequested starting image');assert.equal(graph['19'],undefined);}
 assert.equal(String(node('9','RandomNoise').noise_seed),attempt.seeds.h3);assert.equal(node('6','LoadAudio').audio,'conditioning.wav');
 assert.deepEqual(node('7','MiniMaxH3AddGuide').audio,['6',0]);assert.deepEqual(node('7','MiniMaxH3AddGuide').positive,['5',0]);assert.deepEqual(node('8','BasicGuider').conditioning,['7',0]);assert.deepEqual(node('12','SamplerCustomAdvanced').guider,['8',0]);assert.deepEqual(node('12','SamplerCustomAdvanced').latent_image,['5',1]);assert.deepEqual(node('13','VAEDecode').samples,['12',0]);
 assert.deepEqual(node('15','SaveImage').images,['13',0]);assert.deepEqual(node('16','CreateVideo').images,['13',0]);assert.equal(node('16','CreateVideo').fps,24);assert.deepEqual(node('17','SaveVideo').video,['16',0]);
 assert.deepEqual(node('14','VAEDecodeAudio').samples,['12',0]);assert.deepEqual(node('16','CreateVideo').audio,['14',0]);assert.deepEqual(node('18','SaveAudioAdvanced').audio,['14',0]);
 const queueAfter=await json(join(run,'queue-after.json'));for(const key of ['queue_running','queue_pending']){assert.ok(Array.isArray(queueAfter[key]));assert.ok(!queueAfter[key].some(v=>Array.isArray(v)&&v[1]===promptId),'Completed prompt remains queued');}
 const outputs=record(receipt.outputs),observedOutputs=record(executed.outputs);assert.equal(outputs.nativeFrames,nativePlan.nativeFrames);assert.equal(outputs.requestedFrames,nativePlan.requestedFrames);assert.deepEqual(outputs.initialPlacement,nativePlan.placement);
 const manifestPath=join(run,'original-frames.json');assert.equal(outputs.frameManifestPath,manifestPath);await managed(project,manifestPath);const manifest=await json(manifestPath);assert.equal(manifest.origin,'pre-encode');assert.ok(Array.isArray(manifest.frames)&&manifest.frames.length===nativePlan.nativeFrames);
 function artifact(value:unknown){const item=record(value);assert.equal(item.type,'output');assert.equal(typeof item.subfolder,'string');assert.equal(typeof item.filename,'string');assert.ok(!String(item.filename).includes('/')&&!String(item.filename).includes('\\'));return join(outputRoot,String(item.subfolder),String(item.filename));}
 const imageItems=record(observedOutputs['15']).images;assert.ok(Array.isArray(imageItems));const framePaths=imageItems.map(artifact);assert.equal(new Set(framePaths).size,nativePlan.nativeFrames);assert.equal(framePaths.length,nativePlan.nativeFrames);
 const frames:VideoOutputInput['frames']=[];
 for(let i=0;i<framePaths.length;i++){signal?.throwIfAborted();const p=framePaths[i]!,f=record(manifest.frames[i]);await managed(outputRoot,p);assert.equal(f.path,p);assert.equal(f.index,i+1);assert.equal(f.bytes,(await stat(p)).size);assert.equal(await sha(p,signal),f.sha256,'Original frame checksum differs');assert.match(String(f.pixelSha256),/^[a-f0-9]{64}$/);frames.push({assetId:randomUUID(),path:p,index:i,sha256:String(f.sha256),pixelSha256:String(f.pixelSha256),bytes:Number(f.bytes)});}
 const list=(id:string,key:string)=>{const a=record(observedOutputs[id])[key];assert.ok(Array.isArray(a)&&a.length===1);return artifact(a[0]);};
 const videoPath=list('17','images'),audioPath=list('18','audio'),video=record(outputs.video),audio=record(outputs.audio);assert.equal(video.path,videoPath);assert.equal(audio.path,audioPath);
 for(const[p,expected]of [[videoPath,video.sha256],[audioPath,audio.sha256]] as const){await managed(outputRoot,p);assert.equal(await sha(p,signal),expected,'Native media checksum differs');}
 await mkdir(join(paths.validation,'..'),{recursive:true,mode:0o700});await mkdir(paths.validation,{mode:0o700});
 const exec=async(executable:string,args:string[])=>{signal?.throwIfAborted();const result=await execute({executable,args,cwd:plan.launch.cwd,env:{...process.env,STUDIO_DATA_ROOT:runtime},timeoutMs:600000,...(signal?{signal}:{})});assert.equal(result.code,0,`${executable} failed: ${(result.stderr||result.stdout).slice(-4000)}`);return result.stdout;};
 const inspectInput=join(run,'original-frame-inputs.json');await managed(project,inspectInput);const originalInputs=await json(inspectInput);assert.deepEqual(originalInputs.paths,framePaths);assert.deepEqual(originalInputs.graph,graph);assert.equal(originalInputs.audioSha256,condition.sha256);assert.equal(originalInputs.firstFrameSha256,plan.firstFrame?.sha256);
 // Preserve integer lexical form in the graph: copying raw JSON avoids 64-bit seed rounding.
 const inspectionInput=join(paths.validation,'png-inputs.json'),inspectionResult=join(paths.validation,'png-result.json');await writeFile(inspectionInput,await readFile(inspectInput),{flag:'wx',mode:0o600});
 assert.equal(await sha(join(source,'integrations/h3/media.py'),signal),plan.sourceHashes['media.py'],'PNG inspector changed since capture');
 await exec(join(runtime,'tools/comfyui/venv/bin/python'),['-I','-c','import runpy,sys,json\nm=runpy.run_path(sys.argv[1])\nwith open(sys.argv[3],"x") as f: json.dump(m["inspect_pngs"](sys.argv[2]),f)',join(source,'integrations/h3/media.py'),inspectionInput,inspectionResult]);
 assert.ok((await stat(inspectionResult)).size<=16_000_000);assert.deepEqual(parse(await readFile(inspectionResult,'utf8')),manifest.frames,'Decoded PNG pixels/metadata differ from retained manifest');
 const probe=async(p:string)=>{const r=record(parse(await exec('/usr/bin/ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p])));assert.ok(Array.isArray(r.streams));return r.streams.map(record);};
 const vs=await probe(videoPath),v=vs.filter(s=>s.codec_type==='video'),a=vs.filter(s=>s.codec_type==='audio');assert.equal(vs.length,2);assert.equal(v.length,1);assert.equal(a.length,1);
 assert.deepEqual([v[0]!.codec_name,v[0]!.pix_fmt,v[0]!.width,v[0]!.height,v[0]!.r_frame_rate],['h264','yuv420p',640,480,'24/1']);assert.equal(Number(v[0]!.nb_read_frames),nativePlan.nativeFrames);assert.equal(duration(v[0]!,24),BigInt(nativePlan.nativeFrames));assert.equal(Number(v[0]!.start_pts??0),0);
 const nativeSamples=800*Math.floor((nativePlan.nativeFrames*5+1)/3),as=await probe(audioPath);assert.equal(as.length,1);assert.deepEqual([as[0]!.codec_type,as[0]!.codec_name,as[0]!.sample_rate,as[0]!.channels],['audio','flac','32000',2]);assert.equal(duration(as[0]!,32000),BigInt(nativeSamples));assert.equal(audio.samples,nativeSamples);assert.equal(audio.sampleRate,32000);assert.equal(audio.channels,2);
 const muxSamples=Math.min(nativeSamples,Math.ceil(32000*nativePlan.nativeFrames/24));assert.equal(audio.muxInputSamples,muxSamples);assert.deepEqual([a[0]!.codec_name,a[0]!.sample_rate,a[0]!.channels],['aac','32000',2]);const padding=duration(a[0]!,32000)-BigInt(muxSamples);assert.ok(padding>=0n&&padding<1024n);
 const cs=await probe(conditioning);assert.equal(cs.length,1);assert.deepEqual([cs[0]!.codec_name,cs[0]!.sample_rate,cs[0]!.channels],['pcm_f32le','48000',2]);assert.equal(duration(cs[0]!,48000),BigInt(nativePlan.conditioning.totalSamples));
 const ss=await probe(snapshot);assert.equal(ss.length,1);assert.deepEqual([ss[0]!.codec_name,ss[0]!.sample_rate,ss[0]!.channels],['pcm_f32le','48000',2]);assert.equal(duration(ss[0]!,48000),BigInt(attempt.song.sampleCount));
 const prefix=['-nostdin','-v','error','-xerror','-threads','1','-filter_threads','1'];
 for(const p of [videoPath,audioPath])await exec('/usr/bin/ffmpeg',[...prefix,'-i',p,'-f','null','-']);
 const c=nativePlan.conditioning,expectedInput=c.availableSamples?['-i',snapshot,'-map','0:a:0','-af',`atrim=start_sample=${c.startSample}:end_sample=${c.startSample+c.availableSamples},asetpts=PTS-STARTPTS,apad=whole_len=${c.totalSamples},atrim=end_sample=${c.totalSamples}`]:['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-af',`atrim=end_sample=${c.totalSamples}`];
 const hashArgs=['-c:a','pcm_f32le','-ar','48000','-ac','2','-f','hash','-hash','sha256','-'];
 const expectedHash=(await exec('/usr/bin/ffmpeg',[...prefix,...expectedInput,...hashArgs])).trim(),actualHash=(await exec('/usr/bin/ffmpeg',[...prefix,'-i',conditioning,...hashArgs])).trim();assert.match(expectedHash,/^SHA256=[a-fA-F0-9]{64}$/);assert.equal(actualHash,expectedHash,'Conditioning PCM differs from the captured song interval/silence');
 // Detect concurrent edits during decoding instead of registering mismatched bytes.
 for(const f of frames)assert.equal(await sha(f.path,signal),f.sha256);assert.equal(await sha(videoPath,signal),video.sha256);assert.equal(await sha(audioPath,signal),audio.sha256);assert.equal(await sha(conditioning,signal),condition.sha256);
 const details={nativeCallId:call.id,nativeReceiptPath:paths.nativeReceipt,nativeRequest:bounded(request,paths.nativeRequest),nativeReceipt:bounded(receipt,paths.nativeReceipt),workflowPath:graphPath,workflowSha256:await sha(graphPath,signal),frameManifestPath:manifestPath,frameManifestSha256:await sha(manifestPath,signal),validationDirectory:paths.validation,conditioningPcmSha256:expectedHash,actualSeeds:receipt.actualSeeds,nativeFrames:nativePlan.nativeFrames,requestedFrames:nativePlan.requestedFrames,extraNativeFrames:nativePlan.nativeFrames-nativePlan.requestedFrames,boundary:'Verified native ownership release, request/graph/seed provenance, all original PNG pixels and metadata, media decoding and exact conditioning. No listening or perceptual quality judgement.'};
 await writeFile(join(paths.validation,'receipt.json'),JSON.stringify({state:'succeeded',...details},null,2)+'\n',{flag:'wx',mode:0o600});
 return{output:{title:(attempt.input.clipPrompt.split(/\r?\n/).find(s=>s.trim())??'Generated clip').trim().slice(0,240).replace(/[\uD800-\uDBFF]$/u,''),video:{assetId:randomUUID(),path:videoPath,sha256:String(video.sha256)},audio:{assetId:randomUUID(),path:audioPath,sha256:String(audio.sha256),sampleCount:String(nativeSamples),sampleRate:32000,channels:2},frames,frameCount:nativePlan.nativeFrames,width:640,height:480,fps:'24/1'},details};
}
export async function runVideoTask(o:RunOptions,deps:VideoTaskDependencies={}):Promise<void>{
 const {store,queue,attempt,runtime}=o,provider=deps.provider??runProvider,execute=deps.execute??executeSetupCommand;let dispatched=false,nativeDispatched=false,knownStopped=false,plan:TaskPlan|undefined;
 let details:Rec={...(store.videoAttempt(attempt.id)?.details??{}),planPath:planPath(o)};
 try{
  o.signal?.throwIfAborted();validate(o);plan=await json(planPath(o)) as unknown as TaskPlan;
  if(attempt.details.planSha256)assert.equal(await fileHash(planPath(o)),attempt.details.planSha256,'Captured task hash changed');
  if(plan.executionSource)await verifyExecutionSource(plan.executionSource);
  assert.equal(plan.schemaVersion,1);assert.equal(plan.runtime,runtime);if(!plan.executionSource)assert.equal(plan.source,o.source);assert.equal(plan.origin,o.origin);assert.deepEqual(plan.attempt,captured(attempt));assert.deepEqual(plan.nativePlan,nativeVideoPlan(attempt));assert.equal(plan.paths.planPath,planPath(o));
  assert.deepEqual(plan.firstFrame,continuationFrameInput(runtime,attempt));
  assert.equal(plan.launch.cwd,join(runtime,'projects',attempt.projectId,'workspace'));assert.equal(plan.launch.runDirectory,join(plan.launch.cwd,'runs',attempt.id));
  const asset=store.asset(attempt.song.assetId);assert.ok(asset&&asset.projectId===attempt.projectId&&asset.sha256===attempt.song.sha256);assert.equal(plan.song.sha256,asset.sha256);assert.equal(plan.song.path,attempt.recovery&&plan.replaySong?plan.replaySong.path:asset.path);await managed(join(runtime,'projects',attempt.projectId),plan.song.path);assert.equal(await sha(plan.song.path,o.signal),asset.sha256,'Source song changed since capture');
  if(plan.firstFrame){await managed(join(runtime,'projects',attempt.projectId),plan.firstFrame.path);assert.equal(await sha(plan.firstFrame.path,o.signal),plan.firstFrame.sha256,'Captured continuation snapshot changed');
   assert.ok(plan.firstFrameSource);
   const {path:_sourcePath,...sourceFrame}=plan.firstFrameSource;assert.deepEqual(sourceFrame,attempt.continuation!.frame);
   assert.equal(await sha(join(plan.executionSource?.root??o.source,'integrations/h3/media.py'),o.signal),plan.sourceHashes['media.py'],'PNG inspector changed since capture');await inspectFirstFrame({...o,source:plan.executionSource?.root??o.source},plan.firstFrame.path,execute,o.signal);
  }
  details={...details,...(attempt.continuation?{continuation:attempt.continuation,firstFrame:plan.firstFrame,firstFrameSource:plan.firstFrameSource}:{}),guidance:plan.guidance.map(({text:_text,...g})=>g),capturedProvider:attempt.provider,capturedModel:attempt.model,sourceSong:attempt.song,nativePlan:plan.nativePlan};
  o.signal?.throwIfAborted();store.patchVideoAttempt(attempt.id,{state:'running',stage:plan.replayCall?'Replaying exact captured native video request':'Creative agent translating visual brief',details});
  if(plan.replayCall){nativeDispatched=true;knownStopped=true;details.recovery={...plan.replayCall,providerInvoked:false};await runReplayCall({plan:plan.replayCall,attempt,queue,...(o.signal?{signal:o.signal}:{})});}
  else {dispatched=true;
  const result=await provider(plan.launch,o.signal?{signal:o.signal}:{}),path=join(plan.launch.runDirectory,'provider-receipt.json');assert.equal(result.receiptPath,path);const receipt=await json(path);knownStopped=['exited','failed'].includes(String(receipt.state))&&(typeof receipt.code==='number'||typeof receipt.signal==='string');
  details={...details,providerReceiptPath:path,providerOutcome:bounded(receipt,path,40000),providerFinalProse:await tail(result.stdoutPath)};store.patchVideoAttempt(attempt.id,{state:'validating',stage:'Verifying native clip and complete original frame batch',details});
  assert.ok(result.succeeded&&result.code===0&&result.signal===null&&result.inputDelivered,'Creative provider did not complete successfully');assert.equal(receipt.state,'exited');assert.equal(receipt.succeeded,true);assert.equal(receipt.code,0);assert.equal(receipt.inputDelivered,true);assert.equal(receipt.executable,plan.launch.executable);assert.deepEqual(receipt.argv,plan.launch.argv);assert.equal(receipt.cwd,plan.launch.cwd);
  }
  o.signal?.throwIfAborted();
  const call=queue.get(attempt.nativeCallId);assert.ok(call,'Provider completed without registered native clip');await verifyRelease(call,queue,runtime);const verified=await verifyVideo(plan,call,execute,o.signal);o.signal?.throwIfAborted();
  store.finishVideo(attempt.id,verified.output,{...details,...verified.details});
 }catch(error){
  if(o.signal?.aborted&&!dispatched&&!nativeDispatched&&!store.videoAttempt(attempt.id)?.cancellation){const current=store.videoAttempt(attempt.id);if(current&&!['succeeded','failed','reconciling'].includes(current.state))store.patchVideoAttempt(attempt.id,{state:'queued',stage:'Queued; studio stopped before provider dispatch',details});return;}
  if(error instanceof ProviderLaunchAbortedError)knownStopped=true;
  if(dispatched&&!knownStopped&&plan){try{const path=join(plan.launch.runDirectory,'provider-receipt.json'),r=await json(path);knownStopped=['exited','failed'].includes(String(r.state))&&(typeof r.code==='number'||typeof r.signal==='string'||(!!r.cleanup&&record(r.cleanup).cliStopped===true));details.providerReceiptPath=path;details.providerOutcome=bounded(r,path,40000);details.providerFinalProse=await tail(join(plan.launch.runDirectory,'provider.stdout.log'));}catch{/* Retain uncertain owned provider. */}}
  if(store.videoAttempt(attempt.id)?.cancellation){await settleCancellation({store,queue,runtime,attemptId:attempt.id,providerStopped:!dispatched||knownStopped,details});return;}
  const call=queue.get(attempt.nativeCallId);let uncertain=dispatched&&!knownStopped;
  if(call){if(!['succeeded','failed','cancelled'].includes(call.state)||queue.heldLease()?.callId===call.id){uncertain=true;queue.cancelAttempt(attempt.id);}else if(call.owner!==null){try{await verifyRelease(call,queue,runtime);}catch{uncertain=true;}}else if(call.state==='succeeded'||!call.release||record(call.release).neverLaunched!==true)uncertain=true;}
  details.failure=message(error);const current=store.videoAttempt(attempt.id);if(current&&!['succeeded','failed'].includes(current.state))store.patchVideoAttempt(attempt.id,{state:uncertain?'reconciling':'failed',stage:uncertain?'Native/provider cleanup requires reconciliation':'Video generation failed',error:message(error),details});
 }
}
