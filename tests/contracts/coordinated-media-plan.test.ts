import { expect, test } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mediaProofPlan } from '../../scripts/provider-media-proof.ts';

test('provider media plan uses the shared native coordinator without restricting normal agent tools or forcing replies', async () => {
  const runtime = await mkdtemp(join(tmpdir(), 'studio-agent-plan-'));
  try {
    const plan = await mediaProofPlan(runtime, resolve('.'), 'codex');
    expect(await readdir(runtime)).toEqual([]);
    expect(plan.paths.musicReceipt).toBe(join(runtime, 'projects', plan.intent.projectId, 'runs', plan.native.musicAttemptId, 'receipt.json'));
    expect(plan.launch.stdin).toContain('scripts/native-call.ts');
    expect(plan.launch.stdin).toContain('http://127.0.0.1:9122');
    expect(plan.launch.stdin).toContain('coordinate the shared GPU lane');
    expect(plan.launch.stdin).toContain('no JSON answer schema');
    expect(plan.launch.argv).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(plan.launch.stdin).not.toContain('durable shared scheduler and cancellation API are not ready');
  } finally { await rm(runtime, { recursive: true, force: true }); }
});
