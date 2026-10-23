/** Native protocol metadata fixtures only: no provider, credentials, or network calls. */
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { providerLaunch } from '../../apps/server/src/providers/launch.ts';
import { parseCodexSessionHeader, runProvider, type ProviderLaunch } from '../../apps/server/src/providers/run.ts';
import { intent } from '../support/fixtures.ts';

const sessionId='01a16548-4774-7ff1-9d5d-118bafd51ba9';
const cwd='/tmp/exact project/workspace';
const model='gpt-6.1-sol';
const header=(changes:Record<string,string>={})=>[
  'OpenAI Codex v0.163.0','--------',`workdir: ${changes.cwd??cwd}`,`model: ${changes.model??model}`,
  'provider: openai','approval: never','sandbox: danger-full-access',`session id: ${changes.id??sessionId}`,'--------',
].join('\n')+'\n';
const expected={cwd,model};
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});

it('assigns a fresh Claude UUID once during immutable launch capture without changing natural output or tools',()=>{
  const first=providerLaunch('/tmp/root',{...intent(),provider:'claude',model:'claude-opus-5-5'});
  const second=providerLaunch('/tmp/root',{...intent(),provider:'claude',model:'claude-opus-5-5'});
  const flag=first.argv.indexOf('--session-id'),id=first.argv[flag+1];
  expect(flag).toBeGreaterThan(-1);expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(first.sessionBinding).toEqual({provider:'claude',capture:'assigned-cli-argument',sessionId:id});
  expect(second.sessionBinding).not.toEqual(first.sessionBinding);
  expect(JSON.parse(JSON.stringify(first)).argv).toEqual(first.argv);
  for(const forbidden of ['--json','--output-format','--json-schema','--tools','--safe-mode','--bare','--continue','--resume'])expect(first.argv).not.toContain(forbidden);
  expect(first.stdin).toContain('Reply naturally');
});
it('keeps Codex normal stderr/native text and capabilities with explicit capture metadata',()=>{
  const launch=providerLaunch('/tmp/root',intent());
  expect(launch.sessionBinding).toEqual({provider:'codex',capture:'native-stderr-header'});
  expect(launch.argv).toContain('--dangerously-bypass-approvals-and-sandbox');
  expect(launch.argv).not.toContain('--json');expect(launch.argv).not.toContain('--output-schema');
});
it('observes only the native header ID with exact cwd/model binding',()=>{
  expect(parseCodexSessionHeader(header()+'user\nsession id: 11111111-1111-4111-8111-111111111111\n',expected)).toMatchObject({provider:'codex',status:'observed',sessionId,source:'native-stderr-header',cliVersion:'0.163.0'});
});
it('accepts native CRLF and colour escape sequences without changing recorded identity',()=>{
  expect(parseCodexSessionHeader('\x1b[1m'+header().replaceAll('\n','\r\n')+'\x1b[0m',expected)).toMatchObject({status:'observed',sessionId});
});
it.each([
 ['cwd',header({cwd:'/another/project'})],['model',header({model:'another-model'})],
 ['invalid UUID',header({id:'latest'})],['uppercase/noncanonical UUID',header({id:sessionId.toUpperCase()})],
 ['missing ID',header().replace(`session id: ${sessionId}\n`,'')],
 ['duplicate ID',header().replace(`session id: ${sessionId}`,`session id: ${sessionId}\nsession id: ${sessionId}`)],
 ['duplicate cwd',header().replace(`workdir: ${cwd}`,`workdir: ${cwd}\nworkdir: ${cwd}`)],
 ['truncated header',header().slice(0,-5)],
 ['prompt imitation without native prefix','user\n'+header()],
 ['later header following missing native ID',header().replace(`session id: ${sessionId}\n`,'')+'user\n'+header()],
 ['oversized prefix','x'.repeat(65537)+header()],
])('reports provenance unavailable for %s rather than guessing',(_name,text)=>{
  expect(parseCodexSessionHeader(text,expected)).toMatchObject({provider:'codex',status:'unavailable',sessionId:null,source:'native-stderr-header'});
});

async function fixture(provider:'codex'|'claude',options:{header?:boolean;exit?:number;removeLog?:boolean;replaceLog?:boolean}={}) {
  const root=await mkdtemp(join(tmpdir(),'studio-provider-session-'));roots.push(root);
  const launch=providerLaunch(root,{...intent(),provider,model:provider==='codex'?model:'claude-opus-5-5'});
  await mkdir(launch.cwd,{recursive:true});
  const code=`import {readFileSync,writeFileSync,unlinkSync,renameSync} from 'node:fs';
    setTimeout(()=>process.exit(99),4000).unref();
    process.stdin.resume();process.stdin.on('end',()=>{
      writeFileSync(${JSON.stringify(join(root,'receipt-at-input.json'))},readFileSync(${JSON.stringify(join(launch.runDirectory,'provider-receipt.json'))}));
      ${options.header?`process.stderr.write(${JSON.stringify(header({cwd:launch.cwd}))});`:''}
      process.stdout.write('An ordinary natural-language fixture answer.\\n');
      ${options.removeLog?`unlinkSync(${JSON.stringify(join(launch.runDirectory,'provider.stderr.log'))});`:''}
      ${options.replaceLog?`renameSync(${JSON.stringify(join(launch.runDirectory,'provider.stderr.log'))},${JSON.stringify(join(root,'original-stderr.log'))});writeFileSync(${JSON.stringify(join(launch.runDirectory,'provider.stderr.log'))},${JSON.stringify(header({cwd:launch.cwd,id:'11111111-1111-4111-8111-111111111111'}))});`:''}
      process.exitCode=${options.exit??0};
    });`;
  const native:ProviderLaunch={...launch,executable:process.execPath,argv:['--input-type=module','--eval',code,'--',...launch.argv]};
  const result=await runProvider(native,{signal:AbortSignal.timeout(3000)});
  return {root,launch:native,result,receipt:JSON.parse(await readFile(result.receiptPath,'utf8'))};
}
it('stores actual header metadata while retaining unwrapped prose and ordinary success',async()=>{
  const f=await fixture('codex',{header:true});
  expect(f.result.succeeded).toBe(true);
  expect(f.receipt.providerSession).toMatchObject({status:'observed',sessionId,source:'native-stderr-header'});
  expect(await readFile(f.result.stdoutPath,'utf8')).toBe('An ordinary natural-language fixture answer.\n');
});
it('does not turn absent metadata into a failed completed provider call',async()=>{
  const f=await fixture('codex');
  expect(f.result).toMatchObject({succeeded:true,code:0});
  expect(f.receipt.providerSession).toMatchObject({status:'unavailable',sessionId:null});
});
it('retains observed session identity on a native failure without claiming success',async()=>{
  const f=await fixture('codex',{header:true,exit:7});
  expect(f.result).toMatchObject({succeeded:false,code:7});
  expect(f.receipt.providerSession).toMatchObject({status:'observed',sessionId});
});
it('captures assigned Claude identity before input dispatch without claiming transcript verification',async()=>{
  const f=await fixture('claude');
  const atInput=JSON.parse(await readFile(join(f.root,'receipt-at-input.json'),'utf8'));
  expect(atInput.providerSession).toMatchObject({provider:'claude',status:'assigned',sessionId:f.launch.sessionBinding?.provider==='claude'?f.launch.sessionBinding.sessionId:null,source:'cli-argument'});
  expect(f.receipt.providerSession).toEqual(atInput.providerSession);
  expect(f.result.succeeded).toBe(true);
});
it('an unlinked log path does not lose metadata still retained in the owned descriptor',async()=>{
  const f=await fixture('codex',{header:true,removeLog:true});
  expect(f.result.succeeded).toBe(true);
  expect(f.receipt.providerSession).toMatchObject({status:'observed',sessionId});
  await expect(readFile(f.result.stderrPath,'utf8')).rejects.toMatchObject({code:'ENOENT'});
});
it('binds metadata to its originally opened stderr file, not a replacement at that path',async()=>{
  const f=await fixture('codex',{header:true,replaceLog:true});
  expect(f.result.succeeded).toBe(true);
  expect(f.receipt.providerSession).toMatchObject({status:'observed',sessionId});
  expect(await readFile(f.result.stderrPath,'utf8')).toContain('11111111-1111-4111-8111-111111111111');
});
it('keeps legacy captured Codex launch arguments unchanged and uses only its native header',async()=>{
  const root=await mkdtemp(join(tmpdir(),'studio-provider-session-legacy-'));roots.push(root);await mkdir(join(root,'workspace'));
  await symlink(process.execPath,join(root,'codex'));
  const launch={executable:join(root,'codex'),shell:false as const,cwd:join(root,'workspace'),runDirectory:join(root,'run'),stdin:'legacy input',argv:['--input-type=module','--eval',`process.stdin.resume();process.stdin.on('end',()=>process.stderr.write(${JSON.stringify(header({cwd:join(root,'workspace')}))}));`,'--','--model',model]};
  const before=structuredClone(launch);const result=await runProvider(launch);
  expect(launch).toEqual(before);expect(result.succeeded).toBe(true);
  expect(JSON.parse(await readFile(result.receiptPath,'utf8')).providerSession).toMatchObject({status:'observed',sessionId});
});
it('legacy Claude launch without an assigned ID stays unchanged and explicitly unavailable',async()=>{
  const root=await mkdtemp(join(tmpdir(),'studio-provider-session-legacy-'));roots.push(root);await mkdir(join(root,'workspace'));
  await symlink(process.execPath,join(root,'claude'));
  const launch={executable:join(root,'claude'),shell:false as const,cwd:join(root,'workspace'),runDirectory:join(root,'run'),stdin:'legacy input',argv:['--input-type=module','--eval',"process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('legacy prose'));",'--','--model','claude-opus-5-5']};
  const before=structuredClone(launch);const result=await runProvider(launch);
  expect(launch).toEqual(before);expect(result.succeeded).toBe(true);
  expect(JSON.parse(await readFile(result.receiptPath,'utf8')).providerSession).toMatchObject({provider:'claude',status:'unavailable',sessionId:null});
});
it('refuses inconsistent assigned session metadata before launching any child',async()=>{
  const root=await mkdtemp(join(tmpdir(),'studio-provider-session-mismatch-'));roots.push(root);
  const launch=providerLaunch(root,{...intent(),provider:'claude',model:'claude-opus-5-5'});
  const args=[...launch.argv];args[args.indexOf('--session-id')+1]='11111111-1111-4111-8111-111111111111';
  await expect(runProvider({...launch,executable:process.execPath,argv:args})).rejects.toThrow(/session/i);
  await expect(readFile(join(launch.runDirectory,'provider-receipt.json'))).rejects.toMatchObject({code:'ENOENT'});
});
