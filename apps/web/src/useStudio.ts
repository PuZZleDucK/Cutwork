import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClipDraft, MusicAttempt, MusicDraft, ProjectSnapshot, StudioOverview, StudioProject, ToolId, Provider } from '../../../packages/core/src/contracts/studio.ts';
import type {PurgeRecord} from '../../../packages/core/src/contracts/lifecycle.ts';
import {acknowledgeDeletionSnapshot} from './artifact-lifecycle.ts';
import { acknowledgeRecoverySnapshot, cancellationFlights, restoredProjectState } from './generation-recovery.ts';
import { restoredSnapshot } from './restore-video.ts';
import { prepareMusicSubmission, clearMusicSubmission } from './music-session.ts';
import { errorNoticeReducer } from './notifications.ts';
import { ApiError, request } from './api.ts';
import { latestReadGuard } from './video-state.ts';
import { attemptIsActive, emptyDraft, mergeSavedDraft, musicInputFromDraft } from './studio-state.ts';
import {acknowledgeClipEdit,persistClipEdit,type ClipEditResult,type ClipEditPatch} from './clip-edit-persistence.ts';
import type {ClipEditContext} from '../../../packages/core/src/contracts/studio.ts';

export function useStudio() {
  const [overview, setOverview] = useState<StudioOverview | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [draft, setDraft] = useState<MusicDraft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<ReadonlySet<string>>(()=>new Set());
  const cancelFlights = useRef(cancellationFlights());
  const [errorNotice, dispatchError] = useReducer(errorNoticeReducer, {text:null,occurrence:0});
  const error = errorNotice.text;
  const [connection, setConnection] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [messageVersion, setMessageVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useRef<{project: StudioProject | null; draft: MusicDraft; dirty: boolean; conflict: boolean}>({ project: null, draft: emptyDraft, dirty: false, conflict: false });
  const saveFlight = useRef<Promise<StudioProject | null> | null>(null);
  const actionFlight = useRef(false);
  const mounted = useRef(true);
  const reads = useRef(latestReadGuard());

  const receive = useCallback((next: ProjectSnapshot, reset = false) => {
    const c = current.current;
    if (!reset && c.project?.id !== next.project.id) return;
    if (!reset && c.project && next.project.revision < c.project.revision) return;
    acknowledgeRecoverySnapshot(next);
    acknowledgeDeletionSnapshot(next);
    setSnapshot(next);
    if (reset || (!c.dirty && !c.conflict && !saveFlight.current)) {
      c.project = next.project; c.draft = next.project.draft; c.dirty = false; c.conflict = false;
      setDraft(c.draft); setDirty(false); setConflict(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    const sequence = reads.current.begin();
    try {
      const next = await request<StudioOverview>('/api/studio');
      if (!mounted.current || !reads.current.isCurrent(sequence)) return false;
      const id = current.current.project?.id ?? next.selectedProjectId;
      const project = id ? await request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(id)}`) : null;
      if (!mounted.current || !reads.current.isCurrent(sequence)) return false;
      setOverview(next);
      if (project) receive(project, current.current.project === null);
      setConnection(null);
      return next.tools.some(t => t.active || t.queued > 0 || ['checking','installing','queued'].includes(t.state)) || !!project?.attempts.some(a => attemptIsActive(a.state)) || !!project?.videoAttempts.some(a => attemptIsActive(a.state)) || !!project?.renders.some(r => ['queued','running'].includes(r.state)) || !!project?.deletions?.some(d => ['pending','purging'].includes(d.state));
    } catch (error) {
      if (!mounted.current || !reads.current.isCurrent(sequence)) return false;
      throw error;
    }
  }, [receive]);
  useEffect(() => {
    mounted.current = true;
    let disposed = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let active = false;
      try { active = await refresh(); } catch (e) { if (!disposed) setConnection(`Connection interrupted. ${e instanceof Error ? e.message : 'Retrying shortly.'}`); }
      if (!disposed) timer = setTimeout(() => void poll(), active ? 1000 : 5000);
    };
    void poll();
    return () => { disposed = true; mounted.current = false; clearTimeout(timer); };
  }, [refresh]);

  const edit = useCallback((value: MusicDraft) => {
    current.current.draft = value; current.current.dirty = true;
    setDraft(value); setDirty(true); setNotice(null);
  }, []);
  const save = useCallback(async (): Promise<StudioProject | null> => {
    if (saveFlight.current) return saveFlight.current;
    if (current.current.conflict) throw new Error('Resolve the draft conflict before continuing. Your inputs have been kept.');
    const work = async () => {
      // Capture the clean click-time project; polling cannot donate a newer
      // remote revision to an already-authorized restore. Dirty saves replace
      // this only with their own accepted response.
      let accepted = current.current.project;
      setSaving(true);
      try {
        while (current.current.dirty && current.current.project) {
          const project = current.current.project;
          const submitted = { ...current.current.draft };
          const saved = await request<StudioProject>(`/api/projects/${encodeURIComponent(project.id)}/draft`, { revision: project.revision, draft: submitted }, 'PUT');
          accepted = saved;
          const merged = mergeSavedDraft(current.current.draft, submitted, saved.draft);
          current.current.project = saved; current.current.draft = merged.draft; current.current.dirty = merged.dirty;
          setDraft(merged.draft); setDirty(merged.dirty);
          setSnapshot(old => old?.project.id === saved.id ? { ...old, project: saved } : old);
        }
        dispatchError({type:'clear-save'}); return accepted;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          current.current.conflict = true; setConflict(true);
          dispatchError({type:'raise',text:'This project changed while you were editing. Your inputs have not been overwritten. Choose which draft to keep.'});
        } else dispatchError({type:'raise',text:`Draft not saved. ${e instanceof Error ? e.message : 'Try again.'}`});
        throw e;
      } finally { setSaving(false); }
    };
    const promise = work(); saveFlight.current = promise;
    try { return await promise; } finally { saveFlight.current = null; }
  }, []);
  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(() => { void save().catch(() => {}); }, 500);
    return () => clearTimeout(timer);
  }, [draft, dirty, conflict, save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const act = useCallback(async (operation: () => Promise<void>) => {
    if (actionFlight.current) return false;
    actionFlight.current = true; setMessageVersion(version => version + 1); setBusy(true); dispatchError({type:'clear'}); setNotice(null);
    try { await operation(); return true; }
    catch (e) { dispatchError({type:'raise',text:e instanceof Error ? e.message : 'The action could not be completed.'}); return false; }
    finally { actionFlight.current = false; setBusy(false); }
  }, []);
  const selectProject = (id: string) => act(async () => {
    if (id === current.current.project?.id) return;
    await save();
    await request(`/api/projects/${encodeURIComponent(id)}/select`, {});
    const next = await request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(id)}`);
    receive(next, true); await refresh();
  });
  const createProject = (name: string) => act(async () => {
    await save();
    const project = await request<StudioProject>('/api/projects', { name: name.trim() });
    await request(`/api/projects/${encodeURIComponent(project.id)}/select`, {});
    receive(await request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(project.id)}`), true);
    await refresh();
  });
  const resolveConflict = (keepLocal: boolean) => act(async () => {
    const id = current.current.project?.id; if (!id) return;
    const next = await request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(id)}`);
    if (keepLocal) {
      current.current.project = next.project; current.current.conflict = false; setConflict(false);
      await save();
    } else receive(next, true);
    setNotice(keepLocal ? 'Your draft is saved.' : 'Loaded the saved project draft.');
  });
  const selectSong = (songId: string) => act(async () => {
    await save(); const p = current.current.project; if (!p) return;
    const beforeSelection = { ...current.current.draft };
    const result = await request<StudioProject>(`/api/projects/${encodeURIComponent(p.id)}/songs/${encodeURIComponent(songId)}/select`, { revision: p.revision });
    const merged = mergeSavedDraft(current.current.draft, beforeSelection, result.draft);
    current.current.project = result; current.current.draft = merged.draft; current.current.dirty = merged.dirty;
    setDraft(merged.draft); setDirty(merged.dirty);
    setSnapshot(old => old?.project.id === result.id ? { ...old, project: result } : old);
    setNotice('Song selected. Its original music description and lyrics are restored.');
    // The mutation already succeeded; a follow-up read failure is a connection issue.
    await refresh().catch(e => setConnection(e instanceof Error ? e.message : 'Waiting for the next studio update.'));
  });
  const generate = () => act(async () => {
    await save(); const project = current.current.project; if (!project) return;
    const input = musicInputFromDraft(current.current.draft);
    const identity = prepareMusicSubmission(project.id, input);
    const attempt = await request<MusicAttempt>(`/api/projects/${encodeURIComponent(project.id)}/music`, { idempotencyKey: identity.key, input });
    setSnapshot(old => old?.project.id === project.id ? { ...old, attempts: old.attempts.some(a => a.id === attempt.id) ? old.attempts : [...old.attempts, attempt] } : old);
    clearMusicSubmission(project.id, identity);
    setNotice(attemptIsActive(attempt.state) ? 'Generation queued. You can keep working or switch projects.' : 'Recovered the previously accepted generation. Its result and details are in this project.');
    // Acceptance is already confirmed. A failed follow-up read must not masquerade as a failed submission.
    await refresh().catch(e => setConnection(e instanceof Error ? e.message : 'Waiting for the next studio update.'));
  });
  const perform = (operation: () => Promise<void>, success: string) => act(async () => {
    await save(); await operation(); reads.current.begin(); setNotice(success);
    await refresh().catch(e => setConnection(e instanceof Error ? e.message : 'Waiting for the next studio update.'));
  });
  // Non-form actions need not save inputs, but retain the ordinary action lock.
  const performImmediate = (operation: () => Promise<void>, success: string) => act(async () => {
    await operation(); reads.current.begin(); setNotice(success);
    await refresh().catch(e => setConnection(e instanceof Error ? e.message : 'Waiting for the next studio update.'));
  });
  const performCancellation = async (attemptId:string,operation:()=>Promise<void>,success:string):Promise<boolean> => {
    if(cancelFlights.current.has(attemptId))return false;
    setCancelling(previous=>new Set([...previous,attemptId]));
    setMessageVersion(version=>version+1);dispatchError({type:'clear'});setNotice(null);
    try{return await cancelFlights.current.run(attemptId,async()=>{
      await operation();reads.current.begin();setNotice(success);
      await refresh().catch(e=>setConnection(e instanceof Error?e.message:'Waiting for the next studio update.'));
    });}catch(e){dispatchError({type:'raise',text:e instanceof Error?e.message:'The cancellation could not be completed.'});return false;}
    finally{setCancelling(previous=>{const next=new Set(previous);next.delete(attemptId);return next;});}
  };
  const saveProjectForRestore = async ():Promise<StudioProject> => {
    const project=await save();if(!project)throw new Error('Select the original project first.');return project;
  };
  const acceptRestoredProject = (result:StudioProject,beforeDraft:MusicDraft,clipDraft?:ClipDraft|null):boolean => {
    const merged=restoredProjectState(current.current,result,beforeDraft);if(!merged)return false;
    current.current.project=merged.project;current.current.draft=merged.draft;current.current.dirty=merged.dirty;
    setDraft(merged.draft);setDirty(merged.dirty);
    setSnapshot(old=>restoredSnapshot(old,result,clipDraft));return true;
  };
  const restoreMusic = async (attemptId:string):Promise<boolean> => {
    if(current.current.conflict){dispatchError({type:'raise',text:'Resolve the music draft conflict before replacing its inputs.'});return false;}
    if(current.current.dirty&&!window.confirm('Replace your unsaved music description and lyrics with this generation’s original inputs? Cancel keeps your current draft.'))return false;
    return act(async()=>{
      const project=await saveProjectForRestore(),beforeDraft={...current.current.draft};
      const result=await request<{project:StudioProject}>(`/api/projects/${project.id}/attempts/${attemptId}/restore-parameters`,{projectRevision:project.revision});
      acceptRestoredProject(result.project,beforeDraft);reads.current.begin();
      setNotice('Music inputs restored. Review the description and lyrics, then Generate for a new variation.');
      await refresh().catch(e=>setConnection(e instanceof Error?e.message:'Waiting for the next studio update.'));
    });
  };
  const acceptDeletion = (record:PurgeRecord) => {
    reads.current.begin();
    setSnapshot(old=>old?.project.id===record.projectId?{...old,deletions:[...(old.deletions??[]).filter(row=>row.id!==record.id),record]}:old);
  };
  const acceptClipEdit = (result:ClipEditResult) => {
    reads.current.begin();
    setSnapshot(old=>acknowledgeClipEdit(old,result));
    void refresh().catch(e=>setConnection(e instanceof Error?e.message:'Waiting for the next studio update.'));
  };
  const saveClipEdit = async (context:ClipEditContext,revision:number,patch:ClipEditPatch):Promise<ClipEditResult> => {
    const result=await persistClipEdit(context,revision,patch);acceptClipEdit(result);return result;
  };
  const reportClipEditError = (text:string) => {dispatchError({type:'raise',text});void refresh().catch(()=>{});};
  const provider = (value: Provider) => act(async () => { await request('/api/provider', { provider: value }); await refresh(); });
  const checkProvider = () => act(async () => { await request('/api/provider/check', {}); await refresh(); });
  const setup = (tool: ToolId | 'all') => act(async () => { await request(`/api/setup/${tool}`, {}); await refresh(); });
  return { overview, snapshot, draft, dirty, saving, busy, cancelling, error, connection, conflict, notice, messageVersion, errorVersion: errorNotice.occurrence, edit, save, selectProject, createProject, resolveConflict, selectSong, generate, provider, checkProvider, setup, refresh, perform, performImmediate, performCancellation, saveProjectForRestore, acceptRestoredProject, restoreMusic, acceptDeletion, acceptClipEdit, saveClipEdit, reportClipEditError, clearError: () => dispatchError({type:'clear'}) };
}
