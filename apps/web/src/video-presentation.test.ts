import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {ClipLibrary} from './VideoStudio.tsx';
import {ClipForm} from './ClipComposer.tsx';
import {resolveTiming,timingFromFrames} from '../../../packages/core/src/time/linked-timing.ts';
import type {StudioSong} from '../../../packages/core/src/contracts/studio.ts';

const song={id:'song',projectId:'project',sampleRate:48000,sampleCount:'480000',durationSeconds:10,analysis:{state:'available',sampleIndices:['0','48000','96000'],estimatedBpm:60}} as StudioSong;
const arrangement={songId:song.id,projectId:song.projectId,revision:1,placements:[{id:'placement',clipId:'placed',startFrame:0,endFrame:24,sourceStartFrame:0,priority:1}]};
function library(selected:typeof arrangement|null=arrangement){
 const studio={snapshot:{project:{id:'project'},clips:['placed','unplaced'].map(id=>({id,title:id,assetId:id,rawFrames:[]})),videoAttempts:[],editContexts:[],songs:[song],artifactLifecycles:[]},busy:false} as unknown as Parameters<typeof ClipLibrary>[0]['studio'];
 return renderToStaticMarkup(createElement(ClipLibrary,{studio,song:selected?song:null,arrangement:selected}));
}

test('library keeps its clip count without the redundant project-library annotation',()=>{
 const html=library();expect(html).toContain('<h2>Library</h2>');expect(html).toContain('2 CLIPS');expect(html).not.toContain('PROJECT LIBRARY');
});
test('only clips placed in the selected sequence get the placed-card treatment',()=>{
 expect(library()).toMatch(/class="clip-card in-sequence" id="clip-library-placed"/);
 expect(library()).toMatch(/class="clip-card unplaced" id="clip-library-unplaced"/);
 for(const selected of [null,{...arrangement,placements:[]},{...arrangement,songId:'other',placements:[]}]){
  const html=library(selected);expect(html).not.toContain('clip-card in-sequence');expect(html.match(/class="clip-card unplaced"/g)).toHaveLength(2);
 }
});
test('sequence and placed library cards share colour tokens without specificity-inflating base selectors',()=>{
 const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
 const base=read('./styles.css'),timeline=read('./video.css'),workbench=read('./workbench.css');
 expect(base).toContain('--sequence-clip-background:#364d50');expect(base).toContain('--sequence-clip-border:var(--cyan)');
 const card=workbench.match(/\.clip-card\.in-sequence\{([^}]+)\}/)?.[1];
 expect(card).toContain('background:var(--sequence-clip-background)');expect(card).toContain('border-color:var(--sequence-clip-border)');
 expect(card).toContain('--muted:#c0d4d5'); // Preserve small-label contrast on the brighter teal.
 expect(timeline.match(/\.timeline-span\{([^}]+)\}/)?.[1]).toContain('background:var(--sequence-clip-background)');
 // Vite may turn a mixed-specificity selector list into :is(), so don't group
 // the base card with the obsolete expanded-details variant.
 expect(workbench).not.toContain('.clip-card,.clip-card:has(.clip-edit-details[open])');
});
test('generation has a concise heading without removing its descriptive action button',()=>{
 const intent=timingFromFrames(0,48);
 const props={song,studio:{draft:{style:''},overview:{provider:{auth:'signed-in'},tools:[]}},draft:{intent,timing:resolveTiming(song,intent),persistence:{value:{clipPrompt:''}}}} as unknown as Parameters<typeof ClipForm>[0];
 const html=renderToStaticMarkup(createElement(ClipForm,props));
 expect(html).toContain('<h2>Generate</h2>');expect(html).not.toContain('H3 / NATIVE 24 FPS');expect(html).toContain('Generate clip →');
});
