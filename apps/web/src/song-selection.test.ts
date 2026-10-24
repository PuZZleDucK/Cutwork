import {afterEach,expect,test,vi} from 'vitest';
import {selectSongFromList} from './song-selection.ts';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
 const oldList={scrollTop:160},newList={scrollTop:0},body={},focus=vi.fn();let tick=()=>{};
 const button={id:'song',closest:()=>oldList};const next={focus,matches:()=>false,closest:(selector:string)=>selector==='[hidden]'?null:newList};
 const doc={activeElement:button as unknown,body,getElementById:()=>next as typeof next|null};
 vi.stubGlobal('document',doc);vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{tick=fn;return 1;});
 return {button:button as unknown as HTMLButtonElement,newList,oldList,doc,next,focus,tick:()=>tick()};
}
test('manual selection keeps list scroll and restores keyboard focus without scrolling the page',async()=>{
 const f=fixture();await selectSongFromList(f.button,async()=>{f.oldList.scrollTop=0;return true;});f.doc.activeElement=f.doc.body;f.tick();
 expect(f.newList.scrollTop).toBe(160);expect(f.focus).toHaveBeenCalledWith({preventScroll:true});
});
test('selection does not steal newer focus or focus a hidden or departed workspace',async()=>{
 const f=fixture();await selectSongFromList(f.button,async()=>true);f.doc.activeElement={};f.tick();expect(f.focus).not.toHaveBeenCalled();
 f.doc.activeElement=f.doc.body;f.next.closest=()=>({scrollTop:0});f.tick();expect(f.focus).not.toHaveBeenCalled();
 f.doc.getElementById=()=>null;f.tick();expect(f.focus).not.toHaveBeenCalled();
});
test('failed selection leaves list state alone',async()=>{
 const f=fixture();await selectSongFromList(f.button,async()=>false);f.tick();expect(f.newList.scrollTop).toBe(0);expect(f.focus).not.toHaveBeenCalled();
});
