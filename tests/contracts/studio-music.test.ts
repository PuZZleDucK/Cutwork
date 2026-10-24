import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { runProvider } from '../../apps/server/src/providers/run.ts';
import { prepareMusicTask, runMusicTask, type MusicTaskDependencies } from '../../apps/server/src/studio/music.ts';
import { openStudioStore } from '../../apps/server/src/studio/store.ts';
import type { StudioStore } from '../../apps/server/src/studio/store-contract.ts';
import type { GpuCall, GpuQueue, Json } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const dirs:string[]=[], stores:StudioStore[]=[];
afterEach(async()=>{for(const s of stores.splice(0))s.close();for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
test('music planner uses the template accepted with the attempt, not later config edits',async()=>{
 const f=await fixture();const settings=f.store.promptTemplates();
 f.store.savePromptTemplates(settings.revision,{video:settings.video,music:'CUSTOM MUSIC DIRECTION\n{{task_context}}'});
 const attempt=f.store.submitMusic(f.attempt.projectId,randomUUID(),f.attempt.input);
 f.store.savePromptTemplates(settings.revision+1,{music:'LATER MUSIC\n{{task_context}}',video:settings.video});
 const p=await prepareMusicTask({...f.options,attempt}),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.launch.stdin).toMatch(/^CUSTOM MUSIC DIRECTION/);expect(plan.launch.stdin).not.toContain('LATER MUSIC');
 expect(plan.launch.stdin).toContain(attempt.input.musicPrompt);expect(plan.launch.stdin).toContain('scripts/native-call.ts');
 expect(plan.attempt.promptTemplate).toEqual(attempt.promptTemplate);
});
test('pre-template queued music keeps legacy instruction order even when global templates change',async()=>{
 const f=await fixture();delete f.attempt.promptTemplate;
 f.store.savePromptTemplates(0,{music:'NEW MUSIC {{task_context}}',video:'NEW VIDEO {{task_context}}'});
 const p=await prepareMusicTask(f.options),plan=JSON.parse(await readFile(p.planPath,'utf8')),prompt=plan.launch.stdin as string;
 expect(prompt.indexOf('Music description:')).toBeLessThan(prompt.indexOf('Translate the creative brief'));
 expect(prompt.indexOf('This cooperative helper')).toBeLessThan(prompt.indexOf('Do not use the earlier 500-token'));
 expect(plan.attempt).not.toHaveProperty('promptTemplate');expect(prompt).not.toContain('NEW MUSIC');
});
async function save(path:string,value:unknown){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
async function fixture(){
 const base=await mkdtemp(join(tmpdir(),'studio-music-'));dirs.push(base);const runtime=join(base,'runtime'),source=join(base,'source'),origin='http://127.0.0.1:9122';
 await mkdir(join(source,'integrations/knowledge'),{recursive:true});await mkdir(runtime,{recursive:true});
 await writeFile(join(source,'integrations/knowledge/README.md'),'Real normal tools and project context.\n');await writeFile(join(source,'integrations/knowledge/music.md'),'Fixture copied guidance, unchanged.\n');
 await save(join(source,'integrations/tool-manifest.json'),{node:{version:'24.22.0'},providers:{codex:{version:'0.163.0',model:'gpt-6.1-sol'},claude:{version:'2.1.306',model:'claude-opus-5-5'}}});
 await mkdir(join(source,'integrations/yue2'),{recursive:true});await writeFile(join(source,'integrations/yue2/generate.py'),'# fixture helper');await save(join(source,'integrations/yue2/models.json'),{fixture:true});
 const store=openStudioStore(join(runtime,'studio.sqlite'));stores.push(store);const project=store.createProject('Test music');const attempt=store.submitMusic(project.id,randomUUID(),{musicPrompt:'Original programming jingle\nKeep this direction',lyrics:'My exact words'});
 const request={schemaVersion:1,attemptId:attempt.nativeCallId,parameters:{style:'Translated sonic direction',lyrics:'My exact words',cot:'full'},seeds:attempt.seeds,sampling:{semantic:{max_tokens:4096}}};
 const input=join(runtime,'projects',project.id,'inputs/native-calls',attempt.nativeCallId,'request.json');const receiptPath=join(runtime,'projects',project.id,'runs',attempt.nativeCallId,'receipt.json'),artifacts=join(receiptPath,'../receipt-artifacts');
 const nativeDirectory=join(runtime,'jobs/native-units',randomUUID()),owner={kind:'systemd-unit',unit:'fixture-owned.service',invocationId:'a'.repeat(32),directory:nativeDirectory,supervisor:{pid:12345}};
 const release={owner,cgroupEmptyBeforeAndAfterGpu:true,gpuSettling:{state:'released'},gpu:{processes:[]},rememberedPids:[12345]};
 let call:GpuCall|null={id:attempt.nativeCallId,attemptId:attempt.id,projectId:project.id,tool:'yue2',request:request as Json,sequence:1,state:'succeeded',cancelRequested:false,launch:{command:{args:['-I','-u',join(source,'integrations/yue2/generate.py'),'--request',input,'--result',receiptPath]}},owner,release,result:{code:0,signal:null,directory:nativeDirectory},error:null};
 let held=false,cancelled=false;
 const queue={get:()=>call,heldLease:()=>held?{callId:attempt.nativeCallId,token:'fixture',workerId:'fixture'}:null,cancelAttempt:()=>{cancelled=true;}} as unknown as GpuQueue;
 const bytes=Buffer.from('labelled fake audio bytes for injected ffprobe/decode tests');await mkdir(artifacts,{recursive:true});await writeFile(join(artifacts,'audio.wav'),bytes);await save(input,request);
 const manifest:{path:string;bytes:number;sha256:string}[]=[];
 const add=async(path:string,content:string|Buffer)=>{await mkdir(join(artifacts,path,'..'),{recursive:true});await writeFile(join(artifacts,path),content);manifest.push({path,bytes:Buffer.byteLength(content),sha256:hash(content)});};
 await add('audio.wav',bytes);await add('submitted-request.json',await readFile(input));
 for(const [folder,seed]of [['abc-output',attempt.seeds.abc],['semantic-input',attempt.seeds.semantic],['nar-input',attempt.seeds.nar]] as const)await add(`${folder}/plan.json`,`{"request":{"seed":${seed}}}`);
 await add('effective-config.json','{"generation":{"semantic":{"max_tokens":4096}}}');
 const receipt={schemaVersion:1,state:'succeeded',attemptId:attempt.nativeCallId,requestSha256:hash(await readFile(input)),helperSha256:hash('# fixture helper'),modelManifestSha256:hash(await readFile(join(source,'integrations/yue2/models.json'))),assignedSeeds:attempt.seeds,execution:{device:'cuda'},versions:{'yue2-infer':'0.1.6'},calls:[{stage:'load',state:'succeeded',suppliedSeed:null,inputs:{}},...['abc','semantic','nar'].map(stage=>({stage,state:'succeeded',suppliedSeed:attempt.seeds[stage],inputs:{}})),{stage:'decode',state:'succeeded',suppliedSeed:null,inputs:{}}],artifacts:manifest,audio:{path:join(artifacts,'audio.wav'),sampleRate:48000,samples:96000,channels:2,subtype:'FLOAT',seconds:2},truncated:{abc:false,semantic:false}};
 await save(receiptPath,receipt);await save(join(nativeDirectory,'release.json'),release);await save(join(nativeDirectory,'exit.json'),{code:0,signal:null});
 let providerCount=0,analysisCalls=0;const events:string[]=[];
 const dependencies:MusicTaskDependencies={
  provider:async launch=>{providerCount++;events.push('provider');await mkdir(launch.runDirectory,{recursive:true});const p=join(launch.runDirectory,'provider-receipt.json'),stdoutPath=join(launch.runDirectory,'provider.stdout.log'),stderrPath=join(launch.runDirectory,'provider.stderr.log');await writeFile(stdoutPath,'A natural creative summary.');await writeFile(stderrPath,'');await save(p,{state:'exited',succeeded:true,code:0,signal:null,inputDelivered:true,executable:launch.executable,argv:launch.argv,cwd:launch.cwd});return {succeeded:true,code:0,signal:null,inputDelivered:true,receiptPath:p,stdoutPath,stderrPath,owner:null};},
  execute:async command=>{
   if(command.executable==='/usr/bin/ffprobe')return {code:0,stdout:JSON.stringify({streams:[{codec_type:'audio',codec_name:'pcm_f32le',sample_rate:'48000',channels:2,duration_ts:96000,time_base:'1/48000'}]}),stderr:''};
   if(command.executable==='/usr/bin/ffmpeg'){events.push('decode');return {code:0,stdout:'',stderr:''};}
   analysisCalls++;events.push('analysis');expect(store.attempt(attempt.id)?.state).toBe('succeeded');
   const req=JSON.parse(await readFile(command.args[command.args.indexOf('--request')+1]!, 'utf8'));
   await save(command.args[command.args.indexOf('--result')+1]!,{schemaVersion:1,attemptId:req.attemptId,state:'succeeded',analysisVersion:'studio-librosa-samples-v1',source:{path:req.source.path,sha256:req.source.sha256,sampleRate:48000,channels:2,sampleCount:'96000'},waveform:{bucketSamples:512,peaks:Array.from({length:188},(_,i)=>i===0?1.4:0.2)},beats:{status:'available',estimatedBpm:120,sampleIndices:['1024','25024','49024'],reason:null},error:null});return {code:0,stdout:'',stderr:''};
  }
 };
 const options={runtime,source,origin,attempt,store,queue};
 return { ...options,options,dependencies,receipt,receiptPath,input,artifacts,events,get call(){return call;},setCall:(c:GpuCall|null)=>{call=c;},setHeld:(v:boolean)=>{held=v;},get cancelled(){return cancelled;},get providerCount(){return providerCount;},get analysisCalls(){return analysisCalls;}};
}
async function prepare(f:Awaited<ReturnType<typeof fixture>>){const p=await prepareMusicTask(f.options);f.store.patchAttempt(f.attempt.id,{details:{planPath:p.planPath}});return p;}
async function prepareLegacy(f:Awaited<ReturnType<typeof fixture>>){
 const historicalInput=Object.assign(f.attempt.input,{style:'Previously captured visual direction'}),p=await prepare(f);
 // Reconstruct the on-disk v1 task shape emitted before visual/music separation.
 const plan=JSON.parse(await readFile(p.planPath,'utf8'));plan.attempt.input=structuredClone(historicalInput);
 plan.launch.stdin=plan.launch.stdin.replace(`Optional user lyrics (preserve supplied words):\n${historicalInput.lyrics}`,`Optional user lyrics (preserve supplied words):\n${historicalInput.lyrics}\n\nProject style/context:\n${historicalInput.style}`);
 await save(p.planPath,plan);return {...p,plan,historicalInput};
}
test('planner snapshots normal provider launch, exact input/seeds and unchanged guidance without creating provider run directory',async()=>{
 const f=await fixture(),p=await prepare(f),plan=JSON.parse(await readFile(p.planPath,'utf8'));
 expect(plan.attempt.input).toEqual(f.attempt.input);expect(plan.attempt.seeds).toEqual(f.attempt.seeds);expect(plan.launch.executable).toContain('/tools/provider-cli/codex-0.163.0_claude-2.1.306/node_modules/.bin/codex');
 expect(plan.launch.argv).toContain('--dangerously-bypass-approvals-and-sandbox');expect(plan.launch.stdin).toContain('one fresh song');expect(plan.launch.stdin).toContain('500-token');expect(plan.launch.stdin).toContain(f.attempt.nativeCallId);expect(plan.launch.stdin).toContain('My exact words');
 expect(plan.guidance.map((g:{name:string})=>g.name)).toEqual(['README.md','music.md']);expect(plan.guidance[1].text).toBe('Fixture copied guidance, unchanged.\n');await expect(stat(plan.launch.runDirectory)).rejects.toMatchObject({code:'ENOENT'});
 await expect(prepareMusicTask(f.options)).rejects.toThrow();expect(f.providerCount).toBe(0);
});
test('planner rejects non-loopback origin and relative roots without dispatch',async()=>{const f=await fixture();for(const origin of ['http://example.com:9122','http://127.0.0.1:9122/path','https://127.0.0.1:9122'])await expect(prepareMusicTask({...f.options,origin})).rejects.toThrow();await expect(prepareMusicTask({...f.options,runtime:'relative'})).rejects.toThrow();});
test('new music task excludes legacy project visual style from the saved input and actual agent prompt without rewriting it',async()=>{
 const f=await fixture(),visualStyle='VISUAL_ONLY_SENTINEL: cyan workshop, oil-painted robot, matching costumes';
 const musicPrompt='90s French electronica with dubstep beats and lyrics about programming';
 const legacyInput=Object.assign(f.attempt.input,{musicPrompt,style:visualStyle});
 const original=structuredClone(legacyInput),p=await prepare(f),raw=await readFile(p.planPath,'utf8'),plan=JSON.parse(raw);
 expect(plan.attempt.input).toEqual({musicPrompt,lyrics:'My exact words'});expect(raw).not.toContain(visualStyle);
 expect(plan.launch.stdin).toContain(musicPrompt);expect(plan.launch.stdin).toContain('My exact words');
 expect(plan.launch.stdin).not.toContain('Project style/context:');expect(plan.launch.stdin).not.toContain('Persistent visual style:');
 expect(legacyInput).toEqual(original);
 const provider=f.dependencies.provider!;let dispatchedPrompt:string|null=null;
 await runMusicTask(f.options,{...f.dependencies,provider:async(launch,options)=>{dispatchedPrompt=launch.stdin;return provider(launch,options);}});
 expect(dispatchedPrompt).toBe(plan.launch.stdin);expect(dispatchedPrompt).not.toContain(visualStyle);
 expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');expect(legacyInput).toEqual(original);
 expect(await readFile(p.planPath,'utf8')).toBe(raw);
});
test('queued legacy music plan dispatches its exact originally captured prompt without rewriting inputs or file',async()=>{
 const f=await fixture(),p=await prepareLegacy(f),original=await readFile(p.planPath,'utf8'),input=structuredClone(p.historicalInput);
 expect(f.store.attempt(f.attempt.id)?.state).toBe('queued');const provider=f.dependencies.provider!;let dispatchedPrompt:string|null=null;
 await runMusicTask(f.options,{...f.dependencies,provider:async(launch,options)=>{dispatchedPrompt=launch.stdin;return provider(launch,options);}});
 expect(dispatchedPrompt).toBe(p.plan.launch.stdin);expect(dispatchedPrompt).toContain(`Project style/context:\n${input.style}`);
 expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');expect(f.providerCount).toBe(1);
 expect(p.historicalInput).toEqual(input);expect(await readFile(p.planPath,'utf8')).toBe(original);
});
test.each(['musicPrompt','lyrics','style'] as const)('legacy plan rejects changed historical %s before provider dispatch',async field=>{
 const f=await fixture(),p=await prepareLegacy(f),original=await readFile(p.planPath,'utf8');p.historicalInput[field]+=' altered after capture';
 await runMusicTask(f.options,f.dependencies);expect(f.providerCount).toBe(0);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');
 expect(f.store.project(f.attempt.projectId).songs).toHaveLength(0);expect(await readFile(p.planPath,'utf8')).toBe(original);
});
test.each(['id','nativeCallId','projectId','provider','model','seeds'] as const)('legacy compatibility does not weaken captured %s validation',async field=>{
 const f=await fixture(),p=await prepareLegacy(f);
 p.plan.attempt[field]=field==='provider'?'claude':field==='model'?'claude-opus-5-5':field==='seeds'?{...f.attempt.seeds,abc:'1'}:randomUUID();
 await save(p.planPath,p.plan);await runMusicTask(f.options,f.dependencies);
 expect(f.providerCount).toBe(0);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');expect(f.store.project(f.attempt.projectId).songs).toHaveLength(0);
});
test('native evidence and media checks precede ingestion; analysis preserves exact positions and peaks above one',async()=>{
 const f=await fixture();await prepare(f);await runMusicTask(f.options,f.dependencies);const state=f.store.project(f.attempt.projectId);expect(state.attempts[0]?.state).toBe('succeeded');expect(state.songs).toHaveLength(1);expect(state.songs[0]?.analysis.peaks[0]).toBe(1.4);expect(state.songs[0]?.analysis.sampleIndices).toEqual(['1024','25024','49024']);expect(f.events).toEqual(['provider','decode','analysis']);expect(f.providerCount).toBe(1);
 expect(state.attempts[0]?.details).toHaveProperty('nativeRequest');expect(JSON.stringify(state.attempts[0]?.details)).toContain(f.attempt.seeds.semantic);
});
test('provider prose and exit zero cannot substitute for a registered native call',async()=>{const f=await fixture();f.setCall(null);await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');expect(f.store.project(f.attempt.projectId).songs).toHaveLength(0);});
test.each(['audio hash','request hash','seed','samples','artifact traversal'] as const)('rejects corrupt %s evidence before ingestion',async defect=>{
 const f=await fixture();if(defect==='audio hash')await writeFile(join(f.artifacts,'audio.wav'),'modified audio');if(defect==='request hash')f.receipt.requestSha256='0'.repeat(64);if(defect==='seed')f.receipt.assignedSeeds={...f.attempt.seeds,semantic:'1'};if(defect==='samples')f.receipt.audio.samples=96001;if(defect==='artifact traversal')f.receipt.artifacts[0]!.path='../escape';await save(f.receiptPath,f.receipt);await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');expect(f.store.project(f.attempt.projectId).songs).toHaveLength(0);expect(f.analysisCalls).toBe(0);
});
test('pending native work is frozen and retained as reconciling, never failed or ingested',async()=>{const f=await fixture();f.setCall({...f.call!,state:'running'});f.setHeld(true);await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('reconciling');expect(f.cancelled).toBe(true);});
test('claimed native success without retained release evidence is reconciling',async()=>{const f=await fixture();await rm(join((f.call!.owner as {directory:string}).directory,'release.json'));await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('reconciling');});
test('analysis process failure retains successful original song and records failed analysis',async()=>{
 const f=await fixture();await prepare(f);const execute=f.dependencies.execute!;await runMusicTask(f.options,{...f.dependencies,execute:async(c,l)=>c.executable.includes('audio-analysis')?{code:1,stdout:'',stderr:'Synthetic missing dependency'}:execute(c,l)});const state=f.store.project(f.attempt.projectId);expect(state.attempts[0]?.state).toBe('succeeded');expect(state.songs[0]?.analysis.state).toBe('failed');expect(state.songs[0]?.analysis.error).toContain('Synthetic missing dependency');
});
test('analysis partial result preserves waveform without inventing beats',async()=>{
 const f=await fixture();await prepare(f);const execute=f.dependencies.execute!;await runMusicTask(f.options,{...f.dependencies,execute:async(c,l)=>{const result=await execute(c,l);if(c.executable.includes('audio-analysis')){const p=c.args[c.args.indexOf('--result')+1]!,r=JSON.parse(await readFile(p,'utf8'));r.state='partial';r.beats={status:'unavailable',estimatedBpm:null,sampleIndices:[],reason:'No reliable beat anchors'};await save(p,r);}return result;}});const a=f.store.project(f.attempt.projectId).songs[0]!.analysis;expect(a.state).toBe('partial');expect(a.sampleIndices).toEqual([]);expect(a.estimatedBpm).toBeNull();expect(a.peaks[0]).toBe(1.4);
});
test('analysis source mismatch cannot attach unrelated beat data to an otherwise good song',async()=>{
 const f=await fixture();await prepare(f);const execute=f.dependencies.execute!;await runMusicTask(f.options,{...f.dependencies,execute:async(c,l)=>{const result=await execute(c,l);if(c.executable.includes('audio-analysis')){const p=c.args[c.args.indexOf('--result')+1]!,r=JSON.parse(await readFile(p,'utf8'));r.source.sha256='0'.repeat(64);await save(p,r);}return result;}});expect(f.store.project(f.attempt.projectId).songs[0]!.analysis.state).toBe('failed');expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');
});

test('known provider nonzero exit is failed even when an old-looking successful native artifact exists',async()=>{
 const f=await fixture();await prepare(f);const provider=f.dependencies.provider!;await runMusicTask(f.options,{...f.dependencies,provider:async launch=>{const r=await provider(launch);const receipt=JSON.parse(await readFile(r.receiptPath,'utf8'));Object.assign(receipt,{state:'failed',succeeded:false,code:1});await save(r.receiptPath,receipt);return {...r,succeeded:false,code:1};}});
 expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');expect(f.store.project(f.attempt.projectId).songs).toHaveLength(0);expect(f.analysisCalls).toBe(0);
});
test('failed native call with verified release is failed, not needlessly reconciling',async()=>{
 const f=await fixture();f.setCall({...f.call!,state:'failed',result:{code:1,signal:null}});await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');
});
test('successful native state with missing ownership is conservatively reconciling',async()=>{
 const f=await fixture();f.setCall({...f.call!,owner:null,release:null});await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('reconciling');
});
test('changing captured inputs is rejected before any provider dispatch',async()=>{
 const f=await fixture();await prepare(f);f.attempt.input.musicPrompt='Changed after capture';await runMusicTask(f.options,f.dependencies);expect(f.providerCount).toBe(0);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');
});
test('a saved semantic-plan seed mismatch is rejected even when its altered file hash matches the receipt',async()=>{
 const f=await fixture();const bytes='{"request":{"seed":1}}';await writeFile(join(f.artifacts,'semantic-input/plan.json'),bytes);const entry=f.receipt.artifacts.find(e=>e.path==='semantic-input/plan.json')!;entry.bytes=Buffer.byteLength(bytes);entry.sha256=hash(bytes);await save(f.receiptPath,f.receipt);await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');
});
test('retains unsafe native integer provenance without rounding it in UI history',async()=>{
 const f=await fixture();const raw=await readFile(f.receiptPath,'utf8');await writeFile(f.receiptPath,raw.replace('"inputs": {}','"inputs": {"nativeLargeInteger":9223372036854775806}'));await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');expect(JSON.stringify(f.store.attempt(f.attempt.id)?.details)).toContain('9223372036854775806');expect(JSON.stringify(f.store.attempt(f.attempt.id)?.details)).not.toContain('9223372036854776000');
});
test('truncation is retained explicitly instead of hiding it or refusing playable source',async()=>{
 const f=await fixture();f.receipt.truncated.semantic=true;await save(f.receiptPath,f.receipt);await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.project(f.attempt.projectId).songs[0]?.truncated).toBe(true);
});

test('song title truncation never creates a lone surrogate from a long emoji prompt',async()=>{
 const f=await fixture();f.attempt.input.musicPrompt='x'.repeat(239)+'🎶 original song';await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');expect(f.store.project(f.attempt.projectId).songs[0]?.title).toBe('x'.repeat(239));
});

test('cancelled native call with null result and verified release is terminal failed rather than unreconciled',async()=>{
 const f=await fixture();f.setCall({...f.call!,state:'cancelled',result:null});await prepare(f);await runMusicTask(f.options,f.dependencies);expect(f.store.attempt(f.attempt.id)?.state).toBe('failed');
});


test('already aborted music task keeps captured request queued and never dispatches provider',async()=>{
 const f=await fixture();await prepare(f);const c=new AbortController();c.abort();await runMusicTask({...f.options,signal:c.signal},f.dependencies);expect(f.providerCount).toBe(0);expect(f.store.attempt(f.attempt.id)?.state).toBe('queued');
});
test('provider pre-abort never creates run directory or starts a CPU fixture process',async()=>{
 const f=await fixture(),c=new AbortController();c.abort();const runDirectory=join(f.runtime,'never-start');
 await expect(runProvider({executable:process.execPath,argv:['-e','throw Error("must not execute")'],shell:false,cwd:f.runtime,runDirectory,stdin:'fixture'},{signal:c.signal})).rejects.toThrow(/cancelled before process/);
 await expect(stat(runDirectory)).rejects.toMatchObject({code:'ENOENT'});
});
test('provider abort while CPU fixture is active observes owned CLI exit without setting app exitCode',async()=>{
 const f=await fixture(),c=new AbortController(),runDirectory=join(f.runtime,'provider-abort'),ready=join(f.runtime,'provider-ready');
 const before=process.exitCode;const work=runProvider({executable:process.execPath,argv:['-e',`const fs=require('node:fs');process.stdin.resume();process.on('SIGTERM',()=>process.exit(0));fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000);`],shell:false,cwd:f.runtime,runDirectory,stdin:'CPU fixture only'},{signal:c.signal});
 const deadline=Date.now()+2000;while(Date.now()<deadline){try{await stat(ready);break;}catch{await new Promise(r=>setTimeout(r,5));}}
 await stat(ready);c.abort();const result=await work;expect(result.succeeded).toBe(false);expect(process.exitCode).toBe(before);const receipt=JSON.parse(await readFile(result.receiptPath,'utf8'));expect(receipt.interruptedBy).toBe('abort');expect(receipt.cleanup.cliStopped).toBe(true);const pid=Number(await readFile(ready,'utf8'));expect(()=>process.kill(pid,0)).toThrow();
});

test.each(['success','failure'] as const)('analysis tool is active only during post-ingestion work and resets after %s',async outcome=>{
 const f=await fixture();await prepare(f);const execute=f.dependencies.execute!;let observedActive=false,activeDuring:boolean|null=null;
 await runMusicTask(f.options,{...f.dependencies,execute:async(c,l)=>{
  if(c.executable.includes('audio-analysis')){observedActive=true;activeDuring=f.store.tool('analysis').active;expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');if(outcome==='failure')throw new Error('Injected CPU analysis interruption');}
  else expect(f.store.tool('analysis').active).toBe(false);
  return execute(c,l);
 }});
 expect(observedActive).toBe(true);expect(activeDuring).toBe(true);expect(f.store.tool('analysis').active).toBe(false);expect(f.store.attempt(f.attempt.id)?.state).toBe('succeeded');
 expect(f.store.project(f.attempt.projectId).songs[0]?.analysis.state).toBe(outcome==='success'?'available':'failed');
});

test('new music tasks inline researched guidance and literal user text, while later changes leave the capture untouched',async()=>{
 const f=await fixture();const guidance=await readFile('integrations/knowledge/music.md','utf8');await writeFile(join(f.source,'integrations/knowledge/music.md'),guidance);
 f.attempt.input.musicPrompt='My $& track with {{lyrics}} in its title';
 const p=await prepare(f),before=await readFile(p.planPath,'utf8'),plan=JSON.parse(before);
 expect(plan.launch.stdin).toContain(f.attempt.input.musicPrompt);expect(plan.launch.stdin).toContain(guidance);
 expect(plan.launch.stdin).toContain('cfg_scale');expect(plan.launch.stdin).not.toContain('{{music_description}}');
 expect(plan.guidance.find((g:{name:string})=>g.name==='music.md').sha256).toBe(hash(guidance));
 await writeFile(join(f.source,'integrations/knowledge/music.md'),'Later product guidance');expect(await readFile(p.planPath,'utf8')).toBe(before);
});
