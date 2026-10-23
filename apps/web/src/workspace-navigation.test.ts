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
