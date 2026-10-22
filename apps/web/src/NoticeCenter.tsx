import { useEffect, useReducer, type ReactNode } from 'react';
import { notificationReducer, readWarningDismissals, writeWarningDismissals, visibleNotices, type Notice } from './notifications.ts';
export interface Notification extends Notice { actions?: ReactNode }
function sessionStorageOrNull(): Storage | null { try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; } }
/** Hiding a message never changes the underlying tool/job/conflict state. */
export function NoticeCenter({notices}: {notices: Notification[]}) {
  const [state, dispatch] = useReducer(notificationReducer, undefined, () => ({ dismissed: readWarningDismissals(sessionStorageOrNull()), reviewing: [] }));
  const ids = JSON.stringify(notices.map(n => n.id));
  useEffect(() => { dispatch({type:'reconcile',ids:JSON.parse(ids) as string[]}); }, [ids]);
  useEffect(() => { writeWarningDismissals(sessionStorageOrNull(),state.dismissed); }, [state.dismissed]);
  const visible = visibleNotices(notices,state);
  if (!notices.length) return null;
  return <aside className="notification-center" aria-label="Notifications">
    <div className="notification-stack" id="studio-notifications">{visible.map(notice => <article key={notice.id} className={`floating-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span className="notice-symbol" aria-hidden="true">{notice.kind === 'success' ? '✓' : '!'}</span>
      <div className="notice-copy"><p>{notice.text}</p>{notice.actions && <div className="notice-actions">{notice.actions}</div>}</div>
      <button className="icon-button notice-dismiss" onClick={() => dispatch({type:'dismiss',ids:[notice.id]})} aria-label={`Dismiss ${notice.kind === 'success' ? 'notification' : notice.kind}: ${notice.text}`}>×</button>
    </article>)}</div>
    <button className="notification-toggle" aria-controls="studio-notifications" aria-expanded={visible.length > 0} aria-label={visible.length ? 'Hide notifications' : `Show notifications (${notices.length})`} onClick={() => dispatch({type:visible.length ? 'dismiss' : 'review',ids:notices.map(n=>n.id)})}>
      <span aria-hidden="true">{visible.length ? '−' : '+'}</span> Notifications <span className="notice-count">{visible.length || notices.length}</span>
    </button>
  </aside>;
}
