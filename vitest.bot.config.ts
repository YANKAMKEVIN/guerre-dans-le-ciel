import { defineConfig } from 'vitest/config';

// le bot joue des parties entières : séparé des tests unitaires pour qu'il ait sa propre étape en CI
export default defineConfig({
  test: {
    include: ['tests/bot/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    pool: 'threads',
    poolOptions: { threads: { maxThreads: 2, minThreads: 1 } },
  },
});
