/**
 * Approved provider-runner regression assertions (21 October 2026).
 * These launch only explicitly created local Node fixtures, never a provider.
 * The fixtures cannot spawn descendants or use the network. Teardown observes
 * Linux start/boot identity before killing exactly the fixture PID it owns.
 */
import { test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { observeProcess, runProvider } from '../../apps/server/src/providers/run.ts';

type Owner = Awaited<ReturnType<typeof observeProcess>>;

async function identityStillPresent(owner: Owner): Promise<boolean> {
  try {
    const actual = await observeProcess(owner.pid);
    return actual.start === owner.start && actual.boot === owner.boot && actual.group === owner.group;
  } catch (error) {
    // Linux can report ESRCH when /proc vanishes between open and read.
    if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

async function executing(owner: Owner): Promise<boolean> {
  if (!(await identityStillPresent(owner))) return false;
  // A terminated orphan may briefly remain a zombie before init reaps it.
  try {
    const stat = await readFile(`/proc/${owner.pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/)[0] !== 'Z';
  } catch (error) {
    // Linux can report ESRCH when /proc vanishes between open and read.
    if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs = 5000): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  do {
    const value = await read();
    if (value !== undefined) return value;
    await delay(25);
  } while (performance.now() < deadline);
  throw new Error('Local fixture did not reach the expected state');
}

test('S1-PROVIDER-REVIEW: a failed stdin delivery is failure even when the fixture CLI exits zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-provider-input-review-'));
  try {
    const cwd = join(root, 'workspace'); await mkdir(cwd);
    const runDirectory = join(cwd, 'runs', 'input-error');
    // The receiver deliberately closes stdin without accepting the prompt.
    // A prompt larger than a pipe buffer makes EPIPE observable, not timing luck.
    const result = await runProvider({
      // Test-only substitution for the production provider-name union: Node is
      // the real fixture executable, not a fake named codex/claude on the PATH.
      executable: process.execPath as Parameters<typeof runProvider>[0]['executable'],
      shell: false, cwd, runDirectory,
      argv: ['--input-type=module', '--eval',
        "import { closeSync } from 'node:fs'; closeSync(0); setTimeout(() => process.exit(0), 150);"],
      stdin: 'synthetic prompt data\n'.repeat(500_000),
    });
    const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
    expect(result.code).toBe(0); // retain the actual native exit code, don't rewrite evidence
    expect(receipt.inputError).toMatch(/EPIPE|closed|write/i);
    expect(receipt.state).toBe('failed');
    // Explicit application outcome lets the probe reject a misleading exit 0.
    expect(result).toMatchObject({ succeeded: false });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('S1-PROVIDER-REVIEW: SIGTERM to the probe stops its registered provider fixture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-provider-stop-review-'));
  const cwd = join(root, 'workspace'); await mkdir(cwd);
  const runDirectory = join(cwd, 'runs', 'interrupt');
  const moduleUrl = new URL('../../apps/server/src/providers/run.ts', import.meta.url).href;
  const fixtureOwnerPath = join(root, 'fixture-owner.json');
  // Independent cleanup evidence survives a missing/broken application receipt.
  // Self-expiry is a final backstop if startup fails before publishing either.
  const fixtureCode = `
    import { readFileSync, writeFileSync } from 'node:fs';
    const stat = readFileSync('/proc/self/stat', 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\\s+/);
    writeFileSync(${JSON.stringify(fixtureOwnerPath)}, JSON.stringify({
      kind: 'process', pid: process.pid, group: Number(fields[2]), start: fields[19],
      boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
    }), { flag: 'wx', mode: 0o600 });
    process.stdin.resume();
    setInterval(() => {}, 1000);
    setTimeout(() => process.exit(0), 8000);
  `;
  const launch = {
    executable: process.execPath, shell: false, cwd, runDirectory,
    argv: ['--input-type=module', '--eval', fixtureCode],
    stdin: 'synthetic task, no provider or network',
  };
  const harness = spawn(process.execPath, ['--input-type=module', '--eval',
    `import { runProvider } from ${JSON.stringify(moduleUrl)}; await runProvider(${JSON.stringify(launch)});`],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; harness.stderr.on('data', data => { stderr += String(data); });
  const closed = once(harness, 'close');
  let owner: Owner | undefined;
  try {
    owner = await waitFor(async () => {
      try {
        const receipt = JSON.parse(await readFile(join(runDirectory, 'provider-receipt.json'), 'utf8'));
        if (receipt.state !== 'running') return undefined;
        if (!receipt.owner || receipt.owner.kind !== 'process') throw new Error('Fixture ownership was not captured');
        return receipt.owner as Owner;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (harness.exitCode !== null) throw new Error(`Fixture harness exited: ${stderr}`);
        return undefined;
      }
    });
    expect(await executing(owner)).toBe(true);
    harness.kill('SIGTERM'); // only the probe, not the provider fixture/process group
    const deadline = performance.now() + 2000;
    while (await executing(owner) && performance.now() < deadline) await delay(25);
    // This is a local cleanup test budget, not certification of GPU stop latency.
    expect(await executing(owner)).toBe(false);
  } finally {
    // Never leak the intentionally failing fixture, never touch a real provider.
    if (!owner) {
      try { owner = JSON.parse(await readFile(fixtureOwnerPath, 'utf8')) as Owner; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    if (owner && await executing(owner)) process.kill(owner.pid, 'SIGKILL');
    if (harness.exitCode === null && harness.signalCode === null) harness.kill('SIGKILL');
    await closed;
    if (owner) {
      const observedOwner = owner;
      await waitFor(async () => await executing(observedOwner) ? undefined : true);
    } else {
      // No reliable identity: never guess a PID. Allow the bounded fixture's
      // self-expiry rather than leaving an indefinite detached process.
      await delay(8500);
    }
    await rm(root, { recursive: true, force: true });
  }
}, 25_000);
