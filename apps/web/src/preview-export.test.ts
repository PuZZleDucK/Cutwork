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
 expect(html).toContain('<h2>Preview / Export</h2>');expect(html).not.toContain('LIVE / 24 FPS');
 expect(html).not.toContain('Render preview');expect(html).not.toContain('Update preview after edits');
 expect(html).not.toContain('Preview and export use the same verified file');
});
