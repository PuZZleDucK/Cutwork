/** Native helper lifecycle only. This is not the creative agent and does not
 * constrain agent tools, filesystem or network access. Launched in an owned
 * transient user unit; native work waits for the app's durable ownership ack. */
import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, open } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const planIndex = process.argv.indexOf('--plan');
if (planIndex < 0 || !process.argv[planIndex + 1]) throw new Error('Expected --plan');
const plan = JSON.parse(await readFile(process.argv[planIndex + 1]!, 'utf8'));
const directory: string = plan.directory;
async function record(name: string, value: unknown) {
  const target = join(directory, name), temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, target);
}
const stat = await readFile('/proc/self/stat', 'utf8');
const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
const identity = { pid: process.pid, group: Number(fields[2]), session: Number(fields[3]), startTicks: fields[19],
  bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() };
await record('supervisor.json', { ...identity, invocationId: process.env.INVOCATION_ID, unit: plan.unit });
const expires = performance.now() + 60000;
let permitted = false;
while (performance.now() < expires) {
  try {
    const gate = JSON.parse(await readFile(join(directory, 'go.json'), 'utf8'));
    if (gate.token !== plan.gateToken) throw new Error('Launch gate does not match this invocation');
    permitted = true; break;
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  await delay(20);
}
if (!permitted) {
  await record('exit.json', { code: 124, signal: null, error: 'No durable ownership acknowledgement before gate deadline', nativeLaunched: false });
  process.exitCode = 124;
} else {
  const out = await open(join(directory, 'stdout.log'), 'wx', 0o600);
  const err = await open(join(directory, 'stderr.log'), 'wx', 0o600);
  const startedAt = performance.now();
  const child = spawn(plan.command.executable, plan.command.args, { shell: false, detached: false,
    cwd: plan.command.cwd, env: { ...process.env, ...plan.command.env }, stdio: ['ignore', out.fd, err.fd] });
  const exit = new Promise<{ code: number | null; signal: string | null; error?: string }>(resolve => {
    child.once('error', e => resolve({ code: null, signal: null, error: e.message }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (child.pid) await record('native.json', { pid: child.pid, supervisor: identity, startedUnixMs: Date.now() });
  const result = await exit;
  await out.close(); await err.close();
  await record('exit.json', { ...result, nativeLaunched: !!child.pid, elapsedMs: performance.now() - startedAt });
  process.exitCode = result.code === 0 && !result.signal && !result.error ? 0 : 1;
}
