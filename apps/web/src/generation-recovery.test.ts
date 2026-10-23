import { afterEach,expect,test,vi } from 'vitest';
import { recoveryActions,prepareRecoverySubmission,clearRecoverySubmission } from './generation-recovery.ts';
afterEach(()=>vi.unstubAllGlobals());
test.each(['queued','preparing','waiting_gpu','running','validating'])('only cancel while %s',state=>{
 expect(recoveryActions(state)).toEqual(['cancel']);
});
test.each(['cancel_requested','reconciling','unknown'])('no false recovery while %s',state=>{
 expect(recoveryActions(state)).toEqual([]);
});
test('cancelled work has exactly restart/discard/restore; failed work retries',()=>{
 expect(recoveryActions('cancelled')).toEqual(['restart','discard','restore']);
 expect(recoveryActions('failed')).toEqual(['retry','restore','discard']);
});
test('successful work exposes a fresh variation, never same-seed restart',()=>{
 expect(recoveryActions('succeeded')).toEqual(['reuse']);
});
test('discard removes placeholder actions but does not turn it into a success',()=>{
 expect(recoveryActions('cancelled',true)).toEqual([]);
 expect(recoveryActions('failed',true)).toEqual([]);
});
const keys=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
function storage(){const values=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});return values;}
test('recovery identity survives lost responses and is isolated by project, parent and action',()=>{
 storage();const first=prepareRecoverySubmission('p','a','retry',()=>keys[0]!);
 expect(prepareRecoverySubmission('p','a','retry',()=>keys[1]!)).toEqual(first);
 for(const [p,a,action] of [['q','a','retry'],['p','b','retry'],['p','a','restart']] as const){
  expect(prepareRecoverySubmission(p,a,action,()=>keys[1]!).key).not.toBe(first.key);
 }
 expect(JSON.parse(first.signature)).toEqual({projectId:'p',attemptId:'a',action:'retry'});
});
test('late acceptance cannot clear a newer recovery identity',()=>{
 storage();const first=prepareRecoverySubmission('p','a','restart',()=>keys[0]!);clearRecoverySubmission('p','a','restart',first);
 const newer=prepareRecoverySubmission('p','a','restart',()=>keys[1]!);clearRecoverySubmission('p','a','restart',first);
 expect(prepareRecoverySubmission('p','a','restart',()=>keys[2]!)).toEqual(newer);
});
test('unavailable storage retains the recovery identity for this page lifetime',()=>{
 vi.stubGlobal('sessionStorage',{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}});
 const first=prepareRecoverySubmission('blocked','a','retry',()=>keys[0]!);
 expect(prepareRecoverySubmission('blocked','a','retry',()=>keys[1]!)).toEqual(first);
});

test('accepted recovery keeps its key across failed reads/reload until the exact child AND hidden parent are observed',async()=>{
 storage();const recovery=await import('./generation-recovery.ts'),first=prepareRecoverySubmission('p','a','retry',()=>keys[0]!);
 recovery.markRecoveryAccepted('p','a','retry',first,keys[1]!);
 expect(prepareRecoverySubmission('p','a','retry',()=>keys[2]!)).toEqual(first);
 const parent={id:'a',projectId:'p',placeholderDiscardedAt:'now'},child={id:keys[1]!,projectId:'p',recovery:{parentAttemptId:'a',action:'retry' as const}};
 recovery.acknowledgeRecoverySnapshot({project:{id:'p'},attempts:[child],videoAttempts:[]});expect(prepareRecoverySubmission('p','a','retry',()=>keys[2]!)).toEqual(first);
 recovery.acknowledgeRecoverySnapshot({project:{id:'p'},attempts:[{id:'a',projectId:'p'},child],videoAttempts:[]});expect(prepareRecoverySubmission('p','a','retry',()=>keys[2]!)).toEqual(first);
 recovery.acknowledgeRecoverySnapshot({project:{id:'p'},attempts:[parent,{...child,id:keys[2]!}],videoAttempts:[]});expect(prepareRecoverySubmission('p','a','retry',()=>keys[2]!)).toEqual(first);
 recovery.acknowledgeRecoverySnapshot({project:{id:'p'},attempts:[parent,child],videoAttempts:[]});expect(prepareRecoverySubmission('p','a','retry',()=>keys[2]!).key).toBe(keys[2]);
});

test('lost POST response or a late older acceptance never clears a newer or ambiguous recovery journal',async()=>{
 storage();const recovery=await import('./generation-recovery.ts'),first=prepareRecoverySubmission('p','a','restart',()=>keys[0]!);
 const snapshot={project:{id:'p'},attempts:[{id:'a',projectId:'p',placeholderDiscardedAt:'now'},{id:keys[1]!,projectId:'p',recovery:{parentAttemptId:'a',action:'restart' as const}}],videoAttempts:[]};
 recovery.acknowledgeRecoverySnapshot(snapshot);expect(prepareRecoverySubmission('p','a','restart',()=>keys[2]!)).toEqual(first);
 clearRecoverySubmission('p','a','restart',first);const newer=prepareRecoverySubmission('p','a','restart',()=>keys[2]!);recovery.markRecoveryAccepted('p','a','restart',first,keys[1]!);recovery.acknowledgeRecoverySnapshot(snapshot);expect(prepareRecoverySubmission('p','a','restart',()=>keys[0]!)).toEqual(newer);
});

test('cancellation flights are per attempt, independent, and release on both failure and success',async()=>{
 const {cancellationFlights}=await import('./generation-recovery.ts'),flights=cancellationFlights();let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});const first=flights.run('a',()=>pending);expect(flights.has('a')).toBe(true);const duplicate=vi.fn();expect(await flights.run('a',duplicate)).toBe(false);expect(duplicate).not.toHaveBeenCalled();const other=vi.fn(async()=>{});expect(await flights.run('b',other)).toBe(true);expect(flights.has('a')).toBe(true);release();expect(await first).toBe(true);expect(flights.has('a')).toBe(false);await expect(flights.run('c',async()=>{throw Error('fixture');})).rejects.toThrow('fixture');expect(flights.has('c')).toBe(false);
});

test('authoritative restoration applies before polling but preserves newer local inputs and rejects another project/older revision',async()=>{
 const {restoredProjectState}=await import('./generation-recovery.ts');const project={id:'p',name:'Fixture',revision:1,createdAt:'now',selectedSongId:null,draft:{musicPrompt:'Before',lyrics:'Before lyrics',style:'Current visual'}};const result={...project,revision:2,draft:{musicPrompt:'Restored',lyrics:'Restored lyrics',style:'Restored visual'}};
 expect(restoredProjectState({project,draft:project.draft},result,project.draft)).toEqual({project:result,draft:result.draft,dirty:false});
 expect(restoredProjectState({project,draft:{...project.draft,musicPrompt:'Newer typing'}},result,project.draft)).toEqual({project:result,draft:{...project.draft,musicPrompt:'Newer typing'},dirty:true});
 expect(restoredProjectState({project:{...project,revision:3},draft:project.draft},result,project.draft)).toBeNull();expect(restoredProjectState({project:{...project,id:'other'},draft:project.draft},result,project.draft)).toBeNull();
});

// SSR creates the real hook closure/refs without mounting effects/timers; these
// exercise real request/action flow, not interactive browser rendering.
async function hookFixture(){
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{useStudio}=await import('./useStudio.ts');let studio!:ReturnType<typeof useStudio>;
 const project={id:keys[0]!,name:'Fixture',revision:1,createdAt:'now',selectedSongId:null,draft:{musicPrompt:'Before',lyrics:'Lyrics',style:'Visual'}};
 let saved=structuredClone(project),failReads=false;const calls:{path:string;body:Record<string,unknown>|undefined}[]=[];
 let intercept:((path:string,body:Record<string,unknown>|undefined)=>Promise<Response>|null)=()=>null;
 const snapshot=()=>({project:saved,songs:[],attempts:[],videoAttempts:[],clips:[],arrangements:[],reservations:[],renders:[],events:[],clipDrafts:[],editContexts:[]});
 vi.stubGlobal('window',{confirm:vi.fn(()=>true)});
 vi.stubGlobal('fetch',async(path:string,init?:RequestInit)=>{const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({path,body});const special=intercept(path,body);if(special)return special;
  if(!body&&failReads)throw Error('read offline');
  if(path==='/api/studio')return Response.json({projects:[],selectedProjectId:saved.id,tools:[]});
  if(path.endsWith('/draft')&&body){saved={...saved,revision:saved.revision+1,draft:body.draft};return Response.json(saved);}
  if(path.endsWith('/restore-parameters')){saved={...saved,revision:saved.revision+1,draft:{musicPrompt:'Restored',lyrics:'Restored lyrics',style:'Visual'}};return Response.json({project:saved});}
  return Response.json(snapshot());
 });
 function Harness(){studio=useStudio();return null;}renderToStaticMarkup(React.createElement(Harness));await studio.refresh();
 return {studio,project,calls,snapshot,getSaved:()=>saved,setSaved:(value:typeof project)=>{saved=value;},failReads:()=>{failReads=true;},intercept:(value:typeof intercept)=>{intercept=value;}};
}

test('actual action hook allows cancellation during another action blocked on a dirty save, deduplicates only that attempt and keeps draft',async()=>{
 const f=await hookFixture();let finishSave!:(value:Response)=>void,finishCancel!:()=>void;const saving=new Promise<Response>(resolve=>{finishSave=resolve;}),cancelling=new Promise<void>(resolve=>{finishCancel=resolve;});
 f.intercept(path=>path.endsWith('/draft')?saving:null);f.studio.edit({...f.project.draft,musicPrompt:'Do not lose this draft'});
 const other=vi.fn(async()=>{}),ordinary=f.studio.perform(other,'Other complete');await vi.waitFor(()=>expect(f.calls.some(c=>c.path.endsWith('/draft'))).toBe(true));
 const stop=vi.fn(()=>cancelling),cancel=f.studio.performCancellation('attempt-a',stop,'Stopped');expect(stop).toHaveBeenCalledOnce();expect(other).not.toHaveBeenCalled();const duplicate=vi.fn(async()=>{});expect(await f.studio.performCancellation('attempt-a',duplicate,'Duplicate')).toBe(false);expect(duplicate).not.toHaveBeenCalled();finishCancel();expect(await cancel).toBe(true);
 const accepted={...f.project,revision:2,draft:{...f.project.draft,musicPrompt:'Do not lose this draft'}};f.setSaved(accepted);finishSave(Response.json(accepted));expect(await ordinary).toBe(true);expect((await f.studio.saveProjectForRestore()).draft).toEqual(accepted.draft);
});

test('actual restore refuses declined dirty replacement without saving, then applies accepted result even when refresh is offline',async()=>{
 const f=await hookFixture();f.studio.edit({...f.project.draft,musicPrompt:'Unsaved thought'});vi.mocked(window.confirm).mockReturnValueOnce(false);
 expect(await f.studio.restoreMusic('attempt')).toBe(false);expect(f.calls.filter(c=>c.body)).toHaveLength(0);
 f.intercept((path)=>{if(path.endsWith('/restore-parameters')){f.failReads();return Promise.resolve(Response.json({project:{...f.project,revision:3,draft:{musicPrompt:'Original',lyrics:'Original words',style:'Visual'}}}));}return null;});
 expect(await f.studio.restoreMusic('attempt')).toBe(true);const restore=f.calls.find(c=>c.path.endsWith('/restore-parameters'))!;expect(restore.body).toEqual({projectRevision:2});expect((await f.studio.saveProjectForRestore())).toMatchObject({revision:3,draft:{musicPrompt:'Original',lyrics:'Original words',style:'Visual'}});
});

test('actual restore leaves a delayed newer local edit intact and owned clean-save revision is not replaced by a later poll',async()=>{
 const f=await hookFixture();const owned=f.studio.saveProjectForRestore();f.setSaved({...f.project,revision:8});await f.studio.refresh();expect((await owned).revision).toBe(1);
 let finish!:(value:Response)=>void;const pending=new Promise<Response>(resolve=>{finish=resolve;});f.intercept(path=>path.endsWith('/restore-parameters')?pending:null);
 const restore=f.studio.restoreMusic('attempt');await vi.waitFor(()=>expect(f.calls.some(c=>c.path.endsWith('/restore-parameters'))).toBe(true));f.studio.edit({...f.project.draft,musicPrompt:'Typed after request'});
 const result={...f.project,revision:9,draft:{musicPrompt:'Original',lyrics:'Original lyrics',style:'Visual'}};f.setSaved(result);finish(Response.json({project:result}));expect(await restore).toBe(true);f.intercept(()=>null);await f.studio.save();expect(f.calls.filter(c=>c.path.endsWith('/draft')).at(-1)!.body!.draft).toEqual({...f.project.draft,musicPrompt:'Typed after request'});
});

test('actual cancel button ignores unrelated busy state but disables a duplicate owned cancellation',async()=>{
 const {GenerationActions}=await import('./GenerationActions.tsx'),{renderToStaticMarkup}=await import('react-dom/server'),{createElement}=await import('react');
 const attempt={id:'attempt',projectId:'p',state:'running'} as Parameters<typeof GenerationActions>[0]['attempt'];
 const render=(cancelling:ReadonlySet<string>)=>renderToStaticMarkup(createElement(GenerationActions,{attempt,studio:{busy:true,cancelling} as Parameters<typeof GenerationActions>[0]['studio'],onRestore:async()=>{}}));
 expect(render(new Set())).toContain('Cancel generation');expect(render(new Set())).not.toMatch(/<button[^>]*disabled/);expect(render(new Set(['attempt']))).toMatch(/<button[^>]*disabled/);
});
