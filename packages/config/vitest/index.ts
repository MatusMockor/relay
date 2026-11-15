import { defineConfig } from 'vitest/config';

export const relayVitestPreset = defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    environment: 'node',
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
