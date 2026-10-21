/** Wiring only: every behaviour under test lives in application modules. */
import { assessHost, environments } from '../../apps/server/src/setup/readiness.ts';
import { captureIntent, providerLaunch } from '../../apps/server/src/providers/launch.ts';
import { planVideo } from '../../packages/core/src/time/video-plan.ts';
import { seeds } from '../../apps/server/src/generation/seeds.ts';
import { captureCall, replayCall } from '../../apps/server/src/generation/capture.ts';
import { validateClip } from '../../apps/server/src/media/validate-clip.ts';
import { cancel, gpuHandoff } from '../../packages/core/src/jobs/cancellation.ts';
import type { SliceOneDriver } from './slice1-contract.ts';

export const driver: SliceOneDriver = {
  assessHost, environments, captureIntent, providerLaunch, planVideo, seeds,
  captureCall, replayCall, validateClip, cancel, gpuHandoff,
};
