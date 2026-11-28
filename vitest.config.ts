import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    poolOptions: { threads: { maxThreads: 2, minThreads: 1 } },
  },
});
