import {afterEach,expect,test,vi} from 'vitest';
import {artifactState,artifactMediaAvailable,activeArtifacts,renderMediaAvailable,attemptSourceUnavailable,readDeletionSubmission,beginDeletionSubmission,acknowledgeDeletionSnapshot} from './artifact-lifecycle.ts';
import type {ProjectSnapshot,StudioAttempt,StudioRender} from '../../../packages/core/src/contracts/studio.ts';
import type {ArtifactLifecycle,ArtifactDeletePlan,PurgeRecord} from '../../../packages/core/src/contracts/lifecycle.ts';
const p='project',clip={kind:'clip' as const,id:'clip'},song={kind:'song' as const,id:'song'};
function snapshot(rows:ArtifactLifecycle[]=[]):ProjectSnapshot{return {project:{id:p},artifactLifecycles:rows,deletions:[]} as unknown as ProjectSnapshot;}
function lifecycle(ref:typeof clip|typeof song,state:ArtifactLifecycle['state']):ArtifactLifecycle{return {...ref,projectId:p,state,revision:2,thumbnailAssetId:null,deletionId:null,updatedAt:null};}
afterEach(()=>vi.unstubAllGlobals());
test('legacy rows are active; lifecycle is project/kind/id scoped and original artifacts are not mutated',()=>{
 const s=snapshot();expect(artifactState(s,clip)).toBe('active');const rows=[{id:'clip'},{id:'other'}];
 s.artifactLifecycles=[lifecycle(clip,'archived'),{...lifecycle(song,'deleted'),id:'clip'}];
 expect(activeArtifacts(s,'clip',rows)).toEqual([{id:'other'}]);expect(rows).toHaveLength(2);
 expect(artifactState({...s,artifactLifecycles:[{...lifecycle(clip,'deleted'),projectId:'foreign'}]},clip)).toBe('active');
});
test.each(['deleting','deleted'] as const)('%s full media is never playable and has no restore action',state=>{
 const s=snapshot([lifecycle(clip,state)]);expect(artifactMediaAvailable(s,clip)).toBe(false);expect(activeArtifacts(s,'clip',[{id:'clip'}])).toEqual([]);
});
test('archived media may be inspected in history but not active library',()=>{
 const s=snapshot([lifecycle(clip,'archived')]);expect(artifactMediaAvailable(s,clip)).toBe(true);expect(activeArtifacts(s,'clip',[{id:'clip'}])).toEqual([]);
});
test('accepted deletion immediately denies affected renders even when purge has failed',()=>{
 const s=snapshot();const r={id:'render',projectId:p,snapshot:{song:{id:'song'},clips:[{id:'clip'}]}} as StudioRender;
 expect(renderMediaAvailable(s,r)).toBe(true);
 s.deletions=[{projectId:p,state:'failed',inventory:{affectedRenderIds:['render']}} as PurgeRecord];expect(renderMediaAvailable(s,r)).toBe(false);
 s.deletions=[{projectId:'foreign',inventory:{affectedRenderIds:['render']}} as PurgeRecord];expect(renderMediaAvailable(s,r)).toBe(true);
 s.artifactLifecycles=[lifecycle(song,'deleted')];expect(renderMediaAvailable(s,r)).toBe(false);
});
test('retry never promises unavailable source song or original continuation media',()=>{
 const s=snapshot([lifecycle(song,'deleted')]);s.songs=[{id:'song'}] as ProjectSnapshot['songs'];s.clips=[{id:'clip'}] as ProjectSnapshot['clips'];
 const attempt={input:{songId:'song'},song:{id:'song'},projectId:p} as StudioAttempt;
 expect(attemptSourceUnavailable(s,attempt)).toContain('song');
 s.artifactLifecycles=[lifecycle(clip,'deleted')];expect(attemptSourceUnavailable(s,{...attempt,continuation:{clipId:'clip'}} as StudioAttempt)).toContain('starting frame');
 expect(attemptSourceUnavailable(s,{input:{musicPrompt:'New track',lyrics:''}} as StudioAttempt)).toBeNull();
});
const plan={id:'plan',projectId:p,ref:clip,title:'The shot',digest:'a'.repeat(64),expiresAt:'2026-10-24T00:00:00Z',fileCount:9,bytes:1234,retains:['Text history'],limitations:['External copies cannot be recalled'],blockers:[]} as ArtifactDeletePlan;
function storage(){const values=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});return values;}
test('real deletion confirmation works on LAN HTTP without crypto.randomUUID and retains its key',()=>{
 storage();
 const getRandomValues=vi.fn((bytes:Uint8Array)=>{bytes.fill(255);return bytes;});
 vi.stubGlobal('crypto',{getRandomValues});
 const submission=beginDeletionSubmission(plan);
 expect(submission.key).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
 expect(readDeletionSubmission(p,clip)).toEqual(submission);
 expect(beginDeletionSubmission({...plan,id:'replacement'})).toEqual(submission);
 expect(getRandomValues).toHaveBeenCalledTimes(1);
});
test('confirmation journal keeps exact plan/key through ambiguous failures and refuses replacement until authoritative acceptance',()=>{
 storage();expect(readDeletionSubmission(p,clip)).toBeNull();const first=beginDeletionSubmission(plan,()=> '11111111-1111-4111-8111-111111111111');
 expect(readDeletionSubmission(p,clip)).toEqual(first);expect(beginDeletionSubmission({...plan,id:'new-plan'},()=> '22222222-2222-4222-8222-222222222222')).toEqual(first);
 const s=snapshot();acknowledgeDeletionSnapshot(s);expect(readDeletionSubmission(p,clip)).toEqual(first);
 s.deletions=[{id:'deletion',projectId:p,artifact:clip} as PurgeRecord];acknowledgeDeletionSnapshot(s);expect(readDeletionSubmission(p,clip)).toBeNull();
});
test('delete identities are isolated across projects/artifacts and corrupt journal never becomes confirmation',()=>{
 const values=storage();beginDeletionSubmission(plan,()=> '11111111-1111-4111-8111-111111111111');expect(readDeletionSubmission('other',clip)).toBeNull();expect(readDeletionSubmission(p,song)).toBeNull();
 for(const key of values.keys())values.set(key,'{"plan":{"projectId":"other"},"key":"bad"}');expect(readDeletionSubmission(p,clip)).toBeNull();
});

test('authoritative accepted deletion overrides a stale active lifecycle projection immediately',()=>{
 const s=snapshot();s.deletions=[{id:'delete',projectId:p,artifact:clip,state:'pending'} as PurgeRecord];expect(artifactState(s,clip)).toBe('deleting');expect(artifactMediaAvailable(s,clip)).toBe(false);
 s.deletions[0]!.state='succeeded';expect(artifactState(s,clip)).toBe('deleted');
});
test('only explicit definitive rejection codes release an uncertain confirmation; arbitrary conflict/network failures keep it',async()=>{
 const {deletionDefinitelyRejected,forgetDeletionSubmission}=await import('./artifact-lifecycle.ts'),{ApiError}=await import('./api.ts');
 for(const code of ['DELETE_PLAN_EXPIRED','DELETE_PLAN_STALE','DELETE_PLAN_CHANGED'])expect(deletionDefinitelyRejected(new ApiError('not accepted',409,code))).toBe(true);
 expect(deletionDefinitelyRejected(new ApiError('uncertain',409,'STUDIO_CONFLICT'))).toBe(false);expect(deletionDefinitelyRejected(new Error('offline'))).toBe(false);
 storage();const first=beginDeletionSubmission(plan,()=> '11111111-1111-4111-8111-111111111111');forgetDeletionSubmission({...first,key:'22222222-2222-4222-8222-222222222222'});expect(readDeletionSubmission(p,clip)).toEqual(first);forgetDeletionSubmission(first);expect(readDeletionSubmission(p,clip)).toBeNull();
});
