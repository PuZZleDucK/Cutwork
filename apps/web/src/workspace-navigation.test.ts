import {afterEach,expect,test,vi} from 'vitest';
import {openWorkspaceInput} from './WorkspaceNavigation.tsx';
afterEach(()=>vi.unstubAllGlobals());
test('opening an editor waits for the enabled destination after React commits the action result',()=>{
 let tick:FrameRequestCallback=()=>{};const focus=vi.fn(),scrollIntoView=vi.fn(),onSelect=vi.fn();
 const input={focus,scrollIntoView,matches:()=>false,closest:()=>null};
 vi.stubGlobal('document',{getElementById:()=>input});vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{tick=fn;return 1;});
 openWorkspaceInput('video',onSelect,'clip-prompt');expect(onSelect).toHaveBeenCalledWith('video');expect(focus).not.toHaveBeenCalled();tick(0);expect(focus).toHaveBeenCalledWith({preventScroll:true});expect(scrollIntoView).toHaveBeenCalledWith({block:'nearest',behavior:'auto'});
});
test('a destination hidden again before the next frame does not steal keyboard focus',()=>{
 let tick:FrameRequestCallback=()=>{};const focus=vi.fn();vi.stubGlobal('document',{getElementById:()=>({focus,matches:()=>false,closest:()=>({hidden:true})})});vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{tick=fn;return 1;});
 openWorkspaceInput('video',vi.fn(),'clip-prompt');tick(0);expect(focus).not.toHaveBeenCalled();
});

test('workspace keyboard handling leaves modified browser shortcuts alone',async()=>{
 const {WorkspaceNavigation}=await import('./WorkspaceNavigation.tsx');const onSelect=vi.fn(),preventDefault=vi.fn();
 const tree=WorkspaceNavigation({panel:'video',onSelect,counts:{music:1,video:1,archive:0,history:0}});
 const button=tree.props.children[1];button.props.onKeyDown({key:'Home',ctrlKey:true,preventDefault});
 expect(onSelect).not.toHaveBeenCalled();expect(preventDefault).not.toHaveBeenCalled();
});
test('soundtrack choices lead with duration and BPM and limit long names to 80 characters',async()=>{
 const {soundtrackOption}=await import('./WorkspaceNavigation.tsx');
 const label=soundtrackOption({durationSeconds:61,analysis:{estimatedBpm:123.4},title:'x'.repeat(100)} as any);
 expect(label).toBe('1:01 · 123.4 BPM · '+'x'.repeat(79)+'…');
});
