import { isAbsolute, join } from 'node:path';
import type { HostObservations, PythonEnvironment } from '../../../../packages/core/src/contracts/generation.ts';

/** Decisions from observations. The caller must actually collect them. */
export function assessHost(input: HostObservations): { ready: boolean; issues: string[] } {
  const issues: string[] = [];
  if (input.os !== '26.04') issues.push('Supported host: Ubuntu 26.04.');
  if (input.nodeMajor !== 24) issues.push('The application requires the pinned Node 24 runtime.');
  // nvidia-smi reports 16,380 MiB on the nominal 16 GB Dundee GPU, not 16,384.
  if (!Number.isFinite(input.gpuMiB) || input.gpuMiB < 16_000) issues.push('The proof target is a 16 GB NVIDIA GPU; smaller GPUs are unverified.');
  if (!input.ffmpegFound) issues.push('FFmpeg is missing from the service environment.');
  if (!input.ffprobeFound) issues.push('FFprobe is missing from the service environment.');
  if (!input.mediaFixturePassed) issues.push('Encode/decode/probe capabilities have not passed their smoke check.');
  return { ready: issues.length === 0, issues };
}

/** An installation plan, never a claim that these interpreters already exist. */
export function environments(root: string): Record<'comfyui' | 'yue2' | 'analysis', PythonEnvironment> {
  if (!isAbsolute(root)) throw new Error('Data root must be absolute');
  const environment = (folder: string): PythonEnvironment => {
    const prefix = join(root, 'tools', folder, 'venv');
    const python = join(prefix, 'bin', 'python');
    return { prefix, python, pipArgv: [python, '-m', 'pip'], systemSitePackages: false };
  };
  return { comfyui: environment('comfyui'), yue2: environment('yue2'), analysis: environment('audio-analysis') };
}
