import {DEFAULT_TASK_CONTEXT_OVERRIDES,TASK_CONTEXT_IDS,taskContextError,type TaskContextSettings} from '../../../../packages/core/src/contracts/task-contexts.ts';
import type { ArtifactRef, ArtifactLifecycle, ArtifactBlocker, ArtifactUseReservation, DeletionContext, ManagedMediaInventory, PurgeRecord, RetainedThumbnail } from '../../../../packages/core/src/contracts/lifecycle.ts';
import Database from 'better-sqlite3';
import {DEFAULT_AGENT_TEMPLATES,promptTemplateError,type PromptTemplateSettings} from '../../../../packages/core/src/contracts/prompt-templates.ts';
import { decimal as exactDecimal } from '../../../../packages/core/src/time/decimal.ts';
import { parseTimingValue, resolveTiming, timingValueFromSeconds, type TimingValue } from '../../../../packages/core/src/time/linked-timing.ts';
import { continuationPreset, songCoverage } from '../../../../packages/core/src/time/studio-timing.ts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';
import { providerModels } from '../providers/launch.ts';
import { RENDER_PROFILE } from './render-contract.ts';
import type { AttemptPatch, ClipDraftInput, ClipEditPatch, ClipEditResult, RegisteredAssetInput, SongInput, StudioStore, VideoOutputInput } from './store-contract.ts';
import type { ClipDraft, ClipEditContext, ContinuationCapture, ContinuationReference, MusicAttempt, MusicDraft, MusicInput, Provider, SetupJob, SongAnalysis, StudioAttempt, StudioProject, StudioSong,
  ToolId, ToolStatus, VideoInput, VideoAttempt, StudioClip, SongArrangement, StudioRender, ProjectEvent, ProjectEventKind } from '../../../../packages/core/src/contracts/studio.ts';

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
const attemptStates = ['queued', 'preparing', 'waiting_gpu', 'running', 'validating', 'succeeded', 'failed', 'reconciling', 'cancel_requested', 'cancelled'];
const setupStates = ['queued', 'running', 'succeeded', 'failed', 'reconciling'];
const activeStates = ['queued', 'preparing', 'waiting_gpu', 'running', 'validating', 'reconciling', 'cancel_requested'];
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
function musicDraft(value: unknown): MusicDraft {
  const d = object(value, ['musicPrompt', 'lyrics', 'style']);
  return { musicPrompt: text(d.musicPrompt, 'Music prompt', 16000), lyrics: text(d.lyrics, 'Lyrics', 32000), style: text(d.style, 'Style', 16000) };
}
function musicInput(value: unknown): MusicInput {
  const input = object(value, ['musicPrompt', 'lyrics']);
  return { musicPrompt: text(input.musicPrompt, 'Music prompt', 16000, true), lyrics: text(input.lyrics, 'Lyrics', 32000) };
}
/** Drafts preserve incomplete edits; only submission resolves timing against music. */
function continuationReference(value: unknown): ContinuationReference {
  const input = object(value, ['contextId', 'contextRevision']);
  return { contextId: uuid(input.contextId), contextRevision: integer(input.contextRevision, 'Continuation context revision') };
}
function clipDraftInput(value: unknown): ClipDraftInput {
  const input = object(value, ['clipPrompt', 'timingIntent'], ['continuation']), clipPrompt = text(input.clipPrompt, 'Clip prompt', 16000);
  const continuation = input.continuation === undefined ? {} : { continuation: input.continuation === null ? null : continuationReference(input.continuation) };
  if (input.timingIntent === null) return { clipPrompt, timingIntent: null, ...continuation };
  const intent = object(input.timingIntent, ['start', 'end']);
  const endpoint = (value: unknown): TimingValue => {
    const point = object(value, ['unit', 'value']);
    if (point.unit === 'rational') {
      const fraction = object(point.value, ['numerator', 'denominator']);
      return { unit: 'rational', value: { numerator: text(fraction.numerator, 'Timing numerator', 1000), denominator: text(fraction.denominator, 'Timing denominator', 1000) } };
    }
    if (point.unit !== 'frames' && point.unit !== 'beats' && point.unit !== 'seconds') invalid('Unsupported timing unit');
    return { unit: point.unit, value: text(point.value, 'Timing value', 1000) };
  };
  return { clipPrompt, timingIntent: { start: endpoint(intent.start), end: endpoint(intent.end) }, ...continuation };
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
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid('SHA-256 must be a lowercase hexadecimal digest'); return value;
}
function absolutePath(value: unknown): string {
  const path = text(value, 'Asset path', 16000, true);
  if (!isAbsolute(path) || normalize(path) !== path) invalid('Asset path must be an absolute normalized path'); return path;
}
function registeredAsset(value: unknown): RegisteredAssetInput {
  const a = object(value, ['assetId', 'path', 'sha256']);
  return { assetId: uuid(a.assetId), path: absolutePath(a.path), sha256: digest(a.sha256) };
}
function videoInput(value: unknown): VideoInput {
  const v = object(value, ['songId', 'clipPrompt', 'style', 'startFrame', 'endFrame'], ['requestedIntervalSeconds', 'timingIntent', 'continuation']);
  const input: VideoInput = { songId: uuid(v.songId), clipPrompt: text(v.clipPrompt, 'Clip prompt', 16000, true),
    style: text(v.style, 'Visual style', 16000), startFrame: integer(v.startFrame, 'Start frame'), endFrame: integer(v.endFrame, 'End frame') };
  if (input.endFrame <= input.startFrame) invalid('Video interval must be nonempty');
  if (v.requestedIntervalSeconds !== undefined) {
    const intent = object(v.requestedIntervalSeconds, ['start', 'end']);
    const start = text(intent.start, 'Exact start seconds', 1000, true), end = text(intent.end, 'Exact end seconds', 1000, true);
    try {
      const s = exactDecimal(start), e = exactDecimal(end);
      if (e.numerator * s.denominator <= s.numerator * e.denominator ||
          s.numerator * 24n / s.denominator !== BigInt(input.startFrame) ||
          (e.numerator * 24n + e.denominator - 1n) / e.denominator !== BigInt(input.endFrame)) invalid('Frames must cover the exact requested time interval');
    } catch (error) { if (error instanceof StudioStoreError) throw error; invalid('Exact seconds must be nonnegative decimal strings'); }
    input.requestedIntervalSeconds = { start, end };
  }
  if (v.timingIntent !== undefined) {
    const intent = object(v.timingIntent, ['start', 'end']);
    const endpoint = (value: unknown): TimingValue => {
      const point = object(value, ['unit', 'value']);
      if (point.unit === 'rational') {
        const fraction = object(point.value, ['numerator', 'denominator']);
        const numerator = text(fraction.numerator, 'Timing numerator', 1000, true), denominator = text(fraction.denominator, 'Timing denominator', 1000, true);
        if (!/^(0|[1-9][0-9]*)$/.test(numerator) || !/^[1-9][0-9]*$/.test(denominator)) invalid('Timing fractions require canonical nonnegative numerator and positive denominator');
        return { unit: 'rational' as const, value: { numerator, denominator } };
      }
      if (point.unit !== 'frames' && point.unit !== 'beats' && point.unit !== 'seconds') invalid('Unsupported timing unit');
      return { unit: point.unit, value: text(point.value, 'Timing value', 1000, true) };
    };
    input.timingIntent = { start: endpoint(intent.start), end: endpoint(intent.end) };
  }
  if (v.continuation !== undefined) input.continuation = continuationReference(v.continuation);
  return input;
}
function videoOutput(value: unknown): VideoOutputInput {
  const v = object(value, ['title', 'video', 'audio', 'frames', 'frameCount', 'width', 'height', 'fps']);
  const title = text(v.title, 'Clip title', 240, true).trim(), video = registeredAsset(v.video);
  const frameCount = integer(v.frameCount, 'Native frame count', 1), width = integer(v.width, 'Width', 1, 32768), height = integer(v.height, 'Height', 1, 32768);
  if (v.fps !== '24/1') invalid('Clips must use native 24 fps');
  if (!Array.isArray(v.frames) || v.frames.length !== frameCount) invalid('Every native raw frame is required');
  const frames = v.frames.map((value, index) => {
    const f = object(value, ['assetId', 'path', 'sha256', 'index', 'pixelSha256', 'bytes']);
    if (integer(f.index, 'Raw frame index') !== index) invalid('Raw frames must be ordered, contiguous and zero-based');
    return { ...registeredAsset({ assetId: f.assetId, path: f.path, sha256: f.sha256 }), index, pixelSha256: digest(f.pixelSha256), bytes: integer(f.bytes, 'Frame bytes', 1) };
  });
  let audio: VideoOutputInput['audio'] = null;
  if (v.audio !== null) {
    const a = object(v.audio, ['assetId', 'path', 'sha256', 'sampleCount', 'sampleRate', 'channels']);
    audio = { ...registeredAsset({ assetId: a.assetId, path: a.path, sha256: a.sha256 }), sampleCount: decimal(a.sampleCount, 'Audio sample count', 1n),
      sampleRate: integer(a.sampleRate, 'Audio sample rate', 1, 768000), channels: integer(a.channels, 'Audio channels', 1, 32) };
  }
  return { title, video, audio, frames, frameCount, width, height, fps: '24/1' };
}
function attemptPatch(value: unknown): AttemptPatch {
  const p = object(value, [], ['state', 'stage', 'error', 'details']) as AttemptPatch;
  if (p.state !== undefined && !attemptStates.includes(p.state)) invalid('Unsupported attempt state');
  if (p.state === 'succeeded') conflict('Successful completion requires atomic artifact ingestion');
  if (p.state === 'cancelled' || p.state === 'cancel_requested') conflict('Cancellation requires its dedicated lifecycle operation');
  if (p.stage !== undefined) text(p.stage, 'Attempt stage', 1000);
  if (p.error !== undefined && p.error !== null) text(p.error, 'Attempt error', 16000);
  if (p.details !== undefined) p.details = details(p.details); return p;
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
      if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(meta.version)) conflict('Unsupported studio schema version');
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
      // Version 2 adds video/arrangement/render storage without rewriting any captured music history.
      if (!(db.pragma('table_info(studio_assets)') as { name: string }[]).some(c => c.name === 'media_type')) {
        db.exec("ALTER TABLE studio_assets ADD COLUMN media_type TEXT NOT NULL DEFAULT 'audio/wav'");
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS studio_acceptance (singleton INTEGER PRIMARY KEY CHECK(singleton=1), value INTEGER NOT NULL);
        INSERT OR IGNORE INTO studio_acceptance VALUES (1,(SELECT coalesce(max(sequence),0) FROM studio_attempts));
        CREATE TABLE IF NOT EXISTS studio_video_attempts (sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE,
          native_call_id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL REFERENCES studio_projects(id), idempotency_key TEXT NOT NULL,
          input_json TEXT NOT NULL, completion_json TEXT, data TEXT NOT NULL, UNIQUE(project_id,idempotency_key));
        CREATE TABLE IF NOT EXISTS studio_clips (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES studio_projects(id),
          attempt_id TEXT NOT NULL UNIQUE REFERENCES studio_video_attempts(id), data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_arrangements (song_id TEXT PRIMARY KEY REFERENCES studio_songs(id),
          project_id TEXT NOT NULL REFERENCES studio_projects(id), data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_renders (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL REFERENCES studio_projects(id), song_id TEXT NOT NULL REFERENCES studio_songs(id),
          idempotency_key TEXT NOT NULL, completion_json TEXT, data TEXT NOT NULL, UNIQUE(project_id,idempotency_key));
        CREATE INDEX IF NOT EXISTS studio_video_project ON studio_video_attempts(project_id,sequence);
        CREATE INDEX IF NOT EXISTS studio_clips_project ON studio_clips(project_id);
        CREATE INDEX IF NOT EXISTS studio_renders_project ON studio_renders(project_id,sequence);
      `);
      if (!(db.pragma('table_info(studio_renders)') as { name: string }[]).some(c => c.name === 'cache_eligible')) {
        db.exec('ALTER TABLE studio_renders ADD COLUMN cache_eligible INTEGER NOT NULL DEFAULT 1');
      }
      db.exec(`CREATE TABLE IF NOT EXISTS studio_render_keys (project_id TEXT NOT NULL REFERENCES studio_projects(id),
        idempotency_key TEXT NOT NULL, render_id TEXT NOT NULL REFERENCES studio_renders(id), PRIMARY KEY(project_id,idempotency_key));
        INSERT OR IGNORE INTO studio_render_keys SELECT project_id,idempotency_key,id FROM studio_renders;`);
      if (meta.version === 1) {
        for (const row of db.prepare('SELECT data FROM studio_songs').all() as JsonRow[]) {
          const song = decode<StudioSong>(row);
          db.prepare('INSERT OR IGNORE INTO studio_arrangements VALUES (?,?,?)').run(song.id, song.projectId,
            canonical({ projectId: song.projectId, songId: song.id, revision: 0, placements: [] }));
        }
        db.exec('UPDATE studio_meta SET version=2 WHERE singleton=1');
      }
      db.exec(`CREATE TABLE IF NOT EXISTS studio_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL REFERENCES studio_projects(id), data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS studio_events_project ON studio_events(project_id,sequence);
        UPDATE studio_meta SET version=3 WHERE singleton=1;`);
      // No event backfill: old rows cannot tell us when unrecorded edits happened.
      db.exec(`CREATE TABLE IF NOT EXISTS studio_clip_drafts (song_id TEXT PRIMARY KEY REFERENCES studio_songs(id),
        project_id TEXT NOT NULL REFERENCES studio_projects(id), data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS studio_clip_drafts_project ON studio_clip_drafts(project_id);`);
      if (meta.version < 4) {
        // Earlier session-only edits cannot be recovered or inferred from attempts.
        // Add empty forms without rewriting any creative record or inventing history.
        for (const row of db.prepare('SELECT id,project_id FROM studio_songs ORDER BY sequence').all() as { id: string; project_id: string }[]) {
          db.prepare('INSERT OR IGNORE INTO studio_clip_drafts VALUES (?,?,?)').run(row.id, row.project_id,
            canonical({ projectId: row.project_id, songId: row.id, revision: 0, clipPrompt: '', timingIntent: null }));
        }
      }
      db.exec(`CREATE TABLE IF NOT EXISTS studio_edit_contexts (id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES studio_projects(id), song_id TEXT NOT NULL REFERENCES studio_songs(id),
        clip_id TEXT NOT NULL REFERENCES studio_clips(id), placement_id TEXT UNIQUE, data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS studio_edit_contexts_project ON studio_edit_contexts(project_id);`);
      if (meta.version < 5) {
        // Derive current contexts only; never rewrite historical arrangements,
        // render snapshots, generation inputs, native evidence or edit events.
        for (const row of db.prepare('SELECT data FROM studio_arrangements ORDER BY rowid').all() as JsonRow[]) {
          const a = decode<SongArrangement>(row);
          for (const p of a.placements) insertContext({ id: p.id, projectId: a.projectId, songId: a.songId, clipId: p.clipId,
            revision: 0, placementId: p.id, sourceOriginFrame: p.startFrame - p.sourceStartFrame,
            sourceStartFrame: p.sourceStartFrame, sourceEndFrame: p.sourceStartFrame + p.endFrame - p.startFrame,
            audioSource: p.audioSource ?? 'song', placementIntent: null, trimIntent: null }, true);
        }
        for (const row of db.prepare('SELECT data FROM studio_clips c WHERE NOT EXISTS (SELECT 1 FROM studio_edit_contexts e WHERE e.clip_id=c.id) ORDER BY rowid').all() as JsonRow[]) {
          const clip = decode<StudioClip>(row), attempt = videoRow(clip.attemptId);
          if (!attempt) conflict('Clip is missing its original generation request');
          insertContext({ id: randomUUID(), projectId: clip.projectId, songId: clip.songId, clipId: clip.id,
            revision: 0, placementId: null, sourceOriginFrame: videoSnapshot(attempt).input.startFrame,
            sourceStartFrame: 0, sourceEndFrame: clip.requestedFrames, audioSource: 'song', placementIntent: null, trimIntent: null });
        }
      }
      // Version8 adds mutable lifecycle/purge metadata without rewriting creative snapshots.
      db.exec(`CREATE TABLE IF NOT EXISTS studio_artifact_lifecycle (
        artifact_id TEXT PRIMARY KEY, kind TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES studio_projects(id), data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS studio_deletions (id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES studio_projects(id), idempotency_key TEXT NOT NULL, input_json TEXT NOT NULL, data TEXT NOT NULL,
          UNIQUE(project_id,idempotency_key));
        CREATE TABLE IF NOT EXISTS studio_artifact_uses (id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES studio_projects(id), artifact_id TEXT NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL,
          UNIQUE(artifact_id,owner_id));
        UPDATE studio_meta SET version=8 WHERE singleton=1;`);
      // Version 9 adds shared editable templates without rewriting historical attempts.
      db.exec(`CREATE TABLE IF NOT EXISTS studio_prompt_templates (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL);
        UPDATE studio_meta SET version=9 WHERE singleton=1;`);
      // Version 10 adds context overrides without rewriting accepted requests.
      db.exec(`CREATE TABLE IF NOT EXISTS studio_task_contexts (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL);
        UPDATE studio_meta SET version=10 WHERE singleton=1;`);
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
  function recordEvent(projectId: string, kind: ProjectEventKind, data: Record<string, unknown>, createdAt = now()): void {
    const event: ProjectEvent = { id: randomUUID(), projectId, sequence: 0, createdAt, kind, data };
    db.prepare('INSERT INTO studio_events(id,project_id,data) VALUES (?,?,?)').run(event.id, projectId, canonical(event));
  }
  function analysisSummary(a: SongAnalysis): Record<string, unknown> {
    return { state: a.state, estimatedBpm: a.estimatedBpm, version: a.version, error: a.error, beatCount: a.sampleIndices.length,
      waveformBucketSamples: a.waveformBucketSamples, peakCount: a.peaks.length, sha256: createHash('sha256').update(canonical(a)).digest('hex') };
  }
  function nextSequence(): number {
    const current = (db.prepare('SELECT value FROM studio_acceptance WHERE singleton=1').get() as { value: number }).value;
    const next = integer(current + 1, 'Acceptance sequence', 1);
    db.prepare('UPDATE studio_acceptance SET value=? WHERE singleton=1').run(next); return next;
  }
  function videoRow(id: string): AttemptRow | undefined { return db.prepare('SELECT * FROM studio_video_attempts WHERE id=?').get(uuid(id)) as AttemptRow | undefined; }
  function videoSnapshot(row: AttemptRow): VideoAttempt { return { ...decode<VideoAttempt>(row), sequence: row.sequence }; }
  function saveVideo(a: VideoAttempt): VideoAttempt { db.prepare('UPDATE studio_video_attempts SET data=? WHERE id=?').run(canonical(a), a.id); return a; }
  function clipById(id: string): StudioClip {
    const row = db.prepare('SELECT data FROM studio_clips WHERE id=?').get(uuid(id)) as JsonRow | undefined;
    if (!row) missing('Clip not found'); return decode(row);
  }
  function arrangement(projectId: string, songId: string): SongArrangement {
    const p = project(projectId), song = songById(songId);
    if (song.projectId !== p.id) missing('Song not found in this project');
    const row = db.prepare('SELECT data FROM studio_arrangements WHERE song_id=?').get(song.id) as JsonRow | undefined;
    if (!row) conflict('Song arrangement is missing'); return decode(row);
  }
  function currentArrangement(projectId: string, songId: string, revision: number): SongArrangement {
    integer(revision, 'Arrangement revision'); const a = arrangement(projectId, songId);
    if (a.revision !== revision) conflict('Arrangement changed; reload before editing or rendering'); return a;
  }
  function saveArrangement(a: SongArrangement): SongArrangement {
    db.prepare('UPDATE studio_arrangements SET data=? WHERE song_id=?').run(canonical(a), a.songId); return a;
  }
  function insertContext(c: ClipEditContext, ignore = false): void {
    db.prepare(`INSERT ${ignore ? 'OR IGNORE' : ''} INTO studio_edit_contexts VALUES (?,?,?,?,?,?)`)
      .run(c.id, c.projectId, c.songId, c.clipId, c.placementId, canonical(c));
  }
  function saveContext(c: ClipEditContext): ClipEditContext {
    db.prepare('UPDATE studio_edit_contexts SET song_id=?,placement_id=?,data=? WHERE id=?').run(c.songId, c.placementId, canonical(c), c.id); return c;
  }
  function getContext(projectId: string, contextId: string): ClipEditContext {
    const p = project(projectId), row = db.prepare('SELECT data FROM studio_edit_contexts WHERE id=? AND project_id=?').get(uuid(contextId), p.id) as JsonRow | undefined;
    if (!row) missing('Edit context not found in this project'); return decode(row);
  }
  function captureContinuation(projectId: string, reference: ContinuationReference, songId?: string): ContinuationCapture {
    const c = getContext(projectId, reference.contextId);
    if (songId !== undefined && c.songId !== songId) missing('Continuation belongs to another song');
    if (c.revision !== reference.contextRevision) conflict('Predecessor changed; prepare continuation again before generating');
    const clip = clipById(c.clipId), song = songById(c.songId);
    assertAvailable(projectId, { kind: 'clip', id: clip.id }); assertAvailable(projectId, { kind: 'song', id: song.id });
    if (clip.projectId !== c.projectId || song.projectId !== c.projectId) conflict('Continuation media does not match this project');
    integer(c.sourceStartFrame, 'Retained source start'); integer(c.sourceEndFrame, 'Retained source end', 1, clip.nativeFrames);
    if (c.sourceStartFrame >= c.sourceEndFrame) conflict('Continuation has no retained source frame');
    integer(c.sourceOriginFrame + c.sourceStartFrame, 'Retained timeline start');
    const endFrame = integer(c.sourceOriginFrame + c.sourceEndFrame, 'Continuation start', 1, Number.MAX_SAFE_INTEGER - 1);
    const frame = clip.rawFrames[c.sourceEndFrame - 1];
    if (!frame || frame.index !== c.sourceEndFrame - 1) conflict('Preserved continuation frame is missing');
    const asset = store.asset(frame.assetId);
    if (!asset || asset.projectId !== c.projectId || asset.mediaType !== 'image/png' || asset.sha256 !== frame.sha256) conflict('Preserved continuation frame registration differs');
    return { contextId: c.id, contextRevision: c.revision, clipId: c.clipId, songId: c.songId, sourceOriginFrame: c.sourceOriginFrame,
      sourceStartFrame: c.sourceStartFrame, sourceEndFrame: c.sourceEndFrame, endFrame, frame: { ...frame } };
  }
  function anyAttempt(id: string): { kind: 'music' | 'video'; row: AttemptRow; attempt: StudioAttempt } {
    const music = attemptRow(id); if (music) return { kind: 'music', row: music, attempt: attemptSnapshot(music) };
    const video = videoRow(id); if (video) return { kind: 'video', row: video, attempt: videoSnapshot(video) };
    return missing('Generation attempt not found');
  }
  function saveAnyAttempt(attempt: StudioAttempt): StudioAttempt { return 'song' in attempt ? saveVideo(attempt) : saveAttempt(attempt); }
  function checkAttemptPatch(attempt: StudioAttempt, patch: AttemptPatch): void {
    if (['succeeded', 'failed', 'cancelled'].includes(attempt.state)) conflict('Finished attempts cannot be changed');
    if (attempt.cancellation && patch.state !== undefined && patch.state !== 'reconciling') conflict('Cancellation cannot be resumed or completed by a normal lifecycle patch');
  }
  function currentClipDraft(projectId: string, songId: string, revision: number): ClipDraft {
    integer(revision, 'Clip draft revision'); const p = project(projectId), song = songById(songId);
    if (song.projectId !== p.id) missing('Song not found in this project');
    const row = db.prepare('SELECT data FROM studio_clip_drafts WHERE song_id=? AND project_id=?').get(song.id, p.id) as JsonRow | undefined;
    if (!row) conflict('Clip draft is missing'); const draft = decode<ClipDraft>(row);
    if (draft.revision !== revision) conflict('Clip draft changed; reload before saving'); return draft;
  }
  function persistClipDraft(before: ClipDraft, value: Pick<ClipDraft, 'clipPrompt' | 'timingIntent' | 'continuation'>): ClipDraft {
    const updated = { ...before, ...value };
    const changedFields = (['clipPrompt', 'timingIntent', 'continuation'] as const).filter(key => canonical(before[key] ?? null) !== canonical(updated[key] ?? null));
    if (changedFields.length === 0) return before;
    updated.revision = integer(before.revision + 1, 'Clip draft revision');
    db.prepare('UPDATE studio_clip_drafts SET data=? WHERE song_id=?').run(canonical(updated), before.songId);
    recordEvent(before.projectId, 'clip_draft.saved', { songId: before.songId, revision: updated.revision, changedFields }); return updated;
  }
  function editState(projectId: string, contextId: string, revision: number, arrangementRevision: number): ClipEditResult {
    integer(revision, 'Edit context revision'); const context = getContext(projectId, contextId);
    if (context.revision !== revision) conflict('Clip edit changed; reload before editing');
    assertAvailable(projectId, { kind: 'clip', id: context.clipId }); assertAvailable(projectId, { kind: 'song', id: context.songId });
    const a = currentArrangement(projectId, context.songId, arrangementRevision);
    if (context.placementId !== null && !a.placements.some(p => p.id === context.placementId && p.clipId === context.clipId)) conflict('Clip edit placement is missing');
    return { context, arrangement: a };
  }
  const exactFrameTime = (frame: number): TimingValue => {
    integer(frame, 'Timeline frame');
    try { return timingValueFromSeconds({ numerator: BigInt(frame), denominator: 24n }); }
    catch { return invalid('Timeline frame is outside the supported exact timing range'); }
  };
  function editedContext(projectId: string, contextId: string, revision: number, arrangementRevision: number, value: ClipEditPatch): ClipEditResult {
    const edit = object(value, [], ['sourceStartFrame', 'sourceEndFrame', 'trimIntent', 'startFrame', 'placementIntent', 'audioSource']);
    const trimming = ['sourceStartFrame', 'sourceEndFrame', 'trimIntent'].some(k => Object.hasOwn(edit, k));
    const moving = ['startFrame', 'placementIntent'].some(k => Object.hasOwn(edit, k));
    const audio = Object.hasOwn(edit, 'audioSource');
    if (Number(trimming) + Number(moving) + Number(audio) !== 1) invalid('Choose one trim, move or audio action');
    const { context: before, arrangement: a } = editState(projectId, contextId, revision, arrangementRevision), clip = clipById(before.clipId), song = songById(before.songId);
    if (clip.projectId !== before.projectId || song.projectId !== before.projectId) conflict('Edit context media does not match its project');
    const c: ClipEditContext = { ...before };
    if (trimming) {
      let start = edit.sourceStartFrame === undefined ? c.sourceStartFrame : integer(edit.sourceStartFrame, 'First source frame');
      let end = edit.sourceEndFrame === undefined ? c.sourceEndFrame : integer(edit.sourceEndFrame, 'Exclusive source end', 1);
      if (edit.trimIntent !== undefined && edit.trimIntent !== null) {
        const intent = clipDraftInput({ clipPrompt: '', timingIntent: edit.trimIntent }).timingIntent!;
        const timing = resolveTiming(song, intent); if (!timing.valid) invalid(timing.error);
        const resolvedStart = timing.startFrame - c.sourceOriginFrame, resolvedEnd = timing.endFrame - c.sourceOriginFrame;
        if ((edit.sourceStartFrame !== undefined && start !== resolvedStart) || (edit.sourceEndFrame !== undefined && end !== resolvedEnd)) invalid('Source bounds do not match the exact trim intent');
        start = resolvedStart; end = resolvedEnd; c.trimIntent = intent;
      } else {
        if (edit.sourceStartFrame === undefined && edit.sourceEndFrame === undefined) invalid('Trim requires source bounds or timing intent');
        c.trimIntent = { start: exactFrameTime(c.sourceOriginFrame + start), end: exactFrameTime(c.sourceOriginFrame + end) };
      }
      if (start !== c.sourceStartFrame) c.placementIntent = null;
      c.sourceStartFrame = start; c.sourceEndFrame = end;
    } else if (moving) {
      const start = integer(edit.startFrame, 'Retained timeline start');
      if (edit.placementIntent !== undefined && edit.placementIntent !== null) {
        const intent = clipDraftInput({ clipPrompt: '', timingIntent: { start: edit.placementIntent, end: edit.placementIntent } }).timingIntent!.start;
        try { const time = parseTimingValue(song, intent); if (time.numerator * 24n / time.denominator !== BigInt(start)) invalid('Move frame does not match exact timing intent'); }
        catch (error) { if (error instanceof StudioStoreError) throw error; invalid(error instanceof Error ? error.message : 'Invalid move timing'); }
        c.placementIntent = intent;
      } else c.placementIntent = exactFrameTime(start);
      c.sourceOriginFrame = integer(start - c.sourceStartFrame, 'Source origin', Number.MIN_SAFE_INTEGER); c.trimIntent = null;
    } else {
      if (edit.audioSource !== 'song' && edit.audioSource !== 'clip') invalid('Audio source must be song or clip');
      if (edit.audioSource === 'clip' && !clip.audioAssetId) invalid('This clip has no registered audio');
      c.audioSource = edit.audioSource;
    }
    integer(c.sourceStartFrame, 'First source frame'); integer(c.sourceEndFrame, 'Exclusive source end', 1, clip.nativeFrames);
    if (c.sourceStartFrame >= c.sourceEndFrame) invalid('Retain at least one source frame');
    const startFrame = integer(c.sourceOriginFrame + c.sourceStartFrame, 'Retained start'), endFrame = integer(c.sourceOriginFrame + c.sourceEndFrame, 'Retained end', 1, Number.MAX_SAFE_INTEGER - 1);
    if (canonical(c) === canonical(before)) return { context: before, arrangement: a };
    c.revision = integer(c.revision + 1, 'Edit context revision'); saveContext(c);
    let updated = a;
    if (c.placementId !== null) updated = saveArrangement({ ...a, revision: integer(a.revision + 1, 'Arrangement revision'), placements: a.placements.map(p => p.id !== c.placementId ? p : {
      ...p, startFrame, endFrame, sourceStartFrame: c.sourceStartFrame, ...(audio ? { audioSource: c.audioSource } : {}),
    }) });
    recordEvent(c.projectId, trimming ? 'clip.trimmed' : moving ? 'clip.moved' : 'clip.audio_changed', { songId: c.songId, contextId: c.id, before, after: c, arrangementRevision: updated.revision });
    return { context: c, arrangement: updated };
  }
  function appendPlacement(a: SongArrangement, clip: StudioClip, startFrame: number, sourceStartFrame = 0, frameCount = clip.requestedFrames): SongArrangement {
    integer(startFrame, 'Placement start'); integer(sourceStartFrame, 'Source start'); integer(frameCount, 'Placement frame count', 1);
    if (sourceStartFrame + frameCount > clip.nativeFrames) invalid('Placement exceeds preserved source frames');
    const endFrame = integer(startFrame + frameCount, 'Placement end', 1, Number.MAX_SAFE_INTEGER - 1);
    const priority = integer(a.placements.reduce((max, p) => Math.max(max, p.priority), 0) + 1, 'Placement priority', 1);
    const placement = { id: randomUUID(), clipId: clip.id, startFrame, endFrame, sourceStartFrame, priority };
    insertContext({ id: placement.id, projectId: a.projectId, songId: a.songId, clipId: clip.id, revision: 0, placementId: placement.id,
      sourceOriginFrame: startFrame - sourceStartFrame, sourceStartFrame, sourceEndFrame: sourceStartFrame + frameCount, audioSource: 'song', placementIntent: null, trimIntent: null });
    recordEvent(a.projectId, 'placement.added', { songId: a.songId, placement, revision: a.revision + 1 });
    return saveArrangement({ ...a, revision: a.revision + 1, placements: [...a.placements, placement] });
  }
  function registerAsset(projectId: string, a: RegisteredAssetInput, mediaType: NonNullable<ReturnType<StudioStore['asset']>>['mediaType']): void {
    if (db.prepare('SELECT id FROM studio_assets WHERE id=? OR path=?').get(a.assetId, a.path)) conflict('Asset already belongs to a completed generation');
    db.prepare('INSERT INTO studio_assets(id,project_id,path,sha256,media_type) VALUES (?,?,?,?,?)').run(a.assetId, projectId, a.path, a.sha256, mediaType);
  }
  function renderRow(id: string): (JsonRow & { completion_json: string | null }) | undefined {
    return db.prepare('SELECT data,completion_json FROM studio_renders WHERE id=?').get(uuid(id)) as (JsonRow & { completion_json: string | null }) | undefined;
  }
  function saveRender(r: StudioRender): StudioRender { db.prepare('UPDATE studio_renders SET data=? WHERE id=?').run(canonical(r), r.id); return r; }

  function checkedArtifact(projectId: string, value: ArtifactRef): ArtifactRef {
    const p = project(projectId), input = object(value, ['kind', 'id']);
    if (input.kind !== 'song' && input.kind !== 'clip') invalid('Artifact kind must be song or clip');
    const id = uuid(input.id), media = input.kind === 'song' ? songById(id) : clipById(id);
    if (media.projectId !== p.id) missing('Artifact not found in this project');
    return { kind: input.kind, id };
  }
  function lifecycle(projectId: string, value: ArtifactRef): ArtifactLifecycle {
    projectId = project(projectId).id;
    const ref = checkedArtifact(projectId, value), row = db.prepare('SELECT data FROM studio_artifact_lifecycle WHERE artifact_id=?').get(ref.id) as JsonRow | undefined;
    return row ? decode<ArtifactLifecycle>(row) : { ...ref, projectId, state: 'active', revision: 0, thumbnailAssetId: null, deletionId: null, updatedAt: null };
  }
  function saveLifecycle(value: ArtifactLifecycle): ArtifactLifecycle {
    db.prepare('INSERT INTO studio_artifact_lifecycle VALUES (?,?,?,?) ON CONFLICT(artifact_id) DO UPDATE SET data=excluded.data')
      .run(value.id, value.kind, value.projectId, canonical(value)); return value;
  }
  function assertAvailable(projectId: string, ref: ArtifactRef, options: { allowArchived?: boolean } = {}): void {
    const value = lifecycle(projectId, ref);
    if (value.state !== 'active' && !(options.allowArchived && value.state === 'archived')) conflict(`${ref.kind} is ${value.state}; restore or explicitly choose available media before using it`);
  }
  function removeArtifactPlacements(projectId: string, ref: ArtifactRef): void {
    for (const row of db.prepare('SELECT data FROM studio_arrangements WHERE project_id=?').all(projectId) as JsonRow[]) {
      const a = decode<SongArrangement>(row), removed = a.placements.filter(p => ref.kind === 'song' ? a.songId === ref.id : p.clipId === ref.id);
      if (!removed.length) continue;
      const ids = new Set(removed.map(p => p.id));
      for (const row of db.prepare('SELECT data FROM studio_edit_contexts WHERE project_id=?').all(projectId) as JsonRow[]) {
        const c = decode<ClipEditContext>(row); if (c.placementId && ids.has(c.placementId)) saveContext({ ...c, revision: c.revision + 1, placementId: null });
      }
      saveArrangement({ ...a, revision: a.revision + 1, placements: a.placements.filter(p => !ids.has(p.id)) });
    }
  }
  function deselectSong(projectId: string, songId: string): void {
    const p = project(projectId); if (p.selectedSongId === songId) saveProject({ ...p, revision: p.revision + 1, selectedSongId: null });
  }
  function lifecycleChange(projectId: string, ref: ArtifactRef, revision: number, state: 'active' | 'archived'): ArtifactLifecycle {
    projectId = project(projectId).id; ref = checkedArtifact(projectId, ref); integer(revision, 'Artifact revision'); return write(() => {
      const before = lifecycle(projectId, ref);
      if (before.state === state && (revision === before.revision || revision === before.revision - 1)) return before;
      if (before.revision !== revision) conflict('Artifact changed; reload before managing it');
      if (!['active', 'archived'].includes(before.state)) conflict('Deleting or deleted media cannot be archived or restored');
      if (state === 'archived') { if (ref.kind === 'clip') removeArtifactPlacements(projectId, ref); else deselectSong(projectId, ref.id); }
      const after = saveLifecycle({ ...before, state, revision: before.revision + 1, updatedAt: now() });
      recordEvent(projectId, state === 'archived' ? 'artifact.archived' : 'artifact.restored', { artifactId: ref.id, kind: ref.kind, before: before.state, after: state, revision: after.revision }); return after;
    });
  }
  function deletionContext(projectId: string, ref: ArtifactRef): DeletionContext {
    projectId = project(projectId).id; ref = checkedArtifact(projectId, ref);
    const value = lifecycle(projectId, ref), snapshot = store.project(projectId), blockers: ArtifactBlocker[] = [];
    const videoDepends = (a: VideoAttempt) => ref.kind === 'song' ? a.song.id === ref.id : a.continuation?.clipId === ref.id || a.clipId === ref.id;
    const relatedVideos = snapshot.videoAttempts.filter(videoDepends);
    const relatedMusic = ref.kind === 'song' ? snapshot.attempts.filter(a => a.songId === ref.id) : [];
    for (const a of [...relatedMusic, ...relatedVideos]) if (activeStates.includes(a.state)) blockers.push({ kind: 'attempt', id: a.id, state: a.state, detail: 'Dependent generation has not completed owned-work release' });
    if (ref.kind === 'song' && songById(ref.id).analysis.state === 'pending') blockers.push({ kind: 'analysis', id: ref.id, state: 'pending', detail: 'Audio analysis is still using this song' });
    const renders = snapshot.renders.filter(r => ref.kind === 'song' ? r.songId === ref.id : r.snapshot.clips.some(c => c.id === ref.id));
    for (const r of renders) if (['queued', 'running', 'reconciling'].includes(r.state)) blockers.push({ kind: 'render', id: r.id, state: r.state, detail: 'Dependent preview/export has not finished' });
    for (const r of store.artifactUses(projectId).filter(r => r.artifact.id === ref.id)) blockers.push({ kind: 'reservation', id: r.id, state: 'reserved', detail: r.detail });
    const media = ref.kind === 'song' ? songById(ref.id) : clipById(ref.id);
    const ownAssets = 'rawFrames' in media ? [media.assetId, ...(media.audioAssetId ? [media.audioAssetId] : []), ...media.rawFrames.map(f => f.assetId)] : [media.assetId];
    const assetIds = [...new Set([...ownAssets, ...renders.flatMap(r => r.assetId ? [r.assetId] : [])])].sort();
    // Conservative project-wide bind includes even newly completed dependent work.
    // A terminal attempt may introduce copies after an earlier inventory was prepared.
    const contextHash = createHash('sha256').update(canonical({ project: snapshot.project, ref }));
    for (const table of ['studio_songs', 'studio_clips', 'studio_attempts', 'studio_video_attempts', 'studio_arrangements', 'studio_edit_contexts',
      'studio_clip_drafts', 'studio_renders', 'studio_events', 'studio_artifact_lifecycle', 'studio_deletions', 'studio_artifact_uses', 'studio_assets']) {
      contextHash.update(`\n${table}\n`);
      for (const row of db.prepare(`SELECT * FROM ${table} WHERE project_id=? ORDER BY rowid`).all(projectId)) contextHash.update(canonical(row)).update('\n');
    }
    const contextDigest = contextHash.digest('hex');
    return { lifecycle: value, digest: contextDigest, blockers, assetIds, renderIds: renders.map(r => r.id).sort() };
  }
  function checkedInventory(value: ManagedMediaInventory, projectId: string, ref: ArtifactRef, context: DeletionContext): ManagedMediaInventory {
    const v = object(value, ['version', 'projectId', 'artifact', 'entries', 'affectedAssetIds', 'affectedRenderIds', 'digest']);
    if (v.version !== 1 || v.projectId !== projectId || canonical(v.artifact) !== canonical(ref)) invalid('Purge inventory does not match its artifact');
    digest(v.digest);
    if (!Array.isArray(v.entries) || !Array.isArray(v.affectedAssetIds) || !Array.isArray(v.affectedRenderIds)) invalid('Purge inventory requires arrays');
    const assetIds = v.affectedAssetIds.map(uuid), renderIds = v.affectedRenderIds.map(uuid);
    if (canonical([...new Set(assetIds)].sort()) !== canonical(context.assetIds) || canonical([...new Set(renderIds)].sort()) !== canonical(context.renderIds)) conflict('Purge inventory does not cover exactly the registered artifact and affected renders');
    const ids = new Set<string>(), paths = new Set<string>();
    for (const entry of v.entries) {
      const e = object(entry, ['id', 'path', 'role', 'sha256', 'bytes', 'identity']);
      const id = text(e.id, 'Inventory entry ID', 1000, true), path = absolutePath(e.path); text(e.role, 'Inventory role', 1000, true);
      if (ids.has(id) || paths.has(path)) invalid('Purge inventory entries must be unique'); ids.add(id); paths.add(path);
      if (e.sha256 !== null) digest(e.sha256); if (e.bytes !== null) integer(e.bytes, 'Inventory byte count');
      if (e.identity !== null) { const identity = object(e.identity, ['dev', 'ino', 'mtimeNs', 'size']); for (const key of ['dev', 'ino', 'mtimeNs', 'size']) if (typeof identity[key] !== 'string' || !/^-?\d+$/.test(identity[key] as string)) invalid('File identity values must be integer strings'); }
    }
    for (const id of context.assetIds) { const asset = store.rawAsset(id); if (!asset || !paths.has(asset.path)) conflict('Purge inventory omitted registered media'); }
    return { ...v, affectedAssetIds: assetIds, affectedRenderIds: renderIds } as unknown as ManagedMediaInventory;
  }
  function saveDeletion(value: PurgeRecord): PurgeRecord { db.prepare('UPDATE studio_deletions SET data=? WHERE id=?').run(canonical(value), value.id); return value; }
  function requiredDeletion(id: string): PurgeRecord { const value = store.deletion(id); if (!value) missing('Deletion operation not found'); return value; }

  const store: StudioStore = {
    lifecycle, assertArtifactAvailable: assertAvailable, deletionContext,
    archiveArtifact(projectId, ref, revision) { return lifecycleChange(projectId, ref, revision, 'archived'); },
    restoreArtifact(projectId, ref, revision) { return lifecycleChange(projectId, ref, revision, 'active'); },
    deletions(projectId) {
      if (projectId !== undefined) projectId = project(projectId).id;
      const rows = projectId === undefined ? db.prepare('SELECT data FROM studio_deletions ORDER BY rowid').all() : db.prepare('SELECT data FROM studio_deletions WHERE project_id=? ORDER BY rowid').all(projectId);
      return (rows as JsonRow[]).map(row => decode<PurgeRecord>(row));
    },
    deletion(id) { const row = db.prepare('SELECT data FROM studio_deletions WHERE id=?').get(uuid(id)) as JsonRow | undefined; return row ? decode<PurgeRecord>(row) : null; },
    deletionForKey(projectId, key) { const p = project(projectId), row = db.prepare('SELECT data FROM studio_deletions WHERE project_id=? AND idempotency_key=?').get(p.id, uuid(key)) as JsonRow | undefined; return row ? decode<PurgeRecord>(row) : null; },
    acceptDeletion(projectId, value, input) {
      projectId = project(projectId).id;
      const args = object(input, ['contextDigest', 'idempotencyKey', 'inventory'], ['thumbnail', 'confirmation']);
      let confirmation: { planId: string; digest: string } | undefined;
      if (args.confirmation !== undefined) { const value = object(args.confirmation, ['planId', 'digest']); confirmation = { planId: uuid(value.planId), digest: digest(value.digest) }; }
      const key = uuid(args.idempotencyKey), expected = digest(args.contextDigest), captured = canonical(args);
      return write(() => {
        const ref = checkedArtifact(projectId, value), old = db.prepare('SELECT data,input_json FROM studio_deletions WHERE project_id=? AND idempotency_key=?').get(projectId, key) as (JsonRow & { input_json: string }) | undefined;
        if (old) { const existing = decode<PurgeRecord>(old); if (old.input_json !== captured || canonical(existing.artifact) !== canonical(ref)) conflict('Deletion key belongs to a different confirmed operation'); return existing; }
        const context = deletionContext(projectId, ref);
        if (context.digest !== expected) conflict('Artifact or its dependencies changed; review a fresh deletion confirmation');
        if (!['active', 'archived'].includes(context.lifecycle.state)) conflict('Artifact is already deleting or deleted');
        if (context.blockers.length) conflict(`Artifact is in use: ${context.blockers.map(b => `${b.kind} ${b.id} (${b.state})`).join('; ')}`);
        const inventory = checkedInventory(args.inventory as ManagedMediaInventory, projectId, ref, context);
        let thumbnailAssetId: string | null = null, retainedThumbnail: RetainedThumbnail | undefined;
        if (args.thumbnail !== undefined) {
          const t = object(args.thumbnail, ['assetId', 'path', 'sha256', 'bytes', 'width', 'height']);
          const asset = registeredAsset({ assetId: t.assetId, path: t.path, sha256: t.sha256 });
          integer(t.bytes, 'Thumbnail bytes', 1, 1_000_000); integer(t.width, 'Thumbnail width', 1, 320); integer(t.height, 'Thumbnail height', 1, 240);
          if (inventory.entries.some(e => e.path === asset.path)) invalid('Retained thumbnail must be independent of purged media');
          registerAsset(projectId, asset, 'image/png'); thumbnailAssetId = asset.assetId;
          retainedThumbnail = { ...asset, bytes: t.bytes as number, width: t.width as number, height: t.height as number };
        }
        if (ref.kind === 'clip' && thumbnailAssetId === null) conflict('Create a separate small history thumbnail before deleting this clip');
        const timestamp = now(), operation: PurgeRecord = { id: randomUUID(), projectId, artifact: ref, createdAt: timestamp, updatedAt: timestamp,
          state: 'pending', inventory, completedEntryIds: [], error: null, thumbnailAssetId, ...(retainedThumbnail ? { retainedThumbnail } : {}), ...(confirmation ? { confirmation } : {}) };
        db.prepare('INSERT INTO studio_deletions VALUES (?,?,?,?,?)').run(operation.id, projectId, key, captured, canonical(operation));
        removeArtifactPlacements(projectId, ref); if (ref.kind === 'song') deselectSong(projectId, ref.id);
        for (const id of context.renderIds) db.prepare('UPDATE studio_renders SET cache_eligible=0 WHERE id=?').run(id);
        saveLifecycle({ ...context.lifecycle, state: 'deleting', revision: context.lifecycle.revision + 1, thumbnailAssetId, deletionId: operation.id, updatedAt: timestamp });
        recordEvent(projectId, 'artifact.deletion_requested', { artifactId: ref.id, kind: ref.kind, deletionId: operation.id, fileCount: inventory.entries.length }, timestamp); return operation;
      });
    },
    patchDeletion(id, patch) {
      const value = object(patch, [], ['completedEntryIds', 'error']);
      return write(() => {
        const before = requiredDeletion(id); if (before.state === 'succeeded') return before;
        if (value.completedEntryIds !== undefined && (!Array.isArray(value.completedEntryIds) || value.completedEntryIds.some(v => typeof v !== 'string' || !before.inventory.entries.some(e => e.id === v)))) invalid('Purge progress contains an unknown entry');
        if (value.error !== undefined && value.error !== null) text(value.error, 'Purge error', 16000, true);
        const completedEntryIds = [...new Set([...before.completedEntryIds, ...(value.completedEntryIds as string[] | undefined ?? [])])];
        return saveDeletion({ ...before, completedEntryIds, state: value.error ? 'failed' : 'purging', error: value.error === undefined ? null : value.error as string | null, updatedAt: now() });
      });
    },
    finishDeletion(id) {
      return write(() => {
        const before = requiredDeletion(id); if (before.state === 'succeeded') return before;
        if (before.error || before.inventory.entries.some(e => !before.completedEntryIds.includes(e.id))) conflict('Managed media purge has not completed every file');
        const current = lifecycle(before.projectId, before.artifact);
        if (current.state !== 'deleting' || current.deletionId !== before.id) conflict('Deletion lifecycle does not match its operation');
        if (deletionContext(before.projectId, before.artifact).blockers.length) conflict('Artifact still has unresolved dependent work');
        const timestamp = now(), done = saveDeletion({ ...before, state: 'succeeded', updatedAt: timestamp });
        saveLifecycle({ ...current, state: 'deleted', revision: current.revision + 1, updatedAt: timestamp });
        recordEvent(before.projectId, 'artifact.deleted', { artifactId: before.artifact.id, kind: before.artifact.kind, deletionId: before.id, fileCount: before.inventory.entries.length }, timestamp); return done;
      });
    },
    retargetClipContext(projectId, contextId, revision, songId) {
      projectId = project(projectId).id; songId = uuid(songId);
      integer(revision, 'Context revision'); return write(() => {
        const c = getContext(projectId, contextId); if (c.revision !== revision) conflict('Clip edit changed; reload before choosing a replacement song');
        assertAvailable(projectId, { kind: 'clip', id: c.clipId }); assertAvailable(projectId, { kind: 'song', id: songId });
        if (c.placementId !== null) conflict('Remove this clip placement before choosing another song');
        if (c.songId === songId) return c;
        const after = saveContext({ ...c, songId, revision: c.revision + 1, placementIntent: null, trimIntent: null });
        recordEvent(projectId, 'clip.retargeted', { contextId: c.id, clipId: c.clipId, beforeSongId: c.songId, afterSongId: songId, revision: after.revision }); return after;
      });
    },
    reserveArtifactUse(projectId, ref, ownerId, detail, allowArchived = false) {
      projectId = project(projectId).id;
      text(ownerId, 'Reservation owner', 1000, true); text(detail, 'Reservation detail', 16000, true);
      return write(() => {
        const artifact = checkedArtifact(projectId, ref); assertAvailable(projectId, artifact, { allowArchived });
        const old = db.prepare('SELECT data FROM studio_artifact_uses WHERE artifact_id=? AND owner_id=?').get(artifact.id, ownerId) as JsonRow | undefined;
        if (old) return decode<ArtifactUseReservation>(old);
        const value: ArtifactUseReservation = { id: randomUUID(), projectId, artifact, ownerId, detail, createdAt: now() };
        db.prepare('INSERT INTO studio_artifact_uses VALUES (?,?,?,?,?)').run(value.id, projectId, artifact.id, ownerId, canonical(value)); return value;
      });
    },
    releaseArtifactUse(id) { write(() => { db.prepare('DELETE FROM studio_artifact_uses WHERE id=?').run(uuid(id)); }); },
    artifactUses(projectId) {
      if (projectId !== undefined) projectId = project(projectId).id;
      const rows = projectId === undefined ? db.prepare('SELECT data FROM studio_artifact_uses ORDER BY rowid').all() : db.prepare('SELECT data FROM studio_artifact_uses WHERE project_id=? ORDER BY rowid').all(projectId);
      return (rows as JsonRow[]).map(row => decode<ArtifactUseReservation>(row));
    },
    rawAsset(id) {
      const row = db.prepare('SELECT project_id,path,sha256,media_type FROM studio_assets WHERE id=?').get(uuid(id)) as { project_id: string; path: string; sha256: string; media_type: NonNullable<ReturnType<StudioStore['asset']>>['mediaType'] } | undefined;
      return row ? { projectId: row.project_id, path: row.path, sha256: row.sha256, mediaType: row.media_type } : null;
    },
    assets(projectId) { const p = project(projectId); return (db.prepare('SELECT id FROM studio_assets WHERE project_id=? ORDER BY rowid').all(p.id) as { id: string }[]).map(({ id }) => ({ id, ...store.rawAsset(id)! })); },

    close() { if (db.open) db.close(); },
    promptTemplates() {
      const row=db.prepare('SELECT data FROM studio_prompt_templates WHERE singleton=1').get() as JsonRow|undefined;
      return row?decode<PromptTemplateSettings>(row):{revision:0,...DEFAULT_AGENT_TEMPLATES};
    },
    savePromptTemplates(revision,value) {
      integer(revision,'Prompt template revision');const templates=object(value,['music','video']);
      for(const kind of ['music','video'] as const){const error=promptTemplateError(templates[kind]);if(error)invalid(`${kind==='music'?'Music':'Video'} template: ${error}`);}
      return write(()=>{
        const previous=store.promptTemplates();if(previous.revision!==revision)conflict('Prompt templates changed in another window. Reload the saved templates before applying your edits.');
        const saved:PromptTemplateSettings={revision:revision+1,music:templates.music as string,video:templates.video as string};
        db.prepare('INSERT INTO studio_prompt_templates(singleton,data) VALUES (1,?) ON CONFLICT(singleton) DO UPDATE SET data=excluded.data').run(canonical(saved));return saved;
      });
    },
    taskContexts() {
      const row=db.prepare('SELECT data FROM studio_task_contexts WHERE singleton=1').get() as JsonRow|undefined;
      return row?decode<TaskContextSettings>(row):{revision:0,overrides:{...DEFAULT_TASK_CONTEXT_OVERRIDES}};
    },
    saveTaskContexts(revision,value) {
      integer(revision,'Task context revision');const overrides=object(value,[...TASK_CONTEXT_IDS]);
      for(const id of TASK_CONTEXT_IDS){const error=taskContextError(id,overrides[id]);if(error)invalid(error);}
      return write(()=>{
        const previous=store.taskContexts();if(previous.revision!==revision)conflict('Task contexts changed in another window. Reload saved contexts before applying your edits.');
        const saved:TaskContextSettings={revision:revision+1,overrides:overrides as TaskContextSettings['overrides']};
        db.prepare('INSERT INTO studio_task_contexts(singleton,data) VALUES (1,?) ON CONFLICT(singleton) DO UPDATE SET data=excluded.data').run(canonical(saved));return saved;
      });
    },
    provider() { return (db.prepare('SELECT provider FROM studio_meta WHERE singleton=1').get() as { provider: Provider }).provider; },
    setProvider(value) { const p = providerId(value); db.prepare('UPDATE studio_meta SET provider=? WHERE singleton=1').run(p); },
    selectedProject() { return (db.prepare('SELECT selected_project FROM studio_meta WHERE singleton=1').get() as { selected_project: string | null }).selected_project; },
    selectProject(id) { write(() => { const p = project(id), before = store.selectedProject(); db.prepare('UPDATE studio_meta SET selected_project=? WHERE singleton=1').run(p.id);
      if (before !== p.id) recordEvent(p.id, 'project.selected', { previousProjectId: before }); }); },
    createProject(name) {
      const validated = text(name, 'Project name', 120, true).trim();
      return write(() => {
        const p: StudioProject = { id: randomUUID(), name: validated, createdAt: now(), revision: 0,
          draft: { musicPrompt: '', lyrics: '', style: '' }, selectedSongId: null };
        db.prepare('INSERT INTO studio_projects(id,data) VALUES (?,?)').run(p.id, canonical(p));
        db.prepare('UPDATE studio_meta SET selected_project=? WHERE singleton=1').run(p.id);
        recordEvent(p.id, 'project.created', { name: p.name }, p.createdAt); return p;
      });
    },
    listProjects() {
      return (db.prepare('SELECT data FROM studio_projects ORDER BY sequence').all() as JsonRow[]).map(row => {
        const p = decode<StudioProject>(row);
        const songCount = (db.prepare('SELECT id FROM studio_songs WHERE project_id=?').all(p.id) as { id: string }[]).filter(s => lifecycle(p.id, { kind: 'song', id: s.id }).state === 'active').length;
        const attempts = db.prepare('SELECT sequence,data FROM studio_attempts WHERE project_id=?').all(p.id) as AttemptRow[];
        const videos = (db.prepare('SELECT sequence,data FROM studio_video_attempts WHERE project_id=?').all(p.id) as AttemptRow[]).map(videoSnapshot);
        return { ...p, songCount, activeAttempts: [...attempts.map(attemptSnapshot), ...videos].filter(a => activeStates.includes(a.state)).length,
          coveragePercent: p.selectedSongId === null ? null : songCoverage(songById(p.selectedSongId), arrangement(p.id, p.selectedSongId).placements).percent };
      });
    },
    project(id) {
      const p = project(id);
      const videos = (db.prepare('SELECT sequence,data FROM studio_video_attempts WHERE project_id=? ORDER BY sequence').all(p.id) as AttemptRow[]).map(videoSnapshot);
      return { project: p, songs: (db.prepare('SELECT data FROM studio_songs WHERE project_id=? ORDER BY sequence').all(p.id) as JsonRow[]).map(row => decode<StudioSong>(row)),
        attempts: (db.prepare('SELECT sequence,data FROM studio_attempts WHERE project_id=? ORDER BY sequence').all(p.id) as AttemptRow[]).map(attemptSnapshot),
        videoAttempts: videos, clips: (db.prepare('SELECT data FROM studio_clips WHERE project_id=? ORDER BY rowid').all(p.id) as JsonRow[]).map(row => decode<StudioClip>(row)),
        arrangements: (db.prepare('SELECT data FROM studio_arrangements WHERE project_id=? ORDER BY rowid').all(p.id) as JsonRow[]).map(row => decode<SongArrangement>(row)),
        reservations: videos.filter(a => activeStates.includes(a.state)).map(a => ({ attemptId: a.id, songId: a.song.id, startFrame: a.input.startFrame, endFrame: a.input.endFrame })),
        clipDrafts: (db.prepare('SELECT data FROM studio_clip_drafts WHERE project_id=? ORDER BY rowid').all(p.id) as JsonRow[]).map(row => decode<ClipDraft>(row)),
        editContexts: (db.prepare('SELECT data FROM studio_edit_contexts WHERE project_id=? ORDER BY rowid').all(p.id) as JsonRow[]).map(row => decode<ClipEditContext>(row)),
        renders: (db.prepare('SELECT data FROM studio_renders WHERE project_id=? ORDER BY sequence').all(p.id) as JsonRow[]).map(row => decode<StudioRender>(row)),
        artifactLifecycles: [...(db.prepare('SELECT id FROM studio_songs WHERE project_id=? ORDER BY sequence').all(p.id) as { id: string }[]).map(({ id }) => lifecycle(p.id, { kind: 'song', id })),
          ...(db.prepare('SELECT id FROM studio_clips WHERE project_id=? ORDER BY rowid').all(p.id) as { id: string }[]).map(({ id }) => lifecycle(p.id, { kind: 'clip', id }))],
        deletions: store.deletions(p.id),
        events: (db.prepare('SELECT sequence,data FROM studio_events WHERE project_id=? ORDER BY sequence').all(p.id) as SetupRow[]).map(row => ({ ...decode<ProjectEvent>(row), sequence: row.sequence })) };
    },
    saveDraft(id, revision, draft) {
      integer(revision, 'Project revision'); const input = musicDraft(draft);
      return write(() => { const p = project(id); if (p.revision !== revision) conflict('Project changed; reload before editing');
        const timestamp = now();
        if (p.draft.style !== input.style) recordEvent(p.id, 'style.changed', { before: p.draft.style, after: input.style, revision: p.revision + 1 }, timestamp);
        if (p.draft.musicPrompt !== input.musicPrompt || p.draft.lyrics !== input.lyrics) recordEvent(p.id, 'draft.saved', {
          before: { musicPrompt: p.draft.musicPrompt, lyrics: p.draft.lyrics }, after: { musicPrompt: input.musicPrompt, lyrics: input.lyrics }, revision: p.revision + 1 }, timestamp);
        return saveProject({ ...p, revision: p.revision + 1, draft: input }); });
    },
    saveClipDraft(projectId, songId, revision, draft) {
      const input = clipDraftInput(draft);
      return write(() => {
        assertAvailable(projectId, { kind: 'song', id: songId });
        const before = currentClipDraft(projectId, songId, revision);
        const value: Pick<ClipDraft, 'clipPrompt' | 'timingIntent' | 'continuation'> = { clipPrompt: input.clipPrompt, timingIntent: input.timingIntent };
        if (input.continuation !== undefined) {
          const ref = input.continuation, old = before.continuation;
          value.continuation = ref === null ? null : old && old.contextId === ref.contextId && old.contextRevision === ref.contextRevision
            ? old : captureContinuation(before.projectId, ref, before.songId);
        }
        return persistClipDraft(before, value);
      });
    },
    prepareContinuation(projectId, contextId, revision, draftRevision) {
      const reference = continuationReference({ contextId, contextRevision: revision });
      return write(() => {
        const captured = captureContinuation(projectId, reference), before = currentClipDraft(projectId, captured.songId, draftRevision), song = songById(captured.songId);
        let preset: ReturnType<typeof continuationPreset>;
        try { preset = continuationPreset(song, captured.endFrame); }
        catch (error) { invalid(error instanceof Error ? error.message : 'Continuation timing is unavailable'); }
        const timingIntent: NonNullable<ClipDraft['timingIntent']> = { start: exactFrameTime(captured.endFrame),
          end: preset ? timingValueFromSeconds(preset.endSeconds) : { unit: 'seconds', value: '' } };
        const draft = persistClipDraft(before, { clipPrompt: before.clipPrompt, timingIntent, continuation: captured });
        return { draft, presetBeatCount: preset?.beatCount ?? null };
      });
    },
    selectSong(projectId, songId, revision) {
      integer(revision, 'Project revision');
      return write(() => { const p = project(projectId), s = songById(songId);
        if (s.projectId !== p.id) missing('Song not found in this project');
        assertAvailable(projectId, { kind: 'song', id: s.id });
        if (p.revision !== revision) conflict('Project changed; reload before selecting a song');
        let draft = p.draft;
        if (p.selectedSongId !== s.id) {
          const row = attemptRow(s.attemptId);
          if (!row) conflict('Song is missing its original generation request');
          const original = attemptSnapshot(row);
          if (original.projectId !== p.id || original.songId !== s.id) conflict('Song generation references do not match this project');
          // Restore the user's immutable request, not translated tool prompts.
          // Visual style belongs to the current project; reselecting the same
          // song must not erase edits made since that song was generated.
          draft = { ...p.draft, musicPrompt: original.input.musicPrompt, lyrics: original.input.lyrics };
          recordEvent(p.id, 'song.selected', { before: p.selectedSongId, after: s.id, cause: 'user', revision: p.revision + 1 });
        }
        return saveProject({ ...p, draft, selectedSongId: s.id, revision: p.revision + 1 }); });
    },
    submitMusic(projectId, idempotencyKey, input) {
      const key = uuid(idempotencyKey), captured = musicInput(input), inputJson = canonical(captured);
      return write(() => {
        const p = project(projectId);
        const old = db.prepare('SELECT * FROM studio_attempts WHERE project_id=? AND idempotency_key=?').get(p.id, key) as AttemptRow | undefined;
        if (old) {
          if (attemptSnapshot(old).recovery) conflict('Submission key belongs to a recovery action');
          // Earlier captures included project visual style. Compare the music
          // fields only, but return the original record without rewriting history.
          const previous = object(JSON.parse(old.input_json), ['musicPrompt', 'lyrics'], ['style']);
          if (canonical({ musicPrompt: previous.musicPrompt, lyrics: previous.lyrics }) !== inputJson) conflict('Submission key already belongs to different inputs');
          return attemptSnapshot(old);
        }
        const provider = store.provider(), timestamp = now();
        const a: MusicAttempt = { id: randomUUID(), nativeCallId: randomUUID(), projectId: p.id, sequence: nextSequence(),
          createdAt: timestamp, updatedAt: timestamp, state: 'queued', provider, model: providerModels[provider], input: captured,
          seeds: seedSet(), stage: 'Queued', error: null, songId: null, details: {},
          promptTemplate:{revision:store.promptTemplates().revision,template:store.promptTemplates().music},
          taskContext:{id:'music',revision:store.taskContexts().revision,template:store.taskContexts().overrides.music} };
        const result = db.prepare('INSERT INTO studio_attempts(sequence,id,native_call_id,project_id,idempotency_key,input_json,data) VALUES (?,?,?,?,?,?,?)')
          .run(a.sequence, a.id, a.nativeCallId, p.id, key, inputJson, canonical(a));
        return { ...a, sequence: Number(result.lastInsertRowid) };
      });
    },
    requestCancel(id) {
      return write(() => {
        const { kind, attempt: a } = anyAttempt(id);
        if (['succeeded', 'failed', 'cancelled'].includes(a.state) || a.cancellation) return a;
        const timestamp = now(), updated = saveAnyAttempt({ ...a, state: a.state === 'reconciling' ? 'reconciling' : 'cancel_requested',
          stage: a.state === 'reconciling' ? 'Cancellation requested; owned cleanup still requires reconciliation' : 'Cancellation requested; waiting for owned work to stop',
          cancellation: { requestedAt: timestamp, completedAt: null }, updatedAt: timestamp });
        recordEvent(a.projectId, 'attempt.cancel_requested', { attemptId: a.id, kind }, timestamp); return updated;
      });
    },
    finishCancellation(id, evidence) {
      const capturedDetails = details(evidence);
      return write(() => {
        const { kind, attempt: a } = anyAttempt(id);
        if (a.state === 'succeeded' || a.state === 'cancelled') return a;
        if (!a.cancellation || !['cancel_requested', 'reconciling'].includes(a.state)) conflict('Cancellation has not been requested or owned work is not in a cancellable state');
        const timestamp = now(), updated = saveAnyAttempt({ ...a, state: 'cancelled', stage: 'Cancelled; owned work stopped', error: null,
          cancellation: { ...a.cancellation, completedAt: timestamp }, details: { ...a.details, ...capturedDetails }, updatedAt: timestamp });
        recordEvent(a.projectId, 'attempt.cancelled', { attemptId: a.id, kind }, timestamp); return updated;
      });
    },
    recoverAttempt(id, action, idempotencyKey) {
      const key = uuid(idempotencyKey); if (action !== 'retry' && action !== 'restart') invalid('Recovery action must be retry or restart');
      return write(() => {
        const { kind, row, attempt: parent } = anyAttempt(id), table = kind === 'music' ? 'studio_attempts' : 'studio_video_attempts';
        const old = db.prepare(`SELECT * FROM ${table} WHERE project_id=? AND idempotency_key=?`).get(parent.projectId, key) as AttemptRow | undefined;
        if (old) {
          const previous = kind === 'music' ? attemptSnapshot(old) : videoSnapshot(old);
          if (previous.recovery?.parentAttemptId !== parent.id || previous.recovery.action !== action) conflict('Submission key already belongs to another recovery or generation');
          return previous;
        }
        if ('song' in parent) { assertAvailable(parent.projectId, { kind: 'song', id: parent.song.id }); if (parent.continuation) assertAvailable(parent.projectId, { kind: 'clip', id: parent.continuation.clipId }); }
        if (parent.state !== (action === 'retry' ? 'failed' : 'cancelled')) conflict(action === 'retry' ? 'Retry requires a failed attempt with known stopped work' : 'Restart requires confirmed cancellation');
        const timestamp = now();
        // New lifecycle identity, but immutable user intent, provider pairing,
        // all original seeds/song/frame/timing references are copied verbatim.
        const { cancellation: _cancel, recovery: _recovery, placeholderDiscardedAt: _hidden, ...original } = parent;
        const child: StudioAttempt = { ...original, id: randomUUID(), nativeCallId: randomUUID(), sequence: nextSequence(),
          createdAt: timestamp, updatedAt: timestamp, state: 'queued', stage: 'Queued recovery', error: null,
          recovery: { parentAttemptId: parent.id, action }, details: { recoverySource: { attemptId: parent.id, nativeCallId: parent.nativeCallId,
            ...(typeof parent.details.planPath === 'string' ? { planPath: parent.details.planPath } : {}) } } };
        db.prepare(`INSERT INTO ${table}(sequence,id,native_call_id,project_id,idempotency_key,input_json,data) VALUES (?,?,?,?,?,?,?)`)
          .run(child.sequence, child.id, child.nativeCallId, child.projectId, key, row.input_json, canonical(child));
        // Visibility changes must not move the parent's genuine terminal timestamp.
        if (!parent.placeholderDiscardedAt) saveAnyAttempt({ ...parent, placeholderDiscardedAt: timestamp });
        recordEvent(parent.projectId, 'attempt.recovered', { attemptId: child.id, parentAttemptId: parent.id, kind, action }, timestamp); return child;
      });
    },
    discardAttempt(id) {
      return write(() => {
        const { kind, attempt: a } = anyAttempt(id);
        if (!['failed', 'cancelled'].includes(a.state)) conflict('Only a stopped failed or cancelled placeholder can be discarded');
        if (a.placeholderDiscardedAt) return a;
        const timestamp = now(), updated = saveAnyAttempt({ ...a, placeholderDiscardedAt: timestamp });
        recordEvent(a.projectId, 'attempt.discarded', { attemptId: a.id, kind }, timestamp); return updated;
      });
    },
    restoreAttempt(id, revisions) {
      const requested = object(revisions, ['projectRevision'], ['clipDraftRevision']);
      integer(requested.projectRevision, 'Project revision');
      if (requested.clipDraftRevision !== undefined) integer(requested.clipDraftRevision, 'Clip draft revision');
      return write(() => {
        const { kind, attempt: a } = anyAttempt(id);
        if (!['failed', 'cancelled', 'succeeded'].includes(a.state)) conflict('Restore requires stopped work; successful results may be reused');
        const p = project(a.projectId); if (p.revision !== requested.projectRevision) conflict('Project changed; reload before restoring parameters');
        let draft: ClipDraft | null = null, music = p.draft, selectedSongId = p.selectedSongId;
        if ('song' in a) {
          assertAvailable(p.id, { kind: 'song', id: a.song.id });
          if (a.continuation) assertAvailable(p.id, { kind: 'clip', id: a.continuation.clipId });
          if (requested.clipDraftRevision === undefined) invalid('Video restore requires the original song clip draft revision');
          const before = currentClipDraft(p.id, a.song.id, requested.clipDraftRevision as number);
          selectedSongId = a.song.id;
          if (p.selectedSongId !== selectedSongId) {
            const song = songById(selectedSongId), original = attemptRow(song.attemptId);
            if (!original) conflict('Soundtrack is missing its original generation request');
            const songInput = attemptSnapshot(original).input;
            music = { ...music, musicPrompt: songInput.musicPrompt, lyrics: songInput.lyrics };
          }
          music = { ...music, style: a.input.style };
          const timingIntent = a.input.timingIntent ?? (a.input.requestedIntervalSeconds
            ? { start: { unit: 'seconds' as const, value: a.input.requestedIntervalSeconds.start }, end: { unit: 'seconds' as const, value: a.input.requestedIntervalSeconds.end } }
            : { start: exactFrameTime(a.input.startFrame), end: exactFrameTime(a.input.endFrame) });
          // Restore the captured image, even when the editable predecessor has
          // since changed. Fresh Generate must explicitly reprepare/remove stale refs.
          draft = persistClipDraft(before, { clipPrompt: a.input.clipPrompt, timingIntent, continuation: a.continuation ?? null });
        } else {
          music = { ...music, musicPrompt: a.input.musicPrompt, lyrics: a.input.lyrics };
          if (a.songId !== null && lifecycle(p.id, { kind: 'song', id: a.songId }).state === 'active') {
            if (songById(a.songId).projectId !== p.id) conflict('Restored song does not belong to this project');
            selectedSongId = a.songId;
          }
        }
        const revision = integer(p.revision + 1, 'Project revision'), timestamp = now();
        if (p.draft.style !== music.style) recordEvent(p.id, 'style.changed', { before: p.draft.style, after: music.style, revision }, timestamp);
        if (p.draft.musicPrompt !== music.musicPrompt || p.draft.lyrics !== music.lyrics) recordEvent(p.id, 'draft.saved', {
          before: { musicPrompt: p.draft.musicPrompt, lyrics: p.draft.lyrics }, after: { musicPrompt: music.musicPrompt, lyrics: music.lyrics }, revision }, timestamp);
        if (p.selectedSongId !== selectedSongId) recordEvent(p.id, 'song.selected', { before: p.selectedSongId, after: selectedSongId, cause: 'restore', revision }, timestamp);
        const updated = saveProject({ ...p, draft: music, selectedSongId, revision }), previousProjectId = store.selectedProject();
        db.prepare('UPDATE studio_meta SET selected_project=? WHERE singleton=1').run(p.id);
        if (previousProjectId !== p.id) recordEvent(p.id, 'project.selected', { previousProjectId }, timestamp);
        const restored = a.state === 'succeeded' || a.placeholderDiscardedAt ? a : saveAnyAttempt({ ...a, placeholderDiscardedAt: timestamp });
        recordEvent(p.id, 'attempt.restored', { attemptId: a.id, kind, action: a.state === 'succeeded' ? 'reuse' : 'restore',
          projectRevision: revision, ...(draft ? { songId: draft.songId, clipDraftRevision: draft.revision } : {}) }, timestamp);
        return { project: updated, draft, attempt: restored };
      });
    },
    attempts() { return (db.prepare('SELECT sequence,data FROM studio_attempts ORDER BY sequence').all() as AttemptRow[]).map(attemptSnapshot); },
    attempt(id) { const row = attemptRow(id); return row ? attemptSnapshot(row) : null; },
    patchAttempt(id, patch) {
      const p = attemptPatch(patch);
      return write(() => {
        const row = attemptRow(id); if (!row) missing('Attempt not found'); const a = attemptSnapshot(row);
        checkAttemptPatch(a, p); return saveAttempt({ ...a, ...p, updatedAt: now() });
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
        if (a.cancellation || ['failed', 'reconciling', 'cancel_requested', 'cancelled'].includes(a.state)) conflict('Cancelled, failed or unreconciled work cannot be ingested as successful');
        if (db.prepare('SELECT id FROM studio_assets WHERE id=? OR path=?').get(input.assetId, input.assetPath)) conflict('Asset already belongs to a completed generation');
        const { assetPath, ...songFields } = input;
        const s: StudioSong = { ...songFields, id: randomUUID(), projectId: a.projectId, attemptId: a.id, createdAt: now() };
        db.prepare('INSERT INTO studio_assets(id,project_id,path,sha256) VALUES (?,?,?,?)').run(s.assetId, s.projectId, assetPath, s.sha256);
        db.prepare('INSERT INTO studio_songs(id,project_id,attempt_id,asset_id,data) VALUES (?,?,?,?,?)').run(s.id, s.projectId, s.attemptId, s.assetId, canonical(s));
        db.prepare('INSERT INTO studio_arrangements VALUES (?,?,?)').run(s.id, s.projectId, canonical({ projectId: s.projectId, songId: s.id, revision: 0, placements: [] }));
        db.prepare('INSERT INTO studio_clip_drafts VALUES (?,?,?)').run(s.id, s.projectId, canonical({ projectId: s.projectId, songId: s.id, revision: 0, clipPrompt: '', timingIntent: null }));
        saveAttempt({ ...a, state: 'succeeded', stage: 'Complete', error: null, songId: s.id, details: capturedDetails, updatedAt: now() });
        db.prepare('UPDATE studio_attempts SET completion_json=? WHERE id=?').run(completion, a.id);
        const p = project(a.projectId); saveProject({ ...p, selectedSongId: s.id, revision: p.revision + 1 });
        recordEvent(p.id, 'song.selected', { before: p.selectedSongId, after: s.id, cause: 'generation', revision: p.revision + 1 }); return s;
      });
    },
    setAnalysis(songId, value) {
      return write(() => { const s = songById(songId); assertAvailable(s.projectId, { kind: 'song', id: s.id }, { allowArchived: true }); const updated = { ...s, analysis: analysis(value, s.sampleCount) };
        if (canonical(s.analysis) !== canonical(updated.analysis)) recordEvent(s.projectId, 'analysis.updated', { songId: s.id, before: analysisSummary(s.analysis), after: analysisSummary(updated.analysis) });
        db.prepare('UPDATE studio_songs SET data=? WHERE id=?').run(canonical(updated), s.id); return updated; });
    },
    submitVideo(projectId, idempotencyKey, input) {
      const key = uuid(idempotencyKey), captured = videoInput(input), inputJson = canonical(captured);
      return write(() => {
        const p = project(projectId), song = songById(captured.songId);
        if (song.projectId !== p.id) missing('Song not found in this project');
        const old = db.prepare('SELECT * FROM studio_video_attempts WHERE project_id=? AND idempotency_key=?').get(p.id, key) as AttemptRow | undefined;
        if (old) { if (videoSnapshot(old).recovery) conflict('Submission key belongs to a recovery action'); if (old.input_json !== inputJson) conflict('Submission key already belongs to different inputs'); return videoSnapshot(old); }
        assertAvailable(p.id, { kind: 'song', id: song.id });
        const continuation = captured.continuation ? captureContinuation(p.id, captured.continuation, song.id) : undefined;
        let timingResolution: VideoAttempt['timingResolution'];
        if (captured.timingIntent) {
          const timing = resolveTiming(song, captured.timingIntent);
          if (!timing.valid) invalid(timing.error);
          if (timing.startFrame !== captured.startFrame || timing.endFrame !== captured.endFrame) invalid('Frame interval does not match captured exact timing intent');
          const serialized = (value: { numerator: bigint; denominator: bigint }) => ({ numerator: String(value.numerator), denominator: String(value.denominator) });
          timingResolution = { startSeconds: serialized(timing.startSeconds), endSeconds: serialized(timing.endSeconds) };
          if (captured.requestedIntervalSeconds) {
            const start = exactDecimal(captured.requestedIntervalSeconds.start), end = exactDecimal(captured.requestedIntervalSeconds.end);
            if (start.numerator * timing.startSeconds.denominator !== timing.startSeconds.numerator * start.denominator ||
                end.numerator * timing.endSeconds.denominator !== timing.endSeconds.numerator * end.denominator) invalid('Exact timing metadata conflicts');
          }
        }
        const provider = store.provider(), timestamp = now();
        const a: VideoAttempt = { id: randomUUID(), nativeCallId: randomUUID(), projectId: p.id, sequence: nextSequence(),
          createdAt: timestamp, updatedAt: timestamp, state: 'queued', provider, model: providerModels[provider], input: captured,
          seeds: { h3: (randomBytes(8).readBigUInt64BE() & ((1n << 63n) - 1n)).toString() },
          promptTemplate:{revision:store.promptTemplates().revision,template:store.promptTemplates().video},
          taskContext:{id:continuation?'video-image':'video-text',revision:store.taskContexts().revision,template:store.taskContexts().overrides[continuation?'video-image':'video-text']},
          song: { id: song.id, assetId: song.assetId, sha256: song.sha256, sampleCount: song.sampleCount, sampleRate: song.sampleRate, channels: song.channels },
          stage: 'Queued', error: null, clipId: null, details: {}, ...(timingResolution ? { timingResolution } : {}), ...(continuation ? { continuation } : {}) };
        db.prepare('INSERT INTO studio_video_attempts(sequence,id,native_call_id,project_id,idempotency_key,input_json,data) VALUES (?,?,?,?,?,?,?)')
          .run(a.sequence, a.id, a.nativeCallId, p.id, key, inputJson, canonical(a)); return a;
      });
    },
    videoAttempts() { return (db.prepare('SELECT sequence,data FROM studio_video_attempts ORDER BY sequence').all() as AttemptRow[]).map(videoSnapshot); },
    videoAttempt(id) { const row = videoRow(id); return row ? videoSnapshot(row) : null; },
    patchVideoAttempt(id, patch) {
      const p = attemptPatch(patch);
      return write(() => { const row = videoRow(id); if (!row) missing('Video attempt not found'); const a = videoSnapshot(row);
        checkAttemptPatch(a, p);
        return saveVideo({ ...a, ...p, updatedAt: now() }); });
    },
    finishVideo(id, value, evidence) {
      const input = videoOutput(value), capturedDetails = details(evidence), completion = canonical(input);
      return write(() => {
        const row = videoRow(id); if (!row) missing('Video attempt not found'); const a = videoSnapshot(row);
        if (row.completion_json !== null) {
          if (row.completion_json !== completion) conflict('Completed attempt already has different output');
          if (!a.clipId) conflict('Completed attempt is missing its clip reference'); return clipById(a.clipId);
        }
        if (a.cancellation || ['failed', 'reconciling', 'cancel_requested', 'cancelled'].includes(a.state)) conflict('Cancelled, failed or unreconciled work cannot be ingested as successful');
        assertAvailable(a.projectId, { kind: 'song', id: a.song.id }, { allowArchived: true });
        if (a.continuation) assertAvailable(a.projectId, { kind: 'clip', id: a.continuation.clipId }, { allowArchived: true });
        const song = songById(a.song.id), requestedFrames = a.input.endFrame - a.input.startFrame;
        if (song.projectId !== a.projectId || song.sha256 !== a.song.sha256 || song.assetId !== a.song.assetId) conflict('Captured soundtrack no longer matches');
        if (input.frameCount < requestedFrames) invalid('Native source does not cover requested frames');
        registerAsset(a.projectId, input.video, 'video/mp4');
        if (input.audio) registerAsset(a.projectId, input.audio, 'audio/flac');
        for (const frame of input.frames) registerAsset(a.projectId, frame, 'image/png');
        const clip: StudioClip = { id: randomUUID(), projectId: a.projectId, attemptId: a.id, songId: a.song.id, songSha256: a.song.sha256,
          createdAt: now(), title: input.title, assetId: input.video.assetId, sha256: input.video.sha256, audioAssetId: input.audio?.assetId ?? null,
          fps: '24/1', width: input.width, height: input.height, nativeFrames: input.frameCount, requestedFrames,
          rawFrames: input.frames.map(({ path: _path, ...frame }) => frame) };
        db.prepare('INSERT INTO studio_clips VALUES (?,?,?,?)').run(clip.id, clip.projectId, clip.attemptId, canonical(clip));
        appendPlacement(arrangement(a.projectId, a.song.id), clip, a.input.startFrame);
        saveVideo({ ...a, state: 'succeeded', stage: 'Complete', clipId: clip.id, error: null, details: capturedDetails, updatedAt: now() });
        db.prepare('UPDATE studio_video_attempts SET completion_json=? WHERE id=?').run(completion, a.id); return clip;
      });
    },
    clip(id) { const row = db.prepare('SELECT data FROM studio_clips WHERE id=?').get(uuid(id)) as JsonRow | undefined; return row ? decode<StudioClip>(row) : null; },
    arrangement,
    addPlacement(projectId, songId, revision, input) {
      const p = object(input, ['clipId', 'startFrame'], ['sourceStartFrame', 'frameCount']);
      const clipId = uuid(p.clipId), start = integer(p.startFrame, 'Placement start');
      const source = p.sourceStartFrame === undefined ? 0 : integer(p.sourceStartFrame, 'Source start');
      const count = p.frameCount === undefined ? undefined : integer(p.frameCount, 'Placement frame count', 1);
      return write(() => { const a = currentArrangement(projectId, songId, revision), clip = clipById(clipId);
        if (clip.projectId !== a.projectId) missing('Clip not found in this project');
        assertAvailable(projectId, { kind: 'song', id: songId }); assertAvailable(projectId, { kind: 'clip', id: clipId });
        return appendPlacement(a, clip, start, source, count); });
    },
    movePlacement(projectId, songId, revision, placementId, startFrame) {
      const id = uuid(placementId), start = integer(startFrame, 'Placement start');
      return write(() => { const a = currentArrangement(projectId, songId, revision), placement = a.placements.find(p => p.id === id);
        if (!placement) missing('Placement not found in this arrangement');
        const endFrame = integer(start + placement.endFrame - placement.startFrame, 'Placement end', 1, Number.MAX_SAFE_INTEGER - 1);
        if (start !== placement.startFrame) { const c = getContext(projectId, placement.id); saveContext({ ...c, revision: c.revision + 1, sourceOriginFrame: start - c.sourceStartFrame, placementIntent: exactFrameTime(start), trimIntent: null }); }
        if (start !== placement.startFrame) recordEvent(a.projectId, 'placement.moved', { songId: a.songId, before: placement, after: { ...placement, startFrame: start, endFrame }, revision: a.revision + 1 });
        return saveArrangement({ ...a, revision: a.revision + 1, placements: a.placements.map(p => p.id === id ? { ...p, startFrame: start, endFrame } : p) }); });
    },
    removePlacement(projectId, songId, revision, placementId) {
      const id = uuid(placementId);
      return write(() => { const a = currentArrangement(projectId, songId, revision);
        const placement = a.placements.find(p => p.id === id); if (!placement) missing('Placement not found in this arrangement');
        const c = getContext(projectId, placement.id); saveContext({ ...c, revision: c.revision + 1, placementId: null });
        recordEvent(a.projectId, 'placement.removed', { songId: a.songId, placement, revision: a.revision + 1 });
        return saveArrangement({ ...a, revision: a.revision + 1, placements: a.placements.filter(p => p.id !== id) }); });
    },
    editClipContext(projectId, contextId, revision, arrangementRevision, edit) {
      return write(() => editedContext(projectId, contextId, revision, arrangementRevision, edit));
    },
    setContextPlacement(projectId, contextId, revision, arrangementRevision, placed) {
      if (typeof placed !== 'boolean') invalid('Placement state must be boolean');
      return write(() => {
        const { context: c, arrangement: a } = editState(projectId, contextId, revision, arrangementRevision);
        if (placed === (c.placementId !== null)) return { context: c, arrangement: a };
        const updated: ClipEditContext = { ...c, revision: integer(c.revision + 1, 'Edit context revision'), placementId: placed ? c.id : null };
        const placements = placed ? [...a.placements, { id: c.id, clipId: c.clipId, startFrame: integer(c.sourceOriginFrame + c.sourceStartFrame, 'Retained start'),
          endFrame: integer(c.sourceOriginFrame + c.sourceEndFrame, 'Retained end', 1, Number.MAX_SAFE_INTEGER - 1), sourceStartFrame: c.sourceStartFrame,
          priority: integer(a.placements.reduce((max, p) => Math.max(max, p.priority), 0) + 1, 'Placement priority', 1), audioSource: c.audioSource }]
          : a.placements.filter(p => p.id !== c.placementId);
        saveContext(updated); const arrangement = saveArrangement({ ...a, revision: integer(a.revision + 1, 'Arrangement revision'), placements });
        recordEvent(c.projectId, placed ? 'placement.added' : 'placement.removed', { songId: c.songId, contextId: c.id,
          placement: placed ? placements.at(-1)! : a.placements.find(p => p.id === c.placementId)!, revision: arrangement.revision });
        return { context: updated, arrangement };
      });
    },
    swapPlacementPriority(projectId, songId, revision, firstPlacementId, secondPlacementId) {
      const first = uuid(firstPlacementId), second = uuid(secondPlacementId); if (first === second) invalid('Choose two different overlapping placements');
      return write(() => {
        const a = currentArrangement(projectId, songId, revision), one = a.placements.find(p => p.id === first), two = a.placements.find(p => p.id === second);
        if (!one || !two) missing('Placement not found in this arrangement');
        if (Math.max(one.startFrame, two.startFrame) >= Math.min(one.endFrame, two.endFrame)) invalid('Only overlapping placements can swap dominance');
        const updated = saveArrangement({ ...a, revision: integer(a.revision + 1, 'Arrangement revision'), placements: a.placements.map(p => p.id === first ? { ...p, priority: two.priority } : p.id === second ? { ...p, priority: one.priority } : p) });
        recordEvent(a.projectId, 'placement.priority_swapped', { songId: a.songId, firstPlacementId: first, secondPlacementId: second,
          before: [one.priority, two.priority], after: [two.priority, one.priority], revision: updated.revision }); return updated;
      });
    },
    enqueueRender(projectId, songId, revision, idempotencyKey) {
      const key = uuid(idempotencyKey); integer(revision, 'Arrangement revision');
      return write(() => {
        const p = project(projectId), song = songById(songId);
        if (song.projectId !== p.id) missing('Song not found in this project');
        const old = db.prepare('SELECT r.data FROM studio_render_keys k JOIN studio_renders r ON r.id=k.render_id WHERE k.project_id=? AND k.idempotency_key=?').get(p.id, key) as JsonRow | undefined;
        if (old) { const r = decode<StudioRender>(old); if (r.songId !== song.id || r.revision !== revision) conflict('Render key belongs to another snapshot'); return r; }
        assertAvailable(projectId, { kind: 'song', id: songId });
        const a = currentArrangement(projectId, songId, revision), ids = [...new Set(a.placements.map(p => p.clipId))];
        for (const id of ids) assertAvailable(projectId, { kind: 'clip', id });
        const snapshot = { song, arrangement: a, clips: ids.map(clipById) }, timestamp = now();
        const snapshotHash = createHash('sha256').update(canonical({ profile: RENDER_PROFILE, snapshot })).digest('hex');
        // A new key can point to the canonical current render, but the key itself
        // remains durable: replay after later edits must still return that record.
        const cached = (db.prepare('SELECT data FROM studio_renders WHERE project_id=? AND song_id=? AND cache_eligible=1 ORDER BY sequence DESC').all(p.id, song.id) as JsonRow[])
          .map(row => decode<StudioRender>(row)).find(r => r.revision === revision && r.snapshotHash === snapshotHash && ['queued', 'running', 'succeeded'].includes(r.state));
        if (cached) { db.prepare('INSERT INTO studio_render_keys VALUES (?,?,?)').run(p.id, key, cached.id);
          recordEvent(p.id, 'render.reused', { renderId: cached.id, songId: song.id, revision, state: cached.state }); return cached; }
        const r: StudioRender = { id: randomUUID(), projectId: p.id, songId: song.id, revision, createdAt: timestamp, updatedAt: timestamp,
          state: 'queued', stage: 'Queued', error: null, snapshot, snapshotHash,
          assetId: null, sha256: null, frameCount: null, planHash: null, details: {} };
        db.prepare('INSERT INTO studio_renders(id,project_id,song_id,idempotency_key,data) VALUES (?,?,?,?,?)').run(r.id, p.id, song.id, key, canonical(r));
        db.prepare('INSERT INTO studio_render_keys VALUES (?,?,?)').run(p.id, key, r.id); return r;
      });
    },
    invalidateRenderCache(id) { const value = uuid(id); write(() => { const row = renderRow(value); if (!row) missing('Render not found');
      const changed = db.prepare('UPDATE studio_renders SET cache_eligible=0 WHERE id=? AND cache_eligible=1').run(value);
      if (changed.changes) { const r = decode<StudioRender>(row); recordEvent(r.projectId, 'render.cache_invalidated', { renderId: r.id, songId: r.songId, revision: r.revision }); } }); },
    renders() { return (db.prepare('SELECT data FROM studio_renders ORDER BY sequence').all() as JsonRow[]).map(row => decode<StudioRender>(row)); },
    render(id) { const row = renderRow(id); return row ? decode<StudioRender>(row) : null; },
    patchRender(id, patch) {
      const p = object(patch, [], ['state', 'stage', 'error', 'details']) as Parameters<StudioStore['patchRender']>[1];
      if (p.state !== undefined && !['queued', 'running', 'failed', 'reconciling'].includes(p.state)) invalid('Render completion requires validated atomic ingestion');
      if (p.stage !== undefined) text(p.stage, 'Render stage', 1000);
      if (p.error !== undefined && p.error !== null) text(p.error, 'Render error', 16000);
      if (p.details !== undefined) p.details = details(p.details);
      return write(() => { const row = renderRow(id); if (!row) missing('Render not found'); const r = decode<StudioRender>(row);
        if (r.state === 'succeeded' || r.state === 'failed') conflict('Finished renders cannot be changed');
        return saveRender({ ...r, ...p, updatedAt: now() }); });
    },
    finishRender(id, value, evidence) {
      const v = object(value, ['assetId', 'path', 'sha256', 'frameCount', 'planHash', 'receiptPath']);
      const asset = registeredAsset({ assetId: v.assetId, path: v.path, sha256: v.sha256 }), frameCount = integer(v.frameCount, 'Render frame count', 1);
      const planHash = digest(v.planHash), receiptPath = absolutePath(v.receiptPath), capturedDetails = details(evidence);
      const completion = canonical({ ...asset, frameCount, planHash, receiptPath });
      return write(() => { const row = renderRow(id); if (!row) missing('Render not found'); const r = decode<StudioRender>(row);
        if (row.completion_json !== null) { if (row.completion_json !== completion) conflict('Render already has different output'); return r; }
        if (r.state === 'failed' || r.state === 'reconciling') conflict('Failed or unreconciled render cannot be completed');
        assertAvailable(r.projectId, { kind: 'song', id: r.songId }, { allowArchived: true });
        for (const clip of r.snapshot.clips) assertAvailable(r.projectId, { kind: 'clip', id: clip.id }, { allowArchived: true });
        const song = r.snapshot.song, songFrames = (BigInt(song.sampleCount) * 24n + BigInt(song.sampleRate) - 1n) / BigInt(song.sampleRate);
        const expected = r.snapshot.arrangement.placements.reduce((end, p) => BigInt(p.endFrame) > end ? BigInt(p.endFrame) : end, songFrames);
        if (BigInt(frameCount) !== expected) invalid('Render frame count does not match its immutable timeline');
        registerAsset(r.projectId, asset, 'video/mp4');
        const updated = saveRender({ ...r, state: 'succeeded', stage: 'Complete', error: null, assetId: asset.assetId,
          sha256: asset.sha256, frameCount, planHash, details: capturedDetails, updatedAt: now() });
        db.prepare('UPDATE studio_renders SET completion_json=? WHERE id=?').run(completion, r.id); return updated;
      });
    },

    asset(id) {
      id = uuid(id); const asset = store.rawAsset(id); if (!asset) return null;
      if (store.deletions(asset.projectId).some(d => d.inventory.affectedAssetIds.includes(id))) return null;
      return asset;
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
        for (const a of store.attempts()) if (['preparing', 'waiting_gpu', 'running', 'validating', 'cancel_requested'].includes(a.state)) {
          saveAttempt({ ...a, state: 'reconciling', stage: 'Interrupted; native ownership must be reconciled before retry', updatedAt: now() });
        }
        for (const a of store.videoAttempts()) if (['preparing', 'waiting_gpu', 'running', 'validating', 'cancel_requested'].includes(a.state)) {
          saveVideo({ ...a, state: 'reconciling', stage: 'Interrupted; native ownership must be reconciled before retry', updatedAt: now() });
        }
        for (const r of store.renders()) if (r.state === 'running') saveRender({ ...r, state: 'reconciling', stage: 'Interrupted render; review before retry', updatedAt: now() });
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
