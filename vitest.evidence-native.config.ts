import { defineConfig } from 'vitest/config';

// Explicit opt-in; not default tests, CPU cancellation, or the 12-case model suite.
export default defineConfig({
  test: { include: ['tests/evidence-native/**/*.test.ts'], environment: 'node',
    fileParallelism: false, maxWorkers: 1, retry: 0, testTimeout: 240_000, hookTimeout: 240_000 },
});
