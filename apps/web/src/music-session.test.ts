import { afterEach, expect, it, vi } from 'vitest';
import { prepareMusicSubmission, clearMusicSubmission, musicSubmissionKey } from './music-session.ts';
const keys=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const input={musicPrompt:'A playful riff',lyrics:'hello'};
afterEach(()=>vi.unstubAllGlobals());
function storage(){const values=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});return values;}
it('keeps uncertain music identity per project across navigation and restored module state',()=>{
 storage();const a=prepareMusicSubmission('projectA',input,()=>keys[0]!);prepareMusicSubmission('projectB',input,()=>keys[1]!);
 expect(prepareMusicSubmission('projectA',{...input},()=>keys[2]!)).toEqual(a);
 expect(musicSubmissionKey('projectA')).not.toBe(musicSubmissionKey('projectB'));
});
it('confirmed acceptance frees the next variation but cannot clear a newer request',()=>{
 storage();const one=prepareMusicSubmission('p',input,()=>keys[0]!);clearMusicSubmission('p',one);
 const two=prepareMusicSubmission('p',input,()=>keys[1]!);expect(two.key).not.toBe(one.key);
 clearMusicSubmission('p',one);expect(prepareMusicSubmission('p',input,()=>keys[2]!)).toEqual(two);
});
it('changed creative inputs get a new key; provider defaults do not enter the retry identity',()=>{
 storage();const first=prepareMusicSubmission('p',input,()=>keys[0]!);const changed=prepareMusicSubmission('p',{...input,lyrics:'new'},()=>keys[1]!);
 expect(changed.key).not.toBe(first.key);expect(JSON.parse(changed.signature)).toEqual({projectId:'p',input:{...input,lyrics:'new'}});
});
it('corrupt storage is not trusted and unavailable storage still retains open-session identity',()=>{
 const values=storage();values.set(musicSubmissionKey('p'),'{broken');expect(prepareMusicSubmission('p',input,()=>keys[0]!).key).toBe(keys[0]);
 vi.stubGlobal('sessionStorage',{getItem:()=>{throw Error('disabled');},setItem:()=>{throw Error('disabled');},removeItem:()=>{throw Error('disabled');}});
 const one=prepareMusicSubmission('no-storage',input,()=>keys[1]!);expect(prepareMusicSubmission('no-storage',input,()=>keys[2]!)).toEqual(one);
});
