import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { deflateSync } from 'node:zlib';
import { finalizeRenderFiles } from './render-finalize.ts';
import { RENDER_PROFILE as PROFILE } from './render-contract.ts';
import type { CompiledRender, RenderOptions, RenderPlan, RenderResult, RenderFrame } from './render-contract.ts';
export type { RenderPlan, RenderOptions, RenderResult } from './render-contract.ts';

const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const integer = (n: unknown, min = 0): n is number => Number.isSafeInteger(n) && (n as number) >= min;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
function validate(plan: RenderPlan) {
 assert.equal(plan.schemaVersion, 1); assert.ok(uuid(plan.projectId) && uuid(plan.songId), 'Invalid render project/song identity');
 assert.ok(integer(plan.revision), 'Invalid arrangement revision'); assert.equal(plan.song.sampleRate, 48000); assert.equal(plan.song.channels, 2);
 assert.match(plan.song.sampleCount, /^[1-9][0-9]*$/); const samples = BigInt(plan.song.sampleCount);
 assert.ok(samples <= BigInt(Number.MAX_SAFE_INTEGER), 'Song sample count exceeds exact supported integer range');
 assert.ok(isAbsolute(plan.song.path) && digest(plan.song.sha256), 'Invalid song path/hash'); assert.ok(Array.isArray(plan.placements));
 const priorities = new Set<number>(), ids = new Set<string>();
 for (const p of plan.placements) {
  assert.ok(uuid(p.id) && uuid(p.clipId) && !ids.has(p.id), 'Invalid or duplicate placement identity'); ids.add(p.id);
  assert.ok(integer(p.startFrame) && integer(p.endFrame, 1) && p.endFrame > p.startFrame, 'Placement must be a positive zero-based half-open frame interval');
  assert.ok(integer(p.sourceStartFrame), 'Invalid source frame offset');
  assert.ok(integer(p.priority) && !priorities.has(p.priority), 'Visual priority must be unique'); priorities.add(p.priority);
  assert.ok(Array.isArray(p.frames) && p.sourceStartFrame + p.endFrame - p.startFrame <= p.frames.length, 'Placement overruns retained source frames');
  for (const frame of p.frames) assert.ok(isAbsolute(frame.path) && digest(frame.sha256), 'Invalid retained frame path/hash');
 }
}
/** One timeline compiler is shared by rendering and inspectable receipts. No audio mixing or hidden transitions. */
export function compileRenderPlan(plan: RenderPlan): CompiledRender {
 validate(plan);
 let frameCount = Number((BigInt(plan.song.sampleCount) + 1999n) / 2000n);
 for (const p of plan.placements) frameCount = Math.max(frameCount, p.endFrame);
 assert.ok(integer(frameCount, 1) && Number.isSafeInteger(frameCount * 2000), 'Output duration exceeds exact sample grid');
 const boundaries = [...new Set([0, frameCount, ...plan.placements.flatMap(p => [p.startFrame, p.endFrame])])].sort((a,b) => a-b);
 const spans: CompiledRender['spans'] = [];
 for (let i=1; i<boundaries.length; i++) {
  const startFrame=boundaries[i-1]!, endFrame=boundaries[i]!;
  const winner=plan.placements.filter(p => p.startFrame <= startFrame && p.endFrame >= endFrame).sort((a,b) => b.priority-a.priority)[0];
  const next={startFrame,endFrame,placementId:winner?.id ?? null,sourceStartFrame:winner ? winner.sourceStartFrame+startFrame-winner.startFrame : null};
  const prior=spans.at(-1);
  if (prior && prior.placementId === next.placementId && (prior.sourceStartFrame === null || prior.sourceStartFrame+prior.endFrame-prior.startFrame === next.sourceStartFrame)) prior.endFrame=endFrame;
  else spans.push(next);
 }
 return {frameCount,sampleCount:String(BigInt(frameCount)*2000n),spans};
}
/** Includes renderer profile/version and every immutable media hash; consumers may reuse only an independently validated, current-revision record. */
export function renderPlanHash(plan: RenderPlan): string { validate(plan); return sha(canonical({profile:PROFILE,plan})); }
async function managedFile(project: string, path: string) {
 const rel=relative(project,path); assert.ok(isAbsolute(path) && resolve(path) === path && rel && !rel.startsWith('../') && !isAbsolute(rel), 'Render input must be inside its captured project');
 assert.equal(await realpath(path),path,'Linked render inputs are not managed files'); assert.ok((await stat(path)).isFile(),'Render input must be a regular file');
}
async function hashFile(path: string, signal: AbortSignal) {
 const h=createHash('sha256');for await(const b of createReadStream(path,{signal}))h.update(b);return h.digest('hex');
}
function crc(b:Buffer) { let n=0xffffffff;for(const byte of b){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0; }
function chunk(kind:string,data:Buffer) {const type=Buffer.from(kind),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);}
function blackPng() {
 const header=Buffer.alloc(13);header.writeUInt32BE(640);header.writeUInt32BE(480,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((640*3+1)*480))),chunk('IEND',Buffer.alloc(0))]);
}
function validatePng(bytes: Buffer) {
 assert.ok(bytes.length >= 33 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16)==='IHDR','Retained source is not a PNG');
 assert.equal(bytes.readUInt32BE(16),640,'Retained PNG dimensions must be 640x480; no implicit scaling'); assert.equal(bytes.readUInt32BE(20),480,'Retained PNG dimensions must be 640x480; no implicit scaling');
}
interface CommandResult { stdout: string; stderr: string }
/** Direct CPU binaries only; termination addresses the owned ChildProcess handle, never GPU/process census PIDs. */
function command(binary: string,args: string[], options:{signal:AbortSignal;input?:AsyncIterable<Buffer>;onProgress?:(text:string)=>void}):Promise<CommandResult> {
 options.signal.throwIfAborted();
 return new Promise((accept,reject)=>{
  const child=spawn(binary,args,{stdio:['pipe','pipe','pipe'],shell:false,env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});
  let stdout='',stderr='',failure:unknown,closed=false,killTimer:NodeJS.Timeout|undefined,drainTimer:NodeJS.Timeout|undefined;
  function fail(error:unknown) {
   failure??=error;if(closed)return; child.stdin.destroy();child.kill('SIGTERM');
   if(!killTimer)killTimer=setTimeout(()=>{child.kill('SIGKILL');drainTimer=setTimeout(()=>reject(new Error('Render command cleanup unconfirmed')),3000);},1500);
  }
  const abort=()=>fail(options.signal.reason ?? new Error('Render aborted'));
  options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted)abort();
  child.on('error',fail);child.stdin.on('error',error=>{if(!closed)fail(error);});
  child.stdout.on('data',(bytes:Buffer)=>{stdout+=bytes.toString('utf8');if(Buffer.byteLength(stdout)>2_000_000)fail(new Error('Render probe output exceeded bound'));try{options.onProgress?.(bytes.toString('utf8'));}catch(error){fail(error);}});
  child.stderr.on('data',(bytes:Buffer)=>{stderr=(stderr+bytes.toString('utf8')).slice(-32768);});
  const writing=options.input ? pipeline(Readable.from(options.input),child.stdin).catch(fail) : Promise.resolve(child.stdin.end()).then(()=>{});
  child.on('close',code=>{
   closed=true;options.signal.removeEventListener('abort',abort);if(killTimer)clearTimeout(killTimer);if(drainTimer)clearTimeout(drainTimer);
   void writing.then(()=>{if(failure)reject(failure);else if(code!==0)reject(new Error(`Render command exited ${code}: ${stderr}`));else accept({stdout,stderr});});
  });
 });
}
function parseProbe(text:string):{streams:Record<string,unknown>[];format:Record<string,unknown>} {
 const parsed=JSON.parse(text) as {streams:Record<string,unknown>[];format:Record<string,unknown>};assert.ok(Array.isArray(parsed.streams)&&parsed.format&&typeof parsed.format==='object','Invalid media probe');return parsed;
}
function rational(value:unknown):[bigint,bigint] {
 assert.equal(typeof value,'string');const match=/^(-?[0-9]+)\/([1-9][0-9]*)$/.exec(value as string);assert.ok(match,'Invalid media time base');return[BigInt(match[1]!),BigInt(match[2]!)];
}
function exactSamples(stream:Record<string,unknown>,expected:bigint,rate=48000) {
 const [n,d]=rational(stream.time_base);assert.ok(/^[0-9]+$/.test(String(stream.duration_ts)));assert.equal(BigInt(String(stream.duration_ts))*n*BigInt(rate),expected*d,'Media sample duration does not match captured source');
}

/** Writes one exclusive immutable render. The durable store/runtime owns queueing, cache reuse and stale/current download eligibility. */
export async function runStudioRender(options:RenderOptions):Promise<RenderResult> {
 const {runtime,renderId}=options;assert.ok(uuid(renderId),'Invalid render identity');assert.ok(isAbsolute(runtime)&&resolve(runtime)===runtime,'Absolute normalized runtime required');
 const timeoutMs=options.timeoutMs??1_800_000;assert.ok(integer(timeoutMs,1)&&timeoutMs<=14_400_000,'Invalid bounded CPU render timeout');
 options.signal?.throwIfAborted();const deadline=AbortSignal.timeout(timeoutMs),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
 // Clone synchronously before any await so callers cannot revise the running job.
 const plan=structuredClone(options.plan),compiled=compileRenderPlan(plan),planHash=renderPlanHash(plan);
 const project=join(runtime,'projects',plan.projectId),parent=join(project,'renders'),directory=join(parent,renderId);
 assert.equal(await realpath(runtime),runtime,'Runtime may not contain symlink aliases');assert.equal(await realpath(project),project,'Project directory must be managed without symlink aliases');await mkdir(parent,{recursive:true,mode:0o700});assert.equal(await realpath(parent),parent,'Render directory must be managed');await mkdir(directory,{mode:0o700});
 const ffmpeg=options.ffmpeg??'/usr/bin/ffmpeg',ffprobe=options.ffprobe??'/usr/bin/ffprobe';assert.ok(isAbsolute(ffmpeg)&&isAbsolute(ffprobe),'Absolute media executables required');
 const receiptPath=join(directory,'receipt.json'),partial=join(directory,'output.partial.mp4'),outputPath=join(directory,'output.mp4'),audio=join(directory,'captured-song.wav');
 const startedAt=new Date().toISOString();let result:RenderResult|undefined,primaryError:Error|undefined;
 const evidence:Record<string,unknown>={schemaVersion:1,state:'running',renderId,projectId:plan.projectId,songId:plan.songId,revision:plan.revision,planHash,profile:PROFILE,startedAt,compiled};
 try {
  await writeFile(join(directory,'plan.json'),JSON.stringify({plan,planHash,profile:PROFILE,compiled},null,2)+'\n',{flag:'wx',mode:0o600});
  evidence.executables={ffmpeg:{path:ffmpeg,sha256:await hashFile(ffmpeg,signal),version:(await command(ffmpeg,['-version'],{signal})).stdout.split('\n')[0]},ffprobe:{path:ffprobe,sha256:await hashFile(ffprobe,signal),version:(await command(ffprobe,['-version'],{signal})).stdout.split('\n')[0]}};
  await managedFile(project,plan.song.path);
  const songDigest=createHash('sha256');await pipeline(createReadStream(plan.song.path),new Transform({transform(bytes:Buffer,_encoding,done){songDigest.update(bytes);done(null,bytes);}}),createWriteStream(audio,{flags:'wx',mode:0o600}),{signal});
  assert.equal(songDigest.digest('hex'),plan.song.sha256,'Captured song hash mismatch');
  const songProbe=parseProbe((await command(ffprobe,['-v','error','-show_streams','-show_format','-of','json',audio],{signal})).stdout);
  assert.equal(songProbe.streams.length,1,'Expected one original audio stream');const source=songProbe.streams[0]!;
  assert.equal(source.codec_type,'audio');assert.ok(/^pcm_(s16le|s24le|s32le|f32le)$/.test(String(source.codec_name)),'Expected original PCM WAV');assert.equal(source.sample_rate,'48000');assert.equal(source.channels,2);assert.equal(songProbe.format.format_name,'wav');exactSamples(source,BigInt(plan.song.sampleCount));
  evidence.sourceAudio=source;
  const validated=new Set<string>();const placementMap=new Map(plan.placements.map(p=>[p.id,p]));const black=blackPng();
  async function frameBytes(frame:RenderFrame) {
   signal.throwIfAborted();await managedFile(project,frame.path);assert.ok((await stat(frame.path)).size<=32_000_000,'PNG exceeds bounded frame reader');
   const bytes=await readFile(frame.path,{signal});assert.equal(sha(bytes),frame.sha256,'Retained PNG hash mismatch');validatePng(bytes);validated.add(`${frame.path}\0${frame.sha256}`);return bytes;
  }
  async function* images() {
   for(const span of compiled.spans)for(let frame=span.startFrame;frame<span.endFrame;frame++) {
    signal.throwIfAborted();const p=span.placementId?placementMap.get(span.placementId):undefined;
    yield p ? await frameBytes(p.frames[span.sourceStartFrame!+frame-span.startFrame]!) : black;
   }
  }
  const args=['-v','error','-nostdin','-n','-threads','1','-filter_threads','1','-f','image2pipe','-framerate','24','-c:v','png','-i','pipe:0','-i',audio,
   '-map','0:v:0','-map','1:a:0','-vf','format=yuv420p','-af',`apad=whole_len=${compiled.sampleCount},atrim=end_sample=${compiled.sampleCount},asetpts=PTS-STARTPTS`,
   '-c:v','libx264','-threads','1','-preset',PROFILE.preset,'-crf',String(PROFILE.crf),'-pix_fmt','yuv420p','-r','24','-fps_mode','cfr','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-movie_timescale',String(PROFILE.movieTimescale),'-progress','pipe:1','-nostats',partial];
  evidence.command={executable:ffmpeg,args};let pending='';
  await command(ffmpeg,args,{signal,input:images(),onProgress:text=>{pending+=text;let newline:number;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(line.startsWith('frame=')){const frame=Number(line.slice(6));if(integer(frame))options.onProgress?.(Math.min(frame,compiled.frameCount),compiled.frameCount);}}}});
  const probe=parseProbe((await command(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',partial],{signal})).stdout);
  assert.equal(probe.streams.length,2,'Rendered file must contain exactly video and audio');const video=probe.streams.find(s=>s.codec_type==='video'),sound=probe.streams.find(s=>s.codec_type==='audio');assert.ok(video&&sound);
  assert.equal(video.codec_name,'h264');assert.equal(video.pix_fmt,'yuv420p');assert.equal(video.width,640);assert.equal(video.height,480);assert.equal(video.r_frame_rate,'24/1');assert.equal(video.avg_frame_rate,'24/1');assert.equal(video.nb_read_frames,String(compiled.frameCount));exactSamples(video,BigInt(compiled.frameCount),24);
  assert.equal(sound.codec_name,'aac');assert.equal(sound.sample_rate,'48000');assert.equal(sound.channels,2);exactSamples(sound,BigInt(compiled.sampleCount));
  assert.ok(String(probe.format.format_name).includes('mp4'));await command(ffmpeg,['-v','error','-xerror','-threads','1','-i',partial,'-map','0:v:0','-map','0:a:0','-f','null','-'],{signal});
  signal.throwIfAborted();const outputHash=await hashFile(partial,signal),bytes=(await stat(partial)).size;assert.ok(bytes>0);signal.throwIfAborted();
  options.onProgress?.(compiled.frameCount,compiled.frameCount);signal.throwIfAborted();await rename(partial,outputPath);result={outputPath,sha256:outputHash,bytes,frameCount:compiled.frameCount,sampleCount:compiled.sampleCount,receiptPath,planHash};
  evidence.state='succeeded';evidence.output={...result};evidence.validation={video,audio:sound,fullDecode:true,validatedOriginalPngs:validated.size};
 } catch(error) {
  primaryError=error instanceof Error?error:new Error(String(error));evidence.state='failed';evidence.error=primaryError.message;
 } finally {
  evidence.finishedAt=new Date().toISOString();
  // These are this exclusive render's known scratch derivatives, never original media.
  await finalizeRenderFiles({audioPath:audio,partialPath:partial,outputPath,receiptPath,receipt:evidence,...(primaryError?{primaryError}:{})});
 }
 assert.ok(result);return result;
}
