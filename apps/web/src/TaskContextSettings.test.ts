import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test,vi} from 'vitest';
import {TaskContextsPanel} from './TaskContextSettings.tsx';
const data={contexts:[{id:'music' as const,title:'Music task context',text:'COMPLETE MUSIC {{music_description}} <script>not HTML</script>',sha256:'a'.repeat(64),sources:[{name:'music.md',sourcePath:'integrations/knowledge/music.md',sha256:'b'.repeat(64)}],error:null},{id:'video-text' as const,title:'Video task context — T2VA',text:'COMPLETE VIDEO AND GUIDE',sha256:'c'.repeat(64),sources:[],error:'H3 prompt guides unavailable'}]};
test('Config contexts are expandable, complete, read-only and explicitly placeholder previews',()=>{
 const html=renderToStaticMarkup(createElement(TaskContextsPanel,{data,loading:false,error:null,onRefresh:vi.fn()}));
 for(const text of ['Music task context','Video task context','COMPLETE MUSIC','COMPLETE VIDEO AND GUIDE','{{music_description}}','placeholders','read-only','historical','integrations/knowledge/music.md','H3 prompt guides unavailable'])expect(html).toContain(text);
 expect(html).toContain('<details');expect(html).toContain('readOnly=""');expect(html).not.toContain('<script>');expect(html).not.toContain('Save');
 expect(html).toContain('Refresh task contexts');
});
test('loading and fetch failure remain visible with a retry, separately from template editing',()=>{
 expect(renderToStaticMarkup(createElement(TaskContextsPanel,{data:null,loading:true,error:null,onRefresh:vi.fn()}))).toContain('Loading task contexts');
 const html=renderToStaticMarkup(createElement(TaskContextsPanel,{data:null,loading:false,error:'Cannot read context',onRefresh:vi.fn()}));expect(html).toContain('role="alert"');expect(html).toContain('Cannot read context');expect(html).toContain('Refresh task contexts');
});
