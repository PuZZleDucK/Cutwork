import { describe, expect, it } from 'vitest';
import { createRequestId, mergeSavedDraft, waveformEnvelope, formatDuration, attemptIsActive, agentActivity, historySong, musicInputFromDraft, legacyMusicVisualStyle } from './studio-state.ts';
import { ApiError, request } from './api.ts';

const draft = { musicPrompt: 'A song', lyrics: '', style: '' };
describe('studio browser state helpers', () => {
  it('does not replace typing made during an in-flight save', () => {
    const edited = { ...draft, lyrics: 'New words' };
    expect(mergeSavedDraft(edited, draft, draft)).toEqual({ draft: edited, dirty: true });
  });
  it('adopts a saved result only when the submitted draft is still current', () => {
    expect(mergeSavedDraft(draft, draft, draft)).toEqual({ draft, dirty: false });
  });
  it('creates a version-4 UUID with getRandomValues on insecure LAN HTTP without randomUUID', () => {
    const crypto = { getRandomValues: (bytes: Uint8Array) => { bytes.fill(255); return bytes; } };
    expect(createRequestId(crypto)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('does not invent weak randomness if browser cryptography is unavailable', () => {
    expect(() => createRequestId(null)).toThrow(/cryptography/i);
  });
  it('retains peaks when reducing waveform resolution and bounds malformed input', () => {
    expect(waveformEnvelope([0, 0.9, 0.2, 0.1], 2)).toEqual([0.9, 0.2]);
    expect(waveformEnvelope([NaN, -0.5, 4], 3)).toEqual([0, 0.5, 1]);
    expect(waveformEnvelope([], 200)).toEqual([]);
  });
  it('does not present reconciliation as finished or an estimated duration as exact', () => {
    expect(attemptIsActive('reconciling')).toBe(false);
    expect(attemptIsActive('waiting_gpu')).toBe(true);
    expect(formatDuration(65.8)).toBe('1:05');
  });
});
describe('studio JSON transport', () => {
  it('preserves conflict codes and messages for deliberate draft resolution', async () => {
    const fetcher = async () => new Response(JSON.stringify({error: 'Changed elsewhere', code:'REVISION_CONFLICT'}), {status:409});
    await expect(request('/api/test', { revision: 1 }, 'PUT', fetcher)).rejects.toMatchObject({status:409, code:'REVISION_CONFLICT', message:'Changed elsewhere'});
  });
  it('sends JSON without credentials or inventing successful data', async () => {
    let captured: RequestInit | undefined;
    const fetcher = async (_: string, init?: RequestInit) => { captured = init; return new Response('{"ok":true}'); };
    expect(await request('/api/test', {}, 'POST', fetcher)).toEqual({ok:true});
    expect(captured?.credentials).toBe('same-origin');
    expect(captured?.body).toBe('{}');
    await expect(request('/api/test', undefined, 'GET', async () => new Response('<html>bad</html>'))).rejects.toBeInstanceOf(ApiError);
  });
});

describe('actual agent activity and generation output links', () => {
  it('reports shared agent activity and queue independently of selected provider authentication', () => {
    expect(agentActivity([{ id: 'agent', active: true, queued: 2 }])).toBe('Active · 2 queued');
    expect(agentActivity([{ id: 'agent', active: false, queued: 3 }])).toBe('Idle · 3 queued');
    expect(agentActivity([{ id: 'agent', active: false, queued: 0 }])).toBe('Idle');
    expect(agentActivity([{ id: 'yue2', active: true, queued: 8 }])).toBeNull();
  });
  it('uses only the successful attempt’s actual matching project/song/attempt output', () => {
    const attempt = { id:'attempt-a', projectId:'project-a', state:'succeeded' as const, songId:'song-a' };
    const song = { id:'song-a', projectId:'project-a', attemptId:'attempt-a' };
    expect(historySong(attempt, [song])).toBe(song);
    expect(historySong({...attempt, state:'failed'}, [song])).toBeUndefined();
    expect(historySong({...attempt, songId:null}, [song])).toBeUndefined();
    expect(historySong(attempt, [{...song, attemptId:'other-attempt'}])).toBeUndefined();
    expect(historySong(attempt, [{...song, projectId:'other-project'}])).toBeUndefined();
    expect(historySong(attempt, [{...song, id:'other-song'}])).toBeUndefined();
  });
});

describe('separate music and visual input', () => {
  it('copies only music description and optional lyrics, never project visual style', () => {
    const draft = {musicPrompt:'90s French electronica',lyrics:'Exact words',style:'Monochrome robot closeups'};
    expect(musicInputFromDraft(draft)).toEqual({musicPrompt:'90s French electronica',lyrics:'Exact words'});
    expect(draft.style).toBe('Monochrome robot closeups');
  });
  it('applies restored song inputs immediately without losing later typing', () => {
    const original={musicPrompt:'A',lyrics:'A lyrics',style:'Current visual direction'};
    const restored={...original,musicPrompt:'B',lyrics:''};
    expect(mergeSavedDraft(original,original,restored)).toEqual({draft:restored,dirty:false});
    const typed={...original,lyrics:'typed while waiting'};
    expect(mergeSavedDraft(typed,original,restored)).toEqual({draft:typed,dirty:true});
  });
});

it('retains the labelable legacy visual input in history without making it new music input', () => {
  const legacy={musicPrompt:'Funk',lyrics:'',style:'Blue film grain'};
  expect(legacyMusicVisualStyle(legacy)).toBe('Blue film grain');
  expect(legacyMusicVisualStyle(musicInputFromDraft(legacy))).toBeNull();
});
