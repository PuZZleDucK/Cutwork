import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {VideoStudio} from './VideoStudio.tsx';
function fixture(withSong:boolean,panel:'generate'|'archive'|'history'='generate'){
 const project={id:'project',selectedSongId:withSong?'song':null,draft:{musicPrompt:'Music idea',lyrics:'',style:''}};
 const song={id:'song',projectId:'project',assetId:'audio',title:'Test song',durationSeconds:12,sampleRate:48000,sampleCount:'576000',channels:2,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000','48000'],peaks:[]}};
 const studio={snapshot:{project,songs:withSong?[song]:[],clips:[],arrangements:[],clipDrafts:[],videoAttempts:[],attempts:[],reservations:[],renders:[],events:[],editContexts:[],artifactLifecycles:[],deletions:[]},draft:project.draft,overview:{provider:{auth:'signed-in'},tools:[]},busy:false} as unknown as Parameters<typeof VideoStudio>[0]['studio'];
 return renderToStaticMarkup(createElement(VideoStudio,{studio,panel,musicSection:createElement('section',{},'Music editor')}));
}
test('one Generate panel contains music before video for new and existing soundtracks',()=>{
 for(const withSong of [false,true]){
  const html=fixture(withSong);
  expect(html.match(/id="workspace-pane-generate"/g)).toHaveLength(1);
  expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
  expect(html.indexOf('Music editor')).toBeLessThan(html.indexOf('<hr class="generation-divider"'));
  expect(html.indexOf('<hr class="generation-divider"')).toBeLessThan(html.indexOf('Generate Video'));
  expect(html.match(/class="generation-divider"/g)).toHaveLength(1);
  expect(html).not.toContain('Open music');expect(html).not.toContain('video-song');
 }
});
test('Archive and History retain their own panels and hide both editors together',()=>{
 for(const panel of ['archive','history'] as const){
  for(const withSong of [false,true]){
   const html=fixture(withSong,panel);
   expect(html).toMatch(/id="workspace-pane-generate"[^>]*hidden=""/);
   expect(html).not.toMatch(new RegExp(`id="workspace-pane-${panel}"[^>]*hidden=""`));
  }
 }
});
test('song list has bounded scroll, two-line titles and right-aligned stacked lifecycle buttons',()=>{
 const css=readFileSync(new URL('./workbench.css',import.meta.url),'utf8');
 expect(css).toMatch(/\.song-list\{[^}]*height:240px;[^}]*overflow-y:auto/);
 expect(css).toMatch(/\.song-library-item\{[^}]*display:flex;[^}]*min-height:96px/);
 expect(css).toMatch(/\.song-library-item>\.artifact-controls>\.row-actions\{[^}]*flex-direction:column/);
 expect(css).toMatch(/\.song-row-copy strong\{[^}]*-webkit-line-clamp:2/);
});

test('generation text areas have balanced default heights without disabling manual resizing',()=>{
 const css=readFileSync(new URL('./workbench.css',import.meta.url),'utf8');
 expect(css).toMatch(/\.compose-panel \.lyrics-input\{[^}]*height:180px/);
 expect(css).toMatch(/\.video-compose #visual-style\{[^}]*height:84px/);
 expect(css).toMatch(/\.video-compose #clip-prompt\{[^}]*height:99px/);
 expect(css).not.toMatch(/(?:lyrics-input|#visual-style|#clip-prompt)\{[^}]*resize:none/);
});
test('only generation footers and the video/sequence section bottoms lose their dividers',()=>{
 const css=readFileSync(new URL('./workbench.css',import.meta.url),'utf8');
 expect(css).toMatch(/\.compose-panel \.compose-footer\{[^}]*border-top:0/);
 expect(css).toMatch(/\.video-compose \.compose-footer\{[^}]*border-top:0/);
 expect(css).toContain('.video-workspace>.video-compose,.video-workspace>.video-timeline{border-bottom:0}');
 expect(css).toMatch(/\.generation-divider\{[^}]*border-top:1px solid var\(--border\)/);
});
