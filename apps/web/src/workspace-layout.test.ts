import {expect,test,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {state}=vi.hoisted(()=>({state:{current:null as any}}));
vi.mock('./useStudio.ts',()=>({useStudio:()=>state.current}));
vi.mock('./VideoStudio.tsx',()=>({VideoStudio:({musicSection}:any)=>musicSection}));
import {App} from './App.tsx';
function fixture(withSong=false){
 const project={id:'project',name:'Workshop',draft:{musicPrompt:'Keep this idea',lyrics:'Keep these lyrics',style:'Keep this style'},selectedSongId:withSong?'song':null,revision:1};
 const song={id:'song',projectId:'project',title:'Original soundtrack',assetId:'audio',createdAt:'2026-10-23T00:00:00Z',sampleRate:48000,sampleCount:'480000',durationSeconds:10,channels:2,analysis:{peaks:[],sampleIndices:[],state:'available',estimatedBpm:120,error:null}};
 state.current={snapshot:{project,songs:withSong?[song]:[],clips:[],attempts:[],videoAttempts:[],events:[],renders:[],artifactLifecycles:[]},overview:{projects:[{...project,songCount:withSong?1:0,activeAttempts:0,coveragePercent:0}],provider:{provider:'codex',auth:'signed-in',installed:true,model:'test',detail:'Ready'},tools:[],warnings:[]},draft:project.draft,cancelling:new Set(),busy:false,dirty:false,conflict:false,connection:null};
 return renderToStaticMarkup(createElement(App));
}
test('workspace exposes only Generate, Archive and History with both editors on Generate',()=>{
 const html=fixture();expect(html).toContain('aria-label="Project workspace"');
 for(const name of ['generate','archive','history'])expect(html).toContain(`id="workspace-tab-${name}"`);
 expect(html.match(/role="tab"/g)).toHaveLength(3);
 expect(html).not.toContain('workspace-tab-music');expect(html).not.toContain('workspace-tab-video');
 expect(html).toContain('<h2>Generate Music</h2>');expect(html).toContain('Keep this idea');expect(html).toContain('Keep these lyrics');
});
test('both new and existing projects open Generate without a duplicate soundtrack selector',()=>{
 for(const withSong of [false,true]){
  const html=fixture(withSong);expect(html).toMatch(/id="workspace-tab-generate"[^>]*aria-selected="true"/);
  expect(html).not.toContain('id="video-song"');expect(html).not.toContain('Video soundtrack');
 }
});
test('project navigation offers a compact selector with status instead of consuming a permanent sidebar',()=>{
 const html=fixture();expect(html).toContain('aria-label="Current project"');expect(html).toContain('Workshop');expect(html).toContain('New project');expect(html).not.toContain('Make something');
});
test('project selector and notifications live in the navbar, tabs precede title, music shortcut is absent',()=>{
 const html=fixture(true),header=html.slice(html.indexOf('<header'),html.indexOf('</header>'));
 expect(header).toContain('id="current-project"');expect(header).toContain('aria-label="Notifications"');
 expect(header.indexOf('Shared tool status')).toBeLessThan(header.indexOf('aria-label="Notifications"'));
 expect(html.indexOf('aria-label="Project workspace"')).toBeLessThan(html.indexOf('<h1>Workshop'));
 expect(html).not.toContain('Music &amp; lyrics');expect(html).toContain('Original soundtrack');
});
test('Generate guidance distinguishes needing music from needing video',()=>{
 expect(fixture()).toMatch(/id="workspace-tab-generate"[^>]*class="[^"]*needs-attention/);expect(fixture()).toContain('Start here: generate your soundtrack');
 expect(fixture(true)).toMatch(/id="workspace-tab-generate"[^>]*class="[^"]*needs-attention/);expect(fixture(true)).toContain('Next: generate your first video clip');
});


test('draft-conflict recovery remains in the music form independently of notification dismissal',()=>{
 fixture();state.current.conflict=true;
 const html=renderToStaticMarkup(createElement(App));
 const form=html.slice(html.indexOf('<form'),html.indexOf('</form>'));
 expect(form).toContain('Save my draft over server version');
 expect(form).toContain('Discard my draft and load saved');
});

test('the navbar filters routine advisories and successful actions but retains genuine failures',()=>{
 fixture();Object.assign(state.current,{notice:'Clip order updated.',messageVersion:1,error:'Save failed.',errorVersion:1});
 state.current.overview.warnings=['Trusted LAN only: service account access.','Models share one GPU lane.','Each native generation is bounded to 3600 seconds.'];
 const html=renderToStaticMarkup(createElement(App)),header=html.slice(html.indexOf('<header'),html.indexOf('</header>'));
 expect(header).toContain('Trusted LAN only:');expect(header).toContain('Save failed.');
 expect(header).not.toContain('Clip order updated.');expect(header).not.toContain('Models share one GPU lane.');expect(header).not.toContain('Each native generation is bounded to');
 expect(header).toContain('notice-count">2</span>');
});

test('Cutwork branding remains in the navbar without a decorative footer or renamed projects',()=>{
 const html=fixture();
 expect(html).toContain('aria-label="Cutwork studio home"');expect(html).toContain('src="/cutwork-mark.svg"');
 expect(html).toContain('CUTWORK');expect(html).not.toContain('workspace-footer');
 expect(html).not.toContain('CUTWORK / LOCAL CREATIVE WORKBENCH');expect(html).not.toContain('YOUR PROJECTS. YOUR TOOLS. YOUR DIRECTION.');
 expect(html).not.toContain('ASSEMBLY');expect(html).toContain('Workshop');expect(html).toContain('Keep this idea');
});

test('generated songs precede their player with duration over BPM and compact actions',()=>{
 const html=fixture(true),listStart=html.indexOf('class="song-library"'),playerStart=html.indexOf('class="selected-song"');
 expect(listStart).toBeGreaterThan(0);expect(listStart).toBeLessThan(playerStart);
 const list=html.slice(listStart,playerStart);
 expect(list).toContain('class="song-list"');expect(list).toContain('aria-label="Generated songs"');
 expect(list).toContain('title="Original soundtrack"');
 expect(list).toMatch(/class="song-row-timing"[\s\S]*?0:10[\s\S]*?120.0 BPM/);
 expect(list).toContain('>Archive</button>');expect(list).toContain('>Delete</button>');expect(list).not.toContain('permanently');
 expect(list).not.toContain('Oct 23');expect(list).not.toContain('2026-10-23');
});
test('unknown tempo is explicit and completed guidance clears after the first clip',()=>{
 fixture(true);state.current.snapshot.songs[0].analysis.estimatedBpm=null;state.current.snapshot.clips=[{id:'clip'}];
 const html=renderToStaticMarkup(createElement(App));
 expect(html).toContain('— BPM');expect(html).not.toContain('needs-attention');expect(html).not.toContain('NaN');
});
