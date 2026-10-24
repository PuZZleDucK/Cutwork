/** Explicit fake files/executors; never invokes providers, GPU models or services. */
import {fixtureH3Guides} from '../helpers/h3-guides.ts';
import { afterEach, expect, test, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareVideoTask, runVideoTask, type VideoTaskDependencies } from '../../apps/server/src/studio/video.ts';
test('video planner uses captured editable instructions while retaining exact native context',async()=>{
 const f=await fixture();f.attempt.promptTemplate={revision:7,template:'CUSTOM VIDEO DIRECTION\n{{task_context}}'};
 const p=await prepareVideoTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.launch.stdin).toMatch(/^CUSTOM VIDEO DIRECTION/);expect(plan.launch.stdin).toContain(f.attempt.input.clipPrompt);
 expect(plan.launch.stdin).toContain('scripts/native-call.ts');expect(plan.launch.stdin).toContain(f.attempt.seeds.h3);
 expect(plan.attempt.promptTemplate).toEqual(f.attempt.promptTemplate);
});
test('pre-template queued video keeps legacy instruction order',async()=>{
 const f=await fixture();delete f.attempt.promptTemplate;
 const p=await prepareVideoTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8')),prompt=plan.launch.stdin as string;
 expect(prompt.indexOf('Use the existing helper')).toBeLessThan(prompt.indexOf('Keep the complete original pre-encode'));
 expect(plan.attempt).not.toHaveProperty('promptTemplate');
});
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { VideoAttempt } from '../../packages/core/src/contracts/studio.ts';
import type { GpuCall, GpuQueue } from '../../apps/server/src/jobs/gpu-queue-contract.ts';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
async function save(path:string,value:unknown){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
async function fixture(startFrame=0,endFrame=48,sampleCount='96000'){
 const runtime=await mkdtemp(join(tmpdir(),'studio-video-'));dirs.push(runtime);const source=join(runtime,'source'),origin='http://127.0.0.1:9122',projectId=randomUUID(),songId=randomUUID();
 const songPath=join(runtime,'projects',projectId,'songs','original.wav');await mkdir(join(songPath,'..'),{recursive:true});await writeFile(songPath,'FAKE ORIGINAL SONG');
 const song={id:songId,assetId:randomUUID(),sha256:hash('FAKE ORIGINAL SONG'),sampleCount,sampleRate:48000,channels:2};
 const attempt:VideoAttempt={id:randomUUID(),nativeCallId:randomUUID(),projectId,sequence:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:'queued',provider:'codex',model:'gpt-6.1-sol',input:{songId,clipPrompt:'A robot plays synths on exact beats',style:'Brushed steel and cyan neon',startFrame,endFrame},seeds:{h3:'18446744073709551615'},song,clipId:null,stage:'Queued',error:null,details:{}};
 const current=structuredClone(attempt),finishVideo=vi.fn((id:string,output:unknown,details:unknown)=>{Object.assign(current,{state:'succeeded',clipId:randomUUID(),details});return {id:current.clipId,output};});
 const store={videoAttempt:()=>structuredClone(current),patchVideoAttempt:(_id:string,patch:unknown)=>{Object.assign(current,patch);return structuredClone(current);},finishVideo,asset:()=>({projectId,path:songPath,sha256:song.sha256}),project:()=>({songs:[{...song,analysis:{sampleIndices:['24000','48000','72000']}}]})} as unknown as StudioStore;
 await save(join(source,'integrations/tool-manifest.json'),{node:{version:'24.22.0'},providers:{codex:{version:'0.163.0',model:'gpt-6.1-sol'},claude:{version:'2.1.306',model:'claude-opus-5-5'}}});
 for(const [path,value]of Object.entries({'integrations/knowledge/README.md':'Normal full capabilities unchanged.','integrations/knowledge/video.md':'Fixture video guidance unchanged.','integrations/h3/generate.py':'# fake generator','integrations/h3/workflow.py':'# fake workflow','integrations/h3/media.py':'# fake inspection','integrations/comfyui/requirements.lock':'fake lock'})){await mkdir(join(source,path,'..'),{recursive:true});await writeFile(join(source,path),value);}
 await save(join(source,'integrations/comfyui/recipe.json'),{source:{revision:'fixture-revision'}});
 await save(join(source,'integrations/h3/models.json'),{models:[{repository:'Fixture/H3',revision:'pinned',files:['diffusion_models/model.safetensors','text_encoders/text.safetensors','vae/video.safetensors','vae/audio.safetensors'].map(path=>({path,sha256:'a'.repeat(64),bytes:123}))}]});
 let call:GpuCall|null=null,held=false;const cancel=vi.fn();const queue={get:()=>call,heldLease:()=>held?{callId:attempt.nativeCallId}:null,cancelAttempt:cancel} as unknown as GpuQueue;
 await fixtureH3Guides(runtime,source);
 const options={runtime,source,origin,attempt,store,queue};
 return {...options,options,songPath,current,finishVideo,cancel,setCall:(v:GpuCall|null)=>{call=v;},setHeld:(v:boolean)=>{held=v;}};
}
async function attachContinuation(f:Awaited<ReturnType<typeof fixture>>){
 const clipId=randomUUID(),contextId=randomUUID(),path=join(f.runtime,'projects',f.attempt.projectId,'retained','frame-5.png');
 await mkdir(join(path,'..'),{recursive:true});const bytes=Buffer.from('EXPLICIT FIXTURE ORIGINAL PNG BYTES');await writeFile(path,bytes);
 const frame={assetId:randomUUID(),index:4,sha256:hash(bytes),pixelSha256:'c'.repeat(64),bytes:bytes.length};
 const continuation={contextId,contextRevision:3,clipId,songId:f.attempt.song.id,sourceOriginFrame:19,sourceStartFrame:2,sourceEndFrame:5,endFrame:24,frame};
 f.attempt.continuation=continuation;f.attempt.input.continuation={contextId,contextRevision:3};Object.assign(f.current,structuredClone(f.attempt));
 const oldAsset=f.store.asset,oldProject=f.store.project;
 f.store.asset=(id:string)=>id===frame.assetId?{projectId:f.attempt.projectId,path,sha256:frame.sha256,mediaType:'image/png'}:oldAsset(id);
 f.store.project=(id:string)=>({...oldProject(id),clips:[{id:clipId,rawFrames:[frame]}]} as never);
 const execute:NonNullable<VideoTaskDependencies['execute']>=async c=>{expect(c.executable).toBe(join(f.runtime,'tools/comfyui/venv/bin/python'));expect(c.args).toContain('--inspect-input-png');return{code:0,stdout:JSON.stringify({sha256:hash(await readFile(c.args.at(-1)!)),pixelSha256:frame.pixelSha256,bytes:bytes.length,width:640,height:480}),stderr:''};};
 return{path,bytes,frame,continuation,execute};
}
test('continuation capture copies the exact retained original into private immutable inputs before provider creation',async()=>{
 const f=await fixture(24,72),c=await attachContinuation(f),p=await prepareVideoTask(f.options,{execute:c.execute}),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.attempt.continuation).toEqual(c.continuation);expect(plan.firstFrame).toEqual({path:join(p.planPath,'../continuation.png'),sha256:c.frame.sha256,pixelSha256:c.frame.pixelSha256});
 expect(await readFile(plan.firstFrame.path)).toEqual(c.bytes);expect(plan.firstFrameSource).toEqual({path:c.path,...c.frame});
 expect(plan.launch.stdin).toContain('firstFrame');expect(plan.launch.stdin).toContain('last retained original');expect(plan.launch.stdin).toContain(c.frame.sha256);
 await writeFile(c.path,'LATER ORIGINAL MUTATION');expect(await readFile(plan.firstFrame.path)).toEqual(c.bytes);await expect(stat(plan.launch.runDirectory)).rejects.toMatchObject({code:'ENOENT'});
});
test.each(['source hash','pixel hash','asset project','source manifest'] as const)('continuation capture rejects changed %s without a captured task',async defect=>{
 const f=await fixture(),c=await attachContinuation(f);let execute=c.execute;
 if(defect==='source hash')await writeFile(c.path,'changed');
 if(defect==='pixel hash')execute=async cmd=>({...await c.execute(cmd),stdout:JSON.stringify({sha256:c.frame.sha256,pixelSha256:'0'.repeat(64),bytes:c.bytes.length,width:640,height:480})});
 if(defect==='asset project'){const asset=f.store.asset;f.store.asset=id=>{const a=asset(id);return id===c.frame.assetId&&a?{...a,projectId:randomUUID()}:a;};}
 if(defect==='source manifest'){const project=f.store.project;f.store.project=id=>({...project(id),clips:[]});}
 await expect(prepareVideoTask(f.options,{execute})).rejects.toThrow();await expect(stat(join(f.runtime,'projects',f.attempt.projectId,'inputs',f.attempt.id,'captured-task.json'))).rejects.toMatchObject({code:'ENOENT'});
});
test('video capture preserves visual brief, song identity, maximal seed, and 48 requested versus 56 native frames',async()=>{
 const f=await fixture(),p=await prepareVideoTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.attempt.input).toEqual(f.attempt.input);expect(plan.attempt.song).toEqual(f.attempt.song);expect(plan.attempt.seeds.h3).toBe('18446744073709551615');
 expect(plan.nativePlan).toMatchObject({fps:'24/1',requestedFrames:48,nativeFrames:56,placement:{startFrame:0,endFrame:48},conditioning:{availableSamples:96000,silenceSamples:16000,totalSamples:112000}});
 expect(plan.launch.stdin).toContain(f.attempt.input.style);expect(plan.launch.stdin).toContain(f.attempt.input.clipPrompt);expect(plan.launch.stdin).toContain('normal capabilities');expect(plan.launch.stdin).toContain('native-call.ts');
 expect(plan.launch.stdin).not.toContain('500-token');expect(plan.launch.argv).toContain('--dangerously-bypass-approvals-and-sandbox');expect(plan.launch.executable).toContain('codex-0.163.0_claude-2.1.306');
 expect(plan.guidance.map((v:{name:string})=>v.name)).toEqual(['README.md','video.md','VIDEO_PROMPT_WRITING_GUIDE_base_en.md']);expect(plan.guidance[1].text).toBe('Fixture video guidance unchanged.');
 await expect(stat(plan.launch.runDirectory)).rejects.toMatchObject({code:'ENOENT'});await expect(prepareVideoTask(f.options)).rejects.toThrow();
});
test.each([[0,1,'96000',5,0],[100,148,'96000',56,112000],[0,361,'96000',362,628000]] as const)('native counts and overshoot silence for %s..%s are explicit, not a duration cap',async(start,end,samples,native,silence)=>{
 const f=await fixture(start,end,samples),p=await prepareVideoTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.nativePlan.nativeFrames).toBe(native);expect(plan.nativePlan.conditioning.silenceSamples).toBe(silence);expect(plan.nativePlan.durationWarning).toBe(end-start>360);
});
test('captured song mutation fails preparation instead of silently conditioning a different song',async()=>{const f=await fixture();await writeFile(f.songPath,'changed');await expect(prepareVideoTask(f.options)).rejects.toThrow(/song|hash/i);});
test('aborted video task never launches a provider and remains queued',async()=>{const f=await fixture();await prepareVideoTask(f.options);const c=new AbortController();c.abort();const provider=vi.fn();await runVideoTask({...f.options,signal:c.signal},{provider});expect(provider).not.toHaveBeenCalled();expect(f.current.state).toBe('queued');});

async function nativeFixture(startFrame=0,endFrame=48,samples='96000',continuing=false){
 const f=await fixture(startFrame,endFrame,samples),continuation=continuing?await attachContinuation(f):null,p=await prepareVideoTask(f.options,continuation?{execute:continuation.execute}:{}),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 const run=join(f.runtime,'projects',f.attempt.projectId,'runs',f.attempt.nativeCallId),root=join(run,'comfy-base/output');
 const write=async(path:string,bytes:string|Buffer)=>{await mkdir(join(path,'..'),{recursive:true});await writeFile(path,bytes);};
 const request={schemaVersion:1,attemptId:f.attempt.nativeCallId,projectId:f.attempt.projectId,song:plan.song,plan:plan.nativePlan,seed:f.attempt.seeds.h3,prompt:'Translated native multimodal robot description',...(plan.firstFrame?{firstFrame:plan.firstFrame}:{})};
 await save(plan.paths.nativeRequest,request);await write(join(run,'request.json'),await readFile(plan.paths.nativeRequest));
 await write(join(run,'inputs/source-song.wav'),await readFile(f.songPath));const conditioning=join(run,'inputs/conditioning.wav');await write(conditioning,'FAKE EXACT CONDITIONING');await write(join(run,'comfy-base/input/conditioning.wav'),'FAKE EXACT CONDITIONING');
 const condition={...plan.nativePlan.conditioning,path:conditioning,sha256:hash('FAKE EXACT CONDITIONING'),sourceSnapshot:join(run,'inputs/source-song.wav'),songPath:f.songPath,songSha256:f.attempt.song.sha256,songSamples:Number(samples),sampleRate:48000,channels:2,samples:plan.nativePlan.conditioning.totalSamples,whollyPostSong:plan.nativePlan.conditioning.availableSamples===0};
 const node=(class_type:string,inputs:unknown)=>({class_type,inputs});
 const graph:Record<string,{class_type:string;inputs:Record<string,unknown>}>= {
  '1':node('UNETLoader',{unet_name:'model.safetensors'}) as never,'2':node('CLIPLoader',{clip_name:'text.safetensors'}) as never,'3':node('VAELoader',{vae_name:'video.safetensors'}) as never,'4':node('VAELoader',{vae_name:'audio.safetensors'}) as never,
  '5':node('MiniMaxH3ImageToVideo',{clip:['2',0],vae:['3',0],length:plan.nativePlan.nativeFrames,prompt:request.prompt,width:640,height:480}) as never,
  '6':node('LoadAudio',{audio:'conditioning.wav'}) as never,'7':node('MiniMaxH3AddGuide',{audio:['6',0],positive:['5',0],latent:['5',1],audio_vae:['4',0],frame_idx:0}) as never,
  '8':node('BasicGuider',{conditioning:['7',0],model:['1',0]}) as never,'9':node('RandomNoise',{noise_seed:f.attempt.seeds.h3}) as never,
  '12':node('SamplerCustomAdvanced',{guider:['8',0],latent_image:['5',1],noise:['9',0]}) as never,'13':node('VAEDecode',{samples:['12',0],vae:['3',0]}) as never,
  '14':node('VAEDecodeAudio',{samples:['12',0],vae:['4',0]}) as never,'15':node('SaveImage',{images:['13',0]}) as never,
  '16':node('CreateVideo',{images:['13',0],audio:['14',0],fps:24}) as never,'17':node('SaveVideo',{video:['16',0]}) as never,'18':node('SaveAudioAdvanced',{audio:['14',0]}) as never,
 };
 if(plan.firstFrame){graph['19']=node('LoadImage',{image:'continuation.png'}) as never;graph['5']!.inputs.first_frame=['19',0];await write(join(run,'inputs/continuation.png'),await readFile(plan.firstFrame.path));await write(join(run,'comfy-base/input/continuation.png'),await readFile(plan.firstFrame.path));}
 const frames:{index:number;path:string;sha256:string;pixelSha256:string;bytes:number}[]=[];
 for(let i=1;i<=plan.nativePlan.nativeFrames;i++){const path=join(root,'raw',`frame_${String(i).padStart(5,'0')}_.png`),bytes=`FAKE PNG ${i}`;await write(path,bytes);frames.push({index:i,path,sha256:hash(bytes),pixelSha256:'b'.repeat(64),bytes:Buffer.byteLength(bytes)});}
 const videoPath=join(root,'native/clip.mp4'),audioPath=join(root,'audio/clip.flac');await write(videoPath,'FAKE MP4');await write(audioPath,'FAKE FLAC');const nativeSamples=800*Math.floor((plan.nativePlan.nativeFrames*5+1)/3),muxSamples=Math.min(nativeSamples,Math.ceil(32000*plan.nativePlan.nativeFrames/24));
 const artifact=(path:string)=>({type:'output',filename:path.split('/').at(-1),subfolder:path.slice(root.length+1,path.lastIndexOf('/'))}),promptId=randomUUID();
 const history={[promptId]:{prompt:[0,promptId,graph],status:{completed:true,status_str:'success'},outputs:{'15':{images:frames.map(v=>artifact(v.path))},'17':{images:[artifact(videoPath)]},'18':{audio:[artifact(audioPath)]}}}};
 await save(join(run,'history.json'),history);await save(join(run,'workflow-api.json'),graph);await save(join(run,'submission.json'),{prompt_id:promptId});await save(join(run,'queue-after.json'),{queue_running:[],queue_pending:[]});await save(join(run,'original-frames.json'),{origin:'pre-encode',frames});await save(join(run,'original-frame-inputs.json'),{paths:frames.map(v=>v.path),graph,audioSha256:condition.sha256,...(plan.firstFrame?{firstFrameSha256:plan.firstFrame.sha256}:{})});
 const receipt={schemaVersion:1,state:'succeeded',synthetic:false,attemptId:f.attempt.nativeCallId,projectId:f.attempt.projectId,plan:plan.nativePlan,requestSha256:hash(await readFile(plan.paths.nativeRequest)),sourceHashes:plan.sourceHashes,modelManifestSha256:plan.modelManifestSha256,verifiedModels:plan.verifiedModels,recipeSha256:plan.recipeSha256,lockSha256:plan.lockSha256,sourceRevision:plan.sourceRevision,actualSeeds:f.attempt.seeds,ownedServiceExited:true,ownedGpuProcessAbsent:true,observerExited:true,conditioning:condition,...(plan.firstFrame?{firstFrame:{path:join(run,'inputs/continuation.png'),sourcePath:plan.firstFrame.path,sha256:plan.firstFrame.sha256,pixelSha256:plan.firstFrame.pixelSha256,bytes:continuation!.bytes.length,width:640,height:480}}:{}),promptId,outputs:{nativeFrames:plan.nativePlan.nativeFrames,requestedFrames:plan.nativePlan.requestedFrames,initialPlacement:plan.nativePlan.placement,frameManifestPath:join(run,'original-frames.json'),video:{path:videoPath,sha256:hash('FAKE MP4')},audio:{path:audioPath,sha256:hash('FAKE FLAC'),samples:nativeSamples,sampleRate:32000,channels:2,muxInputSamples:muxSamples}}};await save(plan.paths.nativeReceipt,receipt);
 const directory=join(f.runtime,'jobs/native-units',randomUUID()),owner={kind:'systemd-unit',unit:'fixture.service',invocationId:'f'.repeat(32),directory,supervisor:{pid:12345}},release={owner,cgroupEmptyBeforeAndAfterGpu:true,gpuSettling:{state:'released'},gpu:{processes:[]},rememberedPids:[12345]};await save(join(directory,'release.json'),release);await save(join(directory,'exit.json'),{code:0,signal:null});
 const call:GpuCall={id:f.attempt.nativeCallId,attemptId:f.attempt.id,projectId:f.attempt.projectId,tool:'h3',request:request as never,state:'succeeded',sequence:1,cancelRequested:false,launch:{command:{args:['-I','-u',join(f.source,'integrations/h3/generate.py'),'--request',plan.paths.nativeRequest,'--run']}},owner,release,result:{code:0,signal:null},error:null};f.setCall(call);
 const events:string[]=[];const provider=vi.fn(async(launch:Parameters<NonNullable<VideoTaskDependencies['provider']>>[0])=>{
  events.push('provider');await mkdir(launch.runDirectory,{recursive:true});const receiptPath=join(launch.runDirectory,'provider-receipt.json'),stdoutPath=join(launch.runDirectory,'provider.stdout.log'),stderrPath=join(launch.runDirectory,'provider.stderr.log');await write(stdoutPath,'Natural fixture prose, not evidence');await write(stderrPath,'');await save(receiptPath,{state:'exited',succeeded:true,code:0,signal:null,inputDelivered:true,executable:launch.executable,argv:launch.argv,cwd:launch.cwd});return{succeeded:true,code:0,signal:null,inputDelivered:true,receiptPath,stdoutPath,stderrPath,owner:null};
 });
 const execute:NonNullable<VideoTaskDependencies['execute']>=async c=>{
  if(c.executable.endsWith('/python')&&c.args.includes('--inspect-input-png'))return continuation!.execute(c);
  if(c.executable.endsWith('/python')){events.push('png-decode');await save(c.args.at(-1)!,frames);return{code:0,stdout:'',stderr:''};}
  if(c.executable==='/usr/bin/ffprobe'){
   const path=c.args.at(-1),audio=(codec_name:string,sample_rate:string,duration_ts:number)=>({codec_type:'audio',codec_name,sample_rate,channels:2,duration_ts,time_base:`1/${sample_rate}`});
   const streams=path===videoPath?[{codec_type:'video',codec_name:'h264',pix_fmt:'yuv420p',width:640,height:480,r_frame_rate:'24/1',nb_read_frames:String(plan.nativePlan.nativeFrames),duration_ts:plan.nativePlan.nativeFrames,time_base:'1/24'},audio('aac','32000',muxSamples)]:path===audioPath?[audio('flac','32000',nativeSamples)]:[audio('pcm_f32le','48000',path===conditioning?condition.totalSamples:Number(samples))];
   return{code:0,stdout:JSON.stringify({streams}),stderr:''};
  }
  events.push(c.args.includes('hash')?'conditioning-pcm':'media-decode');return{code:0,stdout:c.args.includes('hash')?'SHA256='+ 'a'.repeat(64)+'\n':'',stderr:''};
 };
 return{...f,plan,run,graph,history,frames,receipt,call,videoPath,audioPath,conditioning,events,dependencies:{provider,execute}};
}
test('verified native clip ingests the entire original batch but retains the captured requested interval and seed',async()=>{
 const f=await nativeFixture();await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('succeeded');expect(f.finishVideo).toHaveBeenCalledTimes(1);
 const output=f.finishVideo.mock.calls[0]![1] as {frameCount:number;frames:{index:number}[];audio:{sampleRate:number}};expect(output.frameCount).toBe(56);expect(output.frames).toHaveLength(56);expect(output.frames[0]?.index).toBe(0);expect(output.frames.at(-1)?.index).toBe(55);expect(output.audio.sampleRate).toBe(32000);
 expect(f.events).toContain('png-decode');expect(f.events.filter(v=>v==='media-decode')).toHaveLength(2);expect(f.events.filter(v=>v==='conditioning-pcm')).toHaveLength(2);expect(f.current.details).toHaveProperty('requestedFrames',48);expect(f.current.details).toHaveProperty('extraNativeFrames',8);
});
test.each(['request','seed','raw frame','graph','history','conditioning','native fps','decode','synthetic','model pin'] as const)('rejects inconsistent %s evidence without placing a clip',async defect=>{
 const f=await nativeFixture();let execute=f.dependencies.execute;
 if(defect==='request')f.receipt.requestSha256='0'.repeat(64);
 if(defect==='seed')f.receipt.actualSeeds={h3:'1'};
 if(defect==='raw frame')await writeFile(f.frames[3]!.path,'modified');
 if(defect==='graph'){f.graph['15']!.inputs.images=['5',0];await save(join(f.run,'workflow-api.json'),f.graph);await save(join(f.run,'history.json'),f.history);}
 if(defect==='history')await save(join(f.run,'history.json'),{});
 if(defect==='conditioning'){const original=execute;execute=async(c,l)=>{const result=await original(c,l);return c.args.includes('hash')&&c.args.includes(f.conditioning)?{...result,stdout:'SHA256='+ 'b'.repeat(64)}:result;};}
 if(defect==='native fps'){const original=execute;execute=async(c,l)=>{const result=await original(c,l);return c.executable==='/usr/bin/ffprobe'?{...result,stdout:result.stdout.replace('24/1','30/1')}:result;};}
 if(defect==='decode'){const original=execute;execute=async(c,l)=>c.executable==='/usr/bin/ffmpeg'&&c.args.includes('null')?{code:1,stdout:'',stderr:'decode failed'}:original(c,l);}
 if(defect==='synthetic')f.receipt.synthetic=true;
 if(defect==='model pin')f.receipt.modelManifestSha256='0'.repeat(64);
 await save(f.plan.paths.nativeReceipt,f.receipt);await runVideoTask(f.options,{...f.dependencies,execute});expect(f.current.state).toBe('failed');expect(f.finishVideo).not.toHaveBeenCalled();
});
test('provider success prose without registered native work is a failed clip',async()=>{const f=await nativeFixture();f.setCall(null);await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('failed');expect(f.finishVideo).not.toHaveBeenCalled();});
test('unknown native ownership retains reconciliation and never places the clip',async()=>{const f=await nativeFixture();f.setCall({...f.call,state:'running'});f.setHeld(true);await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('reconciling');expect(f.cancel).toHaveBeenCalledWith(f.attempt.id);expect(f.finishVideo).not.toHaveBeenCalled();});
test('captured input mutation cannot silently change an already queued clip',async()=>{const f=await nativeFixture();f.attempt.input.style='changed';await runVideoTask(f.options,f.dependencies);expect(f.dependencies.provider).not.toHaveBeenCalled();expect(f.current.state).toBe('failed');});
test('wholly post-song native conditioning uses explicit silence and retains the requested placement',async()=>{const f=await nativeFixture(100,148);await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('succeeded');expect(f.receipt.conditioning.whollyPostSong).toBe(true);expect(f.current.details).toHaveProperty('nativePlan.placement',{startFrame:100,endFrame:148});});

 test.each(['noise','model'] as const)('rejects disconnected assigned %s despite matching graph/history/receipt identity',async defect=>{
 const f=await nativeFixture();if(defect==='noise')f.graph['12']!.inputs.noise=['99',0];else f.graph['1']!.inputs.unet_name='unrecorded.safetensors';
 await save(join(f.run,'workflow-api.json'),f.graph);await save(join(f.run,'history.json'),f.history);await save(join(f.run,'original-frame-inputs.json'),{paths:f.frames.map(v=>v.path),graph:f.graph,audioSha256:f.receipt.conditioning.sha256});
 await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('failed');expect(f.finishVideo).not.toHaveBeenCalled();
});

test('verified image plus audio continuation retains captured source after predecessor context changes',async()=>{
 const f=await nativeFixture(24,72,'96000',true);f.store.project=()=>{throw Error('Must not consult mutable context after acceptance');};
 await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('succeeded');expect(f.finishVideo).toHaveBeenCalledTimes(1);expect(f.current.details).toHaveProperty('continuation',f.attempt.continuation);
});
test.each(['snapshot','native copy','request image','graph image','fingerprint input','receipt pixel','captured source'] as const)('continuation rejects mismatched %s and never places text-only output',async defect=>{
 const f=await nativeFixture(24,72,'96000',true);
 if(defect==='snapshot')await writeFile(f.plan.firstFrame.path,'changed');
 if(defect==='native copy')await writeFile(join(f.run,'comfy-base/input/continuation.png'),'changed');
 if(defect==='request image'){delete (f.call.request as Record<string,unknown>).firstFrame;await save(f.plan.paths.nativeRequest,f.call.request);}
 if(defect==='graph image'){delete f.graph['5']!.inputs.first_frame;await save(join(f.run,'workflow-api.json'),f.graph);await save(join(f.run,'history.json'),f.history);}
 if(defect==='fingerprint input'){const p=join(f.run,'original-frame-inputs.json'),v=JSON.parse(await readFile(p,'utf8'));v.firstFrameSha256='0'.repeat(64);await save(p,v);}
 if(defect==='receipt pixel'){f.receipt.firstFrame!.pixelSha256='0'.repeat(64);await save(f.plan.paths.nativeReceipt,f.receipt);}
 if(defect==='captured source')f.attempt.continuation!.frame.index++;
 await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('failed');expect(f.finishVideo).not.toHaveBeenCalled();
});
test('ordinary attempt rejects an unrequested native image input',async()=>{const f=await nativeFixture();f.graph['5']!.inputs.first_frame=['19',0];await save(join(f.run,'workflow-api.json'),f.graph);await save(join(f.run,'history.json'),f.history);await runVideoTask(f.options,f.dependencies);expect(f.current.state).toBe('failed');expect(f.finishVideo).not.toHaveBeenCalled();});

test('new video capture includes complete verified upstream text and T2VA routing even with a custom template',async()=>{
 const f=await fixture();f.attempt.promptTemplate={revision:3,template:'MY TEMPLATE\n{{task_context}}'};
 const p=await prepareVideoTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 const official=plan.guidance.find((g:{name:string})=>g.name==='VIDEO_PROMPT_WRITING_GUIDE_base_en.md');
 expect(official).toBeDefined();expect(plan.launch.stdin).toContain(official.text);expect(plan.launch.stdin).toContain('Mode: T2VA');
 expect(plan.launch.stdin).toContain('Retained beat anchors:');expect(plan.launch.stdin).toContain('Native-tail-only beat anchors:');
 const captured=await readFile(p.planPath,'utf8');await writeFile(join(f.source,'integrations/knowledge/video.md'),'later guidance');
 expect(await readFile(p.planPath,'utf8')).toBe(captured);
});
test('continuation task routes to I2VA, not Ref2VA despite audio and image conditioning',async()=>{
 const f=await fixture(),c=await attachContinuation(f),p=await prepareVideoTask(f.options,{execute:c.execute});
 const plan=JSON.parse(await readFile(p.planPath,'utf8'));expect(plan.launch.stdin).toContain('Mode: I2VA');
 expect(plan.launch.stdin).toContain('<Picture 1> (from [Shot 1]) is fully referenced.');expect(plan.launch.stdin).not.toContain('Mode: Ref2VA');
});

test('custom video context replaces bundled guides without requiring upstream prompt documents',async()=>{
 const f=await fixture();f.attempt.taskContext={id:'video-text',revision:4,template:'CUSTOM {{clip_description}} {{native_inputs_json}} {{retained_beat_anchors}} {{h_seed}}'};
 await rm(join(f.source,'integrations/h3/prompt-guides.json'));await rm(join(f.source,'integrations/knowledge/video.md'));
 const p=await prepareVideoTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.launch.stdin).toContain('CUSTOM');expect(plan.launch.stdin).toContain(f.attempt.seeds.h3);expect(plan.launch.stdin).not.toContain('{{retained_beat_anchors}}');expect(plan.launch.stdin).not.toContain('Fixture video guidance');
 expect(plan.attempt.taskContext).toEqual(f.attempt.taskContext);expect(plan.guidance[0].sourcePath).toBe('config/task-contexts/video-text/revision/4');
});

test('custom I2VA context expands original-frame and timing placeholders without appending the default guide',async()=>{
 const f=await fixture(),c=await attachContinuation(f);
 f.attempt.taskContext={id:'video-image',revision:5,template:'CUSTOM IMAGE {{first_frame_path}} frame={{source_frame_number}} hash={{first_frame_sha256}}\n{{retained_beat_anchors}}\n{{clip_description}}\n{{native_client_command}}'};
 f.attempt.input.clipPrompt='Literal $& {{first_frame_path}} in the user brief';
 await rm(join(f.source,'integrations/h3/prompt-guides.json'));await rm(join(f.source,'integrations/knowledge/video.md'));
 const p=await prepareVideoTask(f.options,{execute:c.execute}),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.launch.stdin).toContain(`CUSTOM IMAGE ${plan.firstFrame.path} frame=5 hash=${c.frame.sha256}`);
 expect(plan.launch.stdin).toContain(f.attempt.input.clipPrompt);expect(plan.launch.stdin).toContain('scripts/native-call.ts');
 expect(plan.launch.stdin).not.toContain('{{retained_beat_anchors}}');expect(plan.launch.stdin).not.toContain('Fixture video guidance');
 expect(plan.guidance).toHaveLength(1);expect(plan.attempt.taskContext).toEqual(f.attempt.taskContext);
});
