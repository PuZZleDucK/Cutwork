import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MusicAttempt, StudioSong, ToolId, ToolStatus } from '../../../packages/core/src/contracts/studio.ts';
import { useStudio } from './useStudio.ts';
import {activeArtifacts} from './artifact-lifecycle.ts';
import {ArtifactControls} from './ArtifactControls.tsx';
import {PromptTemplateSettings} from './PromptTemplateSettings.tsx';
import { selectSongFromList } from './song-selection.ts';
import { VideoStudio } from './VideoStudio.tsx';
import {creativeHistoryRows} from './CreativeHistory.tsx';
import {WorkspaceNavigation,type WorkspacePanel} from './WorkspaceNavigation.tsx';
import { DebugControl } from './DebugControl.tsx';
import { GenerationActions } from './GenerationActions.tsx';
import { orderedToolIndicators, setupClasses, toolIsReady, toggleToolConfiguration } from './feedback-state.ts';
import { NoticeCenter, type Notification } from './NoticeCenter.tsx';
import { overviewNotice, workspaceNotices } from './notifications.ts';
import { attemptIsActive, formatDuration, stateLabel, waveformEnvelope, agentActivity } from './studio-state.ts';

type Studio = ReturnType<typeof useStudio>;
function Icon({ name, size = 18 }: {name: 'wave' | 'plus' | 'arrow' | 'check' | 'settings' | 'folder' | 'clock' | 'alert' | 'music' | 'chevron'; size?: number}) {
  const paths = {wave: 'M3 10v4m4-9v14m5-18v22m5-17v12m4-9v6', plus:'M12 5v14M5 12h14', arrow:'M5 12h14m-5-5 5 5-5 5', check:'m5 12 4 4L19 6', settings:'M4 7h16M4 17h16M8 4v6m8 4v6', folder:'M3 6h7l2 3h9v11H3z', clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', alert:'M12 8v5m0 3h.01M12 3 2 21h20z', music:'M9 17V5l11-2v12M9 7l11-2M9 17a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm11-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z', chevron:'m9 5 7 7-7 7'};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
const descriptions: Record<ToolId, string> = { agent:'Your creative interpreter. Translates ideas into tool-ready instructions.', yue2:'Turn a description and lyrics into an original soundtrack.', comfyui:'The shared workflow engine behind video generation.', h3:'Create song-conditioned motion on the 24 fps video grid.', analysis:'Extract an estimated tempo, beat positions and waveform.' };
const toolOrder: ToolId[] = ['agent','yue2','comfyui','h3','analysis'];
const errorState = (t: ToolStatus) => ['error','reconciling'].includes(t.state);

function ProviderPanel({studio, compact = false, close,onDebugOpen}: {studio: Studio; compact?: boolean; close?: (() => void) | undefined;onDebugOpen?:(tool:ToolId,open:boolean)=>void}) {
  const p = studio.overview!.provider;
  const tool=studio.overview!.tools.find(t=>t.id==='agent');
  const ready=toolIsReady(tool)&&p.installed&&p.auth==='signed-in';
  return <section className={`provider-panel ${compact ? 'compact' : ''} ${setupClasses(tool,ready)}`} data-setup-tool="agent" aria-label="Creative agent configuration">
    <div className="section-top"><div><span className="eyebrow">CREATIVE AGENT</span><h3>Ideas in. Instructions out.</h3></div>{close && <button className="icon-button" onClick={close} aria-label="Close agent configuration">×</button>}</div>
    <p className="muted">Choose the agent that works with your local tools. Existing generations keep their original provider.</p>
    <div className="provider-options">{(['codex','claude'] as const).map(value => <button key={value} aria-pressed={p.provider === value} disabled={studio.busy} className={`provider-choice ${p.provider === value ? 'chosen' : ''}`} onClick={() => { if (value !== p.provider) void studio.provider(value).then(ok => { if (ok) close?.(); }); }}><span className="choice-symbol">{value === 'codex' ? '⌘' : '✳'}</span><span><strong>{value === 'codex' ? 'Codex' : 'Claude'}</strong><small>{value === 'codex' ? 'Sol 6.1' : 'Opus 5.5'}</small></span>{p.provider === value && <Icon name="check" />}</button>)}</div>
    <div className={`provider-status ${p.auth === 'sign-in-required' ? 'warning' : ''}`}><span className={`status-dot ${p.auth === 'signed-in' ? 'ready' : 'warning'}`} /><span>{p.auth === 'signed-in' ? 'Signed in' : p.auth === 'sign-in-required' ? 'Sign-in required' : 'Sign-in not checked'} · {p.detail}</span></div>
    {p.auth !== 'signed-in' && <div className="sign-in"><p>On the studio server, sign in with:</p><code>{p.signInCommand || 'No sign-in command reported yet.'}</code><p>Your own provider account stays on the server. There are no API keys to enter here.</p></div>}
    <div className="row-actions">{!p.installed && <button className="button primary" disabled={studio.busy || !!tool && ['queued','installing','checking'].includes(tool.state)} onClick={() => void studio.setup('agent')}>Set up agent <Icon name="arrow" /></button>}<button className="button secondary" disabled={studio.busy || !p.installed} onClick={() => void studio.checkProvider()}>Check sign-in</button><span className="micro">{p.model}</span></div>
    {studio.overview?.tools.find(t=>t.id==='agent')&&<DebugControl tool={studio.overview.tools.find(t=>t.id==='agent')!} studio={studio} onOpenChange={onDebugOpen}/>}
  </section>;
}
function ToolPanel({tool, studio, number,onDebugOpen}: {tool: ToolStatus; studio: Studio; number: number;onDebugOpen?:(tool:ToolId,open:boolean)=>void}) {
  const working = tool.active || ['checking','queued','installing'].includes(tool.state);
  return <article className={`tool-panel ${setupClasses(tool)} ${errorState(tool) ? 'has-error' : ''}`} data-setup-tool={tool.id}>
    <div className="tool-heading"><span className="number">{String(number).padStart(2,'0')}</span><span className={`status-label ${errorState(tool) ? 'warning' : ''}`}>{tool.state==='installing' && <span className="pulse-dot" />}{stateLabel(tool.state)}</span></div>
    <h3>{tool.label}</h3><p className="muted tool-description">{descriptions[tool.id]}</p>
    <p className="tool-detail">{tool.detail}</p>
    <div className="tool-bottom"><button className="button secondary small" disabled={studio.busy || working || !studio.overview?.provider.installed || (tool.id !== 'agent' && studio.overview.provider.auth !== 'signed-in')} onClick={() => void studio.setup(tool.id)}>{errorState(tool) ? 'Retry setup' : tool.installed ? 'Verify setup' : 'Set up'}<Icon name="arrow" size={14} /></button><span className="micro">{tool.queued > 0 ? `${tool.queued} queued` : 'LOCAL'}</span></div>
    <DebugControl tool={tool} studio={studio} onOpenChange={onDebugOpen}/>
    {(tool.log || errorState(tool)) && <details className="tool-log"><summary>Setup details</summary><pre>{tool.log || tool.detail}</pre></details>}
  </article>;
}
function SharedSetup({studio, config, agentOpen, closeAgent}: {studio: Studio; config: boolean; agentOpen: boolean; closeAgent: () => void}) {
  const overview = studio.overview!;
  const [debugOpen,setDebugOpen]=useState<Set<ToolId>>(()=>new Set());
  const onDebugOpen=useCallback((tool:ToolId,open:boolean)=>setDebugOpen(before=>{if(before.has(tool)===open)return before;const next=new Set(before);if(open)next.add(tool);else next.delete(tool);return next;}),[]);
  const agentTool = overview.tools.find(t => t.id === 'agent');
  const needAgent = !overview.provider.installed || overview.provider.auth !== 'signed-in' || !toolIsReady(agentTool);
  const allReady = !needAgent && toolOrder.every(id=>toolIsReady(overview.tools.find(t=>t.id===id)));
  const showAll = config || !allReady || debugOpen.size>0;
  const tools = showAll ? overview.tools.filter(t=>t.id!=='agent').sort((a,b)=>toolOrder.indexOf(a.id)-toolOrder.indexOf(b.id)) : [];
  if (!showAll && !agentOpen) return null;
  return <section id="shared-tool-setup" className="setup-area" aria-label="Shared tool setup">
    <div className="setup-title"><div><span className="eyebrow">{config ? 'CONFIGURATION' : 'SHARED WORKBENCH'}</span><h2>{config ? 'One toolchain. Every project.' : 'Ready your tools.'}</h2></div>{tools.some(t => !t.installed) && <button className="button secondary" disabled={studio.busy || overview.tools.some(t => ['queued','installing','checking'].includes(t.state))} onClick={() => void studio.setup('all')}>Install all <Icon name="arrow" /></button>}</div>
    <ProviderPanel studio={studio} compact onDebugOpen={onDebugOpen} close={agentOpen && !showAll ? closeAgent : undefined} />
    {tools.length > 0 && <div className="setup-grid">{tools.map(tool => <ToolPanel key={tool.id} tool={tool} studio={studio} number={toolOrder.indexOf(tool.id) + 1} onDebugOpen={onDebugOpen} />)}</div>}
    {config && <p className="config-note">Tools and agent configuration are shared across projects. Music, creative inputs and generation history are not. Installation and generation keep running when you leave this page.</p>}
  </section>;
}

function ProjectRail({studio}: {studio: Studio}) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const projectInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (creating) projectInput.current?.focus(); }, [creating]);
  const projects = studio.overview?.projects ?? [];
  return <aside className="project-switcher" aria-label="Projects">
    <label htmlFor="current-project">PROJECT</label>
    <select id="current-project" aria-label="Current project" value={studio.snapshot?.project.id??''} disabled={studio.busy} onChange={e=>void studio.selectProject(e.target.value)}>
      {!studio.snapshot&&<option value="">Select a project</option>}
      {projects.map(project=><option key={project.id} value={project.id}>{project.name} · {project.activeAttempts?`${project.activeAttempts} generating`:project.coveragePercent!==null?`${project.coveragePercent.toFixed(1)}% covered`:`${project.songCount} songs`}</option>)}
    </select>
    <button className="button secondary small" onClick={()=>setCreating(!creating)} aria-expanded={creating} aria-label="New project" title="New project" disabled={studio.busy}><Icon name="plus" size={14}/><span className="new-project-label">New project</span></button>
    {creating&&<form className="new-project-form" onSubmit={event=>{event.preventDefault();if(name.trim())void studio.createProject(name).then(ok=>{if(ok){setName('');setCreating(false);}});}}><label htmlFor="project-name">Project name</label><input ref={projectInput} id="project-name" maxLength={120} value={name} onChange={event=>setName(event.target.value)} placeholder="Name your project" required/><button className="button primary small" disabled={!name.trim()||studio.busy}>Create</button><button type="button" className="button secondary small" onClick={()=>setCreating(false)}>Cancel</button></form>}
  </aside>;
}
function DraftConflictActions({studio}: {studio: Studio}) {
  return <><button type="button" className="button secondary small" disabled={studio.busy} onClick={() => void studio.resolveConflict(true)}>Save my draft over server version</button><button type="button" className="button secondary small" disabled={studio.busy} onClick={() => void studio.resolveConflict(false)}>Discard my draft and load saved</button></>;
}
function MusicForm({studio}: {studio: Studio}) {
  const selected=activeArtifacts(studio.snapshot!,'song',studio.snapshot!.songs).find(song=>song.id===studio.snapshot!.project.selectedSongId);
  const selectedAttempt=selected?studio.snapshot!.attempts.find(attempt=>attempt.id===selected.attemptId):undefined;
  const p = studio.overview!.provider;
  const ready = p.auth === 'signed-in' && p.installed && ['agent', 'yue2'].every(id => studio.overview!.tools.some(t => t.id === id && t.installed && t.state === 'ready'));
  return <section className="panel compose-panel">
    <div className="panel-heading"><div><span className="eyebrow">01 / COMPOSE</span><h2>Generate Music</h2></div><span className="panel-icon"><Icon name="music" size={23} /></span></div>
    <p className="panel-intro">Describe the feeling, not the machinery.</p>
    <form onSubmit={event => { event.preventDefault(); void studio.generate(); }}>
      <fieldset disabled={studio.busy}>
        <label htmlFor="music-prompt">Music description <span>REQUIRED</span></label>
        <textarea id="music-prompt" className="music-prompt" value={studio.draft.musicPrompt} onChange={e => studio.edit({...studio.draft, musicPrompt:e.target.value})} placeholder="90s French electronica with dubstep beats and lyrics about programming. Warm synths, playful energy, a late-night build finally coming together…" required />
        <div className="field-heading"><label htmlFor="lyrics">Lyrics</label><span className="optional">OPTIONAL</span></div>
        <textarea id="lyrics" className="lyrics-input" value={studio.draft.lyrics} onChange={e => studio.edit({...studio.draft, lyrics:e.target.value})} placeholder="Add your own words, or leave room for the agent to write." />
      </fieldset>
      <div className="compose-footer"><div className="save-status" role="status"><span className={`status-dot ${studio.conflict ? 'warning' : studio.dirty ? '' : 'ready'}`} />{studio.conflict ? 'Draft conflict' : studio.saving ? 'Saving…' : studio.dirty ? 'Unsaved changes' : 'Draft saved'}{studio.conflict && <DraftConflictActions studio={studio}/>} {studio.dirty && !studio.saving && !studio.conflict && <button type="button" className="button secondary small" disabled={studio.busy} onClick={() => void studio.save().catch(() => {})}>Save</button>}</div><div className="music-generation-actions"><button className="button primary generate" disabled={studio.busy || !ready || !studio.draft.musicPrompt.trim() || studio.conflict || !!studio.connection}>Generate music <Icon name="arrow" /></button>{selectedAttempt&&<GenerationActions studio={studio} attempt={selectedAttempt} onRestore={()=>studio.restoreMusic(selectedAttempt.id)} compact reuseLabel="← Reuse parameters"/>}</div></div>
      {!ready && <p className="inline-advisory"><Icon name="alert" size={15} /> Set up your agent and YuE2, then check sign-in to start generating.</p>}
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
function AttemptPlaceholder({attempt,studio}: {attempt: MusicAttempt;studio:Studio}) {
  return <div className={`attempt-placeholder ${attemptIsActive(attempt.state) ? 'working' : 'has-error'}`}><div className="attempt-symbol"><Icon name={attemptIsActive(attempt.state) ? 'wave' : 'alert'} size={22} /></div><div><strong>{stateLabel(attempt.state)}</strong><p>{attempt.stage || (attempt.state === 'queued' ? 'Your music is in the queue.' : 'Waiting for the next update.')}</p>{attempt.error && <details><summary className="warning">Failure details</summary><pre>{attempt.error}</pre></details>}<span className="micro">{attempt.provider.toUpperCase()} / ATTEMPT {attempt.sequence.toString().padStart(2,'0')}</span><GenerationActions studio={studio} attempt={attempt} onRestore={()=>studio.restoreMusic(attempt.id)} compact/></div></div>;
}
function Soundtrack({studio}: {studio: Studio}) {
  const songs = activeArtifacts(studio.snapshot!,'song',studio.snapshot!.songs);
  const selected = songs.find(s => s.id === studio.snapshot!.project.selectedSongId);
  const pending = studio.snapshot!.attempts.filter(a => a.state!=='succeeded'&&!a.placeholderDiscardedAt);
  return <section className="panel soundtrack-panel"><div className="panel-heading"><div><span className="eyebrow">02 / LISTEN</span><h2>Soundtracks</h2></div><span className="count">{songs.length.toString().padStart(2,'0')}</span></div>
    {songs.length > 0 && <div className="song-library"><div className="song-list" role="group" aria-label="Generated songs">{[...songs].reverse().map(song=><div className="song-library-item" key={song.id}><button type="button" id={`song-choice-${song.id}`} disabled={studio.busy || studio.conflict} className={`song-row ${selected?.id===song.id?'is-selected':''}`} title={song.title} onClick={event=>{if(selected?.id!==song.id)void selectSongFromList(event.currentTarget,()=>studio.selectSong(song.id));}} aria-pressed={selected?.id===song.id}><span className="song-mini-icon"><Icon name={selected?.id===song.id?'wave':'music'}/></span><span className="song-row-copy"><strong>{song.title}</strong>{song.truncated&&<small>Token limit reached</small>}</span><span className="song-row-timing"><span>{formatDuration(song.durationSeconds)}</span><span title="Estimated tempo">{song.analysis.estimatedBpm?.toFixed(1)??'—'} BPM</span></span></button><ArtifactControls studio={studio} refValue={{kind:'song',id:song.id}} title={song.title} deleteLabel="Delete"/></div>)}</div></div>}
    {selected ? <div className="selected-song"><div className="song-name-row"><div><span className="selected-tag"><span className="status-dot ready" /> SELECTED SONG</span><h3 title={selected.title}>{selected.title}</h3></div><span className="duration">{formatDuration(selected.durationSeconds)}</span></div><Waveform song={selected} /><audio key={selected.assetId} controls preload="metadata" src={`/api/assets/${encodeURIComponent(selected.assetId)}`} aria-label={`Listen to ${selected.title}`} /><div className="audio-stats"><span><strong>{selected.analysis.estimatedBpm !== null ? selected.analysis.estimatedBpm.toFixed(1) : '—'}</strong> EST. BPM</span><span><strong>{selected.sampleRate / 1000}</strong> kHz</span><span><strong>{selected.channels === 2 ? 'Stereo' : `${selected.channels} ch`}</strong> SOURCE AUDIO</span></div></div> : <div className="sound-empty"><div className="empty-record"><span /><span /><Icon name="wave" size={32} /></div><h3>{songs.length ? 'Choose a soundtrack.' : 'Your first track starts here.'}</h3><p>{songs.length ? 'Select a generated song above to hear it.' : 'Write an idea on the left. When it becomes a song, you can listen, compare takes and find your direction here.'}</p><span className="micro">NO PRESETS. YOUR IDEA.</span></div>}
    {pending.map(attempt => <AttemptPlaceholder key={attempt.id} attempt={attempt} studio={studio} />)}

  </section>;
}
function ProjectWorkspace({studio,panel,setPanel}:{studio:Studio;panel:WorkspacePanel;setPanel:(panel:WorkspacePanel)=>void}) {
 const snapshot=studio.snapshot!,project=snapshot.project;
 const songs=activeArtifacts(snapshot,'song',snapshot.songs),clips=activeArtifacts(snapshot,'clip',snapshot.clips);
 const counts={music:songs.length,video:clips.length,archive:(snapshot.artifactLifecycles??[]).filter(record=>record.state!=='active').length,history:creativeHistoryRows(snapshot).length};
 return <><div className="workspace-header"><WorkspaceNavigation panel={panel} onSelect={setPanel} counts={counts}/><div className="workspace-title"><h1>{project.name}</h1><span className="micro">24 FPS / LOCAL WORKSPACE</span></div></div>
  <VideoStudio studio={studio} panel={panel} onRequestPanel={setPanel} musicSection={<div className="studio-grid"><MusicForm studio={studio}/><Soundtrack studio={studio}/></div>}/>

 </>;
}
export function App() {
  const studio = useStudio(); const [view, setView] = useState<'projects'|'config'>('projects'); const [agentOpen, setAgentOpen] = useState(false);
  const selected = studio.snapshot?.project;
  const [panel,setPanel]=useState<WorkspacePanel>('generate');
  const song = studio.snapshot?.songs.find(s => s.id === selected?.selectedSongId);
  const notices: Notification[] = [...(studio.overview?.warnings ?? []).map(overviewNotice).filter(n=>n!==null), ...workspaceNotices({projectId:selected?.id ?? null,conflict:studio.conflict,error:studio.error,errorVersion:studio.errorVersion,notice:studio.notice,messageVersion:studio.messageVersion,connection:studio.connection})];
  const conflictNotice = notices.find(n => n.id.startsWith('conflict:'));
  if (conflictNotice) conflictNotice.actions = <DraftConflictActions studio={studio}/>;
  if (song?.truncated) notices.push({id:`song:${song.id}:truncated`,kind:'error',text:'This generation reached a token limit and may end early.'});
  if (song?.analysis.error) notices.push({id:`song:${song.id}:analysis:${song.analysis.error}`,kind:'error',text:`Analysis: ${song.analysis.error}`});
  const agentTool = studio.overview?.tools.find(tool => tool.id === 'agent');
  const activity = studio.overview ? !studio.overview.provider.installed ? stateLabel(agentTool?.state??'missing') : studio.overview.provider.auth==='sign-in-required' ? 'Sign-in required' : toolIsReady(agentTool) ? agentActivity(studio.overview.tools) : stateLabel(agentTool?.state??'checking') : null;
  return <><a className="skip-link" href="#workspace">Skip to workspace</a><header className="topbar"><a className="brand" href="#" onClick={event => {event.preventDefault();setView('projects');}} aria-label="Cutwork studio home"><img className="brand-mark" src="/cutwork-mark.svg" width="38" height="38" alt="" aria-hidden="true"/><span>CUTWORK<small>MUSIC VIDEO STUDIO</small></span></a><nav aria-label="Main navigation"><button className={view === 'projects' ? 'nav-active' : ''} onClick={() => setView('projects')} aria-current={view === 'projects' ? 'page' : undefined}><Icon name="folder" />Projects</button><button className={view === 'config' ? 'nav-active' : ''} onClick={() => setView('config')} aria-current={view === 'config' ? 'page' : undefined}><Icon name="settings" />Config</button></nav><ProjectRail studio={studio}/><div className="status-and-notices"><div className="tool-indicators" aria-label="Shared tool status">{studio.overview && <><div className="agent-indicator-wrap"><button data-tool="agent" disabled={!studio.overview.provider.installed} className={`tool-indicator ${setupClasses(agentTool,toolIsReady(agentTool)&&studio.overview.provider.installed&&studio.overview.provider.auth==='signed-in')} ${studio.overview.provider.auth === 'sign-in-required' ? 'indicator-error' : ''}`} onClick={() => setAgentOpen(!agentOpen)} aria-expanded={agentOpen} aria-describedby="provider-tip"><span className={`status-dot ${studio.overview.provider.auth !== 'signed-in' ? 'warning' : agentTool?.active ? 'active' : 'ready'}`} /><strong>{studio.overview.provider.provider === 'codex' ? 'Codex' : 'Claude'}</strong>{activity && <small className="agent-activity">{activity}</small>}<Icon name="chevron" size={11} /></button><div className="provider-tooltip" id="provider-tip" role="tooltip"><span>Selected provider: {studio.overview.provider.provider === 'codex' ? 'Codex' : 'Claude'}. {studio.overview.provider.detail}</span>{activity && <p>Shared agent work: {activity}</p>}{studio.overview.provider.auth !== 'signed-in' && <code>{studio.overview.provider.signInCommand}</code>}</div></div>{orderedToolIndicators(studio.overview.tools).map(t => <button key={t.id} data-tool={t.id} disabled={!t.installed} className={`tool-indicator ${setupClasses(t)} ${errorState(t) ? 'indicator-error' : ''}`} onClick={() => setView(toggleToolConfiguration)} aria-expanded={view==='config'} aria-controls="shared-tool-setup" title={`${t.label}: ${t.detail} · Click to ${view==='config'?'close':'open'} configuration`}><span className={`status-dot ${t.active ? 'active' : errorState(t) ? 'warning' : 'idle'}`} /><span>{t.label}</span><small>{toolIsReady(t) ? t.active ? 'Active' : 'Idle' : stateLabel(t.state)}{t.queued > 0 ? ` · ${t.queued} queued` : ''}</small></button>)}</>}</div><NoticeCenter notices={notices}/></div></header>
    <div className="app-shell"><main id="workspace" tabIndex={-1}>
      {!studio.overview ? <div className="connecting"><span className="eyebrow">CONNECTING TO YOUR WORKBENCH</span><h1>Good things start with a signal.</h1><p>{studio.connection ? 'The server is not reachable yet. We’ll keep trying.' : 'Reading your projects and local tool status…'}</p><div className="connecting-track" /></div> : <><SharedSetup studio={studio} config={view === 'config'} agentOpen={agentOpen} closeAgent={() => setAgentOpen(false)} /><div hidden={view!=='config'}><PromptTemplateSettings/></div>{view === 'projects' && (selected ? <><ProjectWorkspace key={selected.id} studio={studio} panel={panel} setPanel={setPanel}/></> : <section className="welcome"><span className="eyebrow">AN IDEA IS ENOUGH TO BEGIN</span><h1>From a feeling<br />to a first take.</h1><p>A creative workbench for music and moving images.<br />Start a project, describe your sound, and let your tools take it from there.</p><div className="welcome-rule" /><span className="welcome-instruction"><Icon name="plus" /> Create a project above to begin.</span></section>)}</>}
    </main></div></>;
}
