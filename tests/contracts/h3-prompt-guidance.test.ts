import {afterEach,expect,test} from 'vitest';
import {mkdtemp,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixtureH3Guides} from '../helpers/h3-guides.ts';
import {readH3PromptGuides,videoDirectionContext} from '../../apps/server/src/studio/h3-prompt-guidance.ts';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function fixture(){const runtime=await mkdtemp(join(tmpdir(),'h3-guides-'));dirs.push(runtime);const source=join(runtime,'source');return{runtime,source,...await fixtureH3Guides(runtime,source)};}
test('reads complete pinned guide bytes with hash and upstream provenance',async()=>{
 const f=await fixture(),guides=await readH3PromptGuides(f.runtime,f.source);
 expect(guides).toHaveLength(3);expect(guides[0]).toMatchObject({name:'VIDEO_PROMPT_WRITING_GUIDE_base_en.md',text:f.files[0]!.text,sha256:f.files[0]!.sha256});
 expect(guides[0]!.sourcePath).toContain('/'+ 'a'.repeat(40)+'/docs/');
});
test.each(['changed','missing','linked','ownership'] as const)('rejects %s runtime guides with repair instructions',async defect=>{
 const f=await fixture(),path=join(f.directory,f.files[0]!.path);
 if(defect==='changed')await writeFile(path,'changed');
 if(defect==='missing')await rm(path);
 if(defect==='linked'){await rm(path);await symlink(join(f.directory,f.files[1]!.path),path);}
 if(defect==='ownership')await writeFile(join(f.directory,'.studio-model-manifest'),'wrong');
 await expect(readH3PromptGuides(f.runtime,f.source)).rejects.toThrow(/H3 prompt guides.*Retry H3 setup/);
});
test('T2VA has no image alignment claim; I2VA supplies the official first-frame header',()=>{
 const input={requestedFrames:103,nativeFrames:107,startSample:0,sampleIndices:['0','200000','206000','208720','214000']};
 const text=videoDirectionContext({...input,hasFirstFrame:false});
 expect(text).toContain('Mode: T2VA');expect(text).not.toContain('is fully referenced.');
 const image=videoDirectionContext({...input,hasFirstFrame:true});expect(image).toContain('Mode: I2VA');
 expect(image).toContain('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.');
});
test('separates exact retained-exclusive boundary from native-only beat anchors',()=>{
 const text=videoDirectionContext({requestedFrames:103,nativeFrames:107,startSample:10000,sampleIndices:['9999','10000','210000','216000','218720','224000'],hasFirstFrame:false});
 const retained=text.split('Retained beat anchors: ')[1]!.split('\n')[0]!;
 const tail=text.split('Native-tail-only beat anchors: ')[1]!.split('\n')[0]!;
 expect(JSON.parse(retained).map((b:{relativeSamples:string})=>b.relativeSamples)).toEqual(['0','200000']);
 expect(JSON.parse(tail).map((b:{relativeSamples:string})=>b.relativeSamples)).toEqual(['206000','208720']);
 expect(text).toContain('[0, 206000)');expect(text).toContain('102/24');expect(text).toContain('essential actions');
});
