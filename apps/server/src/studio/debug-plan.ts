import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { providerModels } from '../providers/launch.ts';
import type { DebugContext, DebugLaunch, DebugPlan } from '../../../../packages/core/src/contracts/debug.ts';
import type { ToolId } from '../../../../packages/core/src/contracts/studio.ts';
export const digest = (text:string) => createHash('sha256').update(text).digest('hex');
export function canonical(value:unknown):string {
 if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;
 if(value!==null&&typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
/** Diagnostics only: never read credential stores, auth stdout or environment values. */
export function redact(text:string):string {
 return text.replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]').replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|hf_[A-Za-z0-9]{8,})\b/g,'[REDACTED]')
  .replace(/(\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gi,'$1[REDACTED]')
  .replace(/(\b(?:[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|token)\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,'$1[REDACTED]')
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[REDACTED]@')
  .replace(/([?&](?:token|key|api_key|access_token|signature)=)[^&#\s]*/gi,'$1[REDACTED]');
}
export const tools:ToolId[]=['agent','yue2','comfyui','h3','analysis'];
export function contextDigest(context:DebugContext):string {
 return digest(canonical({provider:context.provider,tool:{id:context.tool.id,state:context.tool.state,installed:context.tool.installed,detail:context.tool.detail,log:context.tool.log,jobId:context.tool.jobId},setupJob:context.setupJob??null}));
}
export interface DebugConfiguration { fingerprint:string; cwd:string; executable:string; model:string; files:Record<string,string> }
export async function configuration(runtime:string,source:string,tool:ToolId,context:DebugContext):Promise<DebugConfiguration>{
 if(!tools.includes(tool)||context.tool.id!==tool)throw new Error('Unsupported or mismatched Debug tool');
 if(!isAbsolute(runtime)||resolve(runtime)!==runtime||!isAbsolute(source)||resolve(source)!==source)throw new Error('Absolute normalized Debug runtime/source required');
 const path=join(source,'integrations/tool-manifest.json'),text=await readFile(path,'utf8'),pin=JSON.parse(text);
 if(!['codex','claude'].includes(context.provider)||pin.providers?.[context.provider]?.model!==providerModels[context.provider])throw new Error('Unsupported pinned Debug provider/model');
 for(const version of [pin.node?.version,pin.providers?.codex?.version,pin.providers?.claude?.version])if(typeof version!=='string'||!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))throw new Error('Invalid pinned Debug CLI version');
 const prefix=join(runtime,`tools/provider-cli/codex-${pin.providers.codex.version}_claude-${pin.providers.claude.version}`),executable=join(prefix,'node_modules/.bin',context.provider);
 const cwd=tool==='agent'?prefix:join(runtime,'tools',tool==='analysis'?'audio-analysis':tool==='h3'?'comfyui':tool);
 const files:Record<string,string>={'integrations/tool-manifest.json':digest(text)};
 const dependencies=tool==='agent'?[]:tool==='h3'?['comfyui','h3']:[tool];
 for(const name of dependencies)for(const leaf of ['recipe.json','requirements.lock','models.json']){
  const relative=`integrations/${name}/${leaf}`;try{files[relative]=digest(await readFile(join(source,relative),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;files[relative]='missing';}
 }
 async function identity(path:string){try{const st=await lstat(path,{bigint:true}),real=await realpath(path),target=await stat(real,{bigint:true});const fields=(s:typeof st)=>({device:String(s.dev),inode:String(s.ino),size:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)});return {real,link:fields(st),target:fields(target)};}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
 const identityValue={cwd:await identity(cwd),executable:await identity(executable)};
 return {cwd,executable,model:pin.providers[context.provider].model,files,fingerprint:digest(canonical({runtime,source,tool,provider:context.provider,files,...identityValue}))};
}
export function makePlan(input:{id:string;runtime:string;source:string;tool:ToolId;context:DebugContext;configuration:DebugConfiguration;now:number;ttlMs:number}):DebugPlan{
 const {id,runtime,source,tool,context,configuration:config,now,ttlMs}=input;
 const runDirectory=join(runtime,'setup-jobs',`debug-${id}`),sessionBinding:DebugLaunch['sessionBinding']=context.provider==='codex'?{provider:'codex',capture:'native-stderr-header'}:{provider:'claude',capture:'assigned-cli-argument',sessionId:randomUUID()};
 const argv=context.provider==='codex'?['exec','--model',config.model,'--dangerously-bypass-approvals-and-sandbox','--skip-git-repo-check','--cd',config.cwd,'-']:['-p','--model',config.model,'--dangerously-skip-permissions','--session-id',sessionBinding.provider==='claude'?sessionBinding.sessionId:''];
 const warning='This agent can make changes autonomously, including outside the displayed working directory. Shared-tool changes can affect every project. It runs with the service account’s normal OS rights and provider tools; this is not a sandbox. New studio work is paused during this maintenance task.';
 const summary=`Investigate and repair ${tool} setup, then describe changes, remaining problems and verification. The studio independently checks readiness afterward.`;
 const failureLogSha256=digest(context.tool.log),detail=redact(context.tool.detail).slice(-16000),log=redact(context.tool.log).slice(-64000);
 const stdin=[`Confirmed shared-tool setup repair: ${tool}.`,summary,warning,
  'Use your normal tools, research, skills and scripts. Reply naturally; no JSON response schema is required. The working directory organises this repair, not your filesystem authority.',
  `Tool directory: ${config.cwd}\nProduct source: ${source}\nRuntime storage: ${runtime}\nRepair evidence directory: ${runDirectory}`,
  tool==='h3'?'H3 shares the managed ComfyUI installation. Its pinned model files live under runtime models/h3. The issue may involve either dependency.':'Use the affected tool’s managed installation and the product-owned recipes as repair context.',
  `Observed setup state: ${context.tool.state}; installed: ${context.tool.installed}; setup job: ${context.tool.jobId??'none'}.\nFailure detail:\n${detail}\n\nBounded diagnostic log (recognizable credentials redacted):\n${log||'(no retained log)'}`,
  `Diagnostic log SHA256 before redaction: ${failureLogSha256}.\nCaptured source files: ${JSON.stringify(config.files)}`,
  'Investigate the actual failure, make a proportionate repair, and report what you changed, what commands/checks you ran, and anything unresolved. Do not treat your final prose as a readiness receipt. The studio will independently rerun its pinned CPU/import/model-file checks; these do not prove GPU generation capacity.',
  'Preserve separate managed Python environments rather than changing the host Python setup. Existing projects and unrelated services are not the repair target. If resolution requires consequences beyond this task, explain them honestly. Normal provider tools and capabilities remain available.',
 ].join('\n\n');
 const launch:DebugLaunch={executable:config.executable,argv,cwd:config.cwd,runDirectory,stdin,shell:false,sessionBinding};
 const quote=(s:string)=>`'${s.replaceAll("'","'\\''")}'`;
 const plan={id,tool,provider:context.provider,model:config.model,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+ttlMs).toISOString(),contextDigest:contextDigest(context),failureLogSha256,summary,warning,readableCommand:[launch.executable,...argv].map(quote).join(' '),launch,
  prelaunchActions:[`Create ${config.cwd} if absent, then start the displayed command there with the complete displayed prompt on stdin.`,`Write only this run's captured prompt, provider transcript and outcome under ${runDirectory}; independently recheck ${tool} readiness afterward.`]};
 return {...plan,digest:digest(canonical({plan,configuration:config.fingerprint}))};
}
