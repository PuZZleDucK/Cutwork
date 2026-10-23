export interface Notice { id: string; kind: 'warning' | 'error'; text: string }
export interface NoticeState { dismissed: string[]; reviewing: string[] }
type NoticeAction = { type: 'dismiss' | 'review' | 'hide' | 'reconcile'; ids: string[] };
const warningKey = 'assembly.dismissed-warnings.v1';
export const LAN_NOTICE_ID = 'warning:lan-access:v1';
// Persist only an opaque onboarding preference, never failure text or prompts.
const warningsOnly = (ids: string[]) => ids.some(id => id === LAN_NOTICE_ID || id.startsWith('warning:Trusted LAN only:')) ? [LAN_NOTICE_ID] : [];
export function notificationReducer(state: NoticeState, action: NoticeAction): NoticeState {
  if (action.type === 'dismiss') return { dismissed: [...new Set([...state.dismissed, ...action.ids])], reviewing: state.reviewing.filter(id => !action.ids.includes(id)) };
  if (action.type === 'review') return { ...state, reviewing: action.ids.filter(id => !state.dismissed.includes(id)) };
  if (action.type === 'hide') return { ...state, reviewing: [] };
  return { dismissed: state.dismissed.filter(id => id.startsWith('warning:') || action.ids.includes(id)), reviewing: state.reviewing.filter(id => action.ids.includes(id)) };
}
export const visibleNotices = <T extends Notice>(notices: T[], state: NoticeState): T[] => notices.filter(n => !state.dismissed.includes(n.id));
export function readWarningDismissals(storage: Pick<Storage, 'getItem'> | null, legacySession: Pick<Storage, 'getItem'> | null = null): string[] {
  const read = (source: Pick<Storage, 'getItem'> | null): string[] => {
    try { const value: unknown = JSON.parse(source?.getItem(warningKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
    catch { return []; }
  };
  return warningsOnly([...read(storage), ...read(legacySession)]);
}
export function writeWarningDismissals(storage: Pick<Storage, 'setItem'> | null, ids: string[]): void {
  try { storage?.setItem(warningKey, JSON.stringify(warningsOnly(ids))); } catch { /* In-memory dismissal still works with blocked/full storage. */ }
}

export interface ErrorNoticeState { text: string | null; occurrence: number }
export function errorNoticeReducer(state: ErrorNoticeState, action: {type:'raise';text:string} | {type:'clear'|'clear-save'}): ErrorNoticeState {
  if (action.type === 'raise') return {text:action.text,occurrence:state.occurrence + 1};
  if (action.type === 'clear-save' && !state.text?.startsWith('Draft not saved.')) return state;
  return {...state,text:null};
}
export function overviewNotice(text: string): Notice | null {
  if (text.startsWith('Trusted LAN only: ')) return {id:LAN_NOTICE_ID,kind:'warning',text};
  // Routine operating limits are documentation, not incidents. The overview API
  // retains them for headless clients; do not put them in the notification inbox.
  if (['Models share one GPU lane.', 'Each native generation is bounded to '].some(prefix => text.startsWith(prefix))) return null;
  // The string-only overview contract also allows general information. Only
  // its explicit operational failure messages belong in this inbox.
  const failure = ['An existing native lease blocks new dispatch', 'Interrupted work requires reconciliation', 'Studio scheduler stopped after an internal error'].some(prefix => text.startsWith(prefix));
  return failure ? {id:`runtime-warning:${text}`,kind:'error',text} : null;
}
export function workspaceNotices(state: { projectId: string | null; conflict: boolean; error: string | null; errorVersion: number; notice: string | null; messageVersion: number; connection: string | null }): Notice[] {
  const notices: Notice[] = [];
  if (state.connection) notices.push({id:`connection:${state.connection}`,kind:'error',text:`${state.connection} Changes stay in this page until saved.`});
  if (state.conflict) notices.push({id:`conflict:${state.projectId}`,kind:'error',text:'This project changed while you were editing. Your inputs have not been overwritten. Choose which draft to keep.'});
  if (state.error && (!state.conflict || state.error !== notices.find(n => n.id.startsWith('conflict:'))?.text)) notices.push({id:`error:${state.errorVersion}:${state.error}`,kind:'error',text:state.error});
  // Successful actions are reflected by their UI state, not by notifications.
  return notices;
}
