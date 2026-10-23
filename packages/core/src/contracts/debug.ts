import type { Provider, ToolId, ToolStatus } from './studio.ts';

export type DebugState = 'disclosed' | 'cancelled' | 'expired' | 'stale' | 'confirmed' | 'running' | 'checking' | 'succeeded' | 'failed' | 'reconciling';
export interface DebugLaunch {
 executable: string; argv: string[]; cwd: string; runDirectory: string; stdin: string; shell: false;
 sessionBinding: { provider: 'codex'; capture: 'native-stderr-header' } | { provider: 'claude'; capture: 'assigned-cli-argument'; sessionId: string };
}
/** Immutable consent document. The command is display text, never shell execution. */
export interface DebugPlan {
 id: string; tool: ToolId; provider: Provider; model: string; createdAt: string; expiresAt: string;
 digest: string; contextDigest: string; failureLogSha256: string;
 summary: string; warning: string; readableCommand: string; launch: DebugLaunch;
 prelaunchActions: string[];
}
export interface DebugReadiness { installed: boolean; ready: boolean; detail: string }
export interface DebugOutcome {
 provider: { succeeded: boolean; code: number | null; signal: string | null; receiptPath: string | null; report: string; reportTruncated: boolean } | null;
 readiness: DebugReadiness | null;
 boundary: string;
}
export interface DebugRecord {
 id: string; tool: ToolId; state: DebugState; plan: DebugPlan;
 createdAt: string; updatedAt: string; confirmedAt: string | null;
 error: string | null; outcome: DebugOutcome | null;
}
/** Read from existing cached state; preparation must not start an auth/probe process. */
export interface DebugContext {
 provider: Provider;
 tool: Pick<ToolStatus, 'id' | 'state' | 'installed' | 'detail' | 'log' | 'jobId'>;
 setupJob?: { id: string; state: string; error: string | null; updatedAt: string } | null;
}
