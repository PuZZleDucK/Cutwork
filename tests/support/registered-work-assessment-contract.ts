/** Independent approved contract; compiler checks the production implementation. */
import * as implementation from '../../apps/server/src/jobs/registered-work-assessment.ts';
import type { ProcessOwner } from '../../apps/server/src/jobs/native-control.ts';
import type { Registration, ProcessMemory, RegisteredWorkEvidence, Identity,
  Discovery, Presence, GpuCorrelation } from '../../apps/server/src/jobs/registered-work-evidence.ts';

export interface NativeExitReceipt {
  receiptId: string;
  attemptId: string;
  registrationId: string;
  beforeWindowId: string;
  owner: ProcessOwner;
  observedAtMs: number;
  exitCode: number | null;
  signalCode: string | null;
}
export interface AssessmentInput {
  expectedRegistration: Registration;
  priorMemory: ProcessMemory;
  evidence: RegisteredWorkEvidence;
  exits: NativeExitReceipt[];
}
export interface Finding {
  kind: 'registered-process-observed' | 'associated-process-observed' | 'queue-work-observed' | 'gpu-pid-match';
  identity?: Identity;
  registrationId?: string;
  phase?: 'before' | 'after';
  gpuRowIndex?: number;
}
export interface Unresolved {
  code: 'report-binding-mismatch' | 'memory-incomplete' | 'history-lost' | 'collection-stopped' |
    'unresolved-launch' | 'census-unavailable' | 'gpu-unavailable' | 'reader-pending' |
    'query-cleanup-unresolved' | 'process-pid-reused' | 'candidate-association' |
    'gpu-correlation-uncertain' | 'historical-gpu-pid' | 'service-exit-unverified' |
    'exit-evidence-conflict' | 'report-inconsistent';
  phase?: 'before' | 'after';
  registrationId?: string;
  identity?: Identity;
  gpuRowIndex?: number;
  receiptId?: string;
}
export interface WorkAssessment {
  kind: 'registered-work-assessment';
  scope: 'captured-registration-only';
  windowId: string;
  attemptId: string;
  registrationRevision: number;
  startedAtMs: number;
  finishedAtMs: number;
  state: 'activity-observed' | 'indeterminate' | 'no-matching-activity-observed';
  findings: Finding[];
  unresolved: Unresolved[];
  processes: Array<{ identity: Identity; discoveredBy: Discovery; before: Presence; after: Presence }>;
  gpuRows: GpuCorrelation[];
  retiredServices: Array<{ registrationId: string; identity: Identity; receiptId: string;
    queue: 'unavailable-after-confirmed-exit' }>;
  limitations: string[];
}
export interface AssessmentModule {
  assessRegisteredWork(input: AssessmentInput): WorkAssessment;
}
export async function loadAssessment(): Promise<AssessmentModule> {
  return implementation;
}
