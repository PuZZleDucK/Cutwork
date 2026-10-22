import { afterEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolveNativeCommand, validateNativeSubmission } from '../../apps/server/src/generation/native-command.ts';
import type { GpuCall } from '../../apps/server/src/jobs/gpu-queue-contract.ts';

const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true }); });
function call(tool: 'yue2' | 'h3'): GpuCall {
  const id = randomUUID(); return { id, attemptId: randomUUID(), projectId: 'project-test', tool,
    request: { schemaVersion: 1, attemptId: id, ...(tool === 'h3' ? { projectId: 'project-test', seed: '18446744073709551615' } : { seeds: { semantic: '9223372036854775806' } }) },
    sequence: 1, state: 'leased', cancelRequested: false, launch: null, owner: null, result: null, release: null, error: null };
}
async function root() { const p = await mkdtemp(join(tmpdir(), 'native-command-')); directories.push(p); return p; }
test.each(['yue2', 'h3'] as const)('captures exact %s request and project cwd before launch with pinned Python and no shell', async tool => {
  const runtime = await root(), input = call(tool);
  const cmd = await resolveNativeCommand({ runtime, source: '/source', call: input, allocatePort: async () => 12345 });
  expect(cmd.cwd).toBe(join(runtime, 'projects/project-test/workspace'));
  expect(cmd.env).toEqual({ STUDIO_DATA_ROOT: runtime });
  expect(cmd.executable).toBe(tool === 'yue2' ? join(runtime, 'tools/yue2/venv/bin/python') : '/usr/bin/python3');
  expect(cmd.args.slice(0, 3)).toEqual(['-I', '-u', `/source/integrations/${tool}/generate.py`]);
  const requestPath = cmd.args[cmd.args.indexOf('--request') + 1]!;
  expect(JSON.parse(await readFile(requestPath, 'utf8'))).toEqual(input.request);
  if (tool === 'h3') expect(cmd.args).toContain('12345');
  else expect(cmd.args).toContain(join(runtime, 'projects/project-test/runs', input.id, 'receipt.json'));
  await expect(resolveNativeCommand({ runtime, source: '/source', call: input, allocatePort: async () => 12346 })).rejects.toThrow();
});
test('rejects traversal/mixed project or native-call identities instead of silently rewriting inputs', () => {
  for (const mutation of [
    (c: GpuCall) => { c.projectId = '../elsewhere'; },
    (c: GpuCall) => { c.id = 'not-a-call-uuid'; },
    (c: GpuCall) => { (c.request as Record<string, unknown>).attemptId = randomUUID(); },
    (c: GpuCall) => { (c.request as Record<string, unknown>).projectId = 'other-project'; },
    (c: GpuCall) => { (c.request as Record<string, unknown>).schemaVersion = 2; },
  ]) { const c = call('h3'); mutation(c); expect(() => validateNativeSubmission(c)).toThrow(); }
});
test('rejected paths/ports make no native request and never spawn a tool', async () => {
  const runtime = await root(), c = call('h3');
  await expect(resolveNativeCommand({ runtime: 'relative', source: '/source', call: c })).rejects.toThrow();
  await expect(resolveNativeCommand({ runtime, source: '/source', call: c, allocatePort: async () => 80 })).rejects.toThrow();
});
