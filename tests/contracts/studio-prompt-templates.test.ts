import {afterEach,expect,test} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {openStudioStore} from '../../apps/server/src/studio/store.ts';
import type {StudioStore} from '../../apps/server/src/studio/store-contract.ts';
import {DEFAULT_AGENT_TEMPLATES,renderAgentTemplate} from '../../packages/core/src/contracts/prompt-templates.ts';

const directories:string[]=[],stores:StudioStore[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-templates-'));directories.push(dir);const path=join(dir,'studio.sqlite'),store=openStudioStore(path);stores.push(store);return{store,path};}
afterEach(()=>{for(const s of stores.splice(0))s.close();for(const p of directories.splice(0))rmSync(p,{recursive:true,force:true});});
const custom={music:'Make a luminous song.\n\n{{task_context}}',video:'Compose a miniature scene.\n\n{{task_context}}'};

test('shared templates have effective defaults, CAS edits, explicit reset and durable revision',()=>{
 const{store:s,path}=fixture();expect(s.promptTemplates()).toEqual({revision:0,...DEFAULT_AGENT_TEMPLATES});
 const p=s.createProject('one'),q=s.createProject('two');
 expect(s.savePromptTemplates(0,custom)).toEqual({revision:1,...custom});
 s.selectProject(p.id);expect(s.promptTemplates().music).toBe(custom.music);s.selectProject(q.id);
 expect(()=>s.savePromptTemplates(0,{...custom,music:'stale {{task_context}}'})).toThrow(/changed/i);
 expect(s.promptTemplates()).toEqual({revision:1,...custom});s.close();
 const reopened=openStudioStore(path);stores.push(reopened);expect(reopened.promptTemplates()).toEqual({revision:1,...custom});
 expect(reopened.savePromptTemplates(1,DEFAULT_AGENT_TEMPLATES)).toEqual({revision:2,...DEFAULT_AGENT_TEMPLATES});
});
test.each(['', 'missing context', '{{task_context}} {{task_context}}', 'x'.repeat(64001)+'{{task_context}}','\0{{task_context}}'])('invalid template %j leaves both stored templates untouched',music=>{
 const{store:s}=fixture();expect(()=>s.savePromptTemplates(0,{...custom,music})).toThrow();expect(s.promptTemplates().revision).toBe(0);
});
test('template replacement is literal and one-pass, including dollars and placeholder-looking user text',()=>{
 expect(renderAgentTemplate('Before {{task_context}} after','$& {{task_context}}')).toBe('Before $& {{task_context}} after');
});
test('new music/video requests capture their accepted templates; idempotency and retries retain them',()=>{
 const{store:s}=fixture(),p=s.createProject('capture');s.savePromptTemplates(0,custom);
 const musicInput={musicPrompt:'song',lyrics:''},musicKey=randomUUID(),m=s.submitMusic(p.id,musicKey,musicInput);
 const song=s.finishMusic(m.id,{title:'fixture',assetId:randomUUID(),assetPath:`/synthetic/${randomUUID()}.wav`,sha256:'a'.repeat(64),sampleCount:'96000',sampleRate:48000,channels:2,durationSeconds:2,truncated:false,analysis:{state:'pending',estimatedBpm:null,sampleIndices:[],waveformBucketSamples:0,peaks:[],error:null,version:null}},{});
 const videoInput={songId:song.id,clipPrompt:'scene',style:'',startFrame:0,endFrame:24},key=randomUUID(),v=s.submitVideo(p.id,key,videoInput);
 s.savePromptTemplates(1,DEFAULT_AGENT_TEMPLATES);
 expect(s.submitMusic(p.id,musicKey,musicInput).promptTemplate).toEqual({revision:1,template:custom.music});
 expect(s.submitVideo(p.id,key,videoInput).promptTemplate).toEqual({revision:1,template:custom.video});
 expect(s.submitMusic(p.id,randomUUID(),musicInput).promptTemplate).toEqual({revision:2,template:DEFAULT_AGENT_TEMPLATES.music});
 s.patchVideoAttempt(v.id,{state:'failed',error:'fixture'});
 expect(s.recoverAttempt(v.id,'retry',randomUUID()).promptTemplate).toEqual(v.promptTemplate);
 const failed=s.submitMusic(p.id,randomUUID(),musicInput);s.patchAttempt(failed.id,{state:'failed',error:'fixture'});
 s.savePromptTemplates(2,custom);expect(s.recoverAttempt(failed.id,'retry',randomUUID()).promptTemplate).toEqual(failed.promptTemplate);
});
test('version 8 migration adds only template storage and keeps historical attempt JSON unchanged',()=>{
 const{store:s,path}=fixture(),p=s.createProject('old'),a=s.submitMusic(p.id,randomUUID(),{musicPrompt:'old',lyrics:''});s.close();
 const db=new Database(path);const row=db.prepare('SELECT data FROM studio_attempts WHERE id=?').get(a.id) as {data:string};
 const legacy=JSON.parse(row.data);delete legacy.promptTemplate;const bytes=JSON.stringify(legacy);db.prepare('UPDATE studio_attempts SET data=? WHERE id=?').run(bytes,a.id);
 db.exec('DROP TABLE studio_prompt_templates; UPDATE studio_meta SET version=8');db.close();
 const reopened=openStudioStore(path);stores.push(reopened);expect(reopened.attempt(a.id)?.promptTemplate).toBeUndefined();
 const observed=new Database(path);expect(observed.prepare('SELECT data FROM studio_attempts WHERE id=?').get(a.id)).toEqual({data:bytes});expect(observed.prepare('SELECT version FROM studio_meta').get()).toEqual({version:9});observed.close();
});
