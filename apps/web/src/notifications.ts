export interface Notice { id: string; kind: 'warning' | 'error' | 'success'; text: string }
export interface NoticeState { dismissed: string[]; reviewing: string[] }
type NoticeAction = { type: 'dismiss' | 'review' | 'reconcile'; ids: string[] };
const warningKey = 'assembly.dismissed-warnings.v1';
const warningsOnly = (ids: string[]) => [...new Set(ids.filter(id => id.startsWith('warning:')))];
export function notificationReducer(state: NoticeState, action: NoticeAction): NoticeState {
  if (action.type === 'dismiss') return { dismissed: [...new Set([...state.dismissed, ...action.ids])], reviewing: state.reviewing.filter(id => !action.ids.includes(id)) };
  if (action.type === 'review') return { ...state, reviewing: action.ids };
  return { dismissed: state.dismissed.filter(id => id.startsWith('warning:') || action.ids.includes(id)), reviewing: state.reviewing.filter(id => action.ids.includes(id)) };
}
export const visibleNotices = <T extends Notice>(notices: T[], state: NoticeState): T[] => notices.filter(n => !state.dismissed.includes(n.id) || state.reviewing.includes(n.id));
export function readWarningDismissals(storage: Pick<Storage, 'getItem'> | null): string[] {
  try { const value: unknown = JSON.parse(storage?.getItem(warningKey) ?? '[]'); return Array.isArray(value) ? warningsOnly(value.filter((id): id is string => typeof id === 'string')) : []; }
  catch { return []; }
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
export function overviewNotice(text: string): Notice {
  // Only these application-authored standing advisories survive dismissal/reload.
  // Operational incidents must be eligible to appear again after they resolve.
  const persistent = ['Trusted LAN only: ', 'Models share one GPU lane.', 'Each native generation is bounded to '].some(prefix => text.startsWith(prefix));
  return {id:`${persistent ? 'warning' : 'runtime-warning'}:${text}`,kind:'warning',text};
}
export function workspaceNotices(state: { projectId: string | null; conflict: boolean; error: string | null; errorVersion: number; notice: string | null; messageVersion: number; connection: string | null }): Notice[] {
  const notices: Notice[] = [];
  if (state.connection) notices.push({id:`connection:${state.connection}`,kind:'warning',text:`${state.connection} Changes stay in this page until saved.`});
  if (state.conflict) notices.push({id:`conflict:${state.projectId}`,kind:'error',text:'This project changed while you were editing. Your inputs have not been overwritten. Choose which draft to keep.'});
  if (state.error && (!state.conflict || state.error !== notices.find(n => n.id.startsWith('conflict:'))?.text)) notices.push({id:`error:${state.errorVersion}:${state.error}`,kind:'error',text:state.error});
  if (state.notice) notices.push({id:`notice:${state.messageVersion}:${state.notice}`,kind:'success',text:state.notice});
  return notices;
}
