import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {createClipEditAutosave} from './clip-edit-autosave.ts';
import {ApiError} from './api.ts';
import type {ClipEditContext,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
const song={id:'song',projectId:'project',sampleRate:48000,sampleCount:'4800000',durationSeconds:100,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0','48000','96000']}} as StudioSong;
const context:ClipEditContext={id:'edit',projectId:'project',songId:'song',clipId:'clip',revision:7,placementId:'placed',sourceOriginFrame:24,sourceStartFrame:5,sourceEndFrame:75,audioSource:'song',placementIntent:null,trimIntent:null};
const arrangement={songId:'song',projectId:'project',revision:11,placements:[]};
function fixture(){
 const write=vi.fn(async(base:ClipEditContext,revision:number,patch:any)=>({context:{...base,...patch,revision:base.revision+1},arrangement:{...arrangement,revision:revision+1}}));
 const onError=vi.fn();
 const editor=createClipEditAutosave({context,song,nativeFrames:80,arrangementRevision:11,write,onError});
 return {editor,write,onError};
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
test('typing is debounced and only the latest valid trim is saved automatically',async()=>{
 const {editor,write}=fixture();editor.trim('end',{unit:'sourceFrames',value:'7'});
 await vi.advanceTimersByTimeAsync(200);editor.trim('end',{unit:'sourceFrames',value:'70'});
 await vi.advanceTimersByTimeAsync(349);expect(write).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);
 expect(write).toHaveBeenCalledExactlyOnceWith(context,11,expect.objectContaining({sourceStartFrame:5,sourceEndFrame:70}));
 expect(editor.getSnapshot().dirty).toBe(null);expect(editor.getSnapshot().trim.end).toEqual({unit:'sourceFrames',value:'70'});
});
test('invalid intermediate text remains editable and never changes the sequence',async()=>{
 const {editor,write}=fixture();editor.trim('end',{unit:'sourceFrames',value:''});await vi.advanceTimersByTimeAsync(1000);await editor.flush();
 expect(write).not.toHaveBeenCalled();expect(editor.getSnapshot().dirty).toBe('trim');expect(editor.getSnapshot().trim.end.value).toBe('');
 editor.trim('end',{unit:'sourceFrames',value:'70'});await editor.flush();expect(write).toHaveBeenCalledOnce();
});
test('blur-style flushing saves immediately and duplicate flushes share one request',async()=>{
 const {editor,write}=fixture();let finish!:(value:any)=>void;write.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 editor.move({unit:'seconds',value:'12.3456789'});const one=editor.flush(),two=editor.flush();expect(write).toHaveBeenCalledOnce();
 expect(write).toHaveBeenCalledWith(context,11,{startFrame:296,placementIntent:{unit:'seconds',value:'12.3456789'}});
 finish({context:{...context,revision:8,sourceOriginFrame:291},arrangement:{...arrangement,revision:12}});await Promise.all([one,two]);
 expect(editor.getSnapshot().dirty).toBe(null);
});
test('typing during a save survives its older response and saves with the acknowledged revision',async()=>{
 const {editor,write}=fixture();let finish!:(value:any)=>void;write.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 editor.trim('end',{unit:'sourceFrames',value:'70'});const flight=editor.flush();
 editor.trim('end',{unit:'sourceFrames',value:'69'});
 finish({context:{...context,revision:8,sourceEndFrame:70},arrangement:{...arrangement,revision:12}});await flight;
 await vi.advanceTimersByTimeAsync(350);
 expect(write).toHaveBeenLastCalledWith(expect.objectContaining({revision:8}),12,expect.objectContaining({sourceEndFrame:69}));
 expect(editor.getSnapshot().trim.end.value).toBe('69');expect(editor.getSnapshot().dirty).toBe(null);
});
test('failure retains typed input, reports once, does not loop, and supports explicit retry',async()=>{
 const {editor,write,onError}=fixture();write.mockRejectedValueOnce(new Error('Connection lost'));
 editor.trim('end',{unit:'sourceFrames',value:'70'});await vi.advanceTimersByTimeAsync(350);
 expect(editor.getSnapshot().error).toContain('Connection lost');expect(editor.getSnapshot().dirty).toBe('trim');expect(onError).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(10000);expect(write).toHaveBeenCalledOnce();await editor.retry();expect(write).toHaveBeenCalledTimes(2);
 expect(editor.getSnapshot().error).toBe(null);expect(editor.getSnapshot().dirty).toBe(null);
});
test('remote changes cannot overwrite dirty text or authorize an automatic conflicting save',async()=>{
 const {editor,write}=fixture();editor.move({unit:'frames',value:'101'});editor.receive({...context,revision:8,sourceOriginFrame:60},12);
 await vi.advanceTimersByTimeAsync(1000);expect(write).not.toHaveBeenCalled();expect(editor.getSnapshot().conflict).toBe(true);expect(editor.getSnapshot().move.value).toBe('101');
 editor.reset();expect(editor.getSnapshot().base.sourceOriginFrame).toBe(60);expect(editor.getSnapshot().dirty).toBe(null);expect(editor.getSnapshot().conflict).toBe(false);
});
test('a conflict response stops autosave and preserves the current draft for recovery',async()=>{
 const {editor,write}=fixture();write.mockRejectedValue(new ApiError('Changed elsewhere',409,'CONFLICT'));
 editor.trim('end',{unit:'sourceFrames',value:'70'});await editor.flush();await vi.advanceTimersByTimeAsync(2000);
 expect(write).toHaveBeenCalledOnce();expect(editor.getSnapshot().conflict).toBe(true);expect(editor.getSnapshot().trim.end.value).toBe('70');
});
test('clean polling updates are adopted; stale snapshots and foreign contexts are ignored',()=>{
 const {editor}=fixture();editor.receive({...context,revision:8,sourceEndFrame:70},12);editor.receive(context,11);editor.receive({...context,id:'other',revision:99},99);
 expect(editor.getSnapshot().base.revision).toBe(8);expect(editor.getSnapshot().base.id).toBe('edit');expect(editor.getSnapshot().trim.end.value).toBe('70');
});
test('an own-save polling response is not mistaken for a remote conflict',async()=>{
 const {editor,write}=fixture();let finish!:(value:any)=>void;write.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 editor.trim('end',{unit:'sourceFrames',value:'70'});const flight=editor.flush();
 const accepted={...context,revision:8,sourceEndFrame:70};editor.receive(accepted,12);
 finish({context:accepted,arrangement:{...arrangement,revision:12}});await flight;
 expect(editor.getSnapshot().conflict).toBe(false);expect(editor.getSnapshot().dirty).toBe(null);
});
test('a synchronous transport failure releases the flight lock for a later retry',async()=>{
 const {editor,write}=fixture();write.mockImplementationOnce(()=>{throw new Error('Offline');});
 editor.move({unit:'frames',value:'101'});await editor.flush();expect(editor.getSnapshot().saving).toBe(false);
 await editor.retry();expect(write).toHaveBeenCalledTimes(2);expect(editor.getSnapshot().dirty).toBe(null);
});
test('a newer edit arriving during a request is preserved and conflicts rather than being overwritten',async()=>{
 const {editor,write}=fixture();let finish!:(value:any)=>void;write.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 editor.trim('end',{unit:'sourceFrames',value:'70'});const flight=editor.flush();editor.trim('end',{unit:'sourceFrames',value:'69'});
 editor.receive({...context,revision:9,sourceEndFrame:65},13);
 finish({context:{...context,revision:8,sourceEndFrame:70},arrangement:{...arrangement,revision:12}});await flight;await vi.advanceTimersByTimeAsync(1000);
 expect(write).toHaveBeenCalledOnce();expect(editor.getSnapshot().conflict).toBe(true);expect(editor.getSnapshot().trim.end.value).toBe('69');
});
test('timing typed while audio or placement is saving survives that acknowledgement',async()=>{
 const {editor,write}=fixture();let finish!:(value:any)=>void;
 const flight=editor.action(()=>new Promise(resolve=>{finish=resolve;}));
 editor.trim('end',{unit:'sourceFrames',value:'70'});
 finish({context:{...context,revision:8,audioSource:'clip'},arrangement:{...arrangement,revision:12}});await flight;await vi.advanceTimersByTimeAsync(350);
 expect(write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({revision:8,audioSource:'clip'}),12,expect.objectContaining({sourceEndFrame:70}));
 expect(editor.getSnapshot().trim.end.value).toBe('70');
});
