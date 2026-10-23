import {expect,test,vi} from 'vitest';
import {restoreVideoParameters,restoredSnapshot,type VideoRestoreOptions} from './restore-video.ts';
import type {ClipDraft,ProjectSnapshot,StudioProject,VideoAttempt} from '../../../packages/core/src/contracts/studio.ts';
function fixture(){
 const project={id:'project',revision:7,draft:{musicPrompt:'current',lyrics:'',style:'current style'}} as StudioProject;
 const target={projectId:'project',songId:'original-song',revision:3,clipPrompt:'visible old draft',timingIntent:null} as ClipDraft;
 const current={...target,songId:'current-song',revision:8};const attempt={id:'attempt',projectId:'project',input:{songId:target.songId}} as VideoAttempt;
 const result={project:{...project,revision:8},draft:{...target,revision:4,clipPrompt:'restored'},attempt};
 const post=vi.fn(async(_url:string,_body:{projectRevision:number;clipDraftRevision:number})=>result),acceptProject=vi.fn(),saveProject=vi.fn(async()=>project),saveClip=vi.fn(async()=>current);
 const options:VideoRestoreOptions={attempt,projectId:'project',selectedSongId:current.songId,observedTarget:target,post,accept:acceptProject,saveProject,saveClip};
 return {options,target,current,project,result,post,acceptProject,saveProject,saveClip};
}
test('cross-song restore uses the revision the user observed, not a fresh server read',async()=>{
 const f=fixture();const r=await restoreVideoParameters(f.options);
 expect(f.post).toHaveBeenCalledExactlyOnceWith('/api/projects/project/attempts/attempt/restore-parameters',{projectRevision:7,clipDraftRevision:3});expect(r.target).toEqual(f.target);expect(f.acceptProject).toHaveBeenCalledExactlyOnceWith(f.result,f.target,f.project.draft);
});
test('an intervening remote edit conflicts and never accepts or retries with a newer revision',async()=>{
 const f=fixture();f.post.mockRejectedValueOnce(new Error('409 draft changed in another tab'));
 await expect(restoreVideoParameters(f.options)).rejects.toThrow('409');expect(f.post).toHaveBeenCalledTimes(1);expect(f.post.mock.calls[0]).toEqual(['/api/projects/project/attempts/attempt/restore-parameters',{projectRevision:7,clipDraftRevision:3}]);expect(f.acceptProject).not.toHaveBeenCalled();
});
test('same-song restoration uses its own successful save revision and rejects foreign context before saving',async()=>{
 const f=fixture();f.options.selectedSongId=f.target.songId;f.saveClip.mockResolvedValue({...f.target,revision:4});
 await restoreVideoParameters(f.options);expect(f.post.mock.calls[0]?.[1]).toEqual({projectRevision:7,clipDraftRevision:4});
 f.saveProject.mockClear();f.options.projectId='other';await expect(restoreVideoParameters(f.options)).rejects.toThrow('original project');expect(f.saveProject).not.toHaveBeenCalled();
});
test('missing original song or failed local save cannot start a restoration',async()=>{
 const f=fixture();f.options.observedTarget=undefined;await expect(restoreVideoParameters(f.options)).rejects.toThrow('original song');expect(f.saveProject).not.toHaveBeenCalled();
 f.options.observedTarget=f.target;f.saveClip.mockRejectedValueOnce(new Error('unsaved local draft'));await expect(restoreVideoParameters(f.options)).rejects.toThrow('unsaved');expect(f.post).not.toHaveBeenCalled();
});

test('capture clean clip revision before a delayed music save allows a remote poll',async()=>{
 const f=fixture();f.options.selectedSongId=f.target.songId;let release!:(p:StudioProject)=>void;let clip=f.target;
 f.saveProject.mockImplementation(()=>new Promise<StudioProject>(resolve=>{release=resolve;}));f.saveClip.mockImplementation(async()=>clip);
 const restoring=restoreVideoParameters(f.options);expect(f.saveClip).toHaveBeenCalledOnce();clip={...f.target,revision:99,clipPrompt:'REMOTE NEW INPUT'};release(f.project);
 await restoring;expect(f.post.mock.calls[0]?.[1]).toEqual({projectRevision:7,clipDraftRevision:3});
});

test('cross-song acceptance updates project and returned draft atomically even without a follow-up GET',()=>{
 const f=fixture(),snapshot={project:f.project,clipDrafts:[f.target]} as ProjectSnapshot;
 const accepted=restoredSnapshot(snapshot,{...f.result.project,selectedSongId:f.target.songId},f.result.draft)!;
 expect(accepted.project.selectedSongId).toBe(f.target.songId);expect(accepted.clipDrafts).toEqual([f.result.draft]);expect(snapshot.clipDrafts).toEqual([f.target]);
 const newer={...snapshot,clipDrafts:[{...f.target,revision:99,clipPrompt:'Newer edit'}]};expect(restoredSnapshot(newer,f.result.project,f.result.draft)!.clipDrafts).toEqual(newer.clipDrafts);
 expect(restoredSnapshot({...snapshot,project:{...f.project,id:'elsewhere'}},f.result.project,f.result.draft)?.project.id).toBe('elsewhere');
});
