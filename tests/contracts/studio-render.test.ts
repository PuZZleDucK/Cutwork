import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { compileRenderPlan, renderPlanHash, runStudioRender } from '../../apps/server/src/studio/render.ts';
import type { RenderFrame, RenderPlan } from '../../apps/server/src/studio/render-contract.ts';
import { RENDER_PROFILE } from '../../apps/server/src/studio/render-contract.ts';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive:true,force:true}); });
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
function crc(b:Buffer) { let n=0xffffffff; for(const byte of b) {n^=byte;for(let i=0;i<8;i++) n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0; }
function chunk(kind:string,data:Buffer) { const type=Buffer.from(kind), size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]); }
/** Real synthetic numbered/color-block PNG fixture, not model-output evidence. */
function png(color:number[], number:number, width=640) {
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(480,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((width*3+1)*480);
 for(let y=0;y<480;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++) pixels[y*(width*3+1)+1+x*3+c]=x<32&&y<32 ? number*32 : color[c]!;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function wav(samples:number) {
 const out=Buffer.alloc(44+samples*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(48000,24);out.writeUInt32LE(192000,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples*4,40);
 for(let i=0;i<samples;i++)for(let channel=0;channel<2;channel++)out.writeInt16LE(Math.round(12000*Math.sin(i*2*Math.PI*(channel?660:440)/48000)),44+i*4+channel*2);
 return out;
}
async function fixture(samples=6500) {
 const runtime=await mkdtemp(join(tmpdir(),'studio-render-'));roots.push(runtime);const projectId=randomUUID(),songId=randomUUID();const dir=join(runtime,'projects',projectId,'media');await mkdir(dir,{recursive:true});
 const audio=wav(samples),path=join(dir,'song.wav');await writeFile(path,audio);const frames:RenderFrame[]=[];
 for(let i=0;i<4;i++) {const b=png([[210,20,20],[20,210,20],[20,20,210],[210,210,20]][i]!,i+1);const path=join(dir,`${i}.png`);await writeFile(path,b);frames.push({path,sha256:hash(b)});}
 const plan:RenderPlan={schemaVersion:1,projectId,songId,revision:3,song:{path,sha256:hash(audio),sampleCount:String(samples),sampleRate:48000,channels:2},placements:[]};return {runtime,plan,frames};
}
const placement=(frames:RenderFrame[],start:number,end:number,source:number,priority:number)=>({id:randomUUID(),clipId:randomUUID(),startFrame:start,endFrame:end,sourceStartFrame:source,priority,frames});
function decodeVideo(path:string) {return execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-i',path,'-map','0:v:0','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:20_000_000,timeout:10000});}
function meanRGB(b:Buffer,frame:number) { const at=frame*640*480*3+(200*640+300)*3;return [...b.subarray(at,at+3)]; }
describe('revision-bound renderer plan',()=>{
 it('partitions half-open spans with newer priority, exact offsets and black gaps',async()=>{
  const {plan,frames}=await fixture();const a=placement(frames,1,5,0,1),b=placement(frames,2,4,2,2);plan.placements=[a,b];
  expect(compileRenderPlan(plan)).toEqual({frameCount:5,sampleCount:'10000',audioSpans:[{startSample:'0',endSample:'6500',source:'song',placementId:null,sourceStartSample:'0'},{startSample:'6500',endSample:'10000',source:'silence',placementId:null,sourceStartSample:null}],spans:[{startFrame:0,endFrame:1,placementId:null,sourceStartFrame:null},{startFrame:1,endFrame:2,placementId:a.id,sourceStartFrame:0},{startFrame:2,endFrame:4,placementId:b.id,sourceStartFrame:2},{startFrame:4,endFrame:5,placementId:a.id,sourceStartFrame:3}]});
 });
 it('rounds only the final partial music frame upward and emits an all-black plan without placements',async()=>{
  const {plan}=await fixture();expect(compileRenderPlan(plan)).toEqual({frameCount:4,sampleCount:'8000',audioSpans:[{startSample:'0',endSample:'6500',source:'song',placementId:null,sourceStartSample:'0'},{startSample:'6500',endSample:'8000',source:'silence',placementId:null,sourceStartSample:null}],spans:[{startFrame:0,endFrame:4,placementId:null,sourceStartFrame:null}]});
 });
 it('rejects fractional/negative times, tied priority and source overrun instead of silently correcting',async()=>{
  const {plan,frames}=await fixture();for(const p of [placement(frames,-1,2,0,1),placement(frames,0,2.5,0,1),placement(frames,0,5,0,1),placement(frames,1,1,0,1)])expect(()=>compileRenderPlan({...plan,placements:[p]})).toThrow();
  expect(()=>compileRenderPlan({...plan,placements:[placement(frames,0,2,0,1),placement(frames,2,4,0,1)]})).toThrow();
 });
 it('keys immutable revision/media identity and does not mutate caller plans',async()=>{
  const {plan}=await fixture();const copy=structuredClone(plan);expect(renderPlanHash(plan)).toBe(renderPlanHash(copy));expect(renderPlanHash({...plan,revision:4})).not.toBe(renderPlanHash(plan));expect(renderPlanHash({...plan,song:{...plan.song,sha256:'1'.repeat(64)}})).not.toBe(renderPlanHash(plan));expect(plan).toEqual(copy);
 });
});
describe('real local CPU FFmpeg render, synthetic source fixtures only',()=>{
 it('renders numbered original PNG ordering, dominance, black gaps and post-song silence; probes and hashes an immutable receipt',async()=>{
  const {runtime,plan,frames}=await fixture(6500);plan.placements=[placement(frames,1,5,0,1),placement(frames,2,4,2,2)];const original=structuredClone(plan);const renderId=randomUUID();const progress:number[]=[];
  const result=await runStudioRender({runtime,renderId,plan,onProgress:f=>progress.push(f)});
  expect(result.frameCount).toBe(5);expect(result.sampleCount).toBe('10000');expect(result.sha256).toBe(hash(await readFile(result.outputPath)));expect(result.planHash).toBe(renderPlanHash(plan));expect(plan).toEqual(original);
  const bytes=decodeVideo(result.outputPath);expect(bytes.length).toBe(5*640*480*3);
  for(const [i,expected] of [[0,[0,0,0]],[1,[210,20,20]],[2,[20,20,210]],[3,[210,210,20]],[4,[210,210,20]]] as const)for(let c=0;c<3;c++)expect(Math.abs(meanRGB(bytes,i)[c]!-expected[c]!)).toBeLessThan(8);
  const audio=execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-i',result.outputPath,'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','pipe:1'],{maxBuffer:1000000,timeout:10000});
  let audible=0,tail=0;for(let i=1000;i<4000;i++)audible+=Math.abs(audio.readFloatLE(i*8));for(let i=8500;i<9900;i++)tail=Math.max(tail,Math.abs(audio.readFloatLE(i*8)));expect(audible/3000).toBeGreaterThan(.1);expect(tail).toBeLessThan(.01);
  const reference=join(runtime,'reference.m4a');execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-i',plan.song.path,'-af','apad=whole_len=10000,atrim=end_sample=10000,asetpts=PTS-STARTPTS','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movie_timescale','48000',reference],{timeout:10000});
  const packets=(path:string)=>JSON.parse(execFileSync('/usr/bin/ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash','-of','json',path],{timeout:10000}).toString()).packets;
  expect(packets(result.outputPath)).toEqual(packets(reference));
  const receipt=JSON.parse(await readFile(result.receiptPath,'utf8'));expect(receipt.state).toBe('succeeded');expect(receipt.planHash).toBe(result.planHash);expect(receipt.output.sha256).toBe(result.sha256);expect(receipt.validation.video.nb_read_frames).toBe('5');expect(receipt.validation.audio.sample_rate).toBe('48000');expect(progress.at(-1)).toBe(5);
  await expect(runStudioRender({runtime,renderId,plan})).rejects.toThrow();
 },30000);
 it('retains black through song-only duration and rejects wrong media hashes before publishing an MP4',async()=>{
  const {runtime,plan}=await fixture(2001);const result=await runStudioRender({runtime,renderId:randomUUID(),plan});const b=decodeVideo(result.outputPath);expect(b.length).toBe(2*640*480*3);expect(Math.max(...meanRGB(b,0),...meanRGB(b,1))).toBeLessThan(3);
  await expect(runStudioRender({runtime,renderId:randomUUID(),plan:{...plan,song:{...plan.song,sha256:'0'.repeat(64)}}})).rejects.toThrow(/hash/i);
 },30000);
 it('rejects a mismatched source dimensions without upscaling and keeps a failed receipt',async()=>{
  const {runtime,plan,frames}=await fixture();const bad=png([20,20,20],1,320);await writeFile(frames[0]!.path,bad);frames[0]!.sha256=hash(bad);plan.placements=[placement(frames,0,1,0,1)];const id=randomUUID();await expect(runStudioRender({runtime,renderId:id,plan})).rejects.toThrow(/640|dimensions/i);const receipt=JSON.parse(await readFile(join(runtime,'projects',plan.projectId,'renders',id,'receipt.json'),'utf8'));expect(receipt.state).toBe('failed');
 },30000);
 it('snapshots the caller plan before asynchronous work and rejects changed PNG bytes',async()=>{
  const {runtime,plan,frames}=await fixture(2001);const captured=structuredClone(plan);const id=randomUUID();const pending=runStudioRender({runtime,renderId:id,plan});plan.revision=99;plan.song.sampleCount='999999';const result=await pending;
  expect(result.frameCount).toBe(2);expect(result.planHash).toBe(renderPlanHash(captured));const disk=JSON.parse(await readFile(join(runtime,'projects',plan.projectId,'renders',id,'plan.json'),'utf8'));expect(disk.plan).toEqual(captured);
  await writeFile(frames[0]!.path,png([0,0,0],0));captured.placements=[placement(frames,0,1,0,1)];await expect(runStudioRender({runtime,renderId:randomUUID(),plan:captured})).rejects.toThrow(/hash/i);
 },30000);
 it('rejects captured sample-count mismatch rather than stretching a song',async()=>{
  const {runtime,plan}=await fixture();plan.song.sampleCount='6501';await expect(runStudioRender({runtime,renderId:randomUUID(),plan})).rejects.toThrow(/sample duration/i);
 },30000);
 it('stops its active FFmpeg child on abort and leaves a failure receipt, never a ready output',async()=>{
  const {runtime,plan}=await fixture(48000*4);const id=randomUUID();const ctl=new AbortController();let observedProgress=false;
  await expect(runStudioRender({runtime,renderId:id,plan,signal:ctl.signal,onProgress:()=>{observedProgress=true;ctl.abort(new Error('test active cancellation'));}})).rejects.toThrow(/test active cancellation/);
  expect(observedProgress).toBe(true);const dir=join(runtime,'projects',plan.projectId,'renders',id);const receipt=JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'));expect(receipt.state).toBe('failed');await expect(readFile(join(dir,'output.mp4'))).rejects.toThrow();
 },30000);
 it('refuses a linked project before creating any render directory through it',async()=>{
  const {runtime,plan}=await fixture();const old=join(runtime,'projects',plan.projectId),moved=join(runtime,'relocated');await rename(old,moved);await symlink(moved,old);
  await expect(runStudioRender({runtime,renderId:randomUUID(),plan})).rejects.toThrow(/symlink/i);await expect(stat(join(moved,'renders'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('honours pre-abort without creating a render and never follows a source outside the project',async()=>{
  const {runtime,plan}=await fixture();const ctl=new AbortController();ctl.abort();await expect(runStudioRender({runtime,renderId:randomUUID(),plan,signal:ctl.signal})).rejects.toThrow();await expect(runStudioRender({runtime,renderId:randomUUID(),plan:{...plan,song:{...plan.song,path:'/etc/passwd'}}})).rejects.toThrow(/project/i);
 });
});

/** Authoritative local FLAC fixture, not H3/model evidence. */
async function clipAudio(runtime:string,plan:RenderPlan,name:string,samples=7000,rate=32000) {
 const directory=join(runtime,'projects',plan.projectId,'media'),path=join(directory,`${name}.flac`),input=join(directory,`${name}.wav`);
 const bytes=wav(samples);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*4,28);
 for(let i=0;i<samples;i++)for(let channel=0;channel<2;channel++) {
  const frame=Math.floor(i*24/rate),frequency=(name==='a'?230:1100)+frame*137+channel*83;
  bytes.writeInt16LE(Math.round((name==='a'?7000:14000)*Math.sin(i*2*Math.PI*frequency/rate)),44+i*4+channel*2);
 }
 await writeFile(input,bytes);
 execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-i',input,'-c:a','flac',path],{timeout:10000});
 const pcm=execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-i',path,'-af','aresample=48000:async=0','-ar','48000','-ac','2','-c:a','pcm_f32le','-f','f32le','pipe:1'],{maxBuffer:2_000_000,timeout:10000});
 return {audio:{path,sha256:hash(await readFile(path))},pcm};
}
function pcmFrom(path:string) {return execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-i',path,'-ar','48000','-ac','2','-c:a','pcm_f32le','-f','f32le','pipe:1'],{maxBuffer:2_000_000,timeout:10000});}
function audioPackets(path:string) {return JSON.parse(execFileSync('/usr/bin/ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash','-of','json',path],{timeout:10000}).toString()).packets;}
async function expectSoundtrack(runtime:string,output:string,pcm:Buffer) {
 const raw=join(runtime,`${randomUUID()}.f32le`),reference=join(runtime,`${randomUUID()}.m4a`);await writeFile(raw,pcm);
 execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-f','f32le','-ar','48000','-ac','2','-i',raw,'-af',`apad=whole_len=${pcm.length/8},atrim=end_sample=${pcm.length/8},asetpts=PTS-STARTPTS`,'-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movie_timescale','48000',reference],{timeout:10000});
 expect(audioPackets(output)).toEqual(audioPackets(reference));
}
describe('hard dominant-clip soundtrack switching',()=>{
 it('compiles exact sample spans with song gaps, source trim offsets and no hidden-audio fallback',async()=>{
  const {runtime,plan,frames}=await fixture(6500),a=await clipAudio(runtime,plan,'a');
  const behind={...placement(frames,0,4,0,1),audioSource:'clip' as const,audio:a.audio},front={...placement(frames,1,3,1,2),audioSource:'song' as const};plan.placements=[behind,front];
  expect(compileRenderPlan(plan)).toHaveProperty('audioSpans',[
   {startSample:'0',endSample:'2000',source:'clip',placementId:behind.id,sourceStartSample:'0'},
   {startSample:'2000',endSample:'6000',source:'song',placementId:null,sourceStartSample:'2000'},
   {startSample:'6000',endSample:'8000',source:'clip',placementId:behind.id,sourceStartSample:'6000'},
  ]);
  expect(renderPlanHash(plan)).not.toBe(renderPlanHash({...plan,placements:[{...behind,audioSource:'song'},front]}));
  expect(RENDER_PROFILE.version).toBe(2);expect(renderPlanHash(plan)).not.toBe(renderPlanHash({...plan,placements:[{...behind,audio:{...a.audio,sha256:'1'.repeat(64)}},front]}));
 });
 it('replaces rather than mixes the song, follows trim/move offsets and keeps exact post-song/short-source silence',async()=>{
  const {runtime,plan,frames}=await fixture(6500),a=await clipAudio(runtime,plan,'a',5001);
  const p={...placement(frames,1,4,1,1),audioSource:'clip' as const,audio:a.audio};plan.placements=[p];
  const result=await runStudioRender({runtime,renderId:randomUUID(),plan}),expected=Buffer.alloc(8000*8),song=pcmFrom(plan.song.path);
  song.copy(expected,0,0,2000*8);a.pcm.copy(expected,2000*8,2000*8,8000*8);
  await expectSoundtrack(runtime,result.outputPath,expected);
  const receipt=JSON.parse(await readFile(result.receiptPath,'utf8'));expect(receipt.soundtrack).toMatchObject({sampleCount:'8000',sha256:hash(expected),format:'f32le',sampleRate:48000,channels:2});
  expect(receipt.soundtrack.spans.at(-1).paddingSamples).toBe(String(8000-a.pcm.length/8));
  const video=decodeVideo(result.outputPath);for(const [i,color] of [[0,[0,0,0]],[1,[20,210,20]],[2,[20,20,210]],[3,[210,210,20]]] as const)for(let c=0;c<3;c++)expect(Math.abs(meanRGB(video,i)[c]!-color[c]!)).toBeLessThan(8);
  expect((await readdir(join(result.outputPath,'..'))).sort()).toEqual(['output.mp4','plan.json','receipt.json']);
 },30000);
 it('overlap priority swaps select only the visible audio source and never change the saved options',async()=>{
  const {runtime,plan,frames}=await fixture(6500),a=await clipAudio(runtime,plan,'a'),b=await clipAudio(runtime,plan,'b');
  const behind={...placement(frames,0,4,0,1),audioSource:'clip' as const,audio:a.audio},front={...placement(frames,1,3,1,2),audioSource:'clip' as const,audio:b.audio};plan.placements=[behind,front];
  const original=structuredClone(plan),one=await runStudioRender({runtime,renderId:randomUUID(),plan}),expected=Buffer.alloc(8000*8);
  a.pcm.copy(expected,0,0,2000*8);b.pcm.copy(expected,2000*8,2000*8,6000*8);a.pcm.copy(expected,6000*8,6000*8,8000*8);await expectSoundtrack(runtime,one.outputPath,expected);
  plan.placements=[{...behind,priority:3},front];const two=await runStudioRender({runtime,renderId:randomUUID(),plan});await expectSoundtrack(runtime,two.outputPath,a.pcm.subarray(0,8000*8));
  expect(plan.placements.map(p=>p.audioSource)).toEqual(['clip','clip']);expect(original.placements.map(p=>p.priority)).toEqual([1,2]);expect(two.planHash).not.toBe(one.planHash);
 },30000);
 it('disabled dominant audio uses the selected song then silence; hidden source is not read or used',async()=>{
  const {runtime,plan,frames}=await fixture(4501),a=await clipAudio(runtime,plan,'a');
  plan.songId=randomUUID(); // Same-project different-song arrangement, not the clip's original song.
  plan.placements=[{...placement(frames,0,4,0,1),audioSource:'clip' as const,audio:{...a.audio,sha256:'0'.repeat(64)}},{...placement(frames,0,4,0,2),audioSource:'song' as const}];
  const result=await runStudioRender({runtime,renderId:randomUUID(),plan}),expected=Buffer.alloc(8000*8);pcmFrom(plan.song.path).copy(expected);await expectSoundtrack(runtime,result.outputPath,expected);
  const receipt=JSON.parse(await readFile(result.receiptPath,'utf8'));expect(receipt.soundtrack.clipSources).toEqual([]);
 },30000);
 it('rejects enabled audio with a missing reference or changed hash instead of silently substituting the song',async()=>{
  const {runtime,plan,frames}=await fixture(),a=await clipAudio(runtime,plan,'a');
  const p={...placement(frames,0,4,0,1),audioSource:'clip' as const};
  await expect(runStudioRender({runtime,renderId:randomUUID(),plan:{...plan,placements:[p]}})).rejects.toThrow(/audio/i);
  const id=randomUUID();await expect(runStudioRender({runtime,renderId:id,plan:{...plan,placements:[{...p,audio:{...a.audio,sha256:'0'.repeat(64)}}]}})).rejects.toThrow(/hash/i);
  await expect(stat(join(runtime,'projects',plan.projectId,'renders',id,'output.mp4'))).rejects.toMatchObject({code:'ENOENT'});
 },30000);
 it('honours wholly post-song clip audio, exact one-sample song tail and silence before/after short source',async()=>{
  const {runtime,plan,frames}=await fixture(2001),a=await clipAudio(runtime,plan,'a',3333);
  plan.placements=[{...placement(frames,3,6,1,1),audioSource:'clip' as const,audio:a.audio}];
  const originalAudio=await readFile(a.audio.path),result=await runStudioRender({runtime,renderId:randomUUID(),plan}),expected=Buffer.alloc(12000*8);
  pcmFrom(plan.song.path).copy(expected);a.pcm.copy(expected,6000*8,2000*8,8000*8);
  await expectSoundtrack(runtime,result.outputPath,expected);
  const receipt=JSON.parse(await readFile(result.receiptPath,'utf8'));expect(receipt.compiled.audioSpans).toEqual([
   {startSample:'0',endSample:'2001',source:'song',placementId:null,sourceStartSample:'0'},
   {startSample:'2001',endSample:'6000',source:'silence',placementId:null,sourceStartSample:null},
   {startSample:'6000',endSample:'12000',source:'clip',placementId:plan.placements[0]!.id,sourceStartSample:'2000'},
  ]);
  expect(receipt.soundtrack.sha256).toBe(hash(expected));expect(receipt.soundtrack.clipSources[0]).toMatchObject({nativeSampleCount:'3333',nativeSampleRate:32000,workingSampleCount:String(a.pcm.length/8)});
  expect(await readFile(a.audio.path)).toEqual(originalAudio);
 },30000);
 it('uses silence when an enabled source trim begins beyond all its audio, never the song underneath',async()=>{
  const {runtime,plan,frames}=await fixture(8000),a=await clipAudio(runtime,plan,'a',500);
  plan.placements=[{...placement(frames,0,2,2,1),audioSource:'clip' as const,audio:a.audio}];
  const result=await runStudioRender({runtime,renderId:randomUUID(),plan}),expected=Buffer.alloc(8000*8),song=pcmFrom(plan.song.path);
  song.copy(expected,4000*8,4000*8);await expectSoundtrack(runtime,result.outputPath,expected);
  const receipt=JSON.parse(await readFile(result.receiptPath,'utf8'));expect(receipt.soundtrack.spans[0]).toMatchObject({availableSamples:'0',paddingSamples:'4000',sourceStartSample:'4000'});
 },30000);
 it('rejects a hash-valid non-FLAC source and an out-of-project source instead of normalizing or falling back',async()=>{
  const {runtime,plan,frames}=await fixture();const p={...placement(frames,0,4,0,1),audioSource:'clip' as const};
  await expect(runStudioRender({runtime,renderId:randomUUID(),plan:{...plan,placements:[{...p,audio:{path:plan.song.path,sha256:plan.song.sha256}}]}})).rejects.toThrow(/flac/i);
  await expect(runStudioRender({runtime,renderId:randomUUID(),plan:{...plan,placements:[{...p,audio:{path:'/etc/passwd',sha256:'0'.repeat(64)}}]}})).rejects.toThrow(/project/i);
 },30000);
});
