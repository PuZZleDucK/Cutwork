import { beforeAll, describe, expect, test } from 'vitest';
import { join } from 'node:path';
import { loadContractDriver } from '../support/load-driver.ts';
import { host, intent } from '../support/fixtures.ts';
import type { HostObservations, SliceOneDriver } from '../support/slice1-contract.ts';

let driver: SliceOneDriver;
beforeAll(async () => { driver = await loadContractDriver(); });

describe('S1-ENV: host readiness is evidence, not directory existence', () => {
  test('accepts the supported baseline only when its media smoke fixture passed', () => {
    expect(driver.assessHost(host())).toEqual({ ready: true, issues: [] });
  });
  test.each<[string, Partial<HostObservations>]>([
    ['wrong Ubuntu release', { os: '24.04' }],
    ['wrong Node major', { nodeMajor: 22 }],
    ['8 GB is not the supported baseline', { gpuMiB: 8192 }],
    ['missing FFmpeg', { ffmpegFound: false }],
    ['missing FFprobe', { ffprobeFound: false }],
    ['present executables but failed codec fixture', { mediaFixturePassed: false }],
  ])('reports not ready: %s', (_, change) => {
    const result = driver.assessHost({ ...host(), ...change });
    expect(result.ready).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  test('gives all three Python tools distinct environments and explicit pip interpreters', () => {
    const environments = driver.environments('/tmp/studio-fixture');
    const folders = { comfyui: 'comfyui', yue2: 'yue2', analysis: 'audio-analysis' };
    expect(new Set(Object.values(environments).map(e => e.prefix)).size).toBe(3);
    for (const key of ['comfyui', 'yue2', 'analysis'] as const) {
      const env = environments[key];
      expect(env.prefix).toBe(join('/tmp/studio-fixture', 'tools', folders[key], 'venv'));
      expect(env.python).toBe(join(env.prefix, 'bin', 'python'));
      expect(env.pipArgv.slice(0, 3)).toEqual([env.python, '-m', 'pip']);
      expect(env.pipArgv).not.toContain('--break-system-packages');
      expect(env.pipArgv).not.toContain('sudo');
      expect(env.systemSitePackages).toBe(false);
    }
  });
});

describe('S1-AGENT: a normal capable agent in the correct project workspace', () => {
  test.each([
    ['codex', 'gpt-6.1-sol', '--dangerously-bypass-approvals-and-sandbox'],
    ['claude', 'claude-opus-5-5', '--dangerously-skip-permissions'],
  ] as const)('uses the captured %s provider/model and its autonomous mode', (provider, model, flag) => {
    const captured = driver.captureIntent({ ...intent(), provider, model });
    const launch = driver.providerLaunch('/tmp/studio-fixture', captured);
    expect(launch.executable).toBe(provider);
    expect(launch.shell).toBe(false);
    expect(launch.argv).toContain(flag);
    expect(launch.argv[launch.argv.indexOf('--model') + 1]).toBe(model);
    expect(launch.cwd).toBe('/tmp/studio-fixture/projects/project-a/workspace');
    expect(launch.runDirectory).toBe(join(launch.cwd, 'runs', 'attempt-1'));
    for (const forbidden of [
      '--bare', '--tools', '--disallowedTools', '--ignore-user-config', '--ignore-rules',
      '--output-schema', '--json-schema', '--json', '--ephemeral', '--sandbox',
    ]) expect(launch.argv).not.toContain(forbidden);
    expect(launch.argv).not.toContain('--last');
    expect(launch.argv).not.toContain('--continue');
    expect(launch.stdin).toContain(captured.musicPrompt);
    expect(launch.stdin).toContain(captured.lyrics);
    expect(launch.stdin).toContain(captured.style);
    expect(launch.stdin).toContain(captured.clipPrompt);
  });
  test('later mutations do not change captured provider, song, timing, prompts or seeds', () => {
    const original = intent();
    const expected = structuredClone(original);
    const captured = driver.captureIntent(original);
    original.provider = 'claude'; original.songId = 'song-b'; original.startFrame = 240;
    original.style = 'Changed later'; original.seeds.video = '9999';
    expect(captured).toEqual(expected);
  });
  test('separates projects while sharing a stable workspace within one project', () => {
    const a1 = driver.providerLaunch('/tmp/studio-fixture', intent());
    const a2 = driver.providerLaunch('/tmp/studio-fixture', { ...intent(), attemptId: 'attempt-2' });
    const b = driver.providerLaunch('/tmp/studio-fixture', { ...intent(), projectId: 'project-b' });
    expect(a1.cwd).toBe(a2.cwd);
    expect(a1.runDirectory).not.toBe(a2.runDirectory);
    expect(a1.cwd).not.toBe(b.cwd);
  });
  test('passes shell-like creative text as input, not as launcher arguments', () => {
    const prompt = 'Sing about $(compile); make the chorus say "rm -rf bad ideas"';
    const launch = driver.providerLaunch('/tmp/studio-fixture', { ...intent(), musicPrompt: prompt });
    expect(launch.stdin).toContain(prompt);
    expect(launch.argv).not.toContain(prompt);
    // This protects launcher interpolation, not the agent's ordinary shell capability.
  });
});
