/** Test-only facade: binds directly to application modules, not a fake implementation. */
import type { Provider, SeedMap, Intent, HostObservations, PythonEnvironment, VideoRequest, VideoPlan, CapturedCall, ClipEvidence, NativeOwner, CancelInput, CancelAction } from "../../packages/core/src/contracts/generation.ts";
export type { Provider, SeedMap, Intent, HostObservations, PythonEnvironment, VideoRequest, VideoPlan, CapturedCall, ClipEvidence, NativeOwner, CancelInput, CancelAction } from "../../packages/core/src/contracts/generation.ts";

export interface SliceOneDriver {
  assessHost(input: HostObservations): { ready: boolean; issues: string[] };
  environments(root: string): Record<'comfyui' | 'yue2' | 'analysis', PythonEnvironment>;
  captureIntent(input: Intent): Intent;
  providerLaunch(root: string, intent: Intent): {
    executable: string;
    shell: false;
    argv: string[];
    cwd: string;
    runDirectory: string;
    stdin: string;
  };
  planVideo(input: VideoRequest): VideoPlan;
  seeds(input: {
    mode: 'fresh' | 'retry' | 'restart';
    stages: string[];
    previous: SeedMap;
    domains: Record<string, { min: string; max: string }>;
    draw: () => string;
  }): SeedMap;
  captureCall(input: {
    id: string;
    attemptId: string;
    argv: string[];
    seeds: SeedMap;
    sourceFiles: Record<string, string>;
    snapshotDirectory: string;
  }): Promise<CapturedCall>;
  replayCall(call: CapturedCall): Promise<{
    argv: string[];
    seeds: SeedMap;
    files: Record<string, string>;
  }>;
  validateClip(evidence: ClipEvidence): {
    accepted: boolean;
    reasons: string[];
    initialPlacementFrames: number;
    retainedSourceFrames: number;
    clipAudioAvailable: boolean;
  };
  cancel(input: CancelInput): {
    state: 'cancel_requested' | 'cancelled' | 'reconciling' | 'succeeded';
    actions: CancelAction[];
    releaseGpu: boolean;
    maySubmit: boolean;
  };
  gpuHandoff(input: {
    currentTool: 'yue2' | 'h3';
    nextTool: 'yue2' | 'h3';
    ownerKnown: boolean;
    currentStopped: boolean;
    resourcesReleased: boolean;
    unloadFailed: boolean;
  }): 'hold' | 'unload-owned-tool' | 'dispatch-next';
}
