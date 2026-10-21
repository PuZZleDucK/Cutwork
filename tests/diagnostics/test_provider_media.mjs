// Development diagnostics, not provider/native proof or approved-suite additions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mediaProofPlan, mediaProofRoot, providerOutcomeState } from '../../scripts/provider-media-proof.ts';

const source = resolve('.');
test('unconfirmed provider exit stays reconciling, never a confirmed failure', () => {
  assert.equal(providerOutcomeState(false, 'reconciling'), 'reconciling');
  assert.equal(providerOutcomeState(false, 'running'), 'reconciling');
  assert.equal(providerOutcomeState(true, 'reconciling'), 'reconciling');
  assert.equal(providerOutcomeState(false, 'failed'), 'provider-failed');
  assert.equal(providerOutcomeState(true, 'exited'), 'provider-exited-awaiting-independent-validation');
});

test('runtime root matches native-helper XDG precedence and absolute-path rule', () => {
  assert.equal(mediaProofRoot({}, '/home/example'), '/home/example/.local/share/music-video-studio');
  assert.equal(mediaProofRoot({ XDG_DATA_HOME: '/srv/data' }, '/home/example'), '/srv/data/music-video-studio');
  assert.equal(mediaProofRoot({ STUDIO_DATA_ROOT: '/srv/studio', XDG_DATA_HOME: '/srv/data' }, '/home/example'), '/srv/studio');
  assert.throws(() => mediaProofRoot({ STUDIO_DATA_ROOT: 'relative' }, '/home/example'));
  assert.throws(() => mediaProofRoot({ XDG_DATA_HOME: 'relative' }, '/home/example'));
});

test('planning snapshots brief, seeds and exact guidance without runtime writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-media-plan-'));
  try {
    const p = await mediaProofPlan(root, source, 'codex');
    assert.deepEqual(await readdir(root), []);
    assert.equal(p.intent.model, 'gpt-6.1-sol');
    assert.equal(p.intent.endFrame, 48);
    assert.equal(p.intent.startFrame, 0);
    assert.equal(p.launch.cwd, join(root, 'projects', p.intent.projectId, 'workspace'));
    assert.equal(p.launch.shell, false);
    assert.ok(p.launch.argv.includes('--dangerously-bypass-approvals-and-sandbox'));
    for (const g of p.guidance) {
      const bytes = await readFile(join(source, g.sourcePath));
      assert.equal(g.sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.ok(p.launch.stdin.includes(bytes.toString('utf8')));
    }
    const values = Object.values(p.intent.seeds);
    assert.equal(new Set(values).size, 4);
    for (const stage of ['abc', 'semantic', 'nar', 'h3']) {
      const seed = p.intent.seeds[stage];
      assert.match(seed, /^(0|[1-9][0-9]*)$/);
      assert.ok(BigInt(seed) < 2n ** (stage === 'h3' ? 64n : 63n));
      assert.ok(p.launch.stdin.includes(seed));
    }
    const prompt = p.launch.stdin;
    p.intent.musicPrompt = 'changed later'; p.guidance[0].text = 'changed later';
    assert.equal(p.launch.stdin, prompt);
    assert.ok(!p.launch.argv.includes('--output-schema'));
    assert.ok(prompt.includes('supervised sequential proof'));
    assert.ok(prompt.includes('no JSON answer schema'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fresh requests separate IDs/seeds and keep the captured provider', async () => {
  const a = await mediaProofPlan('/tmp/studio-media-fixture', source, 'claude');
  const b = await mediaProofPlan('/tmp/studio-media-fixture', source, 'claude');
  assert.equal(a.intent.model, 'claude-opus-5-5');
  assert.ok(a.launch.argv.includes('--dangerously-skip-permissions'));
  assert.notEqual(a.intent.attemptId, b.intent.attemptId);
  assert.notEqual(a.native.h3AttemptId, b.native.h3AttemptId);
  assert.notEqual(a.paths.musicReceipt, b.paths.musicReceipt);
  assert.notDeepEqual(a.intent.seeds, b.intent.seeds);
  await assert.rejects(() => mediaProofPlan('relative', source, 'codex'));
  await assert.rejects(() => mediaProofPlan('/tmp/x', source, 'unknown'));
});

test('CLI defaults to plan only and refuses unapproved live execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-media-cli-'));
  try {
    const env = { ...process.env, STUDIO_DATA_ROOT: root, STUDIO_LIVE: '0' };
    const plan = spawnSync(process.execPath, ['scripts/provider-media-proof.ts', 'codex'], { env, encoding: 'utf8' });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /Plan only/);
    assert.deepEqual(await readdir(root), []);
    const live = spawnSync(process.execPath, ['scripts/provider-media-proof.ts', 'codex', '--run'], { env, encoding: 'utf8' });
    assert.notEqual(live.status, 0);
    assert.match(live.stderr, /STUDIO_LIVE=1/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
