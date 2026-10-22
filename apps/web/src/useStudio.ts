import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicAttempt, MusicDraft, ProjectSnapshot, StudioOverview, StudioProject, ToolId, Provider } from '../../../packages/core/src/contracts/studio.ts';
import { ApiError, request } from './api.ts';
import { attemptIsActive, createRequestId, draftEqual, emptyDraft, mergeSavedDraft } from './studio-state.ts';

export function useStudio() {
  const [overview, setOverview] = useState<StudioOverview | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [draft, setDraft] = useState<MusicDraft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useRef<{project: StudioProject | null; draft: MusicDraft; dirty: boolean; conflict: boolean}>({ project: null, draft: emptyDraft, dirty: false, conflict: false });
  const saveFlight = useRef<Promise<void> | null>(null);
  const actionFlight = useRef(false);
  const mounted = useRef(true);
  const submission = useRef<{ projectId: string; input: MusicDraft; key: string } | null>(null);

  const receive = useCallback((next: ProjectSnapshot, reset = false) => {
    const c = current.current;
    if (!reset && c.project?.id !== next.project.id) return;
    if (!reset && c.project && next.project.revision < c.project.revision) return;
    setSnapshot(next);
    if (reset || (!c.dirty && !c.conflict && !saveFlight.current)) {
      c.project = next.project; c.draft = next.project.draft; c.dirty = false; c.conflict = false;
      setDraft(c.draft); setDirty(false); setConflict(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    const next = await request<StudioOverview>('/api/studio');
    if (!mounted.current) return false;
    setOverview(next);
    const id = current.current.project?.id ?? next.selectedProjectId;
    let project: ProjectSnapshot | null = null;
    if (id) {
      project = await request<ProjectSnapshot>(`/api/projects/${encodeURIComponent(id)}`);
      if (mounted.current) receive(project, current.current.project === null);
    }
    if (mounted.current) setConnection(null);
    return next.tools.some(t => t.active || t.queued > 0 || ['checking','installing','queued'].includes(t.state)) || !!project?.attempts.some(a => attemptIsActive(a.state));
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
  const save = useCallback(async (): Promise<void> => {
    if (saveFlight.current) return saveFlight.current;
    if (current.current.conflict) throw new Error('Resolve the draft conflict before continuing. Your inputs have been kept.');
    const work = async () => {
      setSaving(true);
      try {
        while (current.current.dirty && current.current.project) {
          const project = current.current.project;
          const submitted = { ...current.current.draft };
          const saved = await request<StudioProject>(`/api/projects/${encodeURIComponent(project.id)}/draft`, { revision: project.revision, draft: submitted }, 'PUT');
          const merged = mergeSavedDraft(current.current.draft, submitted, saved.draft);
          current.current.project = saved; current.current.draft = merged.draft; current.current.dirty = merged.dirty;
          setDraft(merged.draft); setDirty(merged.dirty);
          setSnapshot(old => old?.project.id === saved.id ? { ...old, project: saved } : old);
        }
        setError(old => old?.startsWith('Draft not saved.') ? null : old);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          current.current.conflict = true; setConflict(true);
          setError('This project changed while you were editing. Your inputs have not been overwritten. Choose which draft to keep.');
        } else setError(`Draft not saved. ${e instanceof Error ? e.message : 'Try again.'}`);
        throw e;
      } finally { setSaving(false); }
    };
    const promise = work(); saveFlight.current = promise;
    try { await promise; } finally { saveFlight.current = null; }
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
    actionFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'The action could not be completed.'); return false; }
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
    const result = await request<StudioProject>(`/api/projects/${encodeURIComponent(p.id)}/songs/${encodeURIComponent(songId)}/select`, { revision: p.revision });
    current.current.project = result;
    setSnapshot(old => old ? { ...old, project: result } : old); await refresh();
  });
  const generate = () => act(async () => {
    await save(); const project = current.current.project; if (!project) return;
    const input = { ...current.current.draft };
    if (!submission.current || submission.current.projectId !== project.id || !draftEqual(submission.current.input, input)) submission.current = { projectId: project.id, input, key: createRequestId() };
    const attempt = await request<MusicAttempt>(`/api/projects/${encodeURIComponent(project.id)}/music`, { idempotencyKey: submission.current.key, input });
    setSnapshot(old => old?.project.id === project.id ? { ...old, attempts: old.attempts.some(a => a.id === attempt.id) ? old.attempts : [...old.attempts, attempt] } : old);
    submission.current = null;
    setNotice('Generation queued. You can keep working or switch projects.');
    // Acceptance is already confirmed. A failed follow-up read must not masquerade as a failed submission.
    await refresh().catch(e => setConnection(e instanceof Error ? e.message : 'Waiting for the next studio update.'));
  });
  const provider = (value: Provider) => act(async () => { await request('/api/provider', { provider: value }); await refresh(); });
  const checkProvider = () => act(async () => { await request('/api/provider/check', {}); await refresh(); });
  const setup = (tool: ToolId | 'all') => act(async () => { await request(`/api/setup/${tool}`, {}); await refresh(); });
  return { overview, snapshot, draft, dirty, saving, busy, error, connection, conflict, notice, edit, save, selectProject, createProject, resolveConflict, selectSong, generate, provider, checkProvider, setup, refresh, clearError: () => setError(null) };
}
