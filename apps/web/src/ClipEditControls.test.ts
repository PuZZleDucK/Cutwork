import {expect,test,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClipEditControls} from './ClipEditControls.tsx';
import type {ClipEditContext,SongArrangement,StudioClip,StudioSong} from '../../../packages/core/src/contracts/studio.ts';
import type {useStudio} from './useStudio.ts';

const song:StudioSong={id:'song',projectId:'project',title:'Saved song',attemptId:'music-attempt',createdAt:'2026-10-23T00:00:00Z',assetId:'song-audio',sha256:'a'.repeat(64),sampleRate:48000,sampleCount:'4800000',channels:2,durationSeconds:100,truncated:false,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0','48000','96000'],waveformBucketSamples:4800,peaks:[],error:null,version:'fixture'}};
const clip={id:'clip',projectId:'project',songId:'song',attemptId:'attempt',title:'Restored take',nativeFrames:80,audioAssetId:'audio'} as StudioClip;
const saved:ClipEditContext={id:'saved-edit',projectId:'project',songId:'song',clipId:'clip',revision:7,placementId:null,sourceOriginFrame:24,sourceStartFrame:5,sourceEndFrame:75,audioSource:'song',placementIntent:null,trimIntent:null};
function render(placed:boolean,busy=false){
 const context={...saved,placementId:placed?'placement':null};
 const arrangement:SongArrangement={projectId:'project',songId:'song',revision:11,placements:placed?[{id:'placement',clipId:'clip',startFrame:29,endFrame:99,sourceStartFrame:5,priority:1}]:[]};
 const studio={busy,snapshot:{videoAttempts:[{id:'attempt',input:{startFrame:24}}],clips:[clip]},perform:vi.fn()} as unknown as ReturnType<typeof useStudio>;
 return renderToStaticMarkup(createElement(ClipEditControls,{studio,song,arrangement,clip,context,onContinue:vi.fn()}));
}
test('restored unplaced edit exposes continuation, placement and all fine controls directly',()=>{
 const html=render(false);
 expect(html).toContain('UNPLACED');
 expect(html).toMatch(/<button[^>]*>↑ Continue<\/button>/);
 expect(html).toMatch(/<button[^>]*>Place in sequence<\/button>/);
 expect(html).not.toContain('<details');
 expect(html).not.toContain('<summary');
 expect(html).toContain('aria-label="Trim start sourceFrames saved-edit"');
 expect(html).toContain('aria-label="Trim end seconds saved-edit"');
 expect(html).toContain('aria-label="Move start beats saved-edit"');
 expect(html).toContain('Use clip audio');
 expect(html).not.toContain('Apply trim');expect(html).not.toContain('Apply move');
 expect(html.indexOf('class="clip-soundtrack"')).toBeLessThan(html.indexOf('class="source-trim"'));
 expect(html).not.toContain('Visual priority');
 expect(html).not.toContain('No overlapping clips.');
 expect(html).not.toContain('realised timeline');
 expect(html).not.toContain('EDIT saved-ed');
});

test('placed edit exposes removal and inline timing fields without duplicate explanatory copy',()=>{
 const html=render(true);
 expect(html).toContain('IN SEQUENCE');
 expect(html).toContain('↑ Continue');
 expect(html).toContain('Remove');
 expect(html).not.toContain('Place in sequence');
 expect(html.match(/↑ Continue/g)).toHaveLength(1);
 expect(html).not.toContain('<details');
 expect(html).toContain('title="');
});

test.each([true,false])('busy studio disables both direct actions (placed=%s)',placed=>{
 const html=render(placed,true);
 expect(html).toMatch(/<button[^>]*disabled=""[^>]*>↑ Continue<\/button>/);
 expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${placed?'Remove':'Place in sequence'}<\\/button>`));
});

test('the inspector root identifies its exact saved context and placed use',()=>{
 expect(render(true)).toMatch(/^<div class="clip-edit" data-context-id="saved-edit" data-placement-id="placement">/);
 const unplaced=render(false);
 expect(unplaced).toMatch(/^<div class="clip-edit" data-context-id="saved-edit">/);
 expect(unplaced).not.toContain('data-placement-id');
});
