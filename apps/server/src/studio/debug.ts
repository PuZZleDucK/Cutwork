import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { runProvider as defaultRunProvider, ProviderLaunchAbortedError } from '../providers/run.ts';
import type { GpuQueue, MaintenanceLease } from '../jobs/gpu-queue-contract.ts';
import { StudioStoreError } from './store.ts';
import { canonical, configuration, contextDigest, digest, makePlan, redact, tools } from './debug-plan.ts';
import type { DebugContext, DebugOutcome, DebugReadiness, DebugRecord, DebugState } from '../../../../packages/core/src/contracts/debug.ts';
import type { Provider, ProviderStatus, ToolId } from '../../../../packages/core/src/contracts/studio.ts';
export class DebugError extends StudioStoreError { constructor(status:400|404|409,code:string,message:string){super(status,code,message);this.name='DebugError';} }
interface Stored {record:DebugRecord;configuration:string;leases:MaintenanceLease[]}
export interface DebugOptions {
 runtime:string;source:string;queue:GpuQueue;context:(tool:ToolId)=>DebugContext;hasActiveWork:()=>boolean;
 checkProvider:(provider:Provider)=>Promise<ProviderStatus>;probe:(tool:ToolId,provider:Provider)=>Promise<DebugReadiness>;
 applyReadiness?:(tool:ToolId,result:DebugReadiness)=>void;onRecord?:(record:DebugRecord)=>void;
 closeChecks?:()=>void|Promise<void>;runProvider?:typeof defaultRunProvider;now?:()=>number;ttlMs?:number;
}
const blocking:DebugState[]=['confirmed','running','checking','reconciling'];
const boundary='Provider CLI exit and independent setup checks are recorded separately. Normal full-access agents may use unregistered work; arbitrary detached descendants and GPU generation capacity are not certified by this repair.';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorText=(e:unknown)=>redact(e instanceof Error?e.message:String(e)).slice(-12000);
/** Shared repair manager; preparation stores consent metadata only, never launches work. */
export async function createDebugManager(options:DebugOptions){
 const {runtime,source,queue}=options,now=options.now??Date.now,ttlMs=options.ttlMs??600000;
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>3600000)throw new Error('Invalid Debug confirmation lifetime');
 await mkdir(runtime,{recursive:true,mode:0o700});const path=join(runtime,'debug.sqlite'),db=new Database(path);await chmod(path,0o600);
 db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');db.exec('CREATE TABLE IF NOT EXISTS debug_records(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const controller=new AbortController(),running=new Map<string,Promise<void>>(),run=options.runProvider??defaultRunProvider;let closed=false,closing:Promise<void>|undefined;
 const openManager=()=>{if(closed)throw new DebugError(409,'DEBUG_STOPPING','Debug manager is stopping');};
 function stored(id:string):Stored|null {if(!uuid.test(id))throw new DebugError(400,'DEBUG_INPUT','Invalid Debug record ID');const row=db.prepare('SELECT data FROM debug_records WHERE id=?').get(id) as {data:string}|undefined;return row?JSON.parse(row.data) as Stored:null;}
 function all():Stored[]{return (db.prepare('SELECT data FROM debug_records ORDER BY rowid').all() as {data:string}[]).map(row=>JSON.parse(row.data) as Stored);}
 function publish(value:Stored){db.prepare('INSERT INTO debug_records VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.record.id,JSON.stringify(value));try{options.onRecord?.(structuredClone(value.record));}catch(error){process.stderr.write(`Debug status callback failed: ${errorText(error)}\n`);}return structuredClone(value.record);}
 function update(value:Stored,patch:Partial<Pick<DebugRecord,'state'|'error'|'outcome'|'confirmedAt'>>){value.record={...value.record,...patch,updatedAt:new Date(now()).toISOString()};return publish(value);}
 function required(id:string){const value=stored(id);if(!value)throw new DebugError(404,'DEBUG_NOT_FOUND','Debug record not found');return value;}
 const isBlocking=()=>closed||all().some(v=>blocking.includes(v.record.state));
 for(const value of all())if(['confirmed','running','checking'].includes(value.record.state))update(value,{state:'reconciling',error:'The server restarted during confirmed Debug. Ownership and maintenance require review; no repair was replayed.'});
 async function prepare(tool:ToolId){
  openManager();if(!tools.includes(tool))throw new DebugError(400,'DEBUG_INPUT','Unsupported Debug tool');const context=structuredClone(options.context(tool));
  if(!['error','missing'].includes(context.tool.state))throw new DebugError(409,'DEBUG_NOT_FAILED','Debug requires a failed or missing setup; active or uncertain work must be reviewed first');
  const before=contextDigest(context),config=await configuration(runtime,source,tool,context);openManager();
  if(contextDigest(options.context(tool))!==before)throw new DebugError(409,'DEBUG_STALE','Setup context changed during disclosure; request a fresh plan');
  const id=randomUUID(),plan=makePlan({id,runtime,source,tool,context,configuration:config,now:now(),ttlMs});
  const record:DebugRecord={id,tool,state:'disclosed',plan,createdAt:plan.createdAt,updatedAt:plan.createdAt,confirmedAt:null,error:null,outcome:null};
  return publish({record,configuration:config.fingerprint,leases:[]});
 }
 async function report(path:string){
  try{const file=await open(path,'r');try{const info=await file.stat();if(!info.isFile())return{text:'Provider report is not a regular file.',truncated:false};const size=Math.min(info.size,32768),bytes=Buffer.alloc(size);await file.read(bytes,0,size,info.size-size);return{text:redact(bytes.toString('utf8')),truncated:info.size>size};}finally{await file.close();}}
  catch{return{text:'No provider report was available.',truncated:false};}
 }
 async function knownExit(value:Stored){
  try{const r=JSON.parse(await readFile(join(value.record.plan.launch.runDirectory,'provider-receipt.json'),'utf8'));return ['exited','failed'].includes(r.state)&&r.cleanup?.cliStopped!==false&&(typeof r.code==='number'||typeof r.signal==='string'||r.cleanup?.cliStopped===true);}catch{return false;}
 }
 async function execute(value:Stored){
  let dispatched=false,stoppedKnown=true,providerFailure:string|null=null;
  const outcome:DebugOutcome={provider:null,readiness:null,boundary};
  try{
   controller.signal.throwIfAborted();const plan=value.record.plan,status=await options.checkProvider(plan.provider);controller.signal.throwIfAborted();
   if(status.provider!==plan.provider||status.model!==plan.model||!status.installed||status.auth!=='signed-in')throw new Error(`The captured provider cannot start. ${status.detail} ${status.signInCommand}`);
   // Auth checks may take time: never launch a different binary/configuration from the disclosed one.
   const context:DebugContext={provider:plan.provider,tool:{id:plan.tool,state:'error',installed:false,detail:'',log:'',jobId:null}};
   if((await configuration(runtime,source,plan.tool,context)).fingerprint!==value.configuration)throw new Error('Pinned source or tool launch configuration changed after confirmation; request a fresh disclosure');
   controller.signal.throwIfAborted();await mkdir(plan.launch.cwd,{recursive:true,mode:0o700});
   if(await realpath(plan.launch.cwd)!==plan.launch.cwd)throw new Error('Affected tool working directory resolved elsewhere; request a reviewed configuration');
   controller.signal.throwIfAborted();update(value,{state:'running'});dispatched=true;stoppedKnown=false;
   try{
    const result=await run(structuredClone(plan.launch),{signal:controller.signal});
    // A leader exit code alone is not evidence that owned cleanup finished.
    stoppedKnown=await knownExit(value);
    const prose=await report(result.stdoutPath);
    outcome.provider={succeeded:result.succeeded&&result.inputDelivered&&result.code===0,code:result.code,signal:result.signal,receiptPath:result.receiptPath,report:prose.text,reportTruncated:prose.truncated};
    if(!stoppedKnown)throw new Error('Provider exit and owned cleanup are unconfirmed');
    if(!outcome.provider.succeeded)providerFailure=`Provider repair did not complete successfully (code ${result.code}, signal ${result.signal??'none'}).`;
   }catch(error){
    stoppedKnown=error instanceof ProviderLaunchAbortedError||await knownExit(value);
    if(!stoppedKnown)throw error;
    providerFailure=errorText(error);const prose=await report(join(plan.launch.runDirectory,'provider.stdout.log'));
    outcome.provider??={succeeded:false,code:null,signal:null,receiptPath:join(plan.launch.runDirectory,'provider-receipt.json'),report:prose.text,reportTruncated:prose.truncated};
   }
   controller.signal.throwIfAborted();update(value,{state:'checking',outcome});
   const readiness=await options.probe(plan.tool,plan.provider);
   if(/cleanup.*unconfirmed|cleanup could not be confirmed/i.test(readiness.detail))throw new Error(readiness.detail);
   outcome.readiness={installed:readiness.installed,ready:readiness.ready,detail:redact(readiness.detail).slice(-12000)};
   options.applyReadiness?.(plan.tool,structuredClone(outcome.readiness));
   const failure=providerFailure??(readiness.ready?null:outcome.readiness.detail);
   // Release before publishing terminal state. Unknown release never unblocks work.
   for(const lease of [...value.leases]){queue.releaseMaintenance(lease);value.leases=value.leases.filter(v=>v.token!==lease.token);publish(value);}
   update(value,{state:failure?'failed':'succeeded',error:failure,outcome});
  }catch(error){
   const text=errorText(error),uncertain=(dispatched&&!stoppedKnown)||/cleanup.*unconfirmed|cleanup could not be confirmed/i.test(text);
   if(!uncertain){
    try{for(const lease of [...value.leases]){queue.releaseMaintenance(lease);value.leases=value.leases.filter(v=>v.token!==lease.token);publish(value);}}
    catch(releaseError){update(value,{state:'reconciling',error:`${text}; maintenance release unconfirmed: ${errorText(releaseError)}`,outcome});return;}
   }
   update(value,{state:uncertain?'reconciling':'failed',error:text,outcome});
  }
 }
 async function confirm(id:string,confirmationDigest:string):Promise<DebugRecord>{
  openManager();let value=required(id);
  const validate=()=>{
   if(typeof confirmationDigest!=='string'||confirmationDigest!==value.record.plan.digest)throw new DebugError(409,'DEBUG_DIGEST','Debug disclosure digest does not match');
   const {digest:capturedDigest,...capturedPlan}=value.record.plan;
   if(digest(canonical({plan:capturedPlan,configuration:value.configuration}))!==capturedDigest)throw new DebugError(409,'DEBUG_DIGEST','Persisted Debug disclosure changed; review a new request');
   if(value.record.confirmedAt!==null)return false; // exact accepted replay, even after later context/provider changes
   if(value.record.state!=='disclosed')throw new DebugError(409,'DEBUG_STATE',`Debug disclosure is ${value.record.state}; prepare and review a new request`);
   if(now()>=Date.parse(value.record.plan.expiresAt)){update(value,{state:'expired',error:'The confirmation expired; review a fresh disclosure'});throw new DebugError(409,'DEBUG_EXPIRED','Debug disclosure expired; review a new request');}
   return true;
  };
  if(!validate())return structuredClone(value.record);
  const context=structuredClone(options.context(value.record.tool));
  if(contextDigest(context)!==value.record.plan.contextDigest){update(value,{state:'stale',error:'Setup or selected provider changed; review a fresh disclosure'});throw new DebugError(409,'DEBUG_STALE','Debug context changed; review a new request');}
  let config;
  try{config=await configuration(runtime,source,value.record.tool,context);}catch(error){throw new DebugError(409,'DEBUG_STALE',`Debug configuration changed or is unavailable: ${errorText(error)}`);}
  openManager();value=required(id);if(!validate())return structuredClone(value.record);
  if(config.fingerprint!==value.configuration||contextDigest(options.context(value.record.tool))!==value.record.plan.contextDigest){update(value,{state:'stale',error:'Setup, source or launch configuration changed; review a fresh disclosure'});throw new DebugError(409,'DEBUG_STALE','Debug context/configuration changed; review a new request');}
  // No async boundary from idle decision through durable reservation/native locks.
  if(isBlocking()||options.hasActiveWork())throw new DebugError(409,'DEBUG_BUSY','Studio work is active or uncertain. Wait for it to finish before confirming Debug.');
  const acquired:MaintenanceLease[]=[];
  try{
   for(const tool of ['yue2','h3'] as const){const lease=queue.acquireMaintenance(tool);if(!lease)throw new DebugError(409,'DEBUG_BUSY','A native maintenance lease is busy or retained; no repair launched');acquired.push(lease);}
   value.leases=acquired;update(value,{state:'confirmed',confirmedAt:new Date(now()).toISOString()});
  }catch(error){for(const lease of acquired)queue.releaseMaintenance(lease);throw error;}
  const accepted=structuredClone(value.record);
  const work=execute(value).catch(error=>{try{update(value,{state:'reconciling',error:`Debug persistence/ownership needs review: ${errorText(error)}`});}catch{process.stderr.write('Debug outcome could not be persisted; retained maintenance requires review.\n');}}).finally(()=>running.delete(id));
  running.set(id,work);return accepted;
 }
 function cancel(id:string){openManager();const value=required(id);if(value.record.state==='cancelled')return structuredClone(value.record);if(value.record.state!=='disclosed')throw new DebugError(409,'DEBUG_STATE','Only an unconfirmed disclosure can be cancelled');return update(value,{state:'cancelled'});}
 return {prepare,confirm,cancel,get:(id:string)=>{openManager();return structuredClone(stored(id)?.record??null);},list:()=>{openManager();return all().map(v=>structuredClone(v.record));},isBlocking,
  close(){if(closing)return closing;closed=true;controller.abort(new Error('Debug manager is shutting down'));return closing=(async()=>{
   let checks:Promise<void>;try{checks=Promise.resolve(options.closeChecks?.());}catch(error){checks=Promise.reject(error);}
   try{const results=await Promise.allSettled([checks,...running.values()]);const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}finally{db.close();}
  })();},
 };
}
export type DebugManager=Awaited<ReturnType<typeof createDebugManager>>;
