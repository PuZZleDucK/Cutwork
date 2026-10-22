import { expect, test } from 'vitest';
import { activeNativeProgress } from '../support/native-progress.ts';

test('YuE cancellation evidence requires the currently running semantic stage and an unfinished latest token update', () => {
  const running = { state: 'running', calls: [{ stage: 'semantic', state: 'running' }] };
  const log = '[YuE2] Running Generating song: 280 tokens | 56.0 tokens/s | elapsed 5.0s';
  expect(activeNativeProgress('yue2', log, running).active).toBe(true);
  expect(activeNativeProgress('yue2', log + '\n[YuE2] Finished (generation limit reached) Generating song: 500 tokens', running).active).toBe(false);
  expect(activeNativeProgress('yue2', log, { ...running, calls: [{ stage: 'nar', state: 'running' }] }).active).toBe(false);
  expect(activeNativeProgress('yue2', log, { ...running, state: 'succeeded' }).active).toBe(false);
});
test('H3 proof excludes initialization, historical progress and completed sampler/prompt', () => {
  const running = { state: 'running' };
  expect(activeNativeProgress('h3', '\r 0%| | 0/20 [00:00<?, ?it/s]', running).active).toBe(false);
  expect(activeNativeProgress('h3', '\r 5%| | 1/20 [00:43<13:39, 43.11s/it]', running).active).toBe(true);
  expect(activeNativeProgress('h3', '\r 95%| | 19/20 [00:57<00:02]\r 100%| | 20/20 [01:00<00:00]', running).active).toBe(false);
  expect(activeNativeProgress('h3', '\r 5%| | 1/20 [00:43<13:39]\nPrompt executed in 90 seconds', running).active).toBe(false);
  expect(activeNativeProgress('h3', '\r 5%| | 1/20 [00:43<13:39]', { state: 'succeeded' }).active).toBe(false);
});
