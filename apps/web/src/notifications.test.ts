import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NoticeCenter } from './NoticeCenter.tsx';
import { notificationReducer, readWarningDismissals, writeWarningDismissals, visibleNotices, workspaceNotices, errorNoticeReducer, overviewNotice, LAN_NOTICE_ID, type NoticeState } from './notifications.ts';

const warning = { id:LAN_NOTICE_ID, kind:'warning' as const, text:'Trusted LAN only.' };
const error = { id:'error:1', kind:'error' as const, text:'Save failed.' };
const empty: NoticeState = { dismissed: [], reviewing: [] };
describe('dismissible floating notifications', () => {
  it('dismisses one notice without hiding others or changing source messages', () => {
    const original = [warning,error];
    const state = notificationReducer(empty, {type:'dismiss',ids:[warning.id]});
    expect(visibleNotices(original,state)).toEqual([error]); expect(original).toEqual([warning,error]);
  });
  it('keeps dismissed warnings hidden through polling and reopening the panel', () => {
    const dismissed = notificationReducer(empty,{type:'dismiss',ids:[warning.id]});
    expect(visibleNotices([{...warning}],dismissed)).toEqual([]);
    const reopened = notificationReducer(dismissed,{type:'review',ids:[warning.id]});
    expect(visibleNotices([warning],reopened)).toEqual([]);
    expect(visibleNotices([warning],notificationReducer(reopened,{type:'dismiss',ids:[warning.id]}))).toEqual([]);
  });
  it('does not suppress changed warnings or new occurrences of the same error', () => {
    const state = notificationReducer(empty,{type:'dismiss',ids:[warning.id,error.id]});
    const changed = {...warning,id:'warning:new limit',text:'The limit changed.'};
    const repeated = {...error,id:'error:2'};
    expect(visibleNotices([warning,changed,repeated],state)).toEqual([changed,repeated]);
  });
  it('forgets resolved transient dismissals but keeps onboarding dismissal preferences', () => {
    const state = notificationReducer({dismissed:[warning.id,error.id],reviewing:[error.id]}, {type:'reconcile',ids:[]});
    expect(state).toEqual({dismissed:[warning.id],reviewing:[]});
    expect(visibleNotices([error],state)).toEqual([error]);
  });
  it('persists only static warning dismissal, not private message bodies or transient errors', () => {
    let stored = ''; const storage = {getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}};
    writeWarningDismissals(storage,[warning.id,error.id]);
    expect(JSON.parse(stored)).toEqual([warning.id]); expect(readWarningDismissals(storage)).toEqual([warning.id]);
  });
  it('tolerates missing, blocked, malformed or unexpected browser storage', () => {
    expect(readWarningDismissals(null)).toEqual([]);
    expect(readWarningDismissals({getItem:()=>'{oops'})).toEqual([]);
    expect(readWarningDismissals({getItem:()=>JSON.stringify([7,'error:private',warning.id])})).toEqual([warning.id]);
    expect(readWarningDismissals({getItem:()=>{throw Error('blocked');}})).toEqual([]);
    expect(()=>writeWarningDismissals({setItem:()=>{throw Error('quota');}},[warning.id])).not.toThrow();
  });
  it('renders individually dismissible accessible notices and a persistent review toggle', () => {
    const markup = renderToStaticMarkup(createElement(NoticeCenter,{notices:[warning,error]}));
    expect(markup).toContain('aria-label="Notifications"');
    expect(markup).toContain('class="notification-center"');
    expect(markup).toContain('aria-label="Dismiss warning: Trusted LAN only."');
    expect(markup).toContain('aria-label="Dismiss error: Save failed."');
    expect(markup).toContain('role="alert"'); expect(markup).toContain('aria-expanded="true"');
  });
  it('keeps conflict resolution actions within the dismissible notification', () => {
    const actions=createElement('button',null,'Keep my draft');
    const markup=renderToStaticMarkup(createElement(NoticeCenter,{notices:[{...error,actions}]}));
    expect(markup).toContain('Keep my draft'); expect(markup).toContain('Dismiss error: Save failed.');
  });
});

describe('notification recovery and repeated occurrences', () => {
  it('keeps draft-conflict recovery available after an unrelated action cleared the transient error', () => {
    const notices=workspaceNotices({projectId:'a',conflict:true,error:null,errorVersion:2,notice:null,messageVersion:4,connection:null});
    expect(notices).toEqual([{id:'conflict:a',kind:'error',text:expect.stringContaining('Choose which draft')}]);
  });
  it('gives a repeated direct save failure a new identity even with identical text', () => {
    const a=errorNoticeReducer({text:null,occurrence:0},{type:'raise',text:'Draft not saved. Offline'});
    const b=errorNoticeReducer(a,{type:'raise',text:'Draft not saved. Offline'});
    expect(b).toEqual({text:a.text,occurrence:2});
    expect(errorNoticeReducer(b,{type:'clear-save'})).toEqual({text:null,occurrence:2});
    const other={text:'Other action failed',occurrence:3};
    expect(errorNoticeReducer(other,{type:'clear-save'})).toEqual(other);
  });
  it('remembers static advisories but reopens a resolved-then-repeated operational warning', () => {
    const staticWarning=overviewNotice('Trusted LAN only: service account access.')!;
    const dynamic=overviewNotice('An existing native lease blocks new dispatch until reconciliation.')!;
    expect(staticWarning.id).toMatch(/^warning:/); expect(dynamic.id).not.toMatch(/^warning:/);
    let state=notificationReducer(empty,{type:'dismiss',ids:[staticWarning.id,dynamic.id]});
    state=notificationReducer(state,{type:'reconcile',ids:[staticWarning.id]});
    expect(visibleNotices([staticWarning,dynamic],state)).toEqual([dynamic]);
  });
});

it('reports a new distinct recovery failure even when a draft conflict is still unresolved', () => {
  const notices=workspaceNotices({projectId:'a',conflict:true,error:'Could not load project',errorVersion:3,notice:null,messageVersion:4,connection:null});
  expect(notices.map(n=>n.id)).toEqual(['conflict:a','error:3:Could not load project']);
  const conflictText=notices[0]!.text;
  expect(workspaceNotices({projectId:'a',conflict:true,error:conflictText,errorVersion:4,notice:null,messageVersion:5,connection:null})).toHaveLength(1);
});


it('dismiss two of four, close and reopen leaves only the two undismissed notices',()=>{
 const original=[warning,error,{...error,id:'error:2',text:'Export failed.'},{...error,id:'error:3',text:'Analysis failed.'}];
 let state=notificationReducer(empty,{type:'review',ids:original.map(n=>n.id)});
 state=notificationReducer(state,{type:'dismiss',ids:['error:2']});
 state=notificationReducer(state,{type:'dismiss',ids:['error:3']});
 state=notificationReducer(state,{type:'hide',ids:[]});
 expect(state.reviewing).toEqual([]);
 expect(visibleNotices(original,state)).toEqual([warning,error]);
 state=notificationReducer(state,{type:'review',ids:original.map(n=>n.id)});
 state=notificationReducer(state,{type:'reconcile',ids:original.map(n=>n.id)});
 expect(state.reviewing).toEqual([warning.id,error.id]);
 expect(visibleNotices(original,state)).toEqual([warning,error]);
});

it('successful edits never produce notifications, while failures still do',()=>{
 const state={projectId:'a',conflict:false,error:null,errorVersion:1,notice:'Clip order updated.',messageVersion:1,connection:null};
 for(const notice of ['Clip order updated.','Clip trimmed.','Song selected.','Generation submitted.'])expect(workspaceNotices({...state,notice})).toEqual([]);
 expect(workspaceNotices({...state,error:'Save failed.'})).toEqual([{id:'error:1:Save failed.',kind:'error',text:'Save failed.'}]);
 expect(workspaceNotices({...state,connection:'Offline'})[0]?.kind).toBe('error');
});

it('LAN onboarding is the only standing advisory in notifications; real operational failures remain',()=>{
 expect(overviewNotice('Models share one GPU lane. Other resident applications can exhaust RAM or VRAM; the studio never stops unrelated services.')).toBeNull();
 expect(overviewNotice('Each native generation is bounded to 3600 seconds; a job exceeding this limit is stopped, not silently retried.')).toBeNull();
 expect(overviewNotice('Trusted LAN only: service account access.')).toMatchObject({kind:'warning'});
 expect(overviewNotice('Studio scheduler stopped after an internal error. Inspect the server log before recovery.')).toMatchObject({kind:'error'});
});


it('migrates a dismissed LAN warning from session storage and persists no technical/private messages',()=>{
 const legacy={getItem:()=>JSON.stringify(['warning:Trusted LAN only: anyone with access can run agents.','warning:Models share one GPU lane.','error:private prompt'])};
 expect(readWarningDismissals(null,legacy)).toEqual([LAN_NOTICE_ID]);
 let saved='';const persistent={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}};
 writeWarningDismissals(persistent,readWarningDismissals(null,legacy));
 expect(saved).toBe(JSON.stringify([LAN_NOTICE_ID]));
 expect(readWarningDismissals(persistent)).toEqual([LAN_NOTICE_ID]);
});


it('only known operational failures, not unclassified informational text, enter the overview inbox',()=>{
 expect(overviewNotice('SYNTHETIC disposable CPU fixture. No agents, models or production data.')).toBeNull();
 for(const text of ['An existing native lease blocks new dispatch until reconciliation.','Interrupted work requires reconciliation; it is not automatically replayed.','Studio scheduler stopped after an internal error. Inspect the server log before recovery.'])expect(overviewNotice(text)?.kind).toBe('error');
});
