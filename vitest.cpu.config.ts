import { defineConfig } from 'vitest/config';

// Explicitly separate from the 12-case GPU live suite and from default tests.
// Diagnostic watchdogs are not product interruption-latency promises.
export default defineConfig({
  test: { include: ['tests/cpu-native/**/*.test.ts'], environment: 'node',
    fileParallelism: false, maxWorkers: 1, retry: 0, testTimeout: 60_000, hookTimeout: 240_000 },
});
