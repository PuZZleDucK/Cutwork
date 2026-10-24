import { expect, it } from 'vitest';
import { acceptedClipPrompt, orderedToolIndicators, initializePreviewAudio } from './feedback-state.ts';
import type { ToolStatus } from '../../../packages/core/src/contracts/studio.ts';
it('places analysis immediately after YuE2 without mutating setup order, excluding only the separately rendered agent',()=>{
 const tools=['agent','yue2','comfyui','h3','analysis'].map(id=>({id,installed:true}) as ToolStatus);
 expect(orderedToolIndicators(tools).map(t=>t.id)).toEqual(['yue2','analysis','comfyui','h3']);
 expect(tools.map(t=>t.id)).toEqual(['agent','yue2','comfyui','h3','analysis']);
 tools[4]!.installed=false;expect(orderedToolIndicators(tools).map(t=>t.id)).toEqual(['yue2','analysis','comfyui','h3']);
});
it('clears only the successfully accepted description, never a newer draft or uncertain submission',()=>{
 expect(acceptedClipPrompt('shot','shot',true)).toBe('');
 expect(acceptedClipPrompt('shot','shot',false)).toBe('shot');
 expect(acceptedClipPrompt('next shot','shot',true)).toBe('next shot');
});
it('initializes video playback to unmuted half volume without touching export or autoplay',()=>{
 const media={muted:true,defaultMuted:true,volume:1,autoplay:false};
 initializePreviewAudio(media);expect(media).toEqual({muted:false,defaultMuted:false,volume:.5,autoplay:false});
});
import { timelinePercent } from './feedback-state.ts';
it('projects very precise exact times visually without Infinity divided by Infinity',()=>{
 const denominator=10n**500n;expect(timelinePercent({numerator:denominator+1n,denominator},240)).toBe(10);
 expect(timelinePercent({numerator:1n,denominator:2n},240)).toBe(5);
});

it('non-agent configuration status is a reversible toggle',async()=>{
 const {toggleToolConfiguration}=await import('./feedback-state.ts');
 expect(toggleToolConfiguration('projects')).toBe('config');
 expect(toggleToolConfiguration('config')).toBe('projects');
 expect(toggleToolConfiguration(toggleToolConfiguration('projects'))).toBe('projects');
});
