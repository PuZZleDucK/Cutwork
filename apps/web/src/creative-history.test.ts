import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CreativeHistory, creativeHistoryRows, restoreMusicDraft } from './CreativeHistory.tsx';
import type { MusicAttempt, ProjectEvent, ProjectSnapshot, StudioRender, VideoAttempt } from '../../../packages/core/src/contracts/studio.ts';
import type { useStudio } from './useStudio.ts';
const timestamp = '2026-10-23T01:00:00.000Z';
function snapshot(): ProjectSnapshot {
  const music: MusicAttempt = { id:'music',nativeCallId:'native-m',projectId:'project',sequence:1,createdAt:'2026-10-23T00:10:00.000Z',updatedAt:'2026-10-23T00:20:00.000Z',state:'succeeded',provider:'codex',model:'test-model',input:{musicPrompt:'ORIGINAL user idea',lyrics:'ORIGINAL lyrics'},seeds:{abc:'9223372036854775806'},stage:'Complete',error:null,songId:'song',details:{prompt:'AGENT processed prompt',settings:{temperature:0.9}} };
  const video: VideoAttempt = { id:'video',nativeCallId:'native-v',projectId:'project',sequence:2,createdAt:'2026-10-23T00:30:00.000Z',updatedAt:'2026-10-23T00:40:00.000Z',state:'succeeded',provider:'claude',model:'video-model',input:{songId:'song',clipPrompt:'VISUAL user idea',style:'STYLE direction',startFrame:0,endFrame:1},seeds:{h3:'999'},song:{id:'song',assetId:'song-asset',sha256:'a'.repeat(64),sampleCount:'48000',sampleRate:48000,channels:2},stage:'Complete',error:null,clipId:'clip',details:{nativeSettings:{prompt:'ACTUAL H3 prompt'}} };
  const event: ProjectEvent = {id:'style-event',projectId:'project',sequence:7,createdAt:'2026-10-23T00:25:00.000Z',kind:'style.changed',data:{before:'Before style',after:'After style',revision:3}};
  return {project:{id:'project',name:'Project',createdAt:'2026-10-23T00:00:00.000Z',revision:3,draft:{musicPrompt:'current',lyrics:'current',style:'KEEP THIS STYLE'},selectedSongId:'song'},attempts:[music],videoAttempts:[video],events:[event],songs:[{id:'song',projectId:'project',attemptId:'music',createdAt:music.updatedAt,title:'Track',assetId:'song-asset',sha256:'a'.repeat(64),sampleCount:'48000',sampleRate:48000,channels:2,durationSeconds:1,truncated:false,analysis:{state:'available',estimatedBpm:120,sampleIndices:['0','24000'],waveformBucketSamples:24000,peaks:[1.25,0.8],error:null,version:'test'}}],clips:[{id:'clip',projectId:'project',attemptId:'video',songId:'song',songSha256:'a'.repeat(64),createdAt:video.updatedAt,title:'Shot',assetId:'video-asset',sha256:'b'.repeat(64),audioAssetId:null,fps:'24/1',width:640,height:480,nativeFrames:1,requestedFrames:1,rawFrames:[{index:0,assetId:'frame-asset',sha256:'c'.repeat(64),pixelSha256:'d'.repeat(64),bytes:100}]}],arrangements:[{projectId:'project',songId:'song',revision:1,placements:[]}],reservations:[],renders:[]};
}
test('one reverse chronological history merges source timestamps without inventing old style changes', () => {
  const s = snapshot(); const rows = creativeHistoryRows(s);
  expect(rows.map(r=>r.kind)).toEqual(['video.succeeded','video.requested','style.changed','music.succeeded','music.requested','project.created']);
  expect(rows.at(-1)!.timestamp).toBe(s.project.createdAt); expect(rows.at(-1)!.source).toBe('project-record');
  expect(rows.filter(r=>r.kind==='style.changed')).toHaveLength(1); expect(rows.find(r=>r.kind==='music.succeeded')!.timestamp).toBe(s.attempts[0]!.updatedAt);
  expect(s.events).toHaveLength(1); // projection never mutates durable records
});
test('deterministic ties, no invented progress events, no duplicate project creation and no shared/foreign project entries', () => {
  const s = snapshot(); s.attempts[0]!.createdAt=timestamp; s.attempts[0]!.updatedAt=timestamp; s.videoAttempts[0]!.state='running';
  s.events.push({id:'created',projectId:s.project.id,sequence:1,createdAt:s.project.createdAt,kind:'project.created',data:{name:'Project'}});
  s.events.push({id:'foreign',projectId:'other',sequence:99,createdAt:timestamp,kind:'style.changed',data:{after:'DO NOT SHOW'}});
  const a=creativeHistoryRows(s), b=creativeHistoryRows({...s,events:[...s.events].reverse(),attempts:[...s.attempts].reverse()});
  expect(a.map(r=>r.id)).toEqual(b.map(r=>r.id)); expect(a.filter(r=>r.kind==='project.created')).toHaveLength(1);
  expect(a.filter(r=>r.kind.startsWith('video.')).map(r=>r.kind)).toEqual(['video.requested']);
  expect(JSON.stringify(a)).not.toContain('DO NOT SHOW'); expect(a.findIndex(r=>r.kind==='music.succeeded')).toBeLessThan(a.findIndex(r=>r.kind==='music.requested'));
});
test('render request and terminal rows use their actual timestamps and expose original receipt details', () => {
  const s=snapshot(); s.renders=[{id:'render',projectId:'project',songId:'song',revision:1,createdAt:'2026-10-23T00:50:00.000Z',updatedAt:timestamp,state:'succeeded',stage:'Complete',error:null,snapshot:{song:s.songs[0]!,arrangement:s.arrangements[0]!,clips:s.clips},snapshotHash:'1'.repeat(64),assetId:'render-asset',sha256:'2'.repeat(64),frameCount:24,planHash:'3'.repeat(64),details:{receipt:'ORIGINAL receipt'}} as StudioRender];
  expect(creativeHistoryRows(s).slice(0,2).map(r=>[r.kind,r.timestamp])).toEqual([['render.succeeded',timestamp],['render.requested','2026-10-23T00:50:00.000Z']]);
});
test('rendered unified component preserves user/agent prompts, seeds, waveform and video thumbnail without fake video restore', () => {
  const s=snapshot(), studio={snapshot:s,draft:s.project.draft,busy:false,dirty:false,edit:vi.fn()} as unknown as ReturnType<typeof useStudio>;
  const html=renderToStaticMarkup(createElement(CreativeHistory,{studio}));
  for(const value of ['ORIGINAL user idea','ORIGINAL lyrics','AGENT processed prompt','9223372036854775806','VISUAL user idea','STYLE direction','ACTUAL H3 prompt','Before style','After style'])expect(html).toContain(value);
  expect(html).toContain('/api/assets/frame-asset'); expect(html).toContain('Audio waveform'); expect(html.match(/Use these inputs/g)).toHaveLength(1);
  expect(html).not.toContain('Undo'); expect(html).toContain('earlier edits');
});
test('restoring music uses the original user fields, preserves current visual style, and leaves immutable input untouched', () => {
  const s=snapshot(), original=structuredClone(s.attempts[0]!);
  expect(restoreMusicDraft(s.project.draft,original)).toEqual({musicPrompt:'ORIGINAL user idea',lyrics:'ORIGINAL lyrics',style:'KEEP THIS STYLE'});
  expect(original).toEqual(s.attempts[0]);
});
