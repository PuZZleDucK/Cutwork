import {expect,test,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArtifactControls,DeletionDisclosure,ArchivedMedia,RetargetClipContext,restoreDeletionTriggerFocus} from './ArtifactControls.tsx';
import type {ArtifactDeletePlan,ArtifactLifecycle,PurgeRecord} from '../../../packages/core/src/contracts/lifecycle.ts';
import type {useStudio} from './useStudio.ts';
import type {ClipEditContext,ProjectSnapshot} from '../../../packages/core/src/contracts/studio.ts';
const ref={kind:'clip' as const,id:'clip'},p='p';
const plan:ArtifactDeletePlan={id:'plan',projectId:p,ref,title:'<My clip>',digest:'a'.repeat(64),expiresAt:'2026-10-24T00:00:00Z',fileCount:42,bytes:1000,retains:['Generation history, thumbnail and text logs'],limitations:['External copies remain outside the product'],blockers:[{kind:'attempt',id:'busy-id',state:'running',detail:'A continuation is using this clip'}]};
function studio(state:ArtifactLifecycle['state']){const snapshot={project:{id:p},songs:[],clips:[{id:'clip',title:'The clip',assetId:'full-video',rawFrames:[{assetId:'raw-original'}]}],artifactLifecycles:[{...ref,projectId:p,state,revision:2,thumbnailAssetId:'small-thumb',deletionId:'purge',updatedAt:null}],deletions:state==='deleting'?[{id:'purge',projectId:p,artifact:ref,state:'failed',completedEntryIds:['1'],inventory:{entries:[{id:'1'},{id:'2'}]},error:'Read-only filesystem'} as PurgeRecord]:[]} as unknown as ProjectSnapshot;return {snapshot,busy:false,perform:vi.fn(),performImmediate:vi.fn()} as unknown as ReturnType<typeof useStudio>;}
test('delete disclosure names the exact artifact, irreversibility, placements, retained provenance and external-copy boundary',()=>{
 const html=renderToStaticMarkup(createElement(DeletionDisclosure,{plan}));
 for(const value of ['&lt;My clip&gt;','cannot be recovered','placements','thumbnail','text logs','42','External copies','busy-id','running','A continuation'])expect(html).toContain(value);
 expect(html).not.toContain('<My clip>');expect(html).not.toContain('also delete from history');
});
test.each(['deleting','deleted'] as const)('%s never offers Restore or another permanent deletion',state=>{
 const html=renderToStaticMarkup(createElement(ArtifactControls,{studio:studio(state),refValue:ref,title:'The clip'}));
 expect(html).not.toMatch(/>Restore/);expect(html).not.toContain('Delete permanently…');expect(html).not.toContain('>Archive<');
 if(state==='deleting'){expect(html).toContain('Retry media purge');expect(html).toContain('Read-only filesystem');expect(html).toContain('1 / 2');expect(html).not.toContain('Deletion complete');}
 else expect(html).toContain('Full media deleted');
});
test('archive restores visibility only and inactive collection never embeds full media',()=>{
 const html=renderToStaticMarkup(createElement(ArchivedMedia,{studio:studio('archived')}));expect(html).toContain('Restore to library');expect(html).toContain('unplaced');expect(html).toContain('The clip');expect(html).not.toContain('full-video');expect(html).not.toContain('raw-original');expect(html).not.toContain('<video');
});
test('missing-song replacement requires an explicit choice and creates no hidden placement',()=>{
 const s=studio('active');s.snapshot!.songs=[{id:'song',title:'Replacement',projectId:p}] as ProjectSnapshot['songs'];
 const context={id:'context',projectId:p,songId:'deleted-song',clipId:'clip',revision:3,placementId:null} as ClipEditContext;
 const html=renderToStaticMarkup(createElement(RetargetClipContext,{studio:s,context}));
 expect(html).toContain('Choose a replacement song');expect(html).toContain('Remains unplaced');expect(html).toContain('Replacement');expect(html).toMatch(/<button[^>]*disabled/);expect(html).not.toContain('Generate');
});

test('active clip library excludes archived/deleting/deleted outputs but survives having no selected song',async()=>{
 const {ClipLibrary}=await import('./VideoStudio.tsx');
 for(const state of ['archived','deleting','deleted'] as const){
  const s=studio(state);Object.assign(s.snapshot!,{videoAttempts:[],editContexts:[],reservations:[]});
  const html=renderToStaticMarkup(createElement(ClipLibrary,{studio:s,song:null,arrangement:null}));expect(html).not.toContain('/api/assets/full-video');expect(html).not.toContain('/api/assets/raw-original');expect(html).not.toContain('Delete permanently');expect(html).toContain('No active clips');
 }
 const s=studio('active');Object.assign(s.snapshot!,{videoAttempts:[],editContexts:[{id:'context',projectId:p,songId:'removed',clipId:'clip',revision:1,placementId:null,sourceOriginFrame:0,sourceStartFrame:2,sourceEndFrame:20}],reservations:[]});
 const html=renderToStaticMarkup(createElement(ClipLibrary,{studio:s,song:null,arrangement:null}));expect(html).toContain('/api/assets/full-video');expect(html).toContain('Choose a replacement song');expect(html).toContain('source 3–20');expect(html).not.toContain('Place in sequence');
});
test('queued work can still be cancelled from the library without a selected song',async()=>{
 const {ClipLibrary}=await import('./VideoStudio.tsx'),s=studio('active');
 Object.assign(s.snapshot!,{clips:[],videoAttempts:[{id:'attempt',projectId:p,state:'queued',input:{clipPrompt:'Pending shot',songId:'song',startFrame:0,endFrame:24},song:{id:'song'}}],editContexts:[],reservations:[]});s.cancelling=new Set();
 const html=renderToStaticMarkup(createElement(ClipLibrary,{studio:s,song:null,arrangement:null}));expect(html).toContain('Cancel generation');expect(html).not.toContain('Restore parameters');
});

// The real browser checks Cancel/Escape focus after React unmounts the dialog.
// This regression covers the focus call itself and asynchronous disabled states.
test('cancelled disclosure restores only its connected enabled trigger without scrolling',()=>{
 const focus=vi.fn(),trigger={isConnected:true,disabled:false,focus};
 expect(restoreDeletionTriggerFocus(trigger)).toBe(true);expect(focus).toHaveBeenCalledExactlyOnceWith({preventScroll:true});
 focus.mockClear();
 expect(restoreDeletionTriggerFocus({...trigger,disabled:true})).toBe(false);
 expect(restoreDeletionTriggerFocus({...trigger,isConnected:false})).toBe(false);
 expect(restoreDeletionTriggerFocus(null)).toBe(false);expect(focus).not.toHaveBeenCalled();
});
