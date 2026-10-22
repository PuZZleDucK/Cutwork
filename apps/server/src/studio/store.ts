import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';
import { providerModels } from '../providers/launch.ts';
import type { AttemptPatch, SongInput, StudioStore } from './store-contract.ts';
import type { MusicAttempt, MusicDraft, Provider, SetupJob, SongAnalysis, StudioProject, StudioSong,
  ToolId, ToolStatus } from '../../../../packages/core/src/contracts/studio.ts';

export class StudioStoreError extends Error {
  readonly statusCode: 400 | 404 | 409;
  readonly code: string;
  constructor(statusCode: 400 | 404 | 409, code: string, message: string) {
    super(message); this.name = 'StudioStoreError'; this.statusCode = statusCode; this.code = code;
  }
}
function fail(status: 400 | 404 | 409, code: string, message: string): never { throw new StudioStoreError(status, code, message); }
function invalid(message: string): never { return fail(400, 'STUDIO_INPUT', message); }
function conflict(message: string): never { return fail(409, 'STUDIO_CONFLICT', message); }
function missing(message: string): never { return fail(404, 'STUDIO_NOT_FOUND', message); }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toolIds: ToolId[] = ['agent', 'yue2', 'comfyui', 'h3', 'analysis'];
const labels: Record<ToolId, string> = { agent: 'Creative agent', yue2: 'YuE2', comfyui: 'ComfyUI', h3: 'H3 video', analysis: 'Audio analysis' };
const attemptStates = ['queued', 'preparing', 'waiting_gpu', 'running', 'validating', 'succeeded', 'failed', 'reconciling'];
const setupStates = ['queued', 'running', 'succeeded', 'failed', 'reconciling'];
const activeStates = ['queued', 'preparing', 'waiting_gpu', 'running', 'validating', 'reconciling'];
const now = () => new Date().toISOString();
function text(value: unknown, name: string, maximum: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0') ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value) || (nonempty && !value.trim())) invalid(`${name} must be valid text${nonempty ? ' and not blank' : ''} within ${maximum} characters`);
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid('A valid UUID is required');
  return value.toLowerCase();
}
function integer(value: unknown, name: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(`${name} must be a valid integer`);
  return value;
}
function decimal(value: unknown, name: string, minimum = 0n): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 19 ||
      BigInt(value) < minimum || BigInt(value) > (1n << 63n) - 1n) invalid(`${name} must be a bounded unsigned decimal integer string`);
  return value;
}
function toolId(value: unknown): ToolId {
  if (!toolIds.includes(value as ToolId)) invalid('Unsupported tool'); return value as ToolId;
}
function providerId(value: unknown): Provider {
  if (value !== 'codex' && value !== 'claude') invalid('Unsupported provider'); return value;
}

/** Capture plain lossless JSON without invoking accessors, toJSON, or coercion.
 * The limit bounds persistence work, not the creative agent's capabilities. */
function canonical(value: unknown): string {
  const ancestors = new Set<object>(); let count = 0;
  function encode(v: unknown, depth: number): string {
    if (depth > 64 || ++count > 1_000_000) invalid('JSON is too deeply nested or too large');
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'string') return JSON.stringify(text(v, 'JSON text', 2_000_000));
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0) || (Number.isInteger(v) && !Number.isSafeInteger(v))) invalid('JSON number would lose precision');
      return JSON.stringify(v);
    }
    if (typeof v !== 'object') invalid('Only lossless JSON values are supported');
    if (ancestors.has(v)) invalid('Cyclic JSON is not supported');
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    if (!array && prototype !== Object.prototype && prototype !== null) invalid('JSON requires plain objects');
    const keys = Reflect.ownKeys(v), descriptors = Object.getOwnPropertyDescriptors(v);
    if (keys.some(k => typeof k !== 'string')) invalid('JSON cannot contain symbols');
    ancestors.add(v);
    try {
      if (array) {
        if (keys.length !== v.length + 1) invalid('JSON arrays cannot contain holes or extra properties');
        const values: string[] = [];
        for (let index = 0; index < v.length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid('JSON arrays cannot contain accessors or holes');
          values.push(encode(descriptor.value, depth + 1));
        }
        return `[${values.join(',')}]`;
      }
      return `{${(keys as string[]).sort().map(key => {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid('Unsafe JSON property');
        const descriptor = descriptors[key]!;
        if (!('value' in descriptor) || !descriptor.enumerable) invalid('JSON properties cannot contain accessors');
        return `${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`;
      }).join(',')}}`;
    } finally { ancestors.delete(v); }
  }
  const encoded = encode(value, 0); if (Buffer.byteLength(encoded) > 2_000_000) invalid('JSON is too large'); return encoded;
}
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  const copy: unknown = JSON.parse(canonical(value));
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) invalid('A plain object is required');
  const record = copy as Record<string, unknown>;
  if (required.some(k => !Object.hasOwn(record, k)) || Object.keys(record).some(k => !required.includes(k) && !optional.includes(k))) invalid('Object fields do not match the expected input');
  return record;
}
function details(value: unknown): Record<string, unknown> {
  const copy: unknown = JSON.parse(canonical(value));
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) invalid('Details must be a plain object');
  return copy as Record<string, unknown>;
}
function musicDraft(value: unknown, submit = false): MusicDraft {
  const d = object(value, ['musicPrompt', 'lyrics', 'style']);
  return { musicPrompt: text(d.musicPrompt, 'Music prompt', 16000, submit), lyrics: text(d.lyrics, 'Lyrics', 32000), style: text(d.style, 'Style', 16000) };
}
function analysis(value: unknown, sampleCount: string): SongAnalysis {
  const a = object(value, ['state', 'estimatedBpm', 'sampleIndices', 'waveformBucketSamples', 'peaks', 'error', 'version']);
  if (!['pending', 'available', 'partial', 'failed'].includes(a.state as string)) invalid('Unsupported analysis state');
  if (a.estimatedBpm !== null && (typeof a.estimatedBpm !== 'number' || !Number.isFinite(a.estimatedBpm) || a.estimatedBpm <= 0)) invalid('Estimated tempo must be positive or null');
  if (!Array.isArray(a.sampleIndices) || !Array.isArray(a.peaks)) invalid('Analysis indices and peaks must be arrays');
  let previous = -1n;
  for (const value of a.sampleIndices) {
    const current = BigInt(decimal(value, 'Beat sample index'));
    if (current <= previous || current >= BigInt(sampleCount)) invalid('Beat sample indices must be ordered and inside the song');
    previous = current;
  }
  integer(a.waveformBucketSamples, 'Waveform bucket size');
  if (a.peaks.length > 0 && a.waveformBucketSamples === 0) invalid('Nonempty waveform requires a positive bucket size');
  // FLOAT PCM may exceed full scale. Preserve measured magnitudes; display scaling is a UI concern.
  for (const peak of a.peaks) if (typeof peak !== 'number' || !Number.isFinite(peak) || peak < 0) invalid('Waveform peaks must be finite nonnegative values');
  if (a.error !== null) text(a.error, 'Analysis error', 16000);
  if (a.version !== null) text(a.version, 'Analysis version', 1000, true);
  return a as unknown as SongAnalysis;
}
function songInput(value: unknown): SongInput {
  const s = object(value, ['title', 'assetId', 'assetPath', 'sha256', 'sampleCount', 'sampleRate', 'channels', 'durationSeconds', 'truncated', 'analysis']);
  const title = text(s.title, 'Song title', 240, true).trim(), assetId = uuid(s.assetId);
  const assetPath = text(s.assetPath, 'Asset path', 16000, true);
  if (!isAbsolute(assetPath) || normalize(assetPath) !== assetPath) invalid('Asset path must be an absolute normalized path');
  if (typeof s.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(s.sha256)) invalid('Asset SHA-256 must be a lowercase hexadecimal digest');
  const sampleCount = decimal(s.sampleCount, 'Sample count', 1n);
  integer(s.sampleRate, 'Sample rate', 1, 768000); integer(s.channels, 'Channels', 1, 32);
  if (typeof s.durationSeconds !== 'number' || !Number.isFinite(s.durationSeconds) || s.durationSeconds <= 0) invalid('Song duration must be positive');
  if (typeof s.truncated !== 'boolean') invalid('Truncation must be an explicit boolean');
  return { ...s, title, assetId, assetPath, analysis: analysis(s.analysis, sampleCount) } as SongInput;
}
interface JsonRow { data: string }
interface AttemptRow extends JsonRow { sequence: number; input_json: string; completion_json: string | null }
interface SetupRow extends JsonRow { sequence: number }
function decode<T>(row: JsonRow): T { return JSON.parse(row.data) as T; }
function seedSet(): Record<string, string> {
  const used = new Set<string>();
  while (used.size < 3) used.add((randomBytes(8).readBigUInt64BE() & ((1n << 63n) - 1n)).toString());
  const values = [...used]; return { abc: values[0]!, semantic: values[1]!, nar: values[2]! };
}

/** The application is the single writer. Transactions are short, synchronous
 * decisions only: no model calls, subprocesses, or artifact I/O occur here. */
export function openStudioStore(path: string): StudioStore {
  text(path, 'Database path', 16000, true);
  if (!isAbsolute(path)) invalid('Studio store requires an absolute persistent database path');
  const db = new Database(path, { timeout: 5000 });
  const write = <T>(work: () => T): T => db.transaction(work).immediate();
  try {
    const version = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version.split('.').map(Number);
    if (version[0]! * 1_000_000 + version[1]! * 1000 + version[2]! < 3_051_003) conflict('SQLite 3.51.3 or newer is required');
    db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
    if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') conflict('Persistent WAL mode is required');
    db.pragma('synchronous = FULL');
    write(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS studio_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL,
        provider TEXT NOT NULL, selected_project TEXT); INSERT OR IGNORE INTO studio_meta VALUES (1,1,'codex',NULL);`);
      const meta = db.prepare('SELECT version FROM studio_meta WHERE singleton=1').get() as { version: number };
      if (meta.version !== 1) conflict('Unsupported studio schema version');
      db.exec(`
        CREATE TABLE IF NOT EXISTS studio_projects (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_attempts (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
          native_call_id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL REFERENCES studio_projects(id), idempotency_key TEXT NOT NULL,
          input_json TEXT NOT NULL, completion_json TEXT, data TEXT NOT NULL, UNIQUE(project_id,idempotency_key));
        CREATE TABLE IF NOT EXISTS studio_assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES studio_projects(id),
          path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_songs (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL REFERENCES studio_projects(id), attempt_id TEXT NOT NULL UNIQUE REFERENCES studio_attempts(id),
          asset_id TEXT NOT NULL UNIQUE REFERENCES studio_assets(id), data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_tools (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_setup_jobs (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
          tool TEXT NOT NULL REFERENCES studio_tools(id), data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS studio_attempts_project ON studio_attempts(project_id,sequence);
        CREATE INDEX IF NOT EXISTS studio_songs_project ON studio_songs(project_id,sequence);
      `);
      for (const id of toolIds) {
        const t: ToolStatus = { id, label: labels[id], state: 'missing', installed: false, detail: 'Not checked', log: '', checkedAt: null, jobId: null, active: false, queued: 0 };
        db.prepare('INSERT OR IGNORE INTO studio_tools VALUES (?,?)').run(id, canonical(t));
      }
    });
  } catch (error) { db.close(); throw error; }
  function project(id: string): StudioProject {
    const row = db.prepare('SELECT data FROM studio_projects WHERE id=?').get(uuid(id)) as JsonRow | undefined;
    if (!row) missing('Project not found'); return decode(row);
  }
  function saveProject(p: StudioProject): StudioProject {
    db.prepare('UPDATE studio_projects SET data=? WHERE id=?').run(canonical(p), p.id); return p;
  }
  function attemptRow(id: string): AttemptRow | undefined {
    return db.prepare('SELECT * FROM studio_attempts WHERE id=?').get(uuid(id)) as AttemptRow | undefined;
  }
  function attemptSnapshot(row: AttemptRow): MusicAttempt { return { ...decode<MusicAttempt>(row), sequence: row.sequence }; }
  function saveAttempt(a: MusicAttempt): MusicAttempt {
    db.prepare('UPDATE studio_attempts SET data=? WHERE id=?').run(canonical(a), a.id); return a;
  }
  function songById(id: string): StudioSong {
    const row = db.prepare('SELECT data FROM studio_songs WHERE id=?').get(uuid(id)) as JsonRow | undefined;
    if (!row) missing('Song not found'); return decode(row);
  }
  function getTool(id: ToolId): ToolStatus {
    const row = db.prepare('SELECT data FROM studio_tools WHERE id=?').get(toolId(id)) as JsonRow;
    return decode(row);
  }
  function setupJobs(): SetupJob[] {
    return (db.prepare('SELECT sequence,data FROM studio_setup_jobs ORDER BY sequence').all() as SetupRow[]).map(row => ({ ...decode<SetupJob>(row), sequence: row.sequence }));
  }
  const store: StudioStore = {
    close() { if (db.open) db.close(); },
    provider() { return (db.prepare('SELECT provider FROM studio_meta WHERE singleton=1').get() as { provider: Provider }).provider; },
    setProvider(value) { const p = providerId(value); db.prepare('UPDATE studio_meta SET provider=? WHERE singleton=1').run(p); },
    selectedProject() { return (db.prepare('SELECT selected_project FROM studio_meta WHERE singleton=1').get() as { selected_project: string | null }).selected_project; },
    selectProject(id) { write(() => { const p = project(id); db.prepare('UPDATE studio_meta SET selected_project=? WHERE singleton=1').run(p.id); }); },
    createProject(name) {
      const validated = text(name, 'Project name', 120, true).trim();
      return write(() => {
        const p: StudioProject = { id: randomUUID(), name: validated, createdAt: now(), revision: 0,
          draft: { musicPrompt: '', lyrics: '', style: '' }, selectedSongId: null };
        db.prepare('INSERT INTO studio_projects(id,data) VALUES (?,?)').run(p.id, canonical(p));
        db.prepare('UPDATE studio_meta SET selected_project=? WHERE singleton=1').run(p.id); return p;
      });
    },
    listProjects() {
      return (db.prepare('SELECT data FROM studio_projects ORDER BY sequence').all() as JsonRow[]).map(row => {
        const p = decode<StudioProject>(row);
        const songCount = (db.prepare('SELECT count(*) AS n FROM studio_songs WHERE project_id=?').get(p.id) as { n: number }).n;
        const attempts = db.prepare('SELECT sequence,data FROM studio_attempts WHERE project_id=?').all(p.id) as AttemptRow[];
        return { ...p, songCount, activeAttempts: attempts.map(attemptSnapshot).filter(a => activeStates.includes(a.state)).length,
          coveragePercent: p.selectedSongId === null ? null : 0 };
      });
    },
    project(id) {
      const p = project(id);
      return { project: p, songs: (db.prepare('SELECT data FROM studio_songs WHERE project_id=? ORDER BY sequence').all(p.id) as JsonRow[]).map(row => decode<StudioSong>(row)),
        attempts: (db.prepare('SELECT sequence,data FROM studio_attempts WHERE project_id=? ORDER BY sequence').all(p.id) as AttemptRow[]).map(attemptSnapshot) };
    },
    saveDraft(id, revision, draft) {
      integer(revision, 'Project revision'); const input = musicDraft(draft);
      return write(() => { const p = project(id); if (p.revision !== revision) conflict('Project changed; reload before editing');
        return saveProject({ ...p, revision: p.revision + 1, draft: input }); });
    },
    selectSong(projectId, songId, revision) {
      integer(revision, 'Project revision');
      return write(() => { const p = project(projectId), s = songById(songId);
        if (s.projectId !== p.id) missing('Song not found in this project');
        if (p.revision !== revision) conflict('Project changed; reload before selecting a song');
        return saveProject({ ...p, selectedSongId: s.id, revision: p.revision + 1 }); });
    },
    submitMusic(projectId, idempotencyKey, input) {
      const key = uuid(idempotencyKey), captured = musicDraft(input, true), inputJson = canonical(captured);
      return write(() => {
        const p = project(projectId);
        const old = db.prepare('SELECT * FROM studio_attempts WHERE project_id=? AND idempotency_key=?').get(p.id, key) as AttemptRow | undefined;
        if (old) { if (old.input_json !== inputJson) conflict('Submission key already belongs to different inputs'); return attemptSnapshot(old); }
        const provider = store.provider(), timestamp = now();
        const a: MusicAttempt = { id: randomUUID(), nativeCallId: randomUUID(), projectId: p.id, sequence: 0,
          createdAt: timestamp, updatedAt: timestamp, state: 'queued', provider, model: providerModels[provider], input: captured,
          seeds: seedSet(), stage: 'Queued', error: null, songId: null, details: {} };
        const result = db.prepare('INSERT INTO studio_attempts(id,native_call_id,project_id,idempotency_key,input_json,data) VALUES (?,?,?,?,?,?)')
          .run(a.id, a.nativeCallId, p.id, key, inputJson, canonical(a));
        return { ...a, sequence: Number(result.lastInsertRowid) };
      });
    },
    attempts() { return (db.prepare('SELECT sequence,data FROM studio_attempts ORDER BY sequence').all() as AttemptRow[]).map(attemptSnapshot); },
    attempt(id) { const row = attemptRow(id); return row ? attemptSnapshot(row) : null; },
    patchAttempt(id, patch) {
      const p = object(patch, [], ['state', 'stage', 'error', 'details']) as AttemptPatch;
      if (p.state !== undefined && !attemptStates.includes(p.state)) invalid('Unsupported attempt state');
      if (p.state === 'succeeded') conflict('Successful completion requires atomic song ingestion');
      if (p.stage !== undefined) text(p.stage, 'Attempt stage', 1000);
      if (p.error !== undefined && p.error !== null) text(p.error, 'Attempt error', 16000);
      if (p.details !== undefined) p.details = details(p.details);
      return write(() => {
        const row = attemptRow(id); if (!row) missing('Attempt not found'); const a = attemptSnapshot(row);
        if (a.state === 'succeeded' || a.state === 'failed') conflict('Finished attempts cannot be changed');
        return saveAttempt({ ...a, ...p, updatedAt: now() });
      });
    },
    finishMusic(id, value, evidence) {
      const input = songInput(value), capturedDetails = details(evidence), completion = canonical(input);
      return write(() => {
        const row = attemptRow(id); if (!row) missing('Attempt not found'); const a = attemptSnapshot(row);
        if (row.completion_json !== null) {
          if (row.completion_json !== completion) conflict('Completed attempt already has different output');
          if (!a.songId) conflict('Completed attempt is missing its song reference'); return songById(a.songId);
        }
        if (a.state === 'failed' || a.state === 'reconciling') conflict('Failed or unreconciled work cannot be ingested as successful');
        if (db.prepare('SELECT id FROM studio_assets WHERE id=? OR path=?').get(input.assetId, input.assetPath)) conflict('Asset already belongs to a completed generation');
        const { assetPath, ...songFields } = input;
        const s: StudioSong = { ...songFields, id: randomUUID(), projectId: a.projectId, attemptId: a.id, createdAt: now() };
        db.prepare('INSERT INTO studio_assets(id,project_id,path,sha256) VALUES (?,?,?,?)').run(s.assetId, s.projectId, assetPath, s.sha256);
        db.prepare('INSERT INTO studio_songs(id,project_id,attempt_id,asset_id,data) VALUES (?,?,?,?,?)').run(s.id, s.projectId, s.attemptId, s.assetId, canonical(s));
        saveAttempt({ ...a, state: 'succeeded', stage: 'Complete', error: null, songId: s.id, details: capturedDetails, updatedAt: now() });
        db.prepare('UPDATE studio_attempts SET completion_json=? WHERE id=?').run(completion, a.id);
        const p = project(a.projectId); saveProject({ ...p, selectedSongId: s.id, revision: p.revision + 1 }); return s;
      });
    },
    setAnalysis(songId, value) {
      return write(() => { const s = songById(songId), updated = { ...s, analysis: analysis(value, s.sampleCount) };
        db.prepare('UPDATE studio_songs SET data=? WHERE id=?').run(canonical(updated), s.id); return updated; });
    },
    asset(id) {
      const row = db.prepare('SELECT project_id,path,sha256 FROM studio_assets WHERE id=?').get(uuid(id)) as { project_id: string; path: string; sha256: string } | undefined;
      return row ? { projectId: row.project_id, path: row.path, sha256: row.sha256 } : null;
    },
    tools() { return toolIds.map(getTool); }, tool: getTool,
    patchTool(id, patch) {
      const p = object(patch, [], ['state', 'installed', 'detail', 'log', 'checkedAt', 'jobId', 'active', 'queued']);
      if (p.state !== undefined && !['missing', 'checking', 'queued', 'installing', 'ready', 'error', 'reconciling'].includes(p.state as string)) invalid('Unsupported tool state');
      for (const key of ['installed', 'active']) if (p[key] !== undefined && typeof p[key] !== 'boolean') invalid(`${key} must be boolean`);
      if (p.queued !== undefined) integer(p.queued, 'Tool queue length');
      if (p.detail !== undefined) text(p.detail, 'Tool detail', 16000);
      if (p.log !== undefined) text(p.log, 'Tool log', 1_000_000);
      if (p.checkedAt !== undefined && p.checkedAt !== null && (typeof p.checkedAt !== 'string' || !Number.isFinite(Date.parse(p.checkedAt)))) invalid('Check timestamp must be an ISO date or null');
      if (p.jobId !== undefined && p.jobId !== null) uuid(p.jobId);
      return write(() => { const existing = getTool(id);
        if (typeof p.jobId === 'string') {
          const job = setupJobs().find(j => j.id === p.jobId); if (!job || job.tool !== id) missing('Setup job not found for this tool');
        }
        const updated = { ...existing, ...p } as ToolStatus;
        db.prepare('UPDATE studio_tools SET data=? WHERE id=?').run(canonical(updated), id); return updated;
      });
    },
    enqueueSetup(tool) {
      const id = toolId(tool);
      return write(() => {
        const active = setupJobs().find(j => j.tool === id && ['queued', 'running', 'reconciling'].includes(j.state)); if (active) return active;
        const timestamp = now(), job: SetupJob = { id: randomUUID(), tool: id, sequence: 0, state: 'queued', createdAt: timestamp, updatedAt: timestamp, error: null };
        const result = db.prepare('INSERT INTO studio_setup_jobs(id,tool,data) VALUES (?,?,?)').run(job.id, id, canonical(job));
        const updated = { ...getTool(id), jobId: job.id, state: 'queued' as const };
        db.prepare('UPDATE studio_tools SET data=? WHERE id=?').run(canonical(updated), id); return { ...job, sequence: Number(result.lastInsertRowid) };
      });
    },
    setupJobs,
    patchSetup(id, state, error) {
      const jobId = uuid(id); if (!setupStates.includes(state)) invalid('Unsupported setup state');
      if (error !== undefined) text(error, 'Setup error', 16000);
      return write(() => {
        const current = setupJobs().find(j => j.id === jobId); if (!current) missing('Setup job not found');
        if (['succeeded', 'failed'].includes(current.state) && (state !== current.state || (error !== undefined && error !== current.error))) conflict('Finished setup cannot be changed');
        const updated: SetupJob = { ...current, state, error: error ?? current.error, updatedAt: now() };
        db.prepare('UPDATE studio_setup_jobs SET data=? WHERE id=?').run(canonical(updated), jobId); return updated;
      });
    },
    markInterrupted() {
      write(() => {
        for (const a of store.attempts()) if (['preparing', 'waiting_gpu', 'running', 'validating'].includes(a.state)) {
          saveAttempt({ ...a, state: 'reconciling', stage: 'Interrupted; native ownership must be reconciled before retry', updatedAt: now() });
        }
        for (const job of setupJobs()) if (job.state === 'running') {
          const updated = { ...job, state: 'reconciling', updatedAt: now(), error: 'Server restarted while setup was active; review before retrying' };
          db.prepare('UPDATE studio_setup_jobs SET data=? WHERE id=?').run(canonical(updated), job.id);
          const t = { ...getTool(job.tool), state: 'reconciling', active: false, detail: updated.error };
          db.prepare('UPDATE studio_tools SET data=? WHERE id=?').run(canonical(t), job.tool);
        }
      });
    },
  };
  return store;
}
