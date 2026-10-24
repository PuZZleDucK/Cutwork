import {afterEach,expect,test} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {openStudioStore} from '../../apps/server/src/studio/store.ts';
import type {StudioStore} from '../../apps/server/src/studio/store-contract.ts';
import {DEFAULT_TASK_CONTEXT_OVERRIDES,TASK_CONTEXT_MAX_LENGTH,taskContextError} from '../../packages/core/src/contracts/task-contexts.ts';
const dirs:string[]=[],stores:StudioStore[]=[];
function fixture(){const dir=mkdtempSync(join(tmpdir(),'context-settings-'));dirs.push(dir);const path=join(dir,'studio.sqlite'),s=openStudioStore(path);stores.push(s);return{s,path};}
afterEach(()=>{for(const s of stores.splice(0))s.close();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
const overrides={music:'CUSTOM MUSIC {{music_description}} $& {{stage_seeds_json}}','video-text':'CUSTOM VIDEO {{clip_description}} {{native_inputs_json}}','video-image':'CUSTOM CONTINUATION {{first_frame_path}} {{retained_beat_anchors}}'};
test('context overrides are shared, revision-guarded, durable and explicitly resettable to defaults',()=>{
 const {s,path}=fixture();expect(s.taskContexts()).toEqual({revision:0,overrides:DEFAULT_TASK_CONTEXT_OVERRIDES});
 expect(s.saveTaskContexts(0,overrides)).toEqual({revision:1,overrides});expect(()=>s.saveTaskContexts(0,DEFAULT_TASK_CONTEXT_OVERRIDES)).toThrow(/changed/i);
 s.close();const r=openStudioStore(path);stores.push(r);expect(r.taskContexts()).toEqual({revision:1,overrides});
 expect(r.saveTaskContexts(1,DEFAULT_TASK_CONTEXT_OVERRIDES)).toEqual({revision:2,overrides:DEFAULT_TASK_CONTEXT_OVERRIDES});
});
test('context validation permits creative replacement without mandatory wording but catches placeholder mistakes',()=>{
 expect(taskContextError('music','Entirely new guide, with no variables.')).toBeNull();
 expect(taskContextError('music','{{lyrics}} {{music_description}}')).toBeNull();
 for(const value of ['', '   ', '\0', '\ud800','x'.repeat(TASK_CONTEXT_MAX_LENGTH+1),'{{typo_variable}}','{{first_frame_path}}'])expect(taskContextError('music',value)).not.toBeNull();
 expect(taskContextError('video-image','{{first_frame_path}} {{direction}}')).toBeNull();
 const {s}=fixture();expect(()=>s.saveTaskContexts(0,{...overrides,music:'{{unknown}}'})).toThrow();expect(s.taskContexts().revision).toBe(0);
});
test('new requests capture settings; queued requests, idempotency and retry keep their original context',()=>{
 const {s}=fixture(),p=s.createProject('Capture');s.saveTaskContexts(0,overrides);
 const input={musicPrompt:'song',lyrics:''},key=randomUUID(),m=s.submitMusic(p.id,key,input);
 expect(m.taskContext).toEqual({id:'music',revision:1,template:overrides.music});
 const song=s.finishMusic(m.id,{title:'fixture',assetId:randomUUID(),assetPath:'/synthetic/audio.wav',sha256:'a'.repeat(64),sampleCount:'96000',sampleRate:48000,channels:2,durationSeconds:2,truncated:false,analysis:{state:'pending',estimatedBpm:null,sampleIndices:[],waveformBucketSamples:0,peaks:[],error:null,version:null}},{});
 const v=s.submitVideo(p.id,randomUUID(),{songId:song.id,clipPrompt:'scene',style:'',startFrame:0,endFrame:24});expect(v.taskContext).toEqual({id:'video-text',revision:1,template:overrides['video-text']});
 s.saveTaskContexts(1,DEFAULT_TASK_CONTEXT_OVERRIDES);expect(s.submitMusic(p.id,key,input).taskContext).toEqual(m.taskContext);
 expect(s.submitMusic(p.id,randomUUID(),input).taskContext).toEqual({id:'music',revision:2,template:null});
 s.patchVideoAttempt(v.id,{state:'failed',error:'fixture'});expect(s.recoverAttempt(v.id,'retry',randomUUID()).taskContext).toEqual(v.taskContext);
 const c=s.submitMusic(p.id,randomUUID(),input);s.requestCancel(c.id);s.finishCancellation(c.id,{});s.saveTaskContexts(2,overrides);expect(s.recoverAttempt(c.id,'restart',randomUUID()).taskContext).toEqual(c.taskContext);
});
test('schema 9 migration adds settings without rewriting historical attempts or outer templates',()=>{
 const {s,path}=fixture(),p=s.createProject('Old'),a=s.submitMusic(p.id,randomUUID(),{musicPrompt:'old',lyrics:''});s.close();
 const db=new Database(path),row=db.prepare('SELECT data FROM studio_attempts WHERE id=?').get(a.id) as {data:string},old=JSON.parse(row.data);delete old.taskContext;const bytes=JSON.stringify(old);db.prepare('UPDATE studio_attempts SET data=? WHERE id=?').run(bytes,a.id);db.exec('DROP TABLE studio_task_contexts; UPDATE studio_meta SET version=9');db.close();
 const r=openStudioStore(path);stores.push(r);expect(r.attempt(a.id)?.taskContext).toBeUndefined();expect(r.taskContexts().revision).toBe(0);
 const check=new Database(path);expect(check.prepare('SELECT data FROM studio_attempts WHERE id=?').get(a.id)).toEqual({data:bytes});expect(check.prepare('SELECT version FROM studio_meta').get()).toEqual({version:10});check.close();
});
