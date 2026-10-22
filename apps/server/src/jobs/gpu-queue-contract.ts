/** Internal native-call queue, not the user-facing generation/agent state machine.
 * One attempt may submit several calls. The app is the sole production writer;
 * helpers will submit through its API, never open the database themselves. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type GpuTool = 'yue2' | 'h3';
export type CallState = 'queued' | 'leased' | 'launching' | 'running' |
  'cancel_requested' | 'reconciling' | 'succeeded' | 'failed' | 'cancelled';
export interface CallInput {
  id: string;
  attemptId: string;
  projectId: string;
  tool: GpuTool;
  /** Immutable, resolved inputs including explicit seeds and file references. */
  request: Json;
}
export interface GpuCall extends CallInput {
  sequence: number;
  state: CallState;
  cancelRequested: boolean;
  launch: Json;
  owner: Json;
  result: Json;
  release: Json;
  error: string | null;
}
export interface GpuLease { callId: string; token: string; workerId: string }
export interface CallEvent { sequence: number; callId: string; kind: string; detail: Json }
export interface MaintenanceLease { tool: GpuTool; token: string }

/** This storage boundary serializes decisions. It cannot observe native processes
 * or certify GPU release. Only the trusted worker may commit a release, after its
 * adapter establishes quiescence for the owned work and retains the evidence.
 * Never expose finish/reconcile as an unauthenticated browser mutation. */
export interface GpuQueue {
  submit(input: CallInput): GpuCall;
  get(id: string): GpuCall | null;
  list(): GpuCall[];
  events(callId: string): CallEvent[];
  claim(workerId: string): GpuLease | null;
  heldLease(): GpuLease | null;
  prepareLaunch(lease: GpuLease, descriptor: Json): void;
  acknowledgeLaunch(lease: GpuLease, owner: Json): void;
  /** Freeze subsequent submissions for this attempt, cancel never-claimed calls,
   * and retain the lease for active work until the worker proves cleanup. */
  cancelAttempt(attemptId: string): void;
  finish(lease: GpuLease, outcome: 'succeeded' | 'failed' | 'cancelled', result: Json, release: Json): GpuCall;
  /** No timeout/TTL releases a held lease. Recovery is an explicit worker action. */
  reconcile(lease: GpuLease, reason: string): void;
  acquireMaintenance(tool: GpuTool): MaintenanceLease | null;
  releaseMaintenance(lease: MaintenanceLease): void;
  close(): void;
}
