import {expect,test,vi} from 'vitest';
import {createElement,isValidElement,type ReactElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {VideoTimeline} from './VideoTimeline.tsx';
import {resolveTiming,timingFromFrames} from '../../../packages/core/src/time/linked-timing.ts';
import type {StudioSong} from '../../../packages/core/src/contracts/studio.ts';

// Render the real component and inspect its event props without a browser or GPU.
// Memoization is irrelevant to these event/markup contracts; live keyboard proof
// belongs to the root's browser pass.
vi.mock('react',async importOriginal=>{
 const react=await importOriginal<typeof import('react')>();
 return {...react,useMemo:<T,>(factory:()=>T)=>factory()};
});

const song:StudioSong={id:'song',projectId:'project',title:'Timing fixture',attemptId:'music',createdAt:'2026-10-23T00:00:00Z',assetId:'song-asset',sha256:'a'.repeat(64),sampleRate:48000,sampleCount:'480000',channels:2,durationSeconds:10,truncated:false,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0','48000','96000'],waveformBucketSamples:4800,peaks:[.2,.8,.4],error:null,version:'fixture'}};
function fixture(){
 const intent=timingFromFrames(144,192),change=vi.fn(),setError=vi.fn(),setTarget=vi.fn();
 return {
  studio:{busy:false,snapshot:{reservations:[{attemptId:'pending',songId:'song',startFrame:96,endFrame:120}],clips:[{id:'alpha',title:'Alpha shot'},{id:'beta',title:'Beta shot'},{id:'gamma',title:'Gamma shot'}]}},song,
  arrangement:{projectId:'project',songId:'song',revision:3,placements:[{id:'first',clipId:'alpha',startFrame:0,endFrame:48,sourceStartFrame:0,priority:1},{id:'overlap',clipId:'beta',startFrame:24,endFrame:72,sourceStartFrame:0,priority:2},{id:'later',clipId:'gamma',startFrame:72,endFrame:96,sourceStartFrame:0,priority:3}]},
  draft:{intent,timing:resolveTiming(song,intent),target:'end',error:null,change,setError,setTarget},onSelectClip:vi.fn(),
 } as unknown as Parameters<typeof VideoTimeline>[0]&{onSelectClip:ReturnType<typeof vi.fn>};
}
function elements(node:ReactNode):ReactElement<Record<string,unknown>>[]{
 if(Array.isArray(node))return node.flatMap(elements);
 if(!isValidElement<Record<string,unknown>>(node))return [];
 return [node,...elements(node.props.children as ReactNode)];
}

test('placed intervals are native labelled edit buttons; reservations are not controls',()=>{
 const html=renderToStaticMarkup(createElement(VideoTimeline,fixture()));
 for(const title of ['Alpha shot','Beta shot','Gamma shot'])expect(html).toMatch(new RegExp(`<button[^>]*type="button"[^>]*aria-label="Edit clip ${title}"`));
 expect(html).toMatch(/<div[^>]*class="timeline-span reserved"[^>]*data-interval-id="reservation:pending"/);
 expect(html).not.toMatch(/<button[^>]*data-interval-id="reservation:pending"/);
 expect(html).toContain('data-lane-count="2"');
 expect(html).toContain('data-start-frame="144"');
 expect(html).toContain('data-end-frame="192"');
});

test('each placed button selects its own clip without touching generation range or beat target',()=>{
 const props=fixture(),nodes=elements(VideoTimeline(props));
 for(const [id,clipId]of [['first','alpha'],['overlap','beta'],['later','gamma']]){
  const node=nodes.find(n=>n.props['data-interval-id']===id);
  expect(node?.type).toBe('button');
  expect(node?.props.disabled).not.toBe(true);
  (node?.props.onClick as ()=>void)();
  expect(props.onSelectClip).toHaveBeenLastCalledWith(clipId,id);
 }
 expect(props.onSelectClip).toHaveBeenCalledTimes(3);
 expect(props.draft.change).not.toHaveBeenCalled();
 expect(props.draft.setTarget).not.toHaveBeenCalled();
 const reserved=nodes.find(n=>n.props['data-interval-id']==='reservation:pending');
 expect(reserved?.type).toBe('div');expect(reserved?.props.onClick).toBeUndefined();
});

test('two placements of one source clip select distinct saved edit contexts',()=>{
 const props=fixture();
 props.arrangement.placements.push({id:'alpha-repeat',clipId:'alpha',startFrame:120,endFrame:144,sourceStartFrame:5,priority:4});
 const nodes=elements(VideoTimeline(props));
 for(const id of ['first','alpha-repeat']){
  const placed=nodes.find(n=>n.props['data-interval-id']===id);
  expect(placed?.type).toBe('button');
  (placed?.props.onClick as ()=>void)();
 }
 expect(props.onSelectClip.mock.calls).toEqual([['alpha','first'],['alpha','alpha-repeat']]);
 expect(props.draft.change).not.toHaveBeenCalled();
});

test('optional selection handler leaves a disabled button rather than a dead action',()=>{
 const props=fixture(),{onSelectClip:_unused,...withoutHandler}=props;
 const nodes=elements(VideoTimeline(withoutHandler));
 const placed=nodes.find(n=>n.props['data-interval-id']==='first');
 expect(placed?.type).toBe('button');expect(placed?.props.disabled).toBe(true);
 expect(()=>{(placed?.props.onClick as (()=>void)|undefined)?.();}).not.toThrow();
});

test('beat selection continues to edit the requested endpoint, independently of clip inspection',()=>{
 const props=fixture();props.draft.intent=timingFromFrames(0,192);props.draft.timing=resolveTiming(song,props.draft.intent);
 const nodes=elements(VideoTimeline(props));
 const beat=nodes.find(n=>n.props['aria-label']==='Set end to Beat 2');
 expect(beat?.type).toBe('button');(beat?.props.onClick as ()=>void)();
 expect(props.draft.change).toHaveBeenCalledTimes(1);
 expect(props.draft.change).toHaveBeenCalledWith({...props.draft.intent,end:{unit:'rational',value:{numerator:'1',denominator:'1'}}});
 expect(props.onSelectClip).not.toHaveBeenCalled();
});

test('priority controls swap the exact adjacent overlapping placements, not draft timing',()=>{
 const props=fixture(),onSwapPriority=vi.fn(),nodes=elements(VideoTimeline({...props,onSwapPriority}));
 const move=nodes.find(n=>n.props['data-priority-placement-id']==='first'&&n.props['data-priority-above-id']==='overlap');
 expect(move?.type).toBe('button');
 expect(move?.props['aria-label']).toBe('Move Alpha shot above Beta shot');
 expect(move?.props.title).toContain('through all their overlaps');
 expect(move?.props.disabled).toBe(false);
 (move?.props.onClick as ()=>void)();
 expect(onSwapPriority).toHaveBeenCalledExactlyOnceWith('first','overlap');
 expect(props.draft.change).not.toHaveBeenCalled();
 expect(props.onSelectClip).not.toHaveBeenCalled();
 expect(nodes.some(n=>n.props['data-priority-placement-id']==='later')).toBe(false);
 expect(nodes.some(n=>n.props['data-priority-placement-id']==='reservation:pending')).toBe(false);
});

test('busy or missing priority callback cannot change overlap priority',()=>{
 const props=fixture(),onSwapPriority=vi.fn();props.studio.busy=true;
 const busy=elements(VideoTimeline({...props,onSwapPriority})).find(n=>n.props['data-priority-placement-id']==='first');
 expect(busy?.props.disabled).toBe(true);(busy?.props.onClick as ()=>void)();
 expect(onSwapPriority).not.toHaveBeenCalled();
 props.studio.busy=false;
 const missing=elements(VideoTimeline(props)).find(n=>n.props['data-priority-placement-id']==='first');
 expect(missing?.props.disabled).toBe(true);
});

test('timeline rows show saved dominance rather than earliest-start order',()=>{
 const props=fixture(),nodes=elements(VideoTimeline(props));
 const pieces=nodes.filter(n=>n.props['data-segment-start']!==undefined);
 const overlap=pieces.filter(n=>n.props['data-segment-start']===24);
 expect(overlap.map(n=>[n.props['data-segment-placement'],n.props['data-segment-lane']])).toEqual([['overlap',0],['first',1]]);
 expect(pieces.find(n=>n.props['data-segment-placement']==='later')?.props['data-segment-lane']).toBe(0);
});
