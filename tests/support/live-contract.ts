import { access } from 'node:fs/promises';
import { hostname } from 'node:os';
import { isAbsolute } from 'node:path';
import type { Provider, SeedMap } from './slice1-contract.ts';

export interface LiveChain {
  songPath: string;
  clipPath: string;
  exportPath: string;
  receiptPath: string;
  frameManifestPath: string;
  nativeFrames: number;
  requestedFrames: number;
  placementStartFrame: number;
  placementEndFrame: number;
}

/** Bind to real implementation only; no simulator can satisfy the live gate. */
export interface LiveDriver {
  readiness(): Promise<{
    os: string;
    nodeMajor: number;
    providerModels: Record<Provider, string>;
    environments: Record<'comfyui' | 'yue2' | 'analysis', {
      prefix: string; basePrefix: string; systemSitePackages: boolean; importSmokePassed: boolean;
    }>;
    mediaSmokePassed: boolean;
  }>;
  providerTask(provider: Provider): Promise<{
    reportedModel: string; cwd: string; responseText: string;
    sessionId: string; scriptPath: string; scorePath: string; toolLogPath: string;
  }>;
  generateChain(input: { clipSeconds: '2'; provider: Provider }): Promise<LiveChain>;
  replayProbe(): Promise<{
    originalCallId: string; retryCallId: string;
    originalSeeds: SeedMap; retrySeeds: SeedMap;
    originalInputHashes: Record<string, string>; retryInputHashes: Record<string, string>;
    originalParameters: unknown; retryParameters: unknown;
  }>;
  cancellationProbe(tool: 'yue2' | 'h3', phase: 'queued' | 'running'): Promise<{
    requestMonotonicMs: number; confirmedStopMonotonicMs: number;
    inferenceStarted: boolean; observedRunningBeforeCancel: boolean;
    stillRunning: boolean; resourcesReleased: boolean; unrelatedWorkTouched: boolean;
    measurementPath: string;
  }>;
  handoffProbe(): Promise<Array<{
    tool: 'yue2' | 'h3';
    action: 'dispatch' | 'stopped' | 'resources-released';
  }>>;
  closeOwnedWork(): Promise<void>;
}

export async function loadLiveDriver(): Promise<LiveDriver> {
  if (process.env.STUDIO_LIVE !== '1') {
    throw new Error('Live tests may spend credits and run native generators. Set STUDIO_LIVE=1 explicitly after test review.');
  }
  if (hostname().split('.')[0] !== 'dundee') {
    throw new Error('Run the live suite on Dundee, not against a silently substituted machine.');
  }
  const runtime = process.env.STUDIO_LIVE_RUNTIME;
  if (!runtime || !isAbsolute(runtime)) {
    throw new Error('Set STUDIO_LIVE_RUNTIME to the reviewed absolute runtime directory.');
  }
  const url = new URL('./slice1-live-driver.ts', import.meta.url);
  try { await access(url); } catch {
    throw new Error('TEST REVIEW ONLY: live implementation binding is absent; no generator has been started.');
  }
  const module = await import(/* @vite-ignore */ url.href);
  if (typeof module.createDriver !== 'function') throw new Error('Live binding must export createDriver.');
  return module.createDriver({ runtime }) as Promise<LiveDriver>;
}
