import {afterEach,expect,test} from 'vitest';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fixtureH3Guides} from '../helpers/h3-guides.ts';
import {MUSIC_CONTEXT,VIDEO_CONTEXT,formatTaskContext,contextPlaceholders} from '../../apps/server/src/studio/task-context-text.ts';
import {readTaskContexts} from '../../apps/server/src/studio/task-contexts.ts';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function fixture(){const runtime=await mkdtemp(join(tmpdir(),'context-view-'));dirs.push(runtime);const source=join(runtime,'source');await mkdir(join(source,'integrations/knowledge'),{recursive:true});for(const name of ['README.md','music.md','video.md'])await writeFile(join(source,'integrations/knowledge',name),`COMPLETE ${name}\nLast line`);return{runtime,source,...await fixtureH3Guides(runtime,source)};}
test('context interpolation is single-pass and preserves dollar signs and user placeholder-like text',()=>{
 expect(formatTaskContext('Brief: {{brief}}; seed: {{seed}}',{brief:'$& {{seed}}',seed:'9007199254740993'},[])).toBe('Brief: $& {{seed}}; seed: 9007199254740993');
 expect(()=>formatTaskContext('{{missing}}',{},[])).toThrow('missing');
});
test('Config uses the complete runtime context templates and hash-identified guidance without project data',async()=>{
 const f=await fixture(),view=await readTaskContexts(f.runtime,f.source);
 expect(view.contexts.map(c=>c.id)).toEqual(['music','video-text','video-image']);
 for(const c of view.contexts){expect(c.error).toBeNull();expect(c.text).toContain('COMPLETE README.md\nLast line');expect(c.sha256).toBe(createHash('sha256').update(c.text).digest('hex'));}
 const music=view.contexts[0]!;
 expect(music.text).toBe(formatTaskContext(MUSIC_CONTEXT,contextPlaceholders(MUSIC_CONTEXT),await import('../../apps/server/src/studio/task-context-text.ts').then(m=>m.readProductGuidance(f.source,'music'))));
 expect(music.text).toContain('{{music_description}}');expect(music.text).toContain('COMPLETE music.md\nLast line');expect(music.text).not.toContain('VISUAL style');
 for(const c of view.contexts.slice(1)){expect(c.text).toContain(f.files[0]!.text);expect(c.text).toContain('Native-tail-only beat anchors:');expect(c.text).toContain('{{retained_beat_anchors}}');expect(c.text).toContain('COMPLETE video.md\nLast line');expect(c.sources).toHaveLength(3);}
 expect(view.contexts[1]!.text).toContain('Mode: T2VA');expect(view.contexts[1]!.text).not.toContain('Continue from the selected');
 expect(view.contexts[2]!.text).toContain('Mode: I2VA');expect(view.contexts[2]!.text).toContain('Continue from the selected last retained original PNG');
 expect(VIDEO_CONTEXT).toContain('{{direction}}');
});
test('refresh reads changed product guidance rather than a bundled browser copy',async()=>{
 const f=await fixture(),first=await readTaskContexts(f.runtime,f.source);await writeFile(join(f.source,'integrations/knowledge/music.md'),'UPDATED MUSIC');const next=await readTaskContexts(f.runtime,f.source);
 expect(next.contexts[0]!.text).toContain('UPDATED MUSIC');expect(next.contexts[0]!.sha256).not.toBe(first.contexts[0]!.sha256);expect(next.contexts[1]).toEqual(first.contexts[1]);
});
test('missing or corrupt H3 documentation is explicit and does not block music',async()=>{
 const f=await fixture();await writeFile(join(f.directory,f.files[0]!.path),'corrupted');const result=await readTaskContexts(f.runtime,f.source);
 expect(result.contexts[0]!.error).toBeNull();for(const c of result.contexts.slice(1)){expect(c.error).toContain('H3 prompt guides');expect(c.text).toContain('COMPLETE video.md');expect(c.text).not.toContain('corrupted');}
});
test('a missing product guide is visible for that tool, never silently omitted as a complete context',async()=>{
 const f=await fixture();await rm(join(f.source,'integrations/knowledge/music.md'));const result=await readTaskContexts(f.runtime,f.source);
 expect(result.contexts[0]!.error).toContain('Music');expect(result.contexts[1]!.error).toBeNull();
});
test('researched YuE2 guidance preserves native boundaries and normal creative capabilities',async()=>{
 const text=await readFile('integrations/knowledge/music.md','utf8');
 for(const phrase of ['revision 3','section tags','supplied ABC','Vocal','Ins','cfg_scale','max_tokens','not a duration control','no automatic conversion hook','normal tools'])expect(text).toContain(phrase);
 expect(text).not.toContain('100%');
});
