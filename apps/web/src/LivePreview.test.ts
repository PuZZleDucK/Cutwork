import {expect,test} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {StudioSong,StudioClip,SongArrangement} from '../../../packages/core/src/contracts/studio.ts';
import {LivePreview} from './LivePreview.tsx';

const song={id:'song',assetId:'song-audio',sampleRate:48000,sampleCount:'240000',durationSeconds:5} as StudioSong;
const clip=(id:string):StudioClip=>({id,assetId:`video-${id}`,audioAssetId:`audio-${id}`,rawFrames:[],projectId:'project',attemptId:id,songId:'song',songSha256:'a'.repeat(64),createdAt:'2026-10-23T00:00:00Z',title:id,sha256:'b'.repeat(64),fps:'24/1',width:640,height:480,nativeFrames:240,requestedFrames:240});
const arrangement:SongArrangement={songId:'song',projectId:'project',revision:1,placements:[{id:'p-a',clipId:'a',startFrame:0,endFrame:24,sourceStartFrame:0,priority:1},{id:'p-b',clipId:'b',startFrame:24,endFrame:48,sourceStartFrame:0,priority:2},{id:'p-c',clipId:'c',startFrame:48,endFrame:72,sourceStartFrame:0,priority:3}]};
test('live preview has immediate transport and independent scrub/volume controls without a render',()=>{
 const html=renderToStaticMarkup(createElement(LivePreview,{song,arrangement,clips:[clip('a'),clip('b'),clip('c')]}));
 expect(html).toContain('Play live preview');expect(html).toContain('Seek live preview');expect(html).toContain('Live preview volume');
 expect(html).toMatch(/aria-label="Live preview volume"[^>]*value="0.5"/);
 expect(html).toContain('Mute live preview');expect(html).not.toContain('Render preview');expect(html).not.toContain('Update preview after edits');
});
test('only current and upcoming picture/audio are mounted, not the entire media library',()=>{
 const html=renderToStaticMarkup(createElement(LivePreview,{song,arrangement,clips:[clip('a'),clip('b'),clip('c')]}));
 expect(html).toContain('/api/assets/video-a');expect(html).toContain('/api/assets/video-b');expect(html).not.toContain('/api/assets/video-c');
 expect(html.match(/<video/g)).toHaveLength(2);expect(html).toContain('/api/assets/song-audio');
});
test('song-only sequence is immediately playable over black frames without any render output',()=>{
 const html=renderToStaticMarkup(createElement(LivePreview,{song,arrangement:{...arrangement,placements:[]},clips:[]}));
 expect(html).toContain('Play live preview');expect(html).toContain('Uncovered sequence');expect(html).not.toContain('<video');
});

test('preview mute is a styled toggle button with explicit pressed state',()=>{
 const html=renderToStaticMarkup(createElement(LivePreview,{song,arrangement,clips:[clip('a')]}));
 expect(html).toMatch(/<button[^>]*class="button secondary small live-preview-mute"[^>]*aria-pressed="false"[^>]*>Mute<\/button>/);
});
