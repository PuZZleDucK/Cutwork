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
function visibleBeforeFineControls(html:string){
 const disclosure=html.indexOf('<details');
 expect(disclosure).toBeGreaterThan(0);
 return html.slice(0,disclosure);
}

test('restored unplaced edit exposes continuation and explicit placement without opening fine controls',()=>{
 const html=render(false),visible=visibleBeforeFineControls(html);
 expect(visible).toContain('UNPLACED');
 expect(visible).toContain('Source 6–75');
 expect(visible).toContain('29 → 99');
 expect(visible).toMatch(/<button[^>]*>Continue From End ↑<\/button>/);
 expect(visible).toMatch(/<button[^>]*>Place in sequence<\/button>/);
 expect(visible).not.toContain('disabled');
 expect(html).toMatch(/<details[^>]*><summary>Timing &amp; audio<\/summary>/);
 expect(html).toContain('Trim retained footage');
 expect(html).toContain('Move on song');
 expect(html).toContain('Use this clip’s audio instead of the song');
});

test('placed edit exposes continuation and removal while fine controls remain collapsed',()=>{
 const html=render(true),visible=visibleBeforeFineControls(html);
 expect(visible).toContain('IN SEQUENCE');
 expect(visible).toContain('Continue From End ↑');
 expect(visible).toContain('Remove from sequence');
 expect(visible).not.toContain('Place in sequence');
 expect(html.match(/Continue From End/g)).toHaveLength(1);
 expect(html).not.toMatch(/<details[^>]*\bopen/);
});

test.each([true,false])('busy studio disables both visible actions (placed=%s)',placed=>{
 const visible=visibleBeforeFineControls(render(placed,true));
 expect(visible).toMatch(/<button[^>]*disabled=""[^>]*>Continue From End ↑<\/button>/);
 expect(visible).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${placed?'Remove from sequence':'Place in sequence'}<\\/button>`));
});

test('the inspector root identifies its exact saved context and placed use',()=>{
 expect(render(true)).toMatch(/^<div class="clip-edit" data-context-id="saved-edit" data-placement-id="placement">/);
 const unplaced=render(false);
 expect(unplaced).toMatch(/^<div class="clip-edit" data-context-id="saved-edit">/);
 expect(unplaced).not.toContain('data-placement-id');
});
