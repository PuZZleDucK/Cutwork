// Browser-only synthetic fixture. Never imported by the normal studio entrypoint.
// No providers, tool installs, native queues or generated media are invoked.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const input = { musicPrompt: 'A warm electronic soundtrack with playful percussion and a late-night atmosphere.', lyrics:'', style:'' };
const projects = [
  { id:'fixture-project-a', name:'Midnight compile · fixture', createdAt:'2026-10-23T00:00:00Z', revision:1, draft:{...input}, selectedSongId:'fixture-song' },
  { id:'fixture-project-b', name:'Second idea · fixture', createdAt:'2026-10-23T00:00:00Z', revision:1, draft:{musicPrompt:'A quiet piano study.', lyrics:'', style:''}, selectedSongId:null },
];
let selectedProjectId = projects[0].id;
let provider = {provider:'codex',model:'gpt-6.1-sol',installed:true,auth:'signed-in',detail:'Synthetic browser fixture; no real provider check.',signInCommand:'codex login'};
let tools = ['agent','yue2','comfyui','h3','analysis'].map((id,i) => ({id,label:['Agent','YuE2','ComfyUI','H3','Analysis'][i],state:'ready',installed:true,detail:'Synthetic browser fixture',log:'',checkedAt:new Date().toISOString(),jobId:null,active:false,queued:0}));
const song = {id:'fixture-song',projectId:projects[0].id,attemptId:'fixture-attempt',createdAt:'2026-10-23T00:00:00Z',title:'First take · synthetic waveform',assetId:'fixture-audio',sha256:'fixture-only',sampleCount:'1440000',sampleRate:48000,channels:2,durationSeconds:30,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:Array.from({length:60},(_,i)=>String(i*24000)),waveformBucketSamples:6000,peaks:Array.from({length:240},(_,i)=>(0.3+Math.abs(Math.sin(i*1.57))*0.6)*(0.4+Math.abs(Math.sin(i*0.053))*0.6)),error:null,version:'fixture'}};
const attempts = [{id:'fixture-attempt',nativeCallId:'fixture-native-call',projectId:projects[0].id,sequence:1,createdAt:'2026-10-23T00:00:00Z',updatedAt:'2026-10-23T00:00:00Z',state:'succeeded',provider:'codex',model:'gpt-6.1-sol',input:{...input},seeds:{semantic:'12345678901234567890'},stage:'Complete',error:null,songId:song.id,details:{boundary:'Synthetic UI data, not native generation evidence',toolSettings:{temperature:0.9},transcript:'Fixture transcript: preparing an original score.'}}];
let conflictNext = false; let saveDelayMs=0; const requests=[];
const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://127.0.0.1');const path=url.pathname;
  let body={}; if(req.method !== 'GET') {let text='';for await(const chunk of req)text+=chunk;body=JSON.parse(text||'{}');}
  if(path.startsWith('/api/')) requests.push({method:req.method,path,body:structuredClone(body)});
  if(path==='/api/fixture/control') {if('conflictNext' in body)conflictNext=body.conflictNext;if('saveDelayMs' in body)saveDelayMs=body.saveDelayMs;if(body.setupMissing){tools=tools.map(t=>({...t,installed:false,state:'missing'}));provider={...provider,installed:false,auth:'unknown'};}return respond(res,200,{requests,projects});}
  if(path==='/api/studio')return respond(res,200,{projects:projects.map(p=>({...p,songCount:p.id===song.projectId?1:0,activeAttempts:attempts.filter(a=>a.projectId===p.id&&a.state==='queued').length,coveragePercent:null})),selectedProjectId,provider,tools,warnings:[]});
  if(path==='/api/projects'&&req.method==='POST'){const p={id:`fixture-project-${projects.length}`,name:body.name,createdAt:new Date().toISOString(),revision:1,draft:{musicPrompt:'',lyrics:'',style:''},selectedSongId:null};projects.push(p);return respond(res,201,p);}
  const match=path.match(/^\/api\/projects\/([^/]+)(.*)$/);
  if(match){const p=projects.find(p=>p.id===match[1]);if(!p)return respond(res,404,{error:'Unknown fixture project',code:'NOT_FOUND'});const tail=match[2];
   if(!tail)return respond(res,200,{project:p,songs:p.id===song.projectId?[song]:[],attempts:attempts.filter(a=>a.projectId===p.id)});
   if(tail==='/select'){selectedProjectId=p.id;return respond(res,200,p);}
   if(tail==='/draft'){if(saveDelayMs)await new Promise(r=>setTimeout(r,saveDelayMs));if(conflictNext){conflictNext=false;p.revision++;p.draft={...p.draft,musicPrompt:'Server-side conflict fixture draft'};return respond(res,409,{error:'Project changed elsewhere.',code:'REVISION_CONFLICT'});}if(p.revision!==body.revision)return respond(res,409,{error:'Revision conflict',code:'REVISION_CONFLICT'});p.revision++;p.draft=body.draft;return respond(res,200,p);}
   if(tail.startsWith('/songs/')){p.selectedSongId=tail.split('/')[2];p.revision++;return respond(res,200,p);}
   if(tail==='/music'){const a={...attempts[0],id:body.idempotencyKey,projectId:p.id,sequence:attempts.length+1,state:'queued',stage:'Fixture queue only; no generation will run',songId:null,input:body.input,details:{boundary:'Synthetic fixture'}};if(!attempts.some(x=>x.id===a.id))attempts.push(a);return respond(res,202,a);}
  }
  if(path==='/api/provider'){provider={...provider,provider:body.provider,model:body.provider==='codex'?'gpt-6.1-sol':'claude-opus-5-5'};return respond(res,200,provider);}
  if(path==='/api/provider/check')return respond(res,200,provider);
  if(path.startsWith('/api/setup/')){tools=tools.map(t=>({...t,installed:true,state:'ready'}));provider={...provider,installed:true,auth:'signed-in'};return respond(res,202,{});}
  if(path==='/api/assets/fixture-audio'){res.writeHead(404);return res.end('Synthetic waveform only; no generated audio.');}
  const file=resolve(root,path==='/'?'index.html':`.${path}`);if(!file.startsWith(root.endsWith(sep)?root:root+sep))return respond(res,403,{});
  const data=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream'});res.end(data);
 }catch(error){respond(res,500,{error:error.message,code:'FIXTURE_ERROR'});}
});
server.listen(0,'127.0.0.1',()=>console.log(`SYNTHETIC_BROWSER_FIXTURE http://127.0.0.1:${server.address().port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.closeAllConnections();server.close();});
setTimeout(()=>{server.closeAllConnections();server.close();},20*60*1000).unref();
