import {afterEach,expect,test,vi} from 'vitest';
import {openWorkspaceInput} from './WorkspaceNavigation.tsx';
afterEach(()=>vi.unstubAllGlobals());
test('opening an editor waits for the enabled destination after React commits the action result',()=>{
 let tick:FrameRequestCallback=()=>{};const focus=vi.fn(),scrollIntoView=vi.fn(),onSelect=vi.fn();
 const input={focus,scrollIntoView,matches:()=>false,closest:()=>null};
 vi.stubGlobal('document',{getElementById:()=>input});vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{tick=fn;return 1;});
 openWorkspaceInput('generate',onSelect,'clip-prompt');expect(onSelect).toHaveBeenCalledWith('generate');expect(focus).not.toHaveBeenCalled();tick(0);expect(focus).toHaveBeenCalledWith({preventScroll:true});expect(scrollIntoView).toHaveBeenCalledWith({block:'nearest',behavior:'auto'});
});
test('a destination hidden again before the next frame does not steal keyboard focus',()=>{
 let tick:FrameRequestCallback=()=>{};const focus=vi.fn();vi.stubGlobal('document',{getElementById:()=>({focus,matches:()=>false,closest:()=>({hidden:true})})});vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{tick=fn;return 1;});
 openWorkspaceInput('generate',vi.fn(),'clip-prompt');tick(0);expect(focus).not.toHaveBeenCalled();
});

test('workspace keyboard handling leaves modified browser shortcuts alone',async()=>{
 const {WorkspaceNavigation}=await import('./WorkspaceNavigation.tsx');const onSelect=vi.fn(),preventDefault=vi.fn();
 const tree=WorkspaceNavigation({panel:'generate',onSelect,counts:{music:1,video:1,archive:0,history:0}});
 const button=tree.props.children[1];button.props.onKeyDown({key:'Home',ctrlKey:true,preventDefault});
 expect(onSelect).not.toHaveBeenCalled();expect(preventDefault).not.toHaveBeenCalled();
});
test('three-tab arrow navigation wraps and Home returns to Generate',async()=>{
 const {WorkspaceNavigation,workspacePanels}=await import('./WorkspaceNavigation.tsx');
 expect(workspacePanels).toEqual(['generate','archive','history']);
 const onSelect=vi.fn(),focus=vi.fn();vi.stubGlobal('document',{getElementById:()=>({focus})});
 const tree=WorkspaceNavigation({panel:'generate',onSelect,counts:{music:1,video:1,archive:0,history:0}});
 const buttons=tree.props.children;
 for(const [index,key,expected] of [[0,'ArrowLeft','history'],[2,'ArrowRight','generate'],[1,'Home','generate'],[0,'End','history']] as const){
  buttons[index].props.onKeyDown({key,preventDefault:vi.fn()});expect(onSelect).toHaveBeenLastCalledWith(expected);
 }
});
