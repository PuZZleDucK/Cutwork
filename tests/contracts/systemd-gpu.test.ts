import { expect, test } from 'vitest';
import { validateCommand, parseUnitProperties, isEmptyCgroup, systemdLaunchArgs } from '../../apps/server/src/jobs/systemd-gpu.ts';

test('native command is absolute, argument-vector based and has an explicit project working directory', () => {
  const command = { executable: '/usr/bin/python3', args: ['score with spaces.py', '$NOT_EXPANDED'], cwd: '/runtime/projects/p', env: { STUDIO_DATA_ROOT: '/runtime' } };
  expect(validateCommand(command)).toEqual(command);
  for (const bad of [{ ...command, executable: 'python' }, { ...command, cwd: '.' },
    { ...command, args: ['a\0b'] }, { ...command, env: { BAD: 1 } }]) expect(() => validateCommand(bad)).toThrow();
});
test('transient unit owns process lifecycle without filesystem, network or agent-tool restrictions', () => {
  const argv = systemdLaunchArgs('studio-gpu-123.service', '/usr/bin/node', '/repo/scripts/native-gpu-supervisor.ts', '/runtime/run/plan.json', 60);
  expect(argv).toContain('--user'); expect(argv).toContain('--expand-environment=no');
  expect(argv).toContain('--property=KillMode=control-group');
  expect(argv).toContain('--property=RemainAfterExit=yes');
  expect(argv).toContain('--property=Restart=no');
  expect(argv).toContain('--property=RuntimeMaxSec=60s');
  expect(argv.join(' ')).not.toMatch(/ProtectSystem|PrivateNetwork|ReadOnlyPaths|NoNewPrivileges|MemoryMax|Restrict/);
  expect(argv.slice(-4)).toEqual(['/usr/bin/node', '/repo/scripts/native-gpu-supervisor.ts', '--plan', '/runtime/run/plan.json']);
});
test('unit properties reject malformed/duplicate data rather than guessing an owner', () => {
  const raw = 'Id=studio-gpu-123.service\nInvocationID=abcdef\nControlGroup=/user.slice/unit\nMainPID=42\nActiveState=active\nSubState=running\nLoadState=loaded\n';
  expect(parseUnitProperties(raw)).toMatchObject({ MainPID: '42', InvocationID: 'abcdef' });
  expect(() => parseUnitProperties(raw + 'MainPID=43\n')).toThrow();
  expect(() => parseUnitProperties('nonsense')).toThrow();
});
test('cgroup release needs populated zero, including descendant groups, not merely an empty root PID list', () => {
  expect(isEmptyCgroup('populated 0\nfrozen 0\n')).toBe(true);
  expect(isEmptyCgroup('populated 1\nfrozen 0\n')).toBe(false);
  for (const raw of ['', 'populated unknown', 'populated 0\npopulated 1', 'populated 0.0']) expect(() => isEmptyCgroup(raw)).toThrow();
});
