import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { notificationReducer, readWarningDismissals, writeWarningDismissals, visibleNotices, type Notice } from './notifications.ts';
import {notificationFlashes} from './notification-flash.ts';
export interface Notification extends Notice { actions?: ReactNode }
function sessionStorageOrNull(): Storage | null { try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; } }
/** Hiding a message never changes the underlying tool/job/conflict state. */
export function NoticeCenter({notices}: {notices: Notification[]}) {
  const [state, dispatch] = useReducer(notificationReducer, undefined, () => ({ dismissed: readWarningDismissals(sessionStorageOrNull()), reviewing: [] }));
  const ids = JSON.stringify(notices.map(n => n.id));
  useEffect(() => { dispatch({type:'reconcile',ids:JSON.parse(ids) as string[]}); }, [ids]);
  useEffect(() => { writeWarningDismissals(sessionStorageOrNull(),state.dismissed); }, [state.dismissed]);
  const [flashes,setFlashes]=useState<string[]>(()=>visibleNotices(notices,state).map(n=>n.id));
  const queue=useRef<ReturnType<typeof notificationFlashes>|null>(null);
  useEffect(()=>{queue.current=notificationFlashes(setFlashes);return()=>{queue.current?.dispose();queue.current=null;};},[]);
  const announceIds=JSON.stringify(notices.filter(n=>!state.dismissed.includes(n.id)).map(n=>n.id));
  useEffect(()=>{queue.current?.sync(JSON.parse(announceIds) as string[]);},[announceIds]);
  const visible=visibleNotices(notices,state).filter(n=>flashes.includes(n.id)||state.reviewing.includes(n.id));
  const dismiss=(ids:string[])=>{queue.current?.dismiss(ids);dispatch({type:'dismiss',ids});};
  return <aside className="notification-center" aria-label="Notifications">
    <div className="notification-stack" id="studio-notifications">{visible.map(notice => <article key={notice.id} className={`floating-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span className="notice-symbol" aria-hidden="true">{notice.kind === 'success' ? '✓' : '!'}</span>
      <div className="notice-copy"><p>{notice.text}</p>{notice.actions && <div className="notice-actions">{notice.actions}</div>}</div>
      <button className="icon-button notice-dismiss" onClick={() => dismiss([notice.id])} aria-label={`Dismiss ${notice.kind === 'success' ? 'notification' : notice.kind}: ${notice.text}`}>×</button>
    </article>)}</div>
    <button className="notification-toggle" aria-controls="studio-notifications" aria-expanded={visible.length > 0} aria-label={visible.length ? 'Hide notifications' : `Show notifications (${notices.length})`} disabled={!notices.length} title="Warnings and notifications" onClick={() => visible.length ? dismiss(notices.map(n=>n.id)) : dispatch({type:'review',ids:notices.map(n=>n.id)})}>
      <span aria-hidden="true">{visible.length ? '−' : '+'}</span> Notifications <span className="notice-count">{visible.length || notices.length}</span>
    </button>
  </aside>;
}
