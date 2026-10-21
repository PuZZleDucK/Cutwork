import { defineConfig } from 'vitest/config';

// Separately invoked: default tests never launch agents or generators.
// This is a test watchdog, not a product duration limit or latency criterion.
export default defineConfig({
  test: {
    include: ['tests/live/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
