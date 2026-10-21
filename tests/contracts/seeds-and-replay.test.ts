import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContractDriver } from '../support/load-driver.ts';
import type { SliceOneDriver } from '../support/slice1-contract.ts';

let driver: SliceOneDriver;
beforeAll(async () => { driver = await loadContractDriver(); });
const stages = ['score', 'audio'];
// Synthetic 64-bit capabilities; NOT a claim about either generator's seed range.
const domains = { score: { min: '0', max: '18446744073709551615' }, audio: { min: '0', max: '18446744073709551615' } };

describe('S1-SEED: variation is different from recovery', () => {
  test('fresh generation records distinct resolved seeds from the supplied seed source', () => {
    const draws = ['12001', '12002'];
    const previous = { score: '1001', audio: '1002' };
    const result = driver.seeds({ domains, mode: 'fresh', stages, previous, draw: () => draws.shift()! });
    expect(result).toEqual({ score: '12001', audio: '12002' });
    expect(previous).toEqual({ score: '1001', audio: '1002' });
  });
  test.each(['retry', 'restart'] as const)('%s reuses recorded seeds and never draws a variation', mode => {
    const previous = { score: '9007199254740993', audio: '1002' };
    const result = driver.seeds({ domains, mode, stages, previous, draw: () => { throw Error('Unexpected random draw'); } });
    expect(result).toEqual(previous);
    expect(result).not.toBe(previous);
    expect(result.score).toBe('9007199254740993'); // no JavaScript-number rounding
  });
  test.each(['-1', 'random', '1.5', '', '18446744073709551616'])('does not record unresolved/invalid seed %j as an actual seed', seed => {
    expect(() => driver.seeds({ domains, mode: 'fresh', stages: ['audio'], previous: {}, draw: () => seed })).toThrow();
  });
  test('cannot claim an exact retry when a recorded stage seed is missing', () => {
    expect(() => driver.seeds({ domains, mode: 'retry', stages, previous: { score: '1001' }, draw: () => '9999' })).toThrow();
  });
});

describe('S1-REPLAY: capture actual file inputs, not mutable filenames', () => {
  test('retry reads the captured score/script/workflow/audio bytes after working files change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-replay-test-'));
    try {
      const originals = {
        score: '<score>original notes</score>', script: 'print("original tool call")',
        workflow: '{"label":"synthetic graph"}', audio: 'SYNTHETIC AUDIO BYTES, NOT A WAV',
      };
      const sourceFiles: Record<string, string> = {};
      for (const [name, bytes] of Object.entries(originals)) {
        sourceFiles[name] = join(directory, name);
        await writeFile(sourceFiles[name]!, bytes);
      }
      const captured = await driver.captureCall({
        id: 'call-1', attemptId: 'attempt-1', argv: ['python', 'original-script'],
        seeds: { audio: '1002' }, sourceFiles, snapshotDirectory: join(directory, 'runs', 'snapshots'),
      });
      for (const path of Object.values(sourceFiles)) await writeFile(path, 'CHANGED AFTER CAPTURE');
      const replay = await driver.replayCall(captured);
      expect(replay.argv).toEqual(['python', 'original-script']);
      expect(replay.seeds).toEqual({ audio: '1002' });
      for (const [name, bytes] of Object.entries(originals)) {
        expect(replay.files[name]).not.toBe(sourceFiles[name]);
        expect(await readFile(replay.files[name]!, 'utf8')).toBe(bytes);
        expect(captured.files[name]!.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      }
      // Inputs outside the run directory are allowed; snapshots do not sandbox agents.
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  test.each(['missing', 'tampered'] as const)('reports %s snapshot instead of silently replaying changed inputs', async mode => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-replay-test-'));
    try {
      const source = join(directory, 'score'); await writeFile(source, 'original');
      const captured = await driver.captureCall({
        id: 'call-1', attemptId: 'attempt-1', argv: ['native-tool'], seeds: { audio: '1002' },
        sourceFiles: { score: source }, snapshotDirectory: join(directory, 'snapshots'),
      });
      const snapshot = captured.files.score!.snapshotPath;
      if (mode === 'missing') await rm(snapshot); else await writeFile(snapshot, 'tampered');
      await expect(driver.replayCall(captured)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
