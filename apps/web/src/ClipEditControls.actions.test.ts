import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {isValidElement,type ReactElement,type ReactNode} from 'react';
import {ClipEditControls} from './ClipEditControls.tsx';
import {request} from './api.ts';
import type {ClipEditContext,SongArrangement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';

const hooks=vi.hoisted(()=>({editor:null as ReturnType<typeof import('./clip-edit-autosave.ts').createClipEditAutosave>|null}));
vi.mock('./useClipEditAutosave.ts',async()=>{
 const {createClipEditAutosave}=await import('./clip-edit-autosave.ts');
 return {useClipEditAutosave:(props:Parameters<typeof ClipEditControls>[0])=>{
  if(!hooks.editor)hooks.editor=createClipEditAutosave({context:props.context,song:props.song,nativeFrames:props.clip.nativeFrames,arrangementRevision:props.arrangement.revision,write:props.studio.saveClipEdit,onError:props.studio.reportClipEditError});
  hooks.editor.receive(props.context,props.arrangement.revision);
  return {state:hooks.editor.getSnapshot(),editor:hooks.editor};
 }};
});
vi.mock('./api.ts',async importOriginal=>({...await importOriginal<typeof import('./api.ts')>(),request:vi.fn()}));
beforeEach(()=>{hooks.editor=null;vi.useFakeTimers();vi.clearAllMocks();});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
const song:StudioSong={id:'song',projectId:'project',title:'Song',attemptId:'music',createdAt:'2026-10-23T00:00:00Z',assetId:'song-audio',sha256:'a'.repeat(64),sampleRate:48000,sampleCount:'4800000',channels:2,durationSeconds:100,truncated:false,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0','48000','96000'],waveformBucketSamples:4800,peaks:[],error:null,version:'fixture'}};
const clip={id:'clip',projectId:'project',songId:'song',attemptId:'attempt',title:'Take',nativeFrames:80,audioAssetId:'audio'} as StudioClip;
const context:ClipEditContext={id:'edit',projectId:'project',songId:'song',clipId:'clip',revision:7,placementId:'placed',sourceOriginFrame:24,sourceStartFrame:5,sourceEndFrame:75,audioSource:'song',placementIntent:null,trimIntent:null};
function fixture(){
 const arrangement:SongArrangement={projectId:'project',songId:'song',revision:11,placements:[{id:'placed',clipId:'clip',startFrame:29,endFrame:99,sourceStartFrame:5,priority:1}]};
 const saveClipEdit=vi.fn((base:ClipEditContext,revision:number,patch:unknown)=>request(`/api/projects/project/edit-contexts/edit`,{revision:base.revision,arrangementRevision:revision,edit:patch},'PUT'));
 return {studio:{busy:false,snapshot:{videoAttempts:[{id:'attempt',input:{startFrame:24}}],clips:[clip]},saveClipEdit,reportClipEditError:vi.fn(),acceptClipEdit:vi.fn()},song,arrangement,clip,context:{...context},onContinue:vi.fn().mockResolvedValue(undefined)} as unknown as Parameters<typeof ClipEditControls>[0]&{onContinue:ReturnType<typeof vi.fn>};
}
function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{
 if(Array.isArray(node))return node.flatMap(elements);
 if(!isValidElement<Record<string,unknown>>(node))return [];
 return [node,...elements(node.props.children as ReactNode)];
}
function render(props:Parameters<typeof ClipEditControls>[0]){return elements(ClipEditControls(props));}
function control(nodes:ReturnType<typeof render>,name:string){return nodes.find(node=>node.props['aria-label']===name||node.props.children===name)!;}
function click(node:ReactElement<Record<string,unknown>>){return (node.props.onClick as ()=>unknown)();}
function change(node:ReactElement<Record<string,unknown>>,value:string){(node.props.onChange as (event:{target:{value:string}})=>void)({target:{value}});}

test('pending inline trim blocks dependent actions until it saves or is discarded',()=>{
 const props=fixture();let nodes=render(props);
 change(control(nodes,'Trim start sourceFrames edit'),'');nodes=render(props);
 const continueButton=control(nodes,'Continue from'),remove=control(nodes,'Remove');
 expect(continueButton.props.disabled).toBe(true);expect(remove.props.disabled).toBe(true);
 click(continueButton);click(remove);
 expect(props.onContinue).not.toHaveBeenCalled();expect(props.studio.saveClipEdit).not.toHaveBeenCalled();
 expect(nodes.find(node=>node.props.className==='move-clip')?.props.disabled).toBe(true);
 click(control(nodes,'Discard changes'));nodes=render(props);
 expect(control(nodes,'Trim start sourceFrames edit').props.value).toBe('6');
 expect(control(nodes,'Continue from').props.disabled).toBe(false);
});

test('inline trim automatically saves exact source frames with both revision guards and then allows continuation',async()=>{
 const props=fixture();let nodes=render(props);
 change(control(nodes,'Trim end sourceFrames edit'),'70');nodes=render(props);
 vi.mocked(request).mockResolvedValue({context:{...context,revision:8,sourceEndFrame:70},arrangement:{...props.arrangement,revision:12}});
 await vi.advanceTimersByTimeAsync(350);expect(request).toHaveBeenCalledOnce();
 expect(request).toHaveBeenCalledWith('/api/projects/project/edit-contexts/edit',expect.objectContaining({revision:7,arrangementRevision:11,edit:expect.objectContaining({sourceStartFrame:5,sourceEndFrame:70})}),'PUT');
 nodes=render(props);expect(control(nodes,'Continue from').props.disabled).toBe(false);
 click(control(nodes,'Continue from'));
 expect(props.onContinue).toHaveBeenCalledWith(expect.objectContaining({sourceEndFrame:70,revision:8}));
});

test('a newer context revision keeps unsaved values but disables writes and offers explicit reload',()=>{
 const props=fixture();let nodes=render(props);
 change(control(nodes,'Move start frames edit'),'101');
 props.context={...context,revision:8,sourceOriginFrame:60};nodes=render(props);
 expect(control(nodes,'Move start frames edit').props.value).toBe('101');
 expect(nodes.find(node=>node.props.className==='move-clip')?.props.disabled).toBe(true);
 expect(control(nodes,'Continue from').props.disabled).toBe(true);
 click(control(nodes,'Load latest edit'));nodes=render(props);
 expect(control(nodes,'Move start frames edit').props.value).toBe('66');
 expect(control(nodes,'Continue from').props.disabled).toBe(false);
});

test('audio misalignment warns only when the clip audio is actually selected',()=>{
 const props=fixture();props.context={...context,sourceOriginFrame:100};
 let nodes=render(props);
 expect(nodes.some(node=>node.props.children==='⚠ Audio may be out of sync.')).toBe(false);
 hooks.editor=null;props.context={...props.context,audioSource:'clip'};nodes=render(props);
 expect(nodes.some(node=>node.props.children==='⚠ Audio may be out of sync.')).toBe(true);
});

test('the relocated Remove action still targets only its saved context with both revision guards',async()=>{
 const props=fixture(),nodes=render(props);
 const result={context:{...context,revision:8,placementId:null},arrangement:{...props.arrangement,revision:12,placements:[]}};
 vi.mocked(request).mockResolvedValue(result);
 click(control(nodes,'Remove'));await vi.advanceTimersByTimeAsync(0);
 expect(request).toHaveBeenCalledExactlyOnceWith('/api/projects/project/edit-contexts/edit/placement',{revision:7,arrangementRevision:11,placed:false});
 expect(props.studio.acceptClipEdit).toHaveBeenCalledWith(result);
 expect(props.onContinue).not.toHaveBeenCalled();
});
