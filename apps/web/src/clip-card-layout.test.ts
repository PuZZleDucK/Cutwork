import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ClipLibrary} from './VideoStudio.tsx';
function render(placed:boolean,otherSong=false){
 const context={id:'context',projectId:'p',songId:'s',clipId:'clip',revision:1,placementId:placed?'placement':null,sourceOriginFrame:0,sourceStartFrame:0,sourceEndFrame:48,audioSource:'song',trimIntent:null,placementIntent:null};
 const song={id:'s',projectId:'p',title:'Song',sampleRate:48000,sampleCount:'480000',durationSeconds:10,analysis:{state:'available',estimatedBpm:60,sampleIndices:['0','48000','96000']}};
 const selectedSong=otherSong?{...song,id:'other',title:'Another song'}:song;
 const clip={id:'clip',projectId:'p',songId:'s',attemptId:'attempt',title:'Shot',assetId:'video',audioAssetId:'audio',nativeFrames:48,rawFrames:[]};
 const arrangement={projectId:'p',songId:'s',revision:2,placements:placed?[{id:'placement',clipId:'clip',startFrame:0,endFrame:48,sourceStartFrame:0,priority:1}]:[]};
 if(otherSong){arrangement.songId='other';arrangement.placements=[];}
 const studio={busy:false,cancelling:new Set(),snapshot:{project:{id:'p'},songs:otherSong?[song,selectedSong]:[song],clips:[clip],videoAttempts:[{id:'attempt',projectId:'p',state:'succeeded',input:{songId:'s',startFrame:0},song}],editContexts:[context],artifactLifecycles:[]}};
 return renderToStaticMarkup(createElement(ClipLibrary,{studio,song:selectedSong,arrangement,onContinue:vi.fn(),onRestore:vi.fn()} as unknown as Parameters<typeof ClipLibrary>[0]));
}
test('placed card has Remove above preview and all remaining actions in one shared row',()=>{
 const html=render(true),start=html.indexOf('class="clip-card '),card=html.slice(start);
 expect(card.indexOf('IN SEQUENCE')).toBeLessThan(card.indexOf('<video'));
 expect(card.indexOf('>↑ Continue</button>')).toBeLessThan(card.indexOf('>↑ Reuse params</button>'));
 expect(card.indexOf('>Remove</button>')).toBeLessThan(card.indexOf('<video'));
 expect(card).toContain('class="clip-card-actions"');
 const actionRow=card.slice(card.indexOf('class="clip-card-actions"'),card.indexOf('class="clip-edit"'));
 for(const label of ['↑ Continue','↑ Reuse params','Archive','Delete'])expect(actionRow).toContain(`>${label}</button>`);
 expect(actionRow).not.toContain('>Remove</button>');
 expect(card.indexOf('>Remove</button>')).toBeLessThan(card.indexOf('>Archive</button>'));
 expect(card.indexOf('>Archive</button>')).toBeLessThan(card.indexOf('>Delete</button>'));
 expect(card).not.toContain('Delete permanently…');expect(card).not.toContain('Apply trim');expect(card).not.toContain('Apply move');
 expect(card.indexOf('class="clip-soundtrack"')).toBeLessThan(card.indexOf('class="source-trim"'));
});
test('unplaced status and the placement button sit above preview, not among the primary actions',()=>{
 const html=render(false),start=html.indexOf('class="clip-card '),card=html.slice(start);
 expect(card.indexOf('UNPLACED')).toBeLessThan(card.indexOf('<video'));
 expect(card.indexOf('>Place in sequence</button>')).toBeLessThan(card.indexOf('<video'));
 expect(card).not.toContain('>Remove</button>');expect(card.match(/>↑ Continue<\/button>/g)).toHaveLength(1);
});
test('compact primary buttons reset the old standalone continuation margins',()=>{
 const css=readFileSync(new URL('./workbench.css',import.meta.url),'utf8');
 expect(css).toContain('.clip-primary-actions>.button{margin:0}');
});

test('continuation from another song also precedes reuse and lifecycle actions',()=>{
 const html=render(false,true),start=html.indexOf('class="clip-card '),card=html.slice(start);
 expect(card).toContain('>↑ Continue</button>');
 expect(card).toContain('aria-label="Continue from Song"');
 expect(card.indexOf('>↑ Continue</button>')).toBeLessThan(card.indexOf('>↑ Reuse params</button>'));
 expect(card.indexOf('>↑ Reuse params</button>')).toBeLessThan(card.indexOf('>Archive</button>'));
});

test('clip cards remove accumulated whitespace beneath the position inputs without hiding status messages',()=>{
 const css=readFileSync(new URL('./workbench.css',import.meta.url),'utf8');
 expect(css).toContain('.clip-card .edit-context-body{padding-bottom:0}');
 expect(css).toContain('.clip-card .move-clip{padding-bottom:0}');
 expect(css).toContain('.clip-card .move-grid label{margin-bottom:0}');
 expect(css).not.toMatch(/\.clip-save-status\s*\{[^}]*display:none/);
});
