import { useEffect, useMemo, useRef, useState } from 'react';
import type { MusicAttempt, StudioSong, ToolId, ToolStatus } from '../../../packages/core/src/contracts/studio.ts';
import { useStudio } from './useStudio.ts';
import { attemptIsActive, formatDuration, stateLabel, waveformEnvelope, agentActivity, historySong } from './studio-state.ts';

type Studio = ReturnType<typeof useStudio>;
function Icon({ name, size = 18 }: {name: 'wave' | 'plus' | 'arrow' | 'check' | 'settings' | 'folder' | 'clock' | 'alert' | 'music' | 'chevron'; size?: number}) {
  const paths = {wave: 'M3 10v4m4-9v14m5-18v22m5-17v12m4-9v6', plus:'M12 5v14M5 12h14', arrow:'M5 12h14m-5-5 5 5-5 5', check:'m5 12 4 4L19 6', settings:'M4 7h16M4 17h16M8 4v6m8 4v6', folder:'M3 6h7l2 3h9v11H3z', clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', alert:'M12 8v5m0 3h.01M12 3 2 21h20z', music:'M9 17V5l11-2v12M9 7l11-2M9 17a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm11-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z', chevron:'m9 5 7 7-7 7'};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
const descriptions: Record<ToolId, string> = { agent:'Your creative interpreter. Translates ideas into tool-ready instructions.', yue2:'Turn a description and lyrics into an original soundtrack.', comfyui:'The shared workflow engine behind video generation.', h3:'Create song-conditioned motion on the 24 fps video grid.', analysis:'Extract an estimated tempo, beat positions and waveform.' };
const toolOrder: ToolId[] = ['agent','yue2','comfyui','h3','analysis'];
const errorState = (t: ToolStatus) => ['error','reconciling'].includes(t.state);

function ProviderPanel({studio, compact = false, close}: {studio: Studio; compact?: boolean; close?: (() => void) | undefined}) {
  const p = studio.overview!.provider;
  return <section className={`provider-panel ${compact ? 'compact' : ''}`} aria-label="Creative agent configuration">
    <div className="section-top"><div><span className="eyebrow">CREATIVE AGENT</span><h3>Ideas in. Instructions out.</h3></div>{close && <button className="icon-button" onClick={close} aria-label="Close agent configuration">×</button>}</div>
    <p className="muted">Choose the agent that works with your local tools. Existing generations keep their original provider.</p>
    <div className="provider-options">{(['codex','claude'] as const).map(value => <button key={value} aria-pressed={p.provider === value} disabled={studio.busy} className={`provider-choice ${p.provider === value ? 'chosen' : ''}`} onClick={() => { if (value !== p.provider) void studio.provider(value).then(ok => { if (ok) close?.(); }); }}><span className="choice-symbol">{value === 'codex' ? '⌘' : '✳'}</span><span><strong>{value === 'codex' ? 'Codex' : 'Claude'}</strong><small>{value === 'codex' ? 'Sol 6.1' : 'Opus 5.5'}</small></span>{p.provider === value && <Icon name="check" />}</button>)}</div>
    <div className={`provider-status ${p.auth === 'sign-in-required' ? 'warning' : ''}`}><span className={`status-dot ${p.auth === 'signed-in' ? 'ready' : 'warning'}`} /><span>{p.auth === 'signed-in' ? 'Signed in' : p.auth === 'sign-in-required' ? 'Sign-in required' : 'Sign-in not checked'} · {p.detail}</span></div>
    {p.auth !== 'signed-in' && <div className="sign-in"><p>On the studio server, sign in with:</p><code>{p.signInCommand || 'No sign-in command reported yet.'}</code><p>Your own provider account stays on the server. There are no API keys to enter here.</p></div>}
    <div className="row-actions">{!p.installed && <button className="button primary" disabled={studio.busy} onClick={() => void studio.setup('agent')}>Set up agent <Icon name="arrow" /></button>}<button className="button secondary" disabled={studio.busy || !p.installed} onClick={() => void studio.checkProvider()}>Check sign-in</button><span className="micro">{p.model}</span></div>
  </section>;
}
function ToolPanel({tool, studio, number, retiring = false}: {tool: ToolStatus; studio: Studio; number: number; retiring?: boolean}) {
  const working = tool.active || ['checking','queued','installing'].includes(tool.state);
  return <article className={`tool-panel ${working ? 'working' : ''} ${errorState(tool) ? 'has-error' : ''} ${retiring ? 'retiring' : ''}`}>
    <div className="tool-heading"><span className="number">{String(number).padStart(2,'0')}</span><span className={`status-label ${errorState(tool) ? 'warning' : ''}`}>{working && <span className="pulse-dot" />}{stateLabel(tool.state)}</span></div>
    <h3>{tool.label}</h3><p className="muted tool-description">{descriptions[tool.id]}</p>
    <p className="tool-detail">{tool.detail}</p>
    <div className="tool-bottom"><button className="button secondary small" disabled={retiring || studio.busy || working || !studio.overview?.provider.installed || (tool.id !== 'agent' && studio.overview.provider.auth !== 'signed-in')} onClick={() => void studio.setup(tool.id)}>{errorState(tool) ? 'Retry setup' : tool.installed ? 'Verify setup' : 'Set up'}<Icon name="arrow" size={14} /></button><span className="micro">{tool.queued > 0 ? `${tool.queued} queued` : 'LOCAL'}</span></div>
    {(tool.log || errorState(tool)) && <details className="tool-log"><summary>Setup details</summary><pre>{tool.log || tool.detail}</pre></details>}
  </article>;
}
function SharedSetup({studio, config, agentOpen, closeAgent}: {studio: Studio; config: boolean; agentOpen: boolean; closeAgent: () => void}) {
  const overview = studio.overview!;
  const previousTools = useRef(overview.tools);
  const [retiring, setRetiring] = useState<ToolStatus[]>([]);
  useEffect(() => {
    const finished = overview.tools.filter(t => t.id !== 'agent' && t.installed && t.state === 'ready' && previousTools.current.some(old => old.id === t.id && (!old.installed || old.state !== 'ready')));
    previousTools.current = overview.tools;
    if (!finished.length) return;
    setRetiring(finished);
    const timer = setTimeout(() => setRetiring([]), 420);
    return () => { clearTimeout(timer); setRetiring([]); };
  }, [overview.tools]);
  const unfinished = overview.tools.filter(t => t.id !== 'agent' && (!t.installed || t.state !== 'ready'));
  for (const tool of retiring) if (!unfinished.some(t => t.id === tool.id)) unfinished.push(tool);
  const tools = (config ? overview.tools.filter(t => t.id !== 'agent') : unfinished).sort((a,b) => toolOrder.indexOf(a.id) - toolOrder.indexOf(b.id));
  const agentTool = overview.tools.find(t => t.id === 'agent');
  const needAgent = !overview.provider.installed || overview.provider.auth !== 'signed-in' || !!agentTool && !agentTool.installed;
  if (!config && !agentOpen && !needAgent && !tools.length) return null;
  return <section className="setup-area" aria-label="Shared tool setup">
    <div className="setup-title"><div><span className="eyebrow">{config ? 'CONFIGURATION' : 'SHARED WORKBENCH'}</span><h2>{config ? 'One toolchain. Every project.' : 'Ready your tools.'}</h2></div>{tools.some(t => !t.installed) && <button className="button secondary" disabled={studio.busy || overview.tools.some(t => ['queued','installing','checking'].includes(t.state))} onClick={() => void studio.setup('all')}>Install all <Icon name="arrow" /></button>}</div>
    {(needAgent || agentOpen || config) && <ProviderPanel studio={studio} compact close={agentOpen && !needAgent && !config ? closeAgent : undefined} />}
    {tools.length > 0 && <div className="setup-grid">{tools.map(tool => <ToolPanel key={tool.id} tool={tool} studio={studio} number={toolOrder.indexOf(tool.id) + 1} retiring={!config && retiring.some(t => t.id === tool.id)} />)}</div>}
    {config && <p className="config-note">Tools and agent configuration are shared across projects. Music, creative inputs and generation history are not. Installation and generation keep running when you leave this page.</p>}
  </section>;
}

function ProjectRail({studio}: {studio: Studio}) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const projectInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (creating) projectInput.current?.focus(); }, [creating]);
  const projects = studio.overview?.projects ?? [];
  return <aside className="project-rail" aria-label="Projects">
    <div className="rail-heading"><span className="eyebrow">YOUR PROJECTS</span><span className="count">{projects.length.toString().padStart(2,'0')}</span></div>
    <button className="new-project" onClick={() => setCreating(!creating)} aria-expanded={creating} disabled={studio.busy}><Icon name="plus" /> New project</button>
    {creating && <form className="new-project-form" onSubmit={event => { event.preventDefault(); if (name.trim()) void studio.createProject(name).then(ok => { if (ok) { setName(''); setCreating(false); } }); }}><label htmlFor="project-name">Project name</label><input ref={projectInput} id="project-name" maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Something worth making" required /><div className="row-actions"><button className="button primary small" disabled={!name.trim() || studio.busy}>Create</button><button type="button" className="text-button" onClick={() => setCreating(false)}>Cancel</button></div></form>}
    <div className="project-list">{projects.map((project, i) => <button key={project.id} className={`project-item ${project.id === studio.snapshot?.project.id ? 'selected' : ''}`} aria-current={project.id === studio.snapshot?.project.id ? 'page' : undefined} disabled={studio.busy} onClick={() => void studio.selectProject(project.id)}><span className="project-index">{String(i + 1).padStart(2,'0')}</span><span className="project-info"><strong>{project.name}</strong><small>{project.activeAttempts ? `${project.activeAttempts} generating` : `${project.songCount} ${project.songCount === 1 ? 'song' : 'songs'}`}{project.coveragePercent !== null ? ` · ${project.coveragePercent}% covered` : ''}</small></span>{project.activeAttempts > 0 ? <span className="pulse-dot" /> : <Icon name="chevron" size={14} />}</button>)}</div>
    {!projects.length && <p className="rail-empty">An idea needs a place to live. Create your first project to get started.</p>}
    <div className="rail-foot"><span className="tiny-mark">A / V</span><p>Make something<br />only you would make.</p><span className="micro">LOCAL TOOLS / OPEN POSSIBILITIES</span></div>
  </aside>;
}
function MusicForm({studio}: {studio: Studio}) {
  const p = studio.overview!.provider;
  const ready = p.auth === 'signed-in' && p.installed && ['agent', 'yue2'].every(id => studio.overview!.tools.some(t => t.id === id && t.installed && t.state === 'ready'));
  return <section className="panel compose-panel">
    <div className="panel-heading"><div><span className="eyebrow">01 / COMPOSE</span><h2>Start with a sound.</h2></div><span className="panel-icon"><Icon name="music" size={23} /></span></div>
    <p className="panel-intro">Describe the feeling, not the machinery. Your agent handles the technical translation.</p>
    <form onSubmit={event => { event.preventDefault(); void studio.generate(); }}>
      <fieldset disabled={studio.busy}>
        <label htmlFor="music-prompt">Music description <span>REQUIRED</span></label>
        <textarea id="music-prompt" className="music-prompt" value={studio.draft.musicPrompt} onChange={e => studio.edit({...studio.draft, musicPrompt:e.target.value})} placeholder="90s French electronica with dubstep beats and lyrics about programming. Warm synths, playful energy, a late-night build finally coming together…" required />
        <div className="field-heading"><label htmlFor="lyrics">Lyrics</label><span className="optional">OPTIONAL</span></div>
        <textarea id="lyrics" className="lyrics-input" value={studio.draft.lyrics} onChange={e => studio.edit({...studio.draft, lyrics:e.target.value})} placeholder="Add your own words, or leave room for the agent to write." />
        <details className="style-details"><summary>Project style <span className="optional">OPTIONAL</span></summary><label htmlFor="project-style" className="sr-only">Persistent project style</label><textarea id="project-style" value={studio.draft.style} onChange={e => studio.edit({...studio.draft, style:e.target.value})} placeholder="The overall character of your project. Kept alongside each generation’s individual prompt." /><p className="muted small-copy">Shared creative direction for this project, included with the agent’s inputs.</p></details>
      </fieldset>
      <div className="compose-footer"><div className="save-status" role="status"><span className={`status-dot ${studio.conflict ? 'warning' : studio.dirty ? '' : 'ready'}`} />{studio.conflict ? 'Draft conflict' : studio.saving ? 'Saving…' : studio.dirty ? 'Unsaved changes' : 'Draft saved'}{studio.dirty && !studio.saving && !studio.conflict && <button type="button" className="text-button" disabled={studio.busy} onClick={() => void studio.save().catch(() => {})}>Save</button>}</div><button className="button primary generate" disabled={studio.busy || !ready || !studio.draft.musicPrompt.trim() || studio.conflict || !!studio.connection}>Generate music <Icon name="arrow" /></button></div>
      {!ready && <p className="inline-advisory"><Icon name="alert" size={15} /> Set up your agent and YuE2, then check sign-in to start generating.</p>}
      <p className="generation-note">New generations get new seeds. Your exact inputs and the agent’s work stay in the project history.</p>
    </form>
  </section>;
}
function Waveform({song}: {song: StudioSong}) {
  const peaks = useMemo(() => waveformEnvelope(song.analysis.peaks, 240), [song.analysis.peaks]);
  const beats = song.analysis.sampleIndices;
  const durationSamples = Number(song.sampleCount);
  return <div className="waveform-wrap">
    {peaks.length ? <svg className="waveform" viewBox="0 0 960 130" preserveAspectRatio="none" role="img" aria-label={`Audio waveform with ${beats.length} estimated beat markers`}><line x1="0" x2="960" y1="65" y2="65" className="wave-axis" />{beats.length <= 1000 && beats.map((sample, i) => { const x = Number(sample) / durationSamples * 960; return Number.isFinite(x) && x >= 0 && x <= 960 ? <line key={`${sample}-${i}`} x1={x} x2={x} y1="8" y2="122" className="beat-line" /> : null; })}{peaks.map((peak, i) => <rect key={i} x={i / peaks.length * 960} y={65 - Math.max(0.7, peak * 48)} width={Math.max(1, 960 / peaks.length - 1.7)} height={Math.max(1.4, peak * 96)} rx="0.6" className="wave-bar" />)}</svg> : <div className="waveform-unavailable"><Icon name="wave" size={36} /><span>{song.analysis.state === 'pending' ? 'Analysing your soundtrack…' : 'Waveform not available'}</span></div>}
    <div className="wave-ruler"><span>0:00</span><span>{formatDuration(song.durationSeconds / 2)}</span><span>{formatDuration(song.durationSeconds)}</span></div>
  </div>;
}
function AttemptPlaceholder({attempt}: {attempt: MusicAttempt}) {
  return <div className={`attempt-placeholder ${attemptIsActive(attempt.state) ? 'working' : 'has-error'}`}><div className="attempt-symbol"><Icon name={attemptIsActive(attempt.state) ? 'wave' : 'alert'} size={22} /></div><div><strong>{stateLabel(attempt.state)}</strong><p>{attempt.stage || (attempt.state === 'queued' ? 'Your music is in the queue.' : 'Waiting for the next update.')}</p>{attempt.error && <p className="warning">{attempt.error}</p>}<span className="micro">{attempt.provider.toUpperCase()} / ATTEMPT {attempt.sequence.toString().padStart(2,'0')}</span></div></div>;
}
function Soundtrack({studio}: {studio: Studio}) {
  const songs = studio.snapshot!.songs;
  const selected = songs.find(s => s.id === studio.snapshot!.project.selectedSongId);
  const pending = studio.snapshot!.attempts.filter(a => attemptIsActive(a.state) || a.state === 'reconciling');
  return <section className="panel soundtrack-panel"><div className="panel-heading"><div><span className="eyebrow">02 / LISTEN</span><h2>Your soundtrack.</h2></div><span className="count">{songs.length.toString().padStart(2,'0')}</span></div>
    {selected ? <div className="selected-song"><div className="song-name-row"><div><span className="selected-tag"><span className="status-dot ready" /> SELECTED SONG</span><h3>{selected.title}</h3></div><span className="duration">{formatDuration(selected.durationSeconds)}</span></div><Waveform song={selected} /><audio key={selected.assetId} controls preload="metadata" src={`/api/assets/${encodeURIComponent(selected.assetId)}`} aria-label={`Listen to ${selected.title}`} /><div className="audio-stats"><span><strong>{selected.analysis.estimatedBpm !== null ? selected.analysis.estimatedBpm.toFixed(1) : '—'}</strong> EST. BPM</span><span><strong>{selected.sampleRate / 1000}</strong> kHz</span><span><strong>{selected.channels === 2 ? 'Stereo' : `${selected.channels} ch`}</strong> SOURCE AUDIO</span></div>{selected.truncated && <p className="inline-advisory"><Icon name="alert" size={15} /> This generation reached a token limit and may end early.</p>}{selected.analysis.error && <p className="inline-advisory"><Icon name="alert" size={15} /> Analysis: {selected.analysis.error}</p>}</div> : <div className="sound-empty"><div className="empty-record"><span /><span /><Icon name="wave" size={32} /></div><h3>{songs.length ? 'Choose a soundtrack.' : 'Your first track starts here.'}</h3><p>{songs.length ? 'Select a generated song below to hear it.' : 'Write an idea on the left. When it becomes a song, you can listen, compare takes and find your direction here.'}</p><span className="micro">NO PRESETS. YOUR IDEA.</span></div>}
    {pending.map(attempt => <AttemptPlaceholder key={attempt.id} attempt={attempt} />)}
    {songs.length > 0 && <div className="song-library"><div className="list-heading"><span className="eyebrow">GENERATED SONGS</span><span className="micro">Select a take to listen</span></div>{[...songs].reverse().map((song) => <button disabled={studio.busy || studio.conflict} key={song.id} className={`song-row ${selected?.id === song.id ? 'is-selected' : ''}`} onClick={() => { if (selected?.id !== song.id) void studio.selectSong(song.id); }} aria-pressed={selected?.id === song.id}><span className="song-mini-icon"><Icon name={selected?.id === song.id ? 'wave' : 'music'} /></span><span className="song-row-copy"><strong>{song.title}</strong><small>{new Date(song.createdAt).toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}{song.truncated ? ' · Token limit reached' : ''}</small></span><span className="micro">{formatDuration(song.durationSeconds)}</span>{selected?.id === song.id && <Icon name="check" size={16} />}</button>)}</div>}
  </section>;
}
function HistoryOutput({attempt, songs}: {attempt: MusicAttempt; songs: StudioSong[]}) {
  const song = historySong(attempt, songs);
  if (!song) return null;
  return <section className="history-output" aria-label="Generated music output">
    <div className="history-output-heading"><div><span className="eyebrow">GENERATED OUTPUT</span><strong>{song.title}</strong></div><span className="duration">{formatDuration(song.durationSeconds)}</span></div>
    <Waveform song={song} />
  </section>;
}
function History({studio}: {studio: Studio}) {
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const restoreInputs = (attempt: MusicAttempt) => { studio.edit({...attempt.input}); setRestoreId(null); document.getElementById('music-prompt')?.focus(); };
  const attempts = [...studio.snapshot!.attempts].sort((a,b) => b.sequence - a.sequence);
  return <section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">THE CREATIVE RECORD</span><h2>Nothing behind the curtain.</h2></div><Icon name="clock" size={23} /></div><p className="panel-intro">Your ideas, the agent’s choices and the tools that made them real.</p>
    {!attempts.length ? <div className="history-empty"><span className="history-line" /><span>Your first generation will begin the story.</span></div> : <div className="history-list">{attempts.map(attempt => <details key={attempt.id} className="history-entry"><summary><span className={`history-node ${attempt.state === 'succeeded' ? 'complete' : attemptIsActive(attempt.state) ? 'active' : 'attention'}`} /><span className="history-summary"><strong>Music generation <span className="micro">#{String(attempt.sequence).padStart(2,'0')}</span></strong><small>{attempt.provider === 'codex' ? 'Codex' : 'Claude'} → YuE2 · {new Date(attempt.createdAt).toLocaleString()}</small></span><span className={`history-state ${attempt.state === 'failed' || attempt.state === 'reconciling' ? 'warning' : ''}`}>{stateLabel(attempt.state)}</span><Icon name="chevron" size={15} /></summary><div className="history-body"><HistoryOutput attempt={attempt} songs={studio.snapshot!.songs} /><div className="history-inputs"><h4>Your inputs</h4><p className="prompt-text">{attempt.input.musicPrompt}</p>{attempt.input.lyrics && <details><summary>Lyrics</summary><pre>{attempt.input.lyrics}</pre></details>}{attempt.input.style && <details><summary>Project style</summary><pre>{attempt.input.style}</pre></details>}</div><dl className="provenance"><div><dt>Provider / model</dt><dd>{attempt.provider} / {attempt.model}</dd></div><div><dt>Generation tool</dt><dd>YuE2</dd></div><div><dt>Attempt</dt><dd>{attempt.id}</dd></div><div><dt>Native call</dt><dd>{attempt.nativeCallId || 'Not submitted yet'}</dd></div></dl><details><summary>Recorded seeds</summary><pre>{Object.keys(attempt.seeds).length ? JSON.stringify(attempt.seeds,null,2) : 'Seeds have not been recorded yet.'}</pre></details><details><summary>Agent work, tool settings & logs</summary><p className="small-copy muted">The actual details reported for this generation. Long records can be scrolled.</p><pre>{Object.keys(attempt.details).length ? JSON.stringify(attempt.details,null,2) : 'No details have been reported yet.'}</pre></details>{attempt.error && <p className="error-copy">{attempt.error}</p>}<button className="button secondary small" disabled={studio.busy} onClick={() => { if (studio.dirty) setRestoreId(attempt.id); else restoreInputs(attempt); }}>Use these inputs <Icon name="arrow" size={14} /></button><span className="micro reuse-note">A new generation uses new seeds.</span>{restoreId === attempt.id && <div className="restore-confirmation" role="alert"><p>Replace your unsaved draft with this generation’s inputs?</p><div className="row-actions"><button className="button secondary small" disabled={studio.busy} onClick={() => restoreInputs(attempt)}>Replace draft</button><button className="text-button" onClick={() => setRestoreId(null)}>Keep editing</button></div></div>}</div></details>)}</div>}
  </section>;
}
export function App() {
  const studio = useStudio(); const [view, setView] = useState<'projects'|'config'>('projects'); const [agentOpen, setAgentOpen] = useState(false);
  const selected = studio.snapshot?.project;
  const agentTool = studio.overview?.tools.find(tool => tool.id === 'agent');
  const activity = studio.overview ? agentActivity(studio.overview.tools) : null;
  return <><a className="skip-link" href="#workspace">Skip to workspace</a><header className="topbar"><a className="brand" href="#" onClick={event => {event.preventDefault();setView('projects');}} aria-label="Assembly studio home"><span className="brand-symbol"><i /><i /><i /></span><span>ASSEMBLY<small>MUSIC VIDEO STUDIO</small></span></a><nav aria-label="Main navigation"><button className={view === 'projects' ? 'nav-active' : ''} onClick={() => setView('projects')} aria-current={view === 'projects' ? 'page' : undefined}><Icon name="folder" />Projects</button><button className={view === 'config' ? 'nav-active' : ''} onClick={() => setView('config')} aria-current={view === 'config' ? 'page' : undefined}><Icon name="settings" />Config</button></nav><div className="tool-indicators" aria-label="Shared tool status">{studio.overview && <><div className="agent-indicator-wrap"><button className={`tool-indicator ${studio.overview.provider.auth === 'sign-in-required' ? 'indicator-error' : ''}`} onClick={() => setAgentOpen(!agentOpen)} aria-expanded={agentOpen} aria-describedby="provider-tip"><span className={`status-dot ${studio.overview.provider.auth !== 'signed-in' ? 'warning' : agentTool?.active ? 'active' : 'ready'}`} /><strong>{studio.overview.provider.provider === 'codex' ? 'Codex' : 'Claude'}</strong>{activity && <small className="agent-activity">{activity}</small>}<Icon name="chevron" size={11} /></button><div className="provider-tooltip" id="provider-tip" role="tooltip"><span>Selected provider: {studio.overview.provider.provider === 'codex' ? 'Codex' : 'Claude'}. {studio.overview.provider.detail}</span>{activity && <p>Shared agent work: {activity}</p>}{studio.overview.provider.auth !== 'signed-in' && <code>{studio.overview.provider.signInCommand}</code>}</div></div>{studio.overview.tools.filter(t => t.id !== 'agent' && t.installed).map(t => <button key={t.id} className={`tool-indicator ${errorState(t) ? 'indicator-error' : ''}`} onClick={() => setView('config')} title={`${t.label}: ${t.detail}`}><span className={`status-dot ${t.active ? 'active' : errorState(t) ? 'warning' : 'idle'}`} /><span>{t.label}</span><small>{t.active ? 'Active' : 'Idle'}{t.queued > 0 ? ` · ${t.queued} queued` : ''}</small></button>)}</>}</div></header>
    <div className="app-shell"><ProjectRail studio={studio} /><main id="workspace" tabIndex={-1}>
      {studio.connection && <div className="banner warning" role="status"><Icon name="alert" /><span>{studio.connection} Changes stay in this page until saved.</span></div>}
      {studio.error && <div className="banner error" role="alert"><Icon name="alert" /><span>{studio.error}</span>{!studio.conflict && <button className="icon-button" onClick={studio.clearError} aria-label="Dismiss error">×</button>}</div>}
      {studio.conflict && <div className="conflict-actions"><button className="button secondary" disabled={studio.busy} onClick={() => void studio.resolveConflict(true)}>Save my draft over server version</button><button className="button secondary" disabled={studio.busy} onClick={() => void studio.resolveConflict(false)}>Discard my draft and load saved</button></div>}
      {studio.notice && <div className="banner success" role="status"><Icon name="check" /><span>{studio.notice}</span></div>}
      {studio.overview?.warnings.map((warning,i) => <div key={i} className="banner warning"><Icon name="alert" /><span>{warning}</span></div>)}
      {!studio.overview ? <div className="connecting"><span className="eyebrow">CONNECTING TO YOUR WORKBENCH</span><h1>Good things start with a signal.</h1><p>{studio.connection ? 'The server is not reachable yet. We’ll keep trying.' : 'Reading your projects and local tool status…'}</p><div className="connecting-track" /></div> : <><SharedSetup studio={studio} config={view === 'config'} agentOpen={agentOpen} closeAgent={() => setAgentOpen(false)} />{view === 'projects' && (selected ? <><section className="workspace-title"><div><div className="eyebrow breadcrumbs">PROJECT / <span>SOUNDTRACK</span></div><h1>{selected.name}</h1><p>Every good picture starts with something you can feel.</p></div><div className="workspace-stamp"><span>WORKSPACE</span><strong>01 <i>/</i> SOUND</strong></div></section><div className="studio-grid"><MusicForm studio={studio} /><Soundtrack studio={studio} /></div><div className="stage-note"><span className="stage-line" /><Icon name="wave" /><p><strong>Sound first. Pictures next.</strong> This studio stage is for creating and choosing your soundtrack. Visual sequencing and export follow in the next stage.</p><span className="micro">BUILD IN PROGRESS</span></div><History studio={studio} /></> : <section className="welcome"><span className="eyebrow">AN IDEA IS ENOUGH TO BEGIN</span><h1>From a feeling<br />to a first take.</h1><p>A creative workbench for music and moving images.<br />Start a project, describe your sound, and let your tools take it from there.</p><div className="welcome-rule" /><span className="welcome-instruction"><Icon name="plus" /> Create a project in the sidebar to begin.</span></section>)}</>}
      <footer className="workspace-footer"><span>ASSEMBLY / LOCAL CREATIVE WORKBENCH</span><span>YOUR PROJECTS. YOUR TOOLS. YOUR DIRECTION.</span></footer>
    </main></div></>;
}
