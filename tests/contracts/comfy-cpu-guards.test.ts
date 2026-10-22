import { afterEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoInheritedComfyConfig, createCpuRunGuard } from '../support/comfy-cpu-guards.ts';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function source() { const path = await mkdtemp(join(tmpdir(), 'studio-cpu-config-')); directories.push(path); return path; }

test('missing inherited Comfy config permits the proof preflight', async () => {
  await expect(assertNoInheritedComfyConfig(await source())).resolves.toBeUndefined();
});
test.each(['file', 'dangling-link'] as const)('inherited Comfy config (%s) refuses without changing it', async kind => {
  const directory = await source(), path = join(directory, 'extra_model_paths.yaml');
  if (kind === 'file') await writeFile(path, 'personal:\n  custom_nodes: /personal/nodes\n');
  else await symlink('/nonexistent/studio-cpu-test-config', path);
  await expect(assertNoInheritedComfyConfig(directory)).rejects.toThrow('refuses inherited');
  await expect(assertNoInheritedComfyConfig(directory)).rejects.toThrow('refuses inherited');
});
test.each(['SIGINT', 'SIGTERM'] as const)('%s aborts scenario work and latches against later launches after cleanup', name => {
  const events = new EventEmitter() as EventEmitter & { exitCode?: number };
  const run = createCpuRunGuard(events as unknown as Pick<NodeJS.Process, 'on' | 'off' | 'exitCode'>);
  const caller = new AbortController(), signal = run.signalFor(caller.signal);
  const cleanup = vi.fn();
  const detach = run.attach(cleanup);
  events.emit(name);
  expect(signal.aborted).toBe(true);
  expect(caller.signal.aborted).toBe(false); // Derived signal is what the scenario must use.
  expect(() => signal.throwIfAborted()).toThrow(name);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(events.exitCode).toBe(name === 'SIGINT' ? 130 : 143);
  detach();
  expect(events.listenerCount('SIGINT') + events.listenerCount('SIGTERM')).toBe(0);
  expect(() => run.signalFor(new AbortController().signal)).toThrow(name);
});
