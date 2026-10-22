/** Proposed CPU proof fixture contract. No service is started during import/collection. */
import { access } from 'node:fs/promises';
import { hostname } from 'node:os';
import { isAbsolute } from 'node:path';
import type { ProcessOwner } from '../../apps/server/src/jobs/native-control.ts';

export interface OwnedTransportConfig {
  port: number;
  owner: ProcessOwner;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}
export interface JsonRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}
export interface OwnedTransport {
  request<T>(input: JsonRequest, signal: AbortSignal,
    decode: (status: number, body: unknown) => T): Promise<T>;
}
export interface TransportModule {
  createOwnedComfyTransport(config: OwnedTransportConfig, io?: {
    readIdentity?: (pid: number, signal: AbortSignal) => Promise<ProcessOwner>;
  }): OwnedTransport;
}
export interface CpuFixture {
  /** Aborts on caller cancellation, parent termination, or owned cleanup. */
  signal: AbortSignal;
  config: OwnedTransportConfig;
  directory: string;
  command: string[];
  sourceRevision: string;
  /** Records cleanup separately. Cleanup may not supply job-cancellation evidence. */
  close(): Promise<{ ownedServiceExited: boolean; identityResolved: boolean }>;
}
export interface CpuFixtureModule {
  createCpuFixture(input: { runtime: string; signal: AbortSignal }): Promise<CpuFixture>;
}

export async function loadTransport(): Promise<TransportModule> {
  const source = new URL('../../apps/server/src/jobs/comfy-http.ts', import.meta.url);
  try { await access(source); }
  catch { throw new Error('TEST REVIEW ONLY: shared owned transport is not extracted; no fixture has started.'); }
  return import(/* @vite-ignore */ source.href) as Promise<TransportModule>;
}

export async function loadCpuFixture(): Promise<{ module: CpuFixtureModule; runtime: string }> {
  if (process.env.STUDIO_CPU_COMFY !== '1') {
    throw new Error('Opt-in CPU Comfy proof: review first, then set STUDIO_CPU_COMFY=1. No models or GPU inference.');
  }
  if (hostname().split('.')[0] !== 'dundee') throw new Error('Run the native CPU proof on Dundee; do not substitute a host.');
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use the reviewed Node 24 runtime.');
  const runtime = process.env.STUDIO_DATA_ROOT;
  if (!runtime || !isAbsolute(runtime)) throw new Error('Set STUDIO_DATA_ROOT to the reviewed absolute product runtime.');
  const source = new URL('./comfy-cpu-fixture.ts', import.meta.url);
  try { await access(source); }
  catch { throw new Error('TEST REVIEW ONLY: owned CPU fixture is absent; no service has started.'); }
  return { module: await import(/* @vite-ignore */ source.href) as CpuFixtureModule, runtime };
}
