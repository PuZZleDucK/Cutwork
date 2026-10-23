import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const css=readFileSync(new URL('../../apps/web/src/styles.css',import.meta.url),'utf8');
describe('provider help follows the wrapped shared status row',()=>{
 it('anchors the tooltip to the left at the same breakpoint where indicators move left',()=>{
  const wrapped=css.split('@media(max-width:1050px)')[1]?.split('@media')[0]??'';
  expect(wrapped).toContain('.provider-tooltip{left:0;right:auto}');
 });
 it('limits the tooltip width to the viewport with room for header padding',()=>{
  expect(css).toMatch(/\.provider-tooltip\{[^}]*max-width:calc\(100vw - 44px\)/);
 });
});
