import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {PreviewExport} from './VideoStudio.tsx';
test('preview is immediately playable without a render; export stays an explicit action',()=>{
 const song={id:'s',projectId:'p',assetId:'audio',durationSeconds:8,sampleCount:'384000',sampleRate:48000} as any;
 const arrangement={songId:'s',projectId:'p',revision:0,placements:[]};
 const studio={snapshot:{renders:[],clips:[],artifactLifecycles:[]},busy:false} as any;
 const html=renderToStaticMarkup(createElement(PreviewExport,{studio,song,arrangement,active:true}));
 expect(html).toContain('Play live preview');expect(html).toContain('Export MP4');
 expect(html).toContain('class="button primary export-button"');
 expect(html).toMatch(/<svg[^>]*class="save-icon"[^>]*aria-hidden="true"/);
 expect(html).toContain('<h2>Preview / Export</h2>');expect(html).not.toContain('LIVE / 24 FPS');
 expect(html).not.toContain('Render preview');expect(html).not.toContain('Update preview after edits');
 expect(html).not.toContain('Preview and export use the same verified file');
});

test('export remains guarded during work and keeps retry/download controls after completion',()=>{
 const song={id:'s',projectId:'p',assetId:'audio',durationSeconds:8,sampleCount:'384000',sampleRate:48000} as any;
 const arrangement={songId:'s',projectId:'p',revision:0,placements:[]};
 for(const state of ['queued','running','failed','succeeded']){
  const render={id:'render',songId:'s',projectId:'p',revision:0,state,assetId:state==='succeeded'?'export':null,stage:'Export state',snapshot:{song,clips:[]}};
  const studio={snapshot:{project:{id:'p'},songs:[song],renders:[render],clips:[],artifactLifecycles:[]},busy:false} as any;
  const html=renderToStaticMarkup(createElement(PreviewExport,{studio,song,arrangement,active:true}));
  const button=html.match(/<button[^>]*class="button primary export-button"[^>]*>/)?.[0];
  expect(button).toBeDefined();expect(button?.includes('disabled=""')).toBe(['queued','running'].includes(state));
  expect(html).toContain(state==='failed'?'Retry export':state==='succeeded'?'Export again':'Export MP4');
  if(state==='succeeded'){
   expect(html).toContain('/api/projects/p/renders/render/download');
   expect(html.indexOf('Download MP4')).toBeLessThan(html.indexOf('class="button primary export-button"'));
  }
 }
});
