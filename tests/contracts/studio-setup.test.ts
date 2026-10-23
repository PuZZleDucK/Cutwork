import {fixtureH3Guides} from '../helpers/h3-guides.ts';
import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createSetupAdapter, executeSetupCommand, type SetupCommand, type SetupExecutor } from '../../apps/server/src/studio/setup.ts';

const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'studio-setup-')); dirs.push(base);
  const runtime = join(base, 'runtime'), source = join(base, 'source');
  await mkdir(join(source, 'integrations'), { recursive: true });
  await writeFile(join(source, 'integrations/tool-manifest.json'), JSON.stringify({node:{version:'24.22.0'},providers:{codex:{version:'0.163.0',model:'gpt-6.1-sol'},claude:{version:'2.1.306',model:'claude-opus-5-5'}}}));
  const calls: SetupCommand[] = [];
  const execute: SetupExecutor = async (c, log) => {
    calls.push(c); log?.('fixture progress\n');
    if (c.args.includes('--version')) return {code:0,stdout:c.executable.endsWith('/node')?'v24.22.0\n':c.executable.endsWith('/codex')?'codex-cli 0.163.0\n':'2.1.306 (Claude Code)\n',stderr:''};
    if (c.args.join(' ') === 'login status') return {code:0,stdout:'',stderr:'Logged in using ChatGPT\n'};
    if (c.args.join(' ') === 'auth status') return {code:0,stdout:'{"loggedIn":true,"email":"private@example.test"}',stderr:''};
    return {code:0,stdout:'fixture check passed\n',stderr:''};
  };
  await fixtureH3Guides(runtime,source);
  return {runtime,source,calls,execute};
}
async function models(f: Awaited<ReturnType<typeof fixture>>, tool: 'h3'|'yue2') {
  const bytes = 'genuine fixture model', revision = 'a'.repeat(40), repository = tool==='h3'?'Comfy-Org/MiniMax-H3':'m-a-p/YuE2-3B';
  const manifest = JSON.stringify({schemaVersion:1,models:[{repository,revision,files:[{path:'weights.bin',bytes:bytes.length,sha256:hash(bytes)}]}]});
  const integration = join(f.source,'integrations',tool), directory = join(f.runtime,'models',tool,repository.split('/')[1]!,revision);
  await mkdir(integration,{recursive:true}); await mkdir(directory,{recursive:true});
  await writeFile(join(integration,'models.json'),manifest); await writeFile(join(directory,'.studio-model-manifest'),hash(manifest)+'\n');
  await writeFile(join(directory,'weights.bin'),bytes); return {directory,bytes,integration};
}
test('configuration rejects relative roots before any process or write', () => {
  expect(()=>createSetupAdapter({runtime:'relative',source:'/source'})).toThrow(/absolute/);
  expect(()=>createSetupAdapter({runtime:'/runtime',source:'relative'})).toThrow(/absolute/);
});
test.each(['codex','claude'] as const)('checks pinned %s executable and auth without exposing account data',async provider=>{
  const f=await fixture(), adapter=createSetupAdapter(f); const result=await adapter.checkProvider(provider);
  expect(result.installed).toBe(true); expect(result.auth).toBe('signed-in'); expect(JSON.stringify(result)).not.toContain('private@example');
  expect(result.signInCommand).toContain(`${f.source}/scripts/provider.sh`);
  expect(f.calls.map(c=>c.args)).toContainEqual(provider==='codex'?['login','status']:['auth','status']);
  for(const c of f.calls){expect(c.env.STUDIO_DATA_ROOT).toBe(f.runtime);expect(c.env.PATH).toContain('/tools/runtime/node-v24.22.0-linux-x64/bin');expect(c.cwd).toBe(f.source);}
});
test('missing provider and version mismatch are not installed or signed in',async()=>{
  const f=await fixture(); const a=createSetupAdapter({...f,execute:async()=>({code:0,stdout:'wrong version',stderr:''})});
  const s=await a.checkProvider('codex'); expect(s.installed).toBe(false);expect(s.auth).toBe('unknown');
});
test('logged-out CLI remains installed and shows exact normal sign-in command',async()=>{
  const f=await fixture(); const execute:SetupExecutor=async(c,l)=>c.args[0]==='login'?{code:1,stdout:'',stderr:'Not logged in. secret-account-data'}:f.execute(c,l);
  const s=await createSetupAdapter({...f,execute}).checkProvider('codex');expect(s.installed).toBe(true);expect(s.auth).toBe('sign-in-required');
  expect(s.signInCommand).toContain('codex login --device-auth');expect(s.detail).not.toContain('secret-account');
});
test('auth command failure is unknown rather than claiming a logged-out account',async()=>{
  const f=await fixture(); const execute:SetupExecutor=async(c,l)=>{if(c.args[0]==='auth')throw new Error('timeout with private data');return f.execute(c,l);};
  const s=await createSetupAdapter({...f,execute}).checkProvider('claude');expect(s.installed).toBe(true);expect(s.auth).toBe('unknown');expect(s.detail).not.toContain('private data');
});
test('unknown successful auth output does not become signed in',async()=>{
  const f=await fixture();const execute:SetupExecutor=async(c,l)=>c.args[0]==='login'?{code:0,stdout:'Something changed',stderr:''}:f.execute(c,l);
  expect((await createSetupAdapter({...f,execute}).checkProvider('codex')).auth).toBe('unknown');
});
test('agent probe distinguishes installation from sign-in readiness',async()=>{
  const f=await fixture(); const execute:SetupExecutor=async(c,l)=>c.args[0]==='login'?{code:1,stdout:'',stderr:'Not logged in'}:f.execute(c,l);
  expect(await createSetupAdapter({...f,execute}).probe('agent','codex')).toMatchObject({installed:true,ready:false});
});
test('generator directory alone is not readiness and probe does not invoke installer',async()=>{
  const f=await fixture();await mkdir(join(f.runtime,'tools/yue2'),{recursive:true});
  const execute:SetupExecutor=async(c,l)=>{if(c.args.includes('-c'))return {code:1,stdout:'',stderr:'Missing recipe marker'};return f.execute(c,l);};
  const s=await createSetupAdapter({...f,execute}).probe('yue2','codex');expect(s.ready).toBe(false);expect(s.installed).toBe(false);
  expect(f.calls.some(c=>c.args.includes('--install'))).toBe(false);
});
test('hashes actual model bytes and invalidates cache after same-sized changes',async()=>{
  const f=await fixture(), m=await models(f,'yue2'), a=createSetupAdapter(f);
  expect(await a.probe('yue2','codex')).toMatchObject({installed:true,ready:true});
  await writeFile(join(m.directory,'weights.bin'),'x'.repeat(m.bytes.length));
  const s=await a.probe('yue2','codex');expect(s.installed).toBe(true);expect(s.ready).toBe(false);expect(s.detail).toMatch(/hash|checksum/i);
});
test('rejects a model manifest ownership mismatch instead of adopting existing files',async()=>{
  const f=await fixture(),m=await models(f,'h3');await writeFile(join(m.directory,'.studio-model-manifest'),'wrong');
  const s=await createSetupAdapter(f).probe('h3','codex');expect(s.ready).toBe(false);expect(s.detail).toMatch(/manifest/);
});
test('invalid manifest traversal is rejected',async()=>{
  const f=await fixture(),m=await models(f,'h3');const p=join(m.integration,'models.json');const j=JSON.parse(await readFile(p,'utf8'));j.models[0].files[0].path='../escape';await writeFile(p,JSON.stringify(j));
  expect((await createSetupAdapter(f).probe('h3','codex')).ready).toBe(false);
});
test.each(['yue2','comfyui','h3','analysis'] as const)('installs %s with existing explicit recipes and forwards progress',async tool=>{
  const f=await fixture(); if(tool==='yue2'||tool==='h3')await models(f,tool);
  const lines:string[]=[]; await createSetupAdapter(f).install(tool,'codex',s=>lines.push(s));
  const installers=f.calls.filter(c=>c.args.includes('--install'));
  const expected=tool==='yue2'?['prepare-yue2.sh','prepare-yue2-models.py']:tool==='comfyui'?['prepare-comfyui.sh']:tool==='h3'?['prepare-h3-models.py','prepare-h3-models.py']:['prepare-analysis.sh'];
  expect(installers.map(c=>c.args.find(a=>a.includes('/scripts/'))?.split('/').pop())).toEqual(expected);
  expect(lines.length).toBeGreaterThan(0);expect(f.calls.every(c=>c.timeoutMs>0&&c.timeoutMs<=14_400_000)).toBe(true);
  expect(f.calls.map(c=>c.executable).some(x=>x==='sudo'||x==='apt'||x==='pip')).toBe(false);
});
test('setup failures stop before later recipes and retain a bounded actionable error',async()=>{
  const f=await fixture();const execute:SetupExecutor=async(c,l)=>{f.calls.push(c);l?.('download failed');return {code:23,stdout:'',stderr:'Failed download'};};
  await expect(createSetupAdapter({...f,execute}).install('yue2','codex',()=>{})).rejects.toThrow(/23/);
  expect(f.calls).toHaveLength(1);
});
test('Comfy readiness is CPU-only node probe and analysis uses its real media probe',async()=>{
  const f=await fixture();const a=createSetupAdapter({...f,allocatePort:async()=>54321});
  expect((await a.probe('comfyui','codex')).ready).toBe(true); expect((await a.probe('analysis','codex')).ready).toBe(true);
  expect(f.calls.some(c=>c.args.includes(join(f.source,'scripts/probe-comfyui-nodes.py'))&&c.args.includes('--run')&&c.args.includes('54321'))).toBe(true);
  expect(f.calls.some(c=>c.executable===join(f.runtime,'tools/audio-analysis/venv/bin/python')&&c.args.includes(join(f.source,'integrations/analysis/probe.py')))).toBe(true);
});
test('executor streams fixture output and bounds hung owned child lifetime',async()=>{
  const f=await fixture();await mkdir(f.runtime,{recursive:true});const lines:string[]=[];
  const base={executable:process.execPath,cwd:f.runtime,env:{...process.env},timeoutMs:1000};
  expect(await executeSetupCommand({...base,args:['-e','console.log("fixture only")']},s=>lines.push(s))).toMatchObject({code:0});
  expect(lines.join('')).toContain('fixture only');
  await expect(executeSetupCommand({...base,args:['-e','setInterval(()=>{},1000)'],timeoutMs:30})).rejects.toThrow(/timed out/i);
});

test('executor progress persistence errors do not leave a running fixture child',async()=>{
  const f=await fixture();await mkdir(f.runtime,{recursive:true});
  await expect(executeSetupCommand({executable:process.execPath,args:['-e','console.log("fixture");setInterval(()=>{},1000)'],cwd:f.runtime,env:{...process.env},timeoutMs:1000},()=>{throw new Error('storage unavailable');})).rejects.toThrow(/progress recording failed/);
});
test('model missing after dependency imports remains installed but not generation-ready',async()=>{
  const f=await fixture();const result=await createSetupAdapter(f).probe('yue2','codex');expect(result).toMatchObject({installed:true,ready:false});
});

test('Comfy controller gets a bounded grace longer than its network plus three cleanup waits',async()=>{
  const f=await fixture();await createSetupAdapter({...f,allocatePort:async()=>54321}).probe('comfyui','codex');
  const probe=f.calls.find(c=>c.args.includes(join(f.source,'scripts/probe-comfyui-nodes.py')))!;
  expect(probe.terminationGraceMs).toBe(75_000);
  expect(f.calls.filter(c=>c!==probe).every(c=>c.terminationGraceMs===undefined)).toBe(true);
});

test('executor allows an owned controller to reap its separate-session child during grace',async()=>{
  const f=await fixture();await mkdir(f.runtime,{recursive:true});
  const childPid=join(f.runtime,'owned-child.pid'), cleaned=join(f.runtime,'controller-cleanup.txt');
  const fixtureCode=`
    const {spawn}=require('node:child_process');const fs=require('node:fs');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
    fs.writeFileSync(${JSON.stringify(childPid)},String(child.pid));
    process.on('SIGTERM',()=>setTimeout(()=>{
      child.once('exit',()=>{fs.writeFileSync(${JSON.stringify(cleaned)},'reaped');process.exit(0);});
      process.kill(-child.pid,'SIGTERM');
    },150));
    console.log('controller ready');setInterval(()=>{},1000);
  `;
  try {
    await expect(executeSetupCommand({executable:process.execPath,args:['-e',fixtureCode],cwd:f.runtime,env:{...process.env},timeoutMs:1000,terminationGraceMs:1000},()=>{throw new Error('Injected progress persistence failure');})).rejects.toThrow(/progress recording failed/);
    expect(await readFile(cleaned,'utf8')).toBe('reaped');
    const pid=Number(await readFile(childPid,'utf8'));expect(()=>process.kill(pid,0)).toThrow();
  } finally {
    // Only the exact fixture child PID captured by this invocation, never services.
    try {process.kill(-Number(await readFile(childPid,'utf8')),'SIGKILL');} catch { /* Already reaped or never launched. */ }
  }
});
test('executor honors a short injected grace for a non-cooperative CPU fixture',async()=>{
  const f=await fixture();await mkdir(f.runtime,{recursive:true});const start=Date.now();
  await expect(executeSetupCommand({executable:process.execPath,args:['-e','process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'],cwd:f.runtime,env:{...process.env},timeoutMs:1000,terminationGraceMs:50},()=>{throw new Error('Injected progress persistence failure');})).rejects.toThrow(/progress recording failed/);
  expect(Date.now()-start).toBeLessThan(2000);
});
test.each([0,-1,90_001,Infinity])('executor rejects unbounded or invalid grace %s before launch',async grace=>{
  const f=await fixture();await expect(executeSetupCommand({executable:process.execPath,args:['-e','throw Error("must not execute")'],cwd:f.runtime,env:{...process.env},timeoutMs:1000,terminationGraceMs:grace})).rejects.toThrow(/termination grace/);
});

test('closed setup adapter rejects new probes, providers and installs without spawning',async()=>{
 const f=await fixture(),a=createSetupAdapter(f);a.close();a.close();
 await expect(a.probe('yue2','codex')).rejects.toThrow(/stopping|closed/i);
 await expect(a.checkProvider('codex')).rejects.toThrow(/stopping|closed/i);
 await expect(a.install('yue2','codex',()=>{})).rejects.toThrow(/stopping|closed/i);expect(f.calls).toHaveLength(0);
});
test('close aborts first recipe and prevents follow-up installer even when injected executor resolves successfully',async()=>{
 const f=await fixture();let entered!:()=>void,finish!:()=>void;const first=new Promise<void>(r=>{entered=r;}),done=new Promise<void>(r=>{finish=r;});
 const calls:SetupCommand[]=[];const a=createSetupAdapter({...f,execute:async c=>{calls.push(c);entered();await done;return {code:0,stdout:'',stderr:''};}});
 const work=a.install('yue2','codex',()=>{});await first;a.close();expect(calls[0]!.signal?.aborted).toBe(true);finish();
 await expect(work).rejects.toThrow(/stopping|closed/i);expect(calls).toHaveLength(1);
});

test('external abort allows CPU controller to reap its own separate-session child',async()=>{
 const f=await fixture();await mkdir(f.runtime,{recursive:true});const controller=new AbortController(),childPid=join(f.runtime,'abort-child.pid'),cleaned=join(f.runtime,'abort-cleanup');
 const fixtureCode=`const{spawn}=require('node:child_process'),fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});fs.writeFileSync(${JSON.stringify(childPid)},String(c.pid));process.on('SIGTERM',()=>setTimeout(()=>{c.once('exit',()=>{fs.writeFileSync(${JSON.stringify(cleaned)},'reaped');process.exit(0);});process.kill(-c.pid,'SIGTERM');},100));console.log('ready');setInterval(()=>{},1000);`;
 try{await expect(executeSetupCommand({executable:process.execPath,args:['-e',fixtureCode],cwd:f.runtime,env:{...process.env},timeoutMs:1000,terminationGraceMs:1000,signal:controller.signal},()=>controller.abort())).rejects.toThrow(/cancelled/);expect(await readFile(cleaned,'utf8')).toBe('reaped');const pid=Number(await readFile(childPid,'utf8'));expect(()=>process.kill(pid,0)).toThrow();}
 finally{try{process.kill(-Number(await readFile(childPid,'utf8')),'SIGKILL');}catch{/* This exact fixture child already exited. */}}
});
test('pre-aborted command never launches an executable',async()=>{
 const f=await fixture(),c=new AbortController();c.abort();await expect(executeSetupCommand({executable:'/must-not-start',args:[],cwd:f.runtime,env:{},timeoutMs:1000,signal:c.signal})).rejects.toThrow(/cancelled before launch/);
});
test('close during a model checksum prevents hash completion and later work',async()=>{
 const f=await fixture();await models(f,'yue2');const a=createSetupAdapter(f);await expect(a.install('yue2','codex',text=>{if(text.startsWith('Verifying yue2 model checksum:'))a.close();})).rejects.toThrow(/stopping/);
});

test('forced abort reports uncertain descendants rather than equating killed controller with cleanup',async()=>{
 const f=await fixture();await mkdir(f.runtime,{recursive:true});const c=new AbortController();await expect(executeSetupCommand({executable:process.execPath,args:['-e','process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'],cwd:f.runtime,env:{...process.env},timeoutMs:1000,terminationGraceMs:50,signal:c.signal},()=>c.abort())).rejects.toThrow(/cleanup unconfirmed/);
});
test('probe propagates unresolved descendant cleanup for maintenance-lease retention',async()=>{
 const f=await fixture();const a=createSetupAdapter({...f,execute:async()=>{throw new Error('owned descendant cleanup unconfirmed');}});await expect(a.probe('comfyui','codex')).rejects.toThrow(/cleanup unconfirmed/);
});

test('H3 setup verifies upstream guide files as well as existing weights',async()=>{
 const f=await fixture();await models(f,'h3');
 const guides=await fixtureH3Guides(f.runtime,f.source);await writeFile(join(guides.directory,guides.files[0]!.path),'changed');
 const status=await createSetupAdapter(f).probe('h3','codex');expect(status.ready).toBe(false);expect(status.detail).toContain('Retry H3 setup');
});
