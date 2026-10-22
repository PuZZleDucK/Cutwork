import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { CallInput, CallEvent, CallState, GpuCall, GpuLease, GpuQueue,
  GpuTool, Json, MaintenanceLease } from './gpu-queue-contract.ts';

export class GpuQueueError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'GpuQueueError'; this.code = code; }
}
function reject(code: string, message: string): never { throw new GpuQueueError(code, message); }
function identifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    reject('GPU_QUEUE_INPUT', `${name} must be a nonempty, well-formed string without NUL`);
  }
  return value;
}
function tool(value: unknown): GpuTool {
  if (value !== 'yue2' && value !== 'h3') reject('GPU_QUEUE_INPUT', 'Unsupported native GPU tool');
  return value;
}

/** Stable lossless JSON capture, without toJSON/getter execution. Reject values
 * JSON.stringify would silently omit/coerce. Decimal integers needing more than
 * Number precision (including native seeds) must arrive as strings. */
function canonical(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(v: unknown, depth: number): string {
    if (depth > 128) reject('GPU_QUEUE_INPUT', 'JSON nesting exceeds 128 levels');
    if (v === null) return 'null';
    if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0) || (Number.isInteger(v) && !Number.isSafeInteger(v))) {
        reject('GPU_QUEUE_INPUT', 'JSON numbers must be finite and losslessly representable');
      }
      return JSON.stringify(v);
    }
    if (typeof v !== 'object') reject('GPU_QUEUE_INPUT', 'Value is not lossless JSON');
    if (ancestors.has(v)) reject('GPU_QUEUE_INPUT', 'Cyclic JSON is not supported');
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    if (!array && prototype !== Object.prototype && prototype !== null) reject('GPU_QUEUE_INPUT', 'JSON requires plain objects');
    const descriptors = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(v);
    if (keys.some(key => typeof key !== 'string')) reject('GPU_QUEUE_INPUT', 'JSON cannot contain symbol properties');
    ancestors.add(v);
    try {
      if (array) {
        if (keys.length !== v.length + 1) reject('GPU_QUEUE_INPUT', 'JSON arrays cannot contain holes or extra properties');
        const items: string[] = [];
        for (let index = 0; index < v.length; index++) {
          const d = descriptors[String(index)];
          if (!d || !('value' in d) || !d.enumerable) reject('GPU_QUEUE_INPUT', 'JSON array entries must be ordinary enumerable values');
          items.push(encode(d.value, depth + 1));
        }
        return `[${items.join(',')}]`;
      }
      return `{${(keys as string[]).sort().map(key => {
        const d = descriptors[key]!;
        if (!('value' in d) || !d.enumerable) reject('GPU_QUEUE_INPUT', 'JSON properties must be ordinary enumerable values');
        return `${JSON.stringify(key)}:${encode(d.value, depth + 1)}`;
      }).join(',')}}`;
    } finally { ancestors.delete(v); }
  }
  return encode(value, 0);
}
function nonNullJson(value: unknown, name: string): string {
  const json = canonical(value);
  if (json === 'null') reject('GPU_QUEUE_INPUT', `${name} cannot be null (reserved for absent evidence)`);
  return json;
}
function releaseJson(value: unknown): string {
  const json = canonical(value), copy: Json = JSON.parse(json);
  if (copy === null || typeof copy !== 'object' || Array.isArray(copy) || !Object.keys(copy).length) {
    reject('GPU_QUEUE_INPUT', 'A nonempty release-evidence object is required');
  }
  return json;
}
function captureLease(value: GpuLease): GpuLease {
  if (!value || typeof value !== 'object') reject('GPU_QUEUE_INPUT', 'Missing GPU lease');
  return { callId: identifier(value.callId, 'callId'), token: identifier(value.token, 'token'),
    workerId: identifier(value.workerId, 'workerId') };
}
interface CallRow {
  sequence: number; id: string; attempt_id: string; project_id: string; tool: GpuTool;
  input_json: string; request_json: string; state: CallState; cancel_requested: number;
  launch_json: string; owner_json: string; result_json: string; release_json: string; error: string | null;
}
function snapshot(row: CallRow): GpuCall {
  return { sequence: row.sequence, id: row.id, attemptId: row.attempt_id, projectId: row.project_id,
    tool: row.tool, request: JSON.parse(row.request_json), state: row.state, cancelRequested: row.cancel_requested === 1,
    launch: JSON.parse(row.launch_json), owner: JSON.parse(row.owner_json), result: JSON.parse(row.result_json),
    release: JSON.parse(row.release_json), error: row.error };
}

/** One shared durable lane. Transactions only persist decisions; they never
 * perform I/O to a tool, steal expired ownership, replay launches, or certify
 * native resource release. The worker alone may supply finish() evidence. */
export function openGpuQueue(path: string): GpuQueue {
  identifier(path, 'database path');
  if (!isAbsolute(path)) reject('GPU_QUEUE_INPUT', 'GPU queue requires an absolute persistent database path');
  const db = new Database(path, { timeout: 5000 });
  const write = <T>(operation: () => T): T => db.transaction(operation).immediate();
  try {
    const version = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version.split('.').map(Number);
    if (version.length !== 3 || version.some(n => !Number.isSafeInteger(n)) ||
        version[0]! * 1_000_000 + version[1]! * 1000 + version[2]! < 3_051_003) {
      reject('GPU_QUEUE_STORAGE', 'SQLite 3.51.3 or newer is required for the accepted WAL fix');
    }
    db.pragma('busy_timeout = 5000'); db.pragma('foreign_keys = ON');
    if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') reject('GPU_QUEUE_STORAGE', 'Persistent WAL mode is required');
    db.pragma('synchronous = FULL');
    if (db.pragma('synchronous', { simple: true }) !== 2) reject('GPU_QUEUE_STORAGE', 'FULL synchronous mode is required');
    write(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gpu_queue_meta (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version INTEGER NOT NULL);
        INSERT OR IGNORE INTO gpu_queue_meta VALUES (1, 1);
      `);
      if ((db.prepare('SELECT version FROM gpu_queue_meta WHERE singleton = 1').get() as { version: number }).version !== 1) {
        reject('GPU_QUEUE_STORAGE', 'Unsupported GPU queue schema version');
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS gpu_attempts (id TEXT PRIMARY KEY, cancel_requested INTEGER NOT NULL CHECK(cancel_requested IN (0,1)));
        CREATE TABLE IF NOT EXISTS gpu_calls (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT CHECK(sequence <= 9007199254740991),
          id TEXT NOT NULL UNIQUE, attempt_id TEXT NOT NULL REFERENCES gpu_attempts(id), project_id TEXT NOT NULL,
          tool TEXT NOT NULL CHECK(tool IN ('yue2','h3')), input_json TEXT NOT NULL, request_json TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('queued','leased','launching','running','cancel_requested','reconciling','succeeded','failed','cancelled')),
          cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
          launch_json TEXT NOT NULL DEFAULT 'null', owner_json TEXT NOT NULL DEFAULT 'null',
          result_json TEXT NOT NULL DEFAULT 'null', release_json TEXT NOT NULL DEFAULT 'null', error TEXT
        );
        CREATE INDEX IF NOT EXISTS gpu_calls_fifo ON gpu_calls(state, sequence);
        CREATE INDEX IF NOT EXISTS gpu_calls_attempt ON gpu_calls(attempt_id, sequence);
        CREATE TABLE IF NOT EXISTS gpu_lease (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1), call_id TEXT NOT NULL UNIQUE REFERENCES gpu_calls(id),
          token TEXT NOT NULL UNIQUE, worker_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gpu_maintenance (tool TEXT PRIMARY KEY CHECK(tool IN ('yue2','h3')), token TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS gpu_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT CHECK(sequence <= 9007199254740991),
          call_id TEXT NOT NULL REFERENCES gpu_calls(id), kind TEXT NOT NULL, detail_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS gpu_events_call ON gpu_events(call_id, sequence);
      `);
    });
  } catch (error) { db.close(); throw error; }

  const row = (id: string) => db.prepare('SELECT * FROM gpu_calls WHERE id = ?').get(id) as CallRow | undefined;
  const held = () => (db.prepare('SELECT call_id AS callId, token, worker_id AS workerId FROM gpu_lease WHERE singleton = 1').get() as GpuLease | undefined) ?? null;
  function active(lease: GpuLease): CallRow {
    const current = held();
    if (!current || current.callId !== lease.callId || current.token !== lease.token || current.workerId !== lease.workerId) {
      reject('GPU_QUEUE_LEASE', 'GPU lease does not match the persisted holder');
    }
    const call = row(lease.callId);
    if (!call || !['leased', 'launching', 'running', 'cancel_requested', 'reconciling'].includes(call.state)) {
      reject('GPU_QUEUE_STATE', 'Held GPU call is not active');
    }
    return call;
  }
  function event(callId: string, kind: string, detail: Json) {
    db.prepare('INSERT INTO gpu_events (call_id, kind, detail_json) VALUES (?, ?, ?)').run(callId, kind, canonical(detail));
  }
  return {
    submit(input: CallInput) {
      const copy = JSON.parse(canonical(input)) as CallInput;
      if (!copy || typeof copy !== 'object' || Object.keys(copy).length !== 5 ||
          Object.keys(copy).some(key => !['id', 'attemptId', 'projectId', 'tool', 'request'].includes(key))) {
        reject('GPU_QUEUE_INPUT', 'Expected exactly the native call input fields');
      }
      const call: CallInput = { id: identifier(copy.id, 'id'), attemptId: identifier(copy.attemptId, 'attemptId'),
        projectId: identifier(copy.projectId, 'projectId'), tool: tool(copy.tool), request: copy.request };
      const inputJson = canonical(call), requestJson = canonical(call.request);
      return write(() => {
        const existing = row(call.id);
        if (existing) {
          if (existing.input_json !== inputJson) reject('GPU_QUEUE_CONFLICT', 'Call ID already has different immutable inputs');
          return snapshot(existing);
        }
        db.prepare('INSERT OR IGNORE INTO gpu_attempts VALUES (?, 0)').run(call.attemptId);
        const attempt = db.prepare('SELECT cancel_requested FROM gpu_attempts WHERE id = ?').get(call.attemptId) as { cancel_requested: number };
        if (attempt.cancel_requested) reject('GPU_QUEUE_CANCELLED', 'Attempt is stopped for new submissions');
        db.prepare(`INSERT INTO gpu_calls (id, attempt_id, project_id, tool, input_json, request_json, state)
          VALUES (?, ?, ?, ?, ?, ?, 'queued')`).run(call.id, call.attemptId, call.projectId, call.tool, inputJson, requestJson);
        event(call.id, 'submitted', JSON.parse(inputJson)); return snapshot(row(call.id)!);
      });
    },
    get(id: string) { const found = row(identifier(id, 'id')); return found ? snapshot(found) : null; },
    list() { return (db.prepare('SELECT * FROM gpu_calls ORDER BY sequence').all() as CallRow[]).map(snapshot); },
    events(callId: string): CallEvent[] {
      const rows = db.prepare('SELECT sequence, call_id AS callId, kind, detail_json FROM gpu_events WHERE call_id = ? ORDER BY sequence')
        .all(identifier(callId, 'callId')) as Array<{ sequence: number; callId: string; kind: string; detail_json: string }>;
      return rows.map(({ detail_json, ...e }) => ({ ...e, detail: JSON.parse(detail_json) }));
    },
    heldLease: held,
    claim(workerId: string) {
      const worker = identifier(workerId, 'workerId');
      return write(() => {
        if (held()) return null;
        const first = db.prepare("SELECT * FROM gpu_calls WHERE state = 'queued' ORDER BY sequence LIMIT 1").get() as CallRow | undefined;
        if (!first || db.prepare('SELECT 1 FROM gpu_maintenance WHERE tool = ?').get(first.tool)) return null;
        const lease = { callId: first.id, token: randomUUID(), workerId: worker };
        db.prepare('INSERT INTO gpu_lease VALUES (1, ?, ?, ?)').run(lease.callId, lease.token, lease.workerId);
        db.prepare("UPDATE gpu_calls SET state = 'leased' WHERE id = ?").run(first.id);
        event(first.id, 'claimed', { workerId: worker }); return lease;
      });
    },
    prepareLaunch(value: GpuLease, descriptor: Json) {
      const lease = captureLease(value), captured = nonNullJson(descriptor, 'Launch descriptor');
      write(() => {
        const call = active(lease);
        if (call.cancel_requested || call.state !== 'leased' || call.launch_json !== 'null') {
          reject('GPU_QUEUE_STATE', 'Launch is not permitted for this call');
        }
        db.prepare("UPDATE gpu_calls SET state = 'launching', launch_json = ? WHERE id = ?").run(captured, call.id);
        event(call.id, 'launch-intent', JSON.parse(captured));
      });
    },
    acknowledgeLaunch(value: GpuLease, owner: Json) {
      const lease = captureLease(value), captured = nonNullJson(owner, 'Native owner acknowledgement');
      write(() => {
        const call = active(lease);
        if (call.launch_json === 'null' || call.owner_json !== 'null' ||
            !['launching', 'cancel_requested', 'reconciling'].includes(call.state)) {
          reject('GPU_QUEUE_STATE', 'Native acknowledgement requires an unacknowledged launch intent');
        }
        db.prepare('UPDATE gpu_calls SET state = ?, owner_json = ? WHERE id = ?')
          .run(call.cancel_requested ? 'cancel_requested' : 'running', captured, call.id);
        event(call.id, 'launch-acknowledged', JSON.parse(captured));
      });
    },
    cancelAttempt(attemptId: string) {
      const id = identifier(attemptId, 'attemptId');
      write(() => {
        const previous = db.prepare('SELECT cancel_requested FROM gpu_attempts WHERE id = ?').get(id) as { cancel_requested: number } | undefined;
        if (previous?.cancel_requested) return;
        db.prepare('INSERT INTO gpu_attempts VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET cancel_requested = 1').run(id);
        const calls = db.prepare("SELECT * FROM gpu_calls WHERE attempt_id = ? AND state NOT IN ('succeeded','failed','cancelled') ORDER BY sequence").all(id) as CallRow[];
        for (const call of calls) {
          const state = call.state === 'queued' ? 'cancelled' : call.state === 'reconciling' ? 'reconciling' : 'cancel_requested';
          db.prepare('UPDATE gpu_calls SET cancel_requested = 1, state = ? WHERE id = ?').run(state, call.id);
          event(call.id, state === 'cancelled' ? 'cancelled' : 'cancel-requested', { neverClaimed: call.state === 'queued' });
        }
      });
    },
    finish(value: GpuLease, outcome: 'succeeded' | 'failed' | 'cancelled', result: Json, release: Json) {
      const lease = captureLease(value), resultJson = canonical(result), evidenceJson = releaseJson(release);
      if (!['succeeded', 'failed', 'cancelled'].includes(outcome)) reject('GPU_QUEUE_INPUT', 'Invalid terminal outcome');
      return write(() => {
        const call = active(lease);
        if (outcome === 'succeeded' && (call.launch_json === 'null' || call.owner_json === 'null')) {
          reject('GPU_QUEUE_STATE', 'Successful completion requires a recorded native acknowledgement');
        }
        const state = call.cancel_requested ? 'cancelled' : outcome;
        const output = state === 'cancelled' ? 'null' : resultJson;
        db.prepare('UPDATE gpu_calls SET state = ?, result_json = ?, release_json = ? WHERE id = ?')
          .run(state, output, evidenceJson, call.id);
        event(call.id, state, { requestedOutcome: outcome, result: JSON.parse(output), release: JSON.parse(evidenceJson) });
        db.prepare('DELETE FROM gpu_lease WHERE singleton = 1').run();
        return snapshot(row(call.id)!);
      });
    },
    reconcile(value: GpuLease, reason: string) {
      const lease = captureLease(value), message = identifier(reason, 'Reconciliation reason');
      write(() => {
        const call = active(lease);
        if (call.state === 'reconciling' && call.error === message) return;
        db.prepare("UPDATE gpu_calls SET state = 'reconciling', error = ? WHERE id = ?").run(message, call.id);
        event(call.id, 'reconciling', { reason: message });
      });
    },
    acquireMaintenance(value: GpuTool) {
      const name = tool(value);
      return write(() => {
        if (db.prepare('SELECT 1 FROM gpu_maintenance WHERE tool = ?').get(name)) return null;
        const lease = held();
        if (lease && row(lease.callId)!.tool === name) return null;
        const lock: MaintenanceLease = { tool: name, token: randomUUID() };
        db.prepare('INSERT INTO gpu_maintenance VALUES (?, ?)').run(lock.tool, lock.token); return lock;
      });
    },
    releaseMaintenance(value: MaintenanceLease) {
      if (!value || typeof value !== 'object') reject('GPU_QUEUE_INPUT', 'Missing maintenance lease');
      const name = tool(value.tool), token = identifier(value.token, 'Maintenance token');
      write(() => {
        const lock = db.prepare('SELECT token FROM gpu_maintenance WHERE tool = ?').get(name) as { token: string } | undefined;
        if (!lock || lock.token !== token) reject('GPU_QUEUE_LEASE', 'Maintenance lease does not match the persisted holder');
        db.prepare('DELETE FROM gpu_maintenance WHERE tool = ?').run(name);
      });
    },
    close() { if (db.open) db.close(); },
  };
}
