import { isAbsolute, join } from 'node:path';
import type { Intent, Provider } from '../../../../packages/core/src/contracts/generation.ts';
import { identifier } from '../../../../packages/core/src/contracts/validation.ts';

export const providerModels: Readonly<Record<Provider, string>> = {
  codex: 'gpt-6.1-sol', claude: 'claude-opus-5-5',
};

export function captureIntent(input: Intent): Intent {
  // No references back to mutable form/default/seed state survive submission.
  return structuredClone(input);
}

/** Prepare a normal CLI invocation; no process starts in this function. */
export function providerLaunch(root: string, intent: Intent) {
  if (!isAbsolute(root)) throw new Error('Data root must be absolute');
  if (!(intent.provider in providerModels) || providerModels[intent.provider] !== intent.model) {
    throw new Error('Captured provider/model pairing is unsupported; never substitute another model');
  }
  const cwd = join(root, 'projects', identifier(intent.projectId, 'projectId'), 'workspace');
  const runDirectory = join(cwd, 'runs', identifier(intent.attemptId, 'attemptId'));
  const argv = intent.provider === 'codex'
    ? ['exec', '--model', intent.model, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--cd', cwd, '-']
    : ['-p', '--model', intent.model, '--dangerously-skip-permissions'];
  const stdin = [
    'Create media for this project using your normal tools and capabilities.',
    'You may research, inspect relevant project context, write scripts and create or edit scores.',
    'The workspace organises project artifacts; it is not a filesystem sandbox.',
    `Project: ${intent.projectId}; attempt: ${intent.attemptId}; song: ${intent.songId}`,
    `Run directory: ${runDirectory}`,
    `Music description:\n${intent.musicPrompt}`, `Optional lyrics:\n${intent.lyrics}`,
    `Persistent visual style:\n${intent.style}`, `Clip description:\n${intent.clipPrompt}`,
    `Requested timeline interval: [${intent.startFrame}, ${intent.endFrame}) frames at 24 fps.`,
    `Assigned seeds (decimal strings): ${JSON.stringify(intent.seeds)}`,
    'Use the supplied generator guidance and registration helpers to record actual calls, seeds, native job ownership and output files.',
    'If using your own script, register equivalent evidence and coordinate the shared GPU lane.',
    'Report missing capabilities or tracking limitations instead of claiming success. Reply naturally; no JSON answer schema is required.',
  ].join('\n\n');
  return { executable: intent.provider, shell: false as const, argv, cwd, runDirectory, stdin };
}
