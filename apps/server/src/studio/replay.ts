/** Recovery changes execution identity/path only, not creative parameters. The
 * supported native request is itself the captured score/prompt/settings record. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import type {StudioAttempt} from '../../../../packages/core/src/contracts/studio.ts';
import type {GpuQueue,Json,CallInput} from '../jobs/gpu-queue-contract.ts';
import {providerLaunch} from '../providers/launch.ts';
import {captureReplayFile,verifyReplayFile,verifyExecutionSource,fileHash,type ExecutionSource,type ReplayFile} from './execution-snapshot.ts';
export interface ReplayCall {parentAttemptId:string;parentCallId:string;request:Json;requestSha256:string}
const record=(v:unknown):Record<string,any>=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,any>;};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function nativeFailureDetail(call:{error:string|null;result:Json;release:Json}):string{
 const object=(v:Json|undefined):Record<string,Json>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v:{};
 const result=object(call.result),after=object(object(call.release).after);
 // A missing helper receipt after an OOM kill is expected. The independently
 // retained unit result identifies host pressure, not necessarily CUDA VRAM OOM.
 if(after.Result==='oom-kill')return 'Owned native worker was killed for host memory pressure (systemd result: oom-kill). Consider lower-memory tool settings; no automatic retry was made.';
 if(call.error)return call.error;
 if(typeof result.error==='string'&&result.error)return result.error;
 if(typeof result.signal==='string')return `Native worker exited on signal ${result.signal}`;
 if(typeof result.code==='number')return `Native worker exited with code ${result.code}`;
 return 'See retained native receipt and resource-release evidence';
}
/** Rewrite execution addresses only; literal creative text and guidance are not templates. */
function reboundPrompt(original:Record<string,any>,parent:StudioAttempt,replacements:[string,string][]):string{
 let prompt=String(original.launch.stdin);const protectedParts=new Map<string,string>();
 const input=parent.input,block='song' in parent?`Persistent VISUAL style:\n${parent.input.style}\n\nIndividual clip brief:\n${parent.input.clipPrompt}`:`Music description:\n${(input as {musicPrompt:string}).musicPrompt}\n\nOptional user lyrics (preserve supplied words):\n${(input as {lyrics:string}).lyrics}`;
 const blocks=[block,...(Array.isArray(original.guidance)?original.guidance.map((g:{sourcePath:string;sha256:string;text:string})=>`Product guidance ${g.sourcePath}; SHA256 ${g.sha256}:\n\n${g.text}`):[])];
 for(const text of blocks){if(!prompt.includes(text))continue;const token=`__STUDIO_LITERAL_${randomUUID()}__`;protectedParts.set(token,text);prompt=prompt.replaceAll(text,token);}
 for(const[from,to]of replacements){assert.ok(from);prompt=prompt.replaceAll(from,to);}
 for(const[token,text]of protectedParts)prompt=prompt.replaceAll(token,text);return prompt;
}
export async function runReplayCall(o:{plan:ReplayCall;attempt:StudioAttempt;queue:GpuQueue;signal?:AbortSignal;timeoutMs?:number}):Promise<void>{
 o.signal?.throwIfAborted();assert.equal(digest(o.plan.request),o.plan.requestSha256,'Resolved replay request changed');
 const tool='song' in o.attempt?'h3':'yue2',input:CallInput={id:o.attempt.nativeCallId,attemptId:o.attempt.id,projectId:o.attempt.projectId,tool,request:o.plan.request};
 o.queue.submit(input);const deadline=performance.now()+(o.timeoutMs??14_400_000);
 for(;;){o.signal?.throwIfAborted();const call=o.queue.get(input.id);assert.ok(call,'Captured native replay disappeared');if(call.state==='succeeded')return;if(['failed','cancelled','reconciling'].includes(call.state))throw Error(`Native recovery ${call.state}: ${nativeFailureDetail(call)}`);if(performance.now()>=deadline){o.queue.cancelAttempt(input.attemptId);throw Error('Native recovery observation timed out; cleanup requires reconciliation');}await delay(50,undefined,o.signal?{signal:o.signal}:{});}
}
/** Caller already allocated a linked attempt with original parameters/seeds. */
export async function prepareRecoveryTask(o:{runtime:string;origin:string;attempt:StudioAttempt;parent:StudioAttempt;queue:GpuQueue}):Promise<{planPath:string;planSha256:string;nativeReplayRequest?:Json;nativeRecoverySong?:{path:string;sha256:string}}>{
 const {runtime,attempt,parent,queue,origin}=o;
 assert.equal(attempt.projectId,parent.projectId);assert.deepEqual(attempt.input,parent.input);assert.deepEqual(attempt.seeds,parent.seeds);assert.equal(attempt.provider,parent.provider);assert.equal(attempt.model,parent.model);
 assert.ok(typeof parent.details.planPath==='string'&&typeof parent.details.planSha256==='string','Exact recovery unavailable: original captured task/hash missing');
 assert.equal(await fileHash(parent.details.planPath),parent.details.planSha256,'Original captured task changed');assert.ok((await stat(parent.details.planPath)).size<=4_000_000);
 const original=record(JSON.parse(await readFile(parent.details.planPath,'utf8')));assert.equal(original.attempt.id,parent.id);assert.equal(original.attempt.nativeCallId,parent.nativeCallId);assert.equal(original.runtime,runtime);
 assert.ok(original.executionSource,'Exact recovery unavailable: original executable snapshot missing');await verifyExecutionSource(original.executionSource);
 const directory=join(runtime,'projects',attempt.projectId,'inputs',attempt.id),planPath=join(directory,'captured-task.json');await mkdir(directory,{recursive:false,mode:0o700});
 const executionSource:ExecutionSource={root:join(directory,'execution-source'),files:[]};await mkdir(executionSource.root,{mode:0o700});
 for(const file of (original.executionSource as ExecutionSource).files){const rel=relative(original.executionSource.root,file.path);assert.ok(rel&&!rel.startsWith('../')&&!isAbsolute(rel));executionSource.files.push(await captureReplayFile(file.path,join(executionSource.root,rel),file.sha256));}
 const plan=structuredClone(original);plan.executionSource=executionSource;plan.origin=origin;plan.attempt={...plan.attempt,id:attempt.id,nativeCallId:attempt.nativeCallId};
 const project=join(runtime,'projects',attempt.projectId),launch=providerLaunch(runtime,{projectId:attempt.projectId,attemptId:attempt.id,songId:'song' in attempt?attempt.song.id:attempt.nativeCallId,provider:attempt.provider,model:attempt.model,musicPrompt:'',lyrics:'',style:'',clipPrompt:'',startFrame:0,endFrame:0,seeds:attempt.seeds});
 plan.launch={...launch,executable:original.launch.executable,stdin:String(original.launch.stdin)};
 const replacePath=(p:string)=>p.replaceAll(parent.nativeCallId,attempt.nativeCallId).replaceAll(parent.id,attempt.id);
 plan.paths=Object.fromEntries(Object.entries(original.paths).map(([k,v])=>[k,typeof v==='string'?replacePath(v):v]));plan.paths.planPath=planPath;
 if('song' in attempt){
  assert.ok(original.replaySong,'Exact recovery unavailable: captured song missing');await verifyReplayFile(original.replaySong);plan.replaySong=await captureReplayFile(original.replaySong.path,join(directory,'source-song.wav'),attempt.song.sha256);plan.song={path:plan.replaySong.path,sha256:attempt.song.sha256};
  if(original.firstFrame){const frame=attempt.continuation!.frame;const saved:ReplayFile={path:original.firstFrame.path,sha256:frame.sha256,bytes:frame.bytes};await verifyReplayFile(saved);const copy=await captureReplayFile(saved.path,join(directory,'continuation.png'),saved.sha256);plan.firstFrame={path:copy.path,sha256:copy.sha256,pixelSha256:frame.pixelSha256};}
 }else{const analysisId=randomUUID();plan.paths.analysisId=analysisId;plan.paths.analysisDirectory=join(project,'analysis',analysisId);plan.paths.analysisRequest=join(plan.paths.analysisDirectory,'request.json');plan.paths.analysisReceipt=join(plan.paths.analysisDirectory,'receipt.json');}
 const call=queue.get(parent.nativeCallId);
 let resolved:unknown,sourceCallId:string|undefined;
 if(call){
  assert.equal(call.attemptId,parent.id);assert.equal(call.projectId,parent.projectId);assert.notEqual(call.state,'succeeded','Native call already succeeded; exact retry is unavailable without revalidation. Restore parameters to create a deliberate new generation instead.');assert.ok(['failed','cancelled'].includes(call.state),'Original native ownership is not terminal');assert.equal(call.tool,'song' in attempt?'h3':'yue2','Original native tool differs from captured parent');assert.notEqual(queue.heldLease()?.callId,call.id,'Original native lease remains held');
  resolved=call.request;sourceCallId=call.id;
 }else if(original.replayCall){
  // A later restart may precede submission of a previously resolved replay.
  // Retain that request; absence of this child's native call does not erase it.
  assert.equal(digest(original.replayCall.request),original.replayCall.requestSha256,'Earlier captured replay request changed');
  resolved=original.replayCall.request;sourceCallId=original.replayCall.parentCallId;
 }
 if(resolved){
  const request=structuredClone(record(resolved));request.attemptId=attempt.nativeCallId;
  if('song' in attempt){assert.equal(request.song.sha256,attempt.song.sha256);assert.equal(request.seed,attempt.seeds.h3);assert.deepEqual(request.plan,plan.nativePlan);request.song=plan.song;if(plan.firstFrame)request.firstFrame=plan.firstFrame;else assert.equal(request.firstFrame,undefined);}
  else for(const[k,v]of Object.entries(record(request.seeds)))assert.equal(v,(attempt.seeds as Record<string,string>)[k]);
  plan.replayCall={parentAttemptId:parent.id,parentCallId:sourceCallId,request,requestSha256:digest(request)};
  delete plan.recoveryBeforeNative;
 }else{
  // A cancelled preparer may have made notes, but no actual native call exists.
  // Repeat the original task with the same assigned seeds; do not invent native settings.
  delete plan.replayCall;plan.recoveryBeforeNative={parentAttemptId:parent.id,actualNativeCallExisted:false};
 }
 plan.launch.stdin=reboundPrompt(original,parent,[[parent.nativeCallId,attempt.nativeCallId],[parent.id,attempt.id],[original.origin,origin],...('song' in attempt?[[original.song.path,plan.song.path] as [string,string]]:[])]);
 await writeFile(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});return{planPath,planSha256:await fileHash(planPath),...(plan.replayCall?{nativeReplayRequest:plan.replayCall.request}:{}),...('song' in attempt?{nativeRecoverySong:plan.song}:{})};
}
