import {expect,test,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {state}=vi.hoisted(()=>({state:{current:null as any}}));
vi.mock('./useStudio.ts',()=>({useStudio:()=>state.current}));
vi.mock('./VideoStudio.tsx',()=>({VideoStudio:()=>null}));
import {App} from './App.tsx';
function fixture(withSong=false){
 const project={id:'project',name:'Workshop',draft:{musicPrompt:'Keep this idea',lyrics:'Keep these lyrics',style:'Keep this style'},selectedSongId:withSong?'song':null,revision:1};
 const song={id:'song',projectId:'project',title:'Original soundtrack',assetId:'audio',createdAt:'2026-10-23T00:00:00Z',sampleRate:48000,sampleCount:'480000',durationSeconds:10,channels:2,analysis:{peaks:[],sampleIndices:[],state:'available',estimatedBpm:120,error:null}};
 state.current={snapshot:{project,songs:withSong?[song]:[],clips:[],attempts:[],videoAttempts:[],events:[],renders:[],artifactLifecycles:[]},overview:{projects:[{...project,songCount:withSong?1:0,activeAttempts:0,coveragePercent:0}],provider:{provider:'codex',auth:'signed-in',installed:true,model:'test',detail:'Ready'},tools:[],warnings:[]},draft:project.draft,cancelling:new Set(),busy:false,dirty:false,conflict:false,connection:null};
 return renderToStaticMarkup(createElement(App));
}
test('workspace exposes Music, Video, Archive and History as explicit navigation, not a continuous page of cards',()=>{
 const html=fixture();expect(html).toContain('aria-label="Project workspace"');
 for(const name of ['Music','Video','Archive','History'])expect(html).toMatch(new RegExp('role="tab"[^>]*>[\\s\\S]*?'+name));
 expect(html).toContain('role="tabpanel"');expect(html).toContain('Keep this idea');expect(html).toContain('Keep these lyrics');
});
test('an existing soundtrack opens video editing and retains the music form mounted but hidden',()=>{
 const html=fixture(true);expect(html).toMatch(/id="workspace-tab-video"[^>]*aria-selected="true"/);
 expect(html).toMatch(/id="workspace-pane-music"[^>]*hidden=""/);expect(html).toContain('Keep this idea');
});
test('project navigation offers a compact selector with status instead of consuming a permanent sidebar',()=>{
 const html=fixture();expect(html).toContain('aria-label="Current project"');expect(html).toContain('Workshop');expect(html).toContain('New project');expect(html).not.toContain('Make something');
});
test('project selector and notifications live in the navbar, tabs precede title, music shortcut is absent',()=>{
 const html=fixture(true),header=html.slice(html.indexOf('<header'),html.indexOf('</header>'));
 expect(header).toContain('id="current-project"');expect(header).toContain('aria-label="Notifications"');
 expect(header.indexOf('Shared tool status')).toBeLessThan(header.indexOf('aria-label="Notifications"'));
 expect(html.indexOf('aria-label="Project workspace"')).toBeLessThan(html.indexOf('<h1>Workshop'));
 expect(html).not.toContain('Music &amp; lyrics');expect(html).toContain('0:10 · 120.0 BPM · Original soundtrack');
});
test('hazard guidance highlights music first, then video without selecting a different tab',()=>{
 expect(fixture()).toMatch(/id="workspace-tab-music"[^>]*class="[^"]*needs-attention/);
 expect(fixture(true)).toMatch(/id="workspace-tab-video"[^>]*class="[^"]*needs-attention/);
});
