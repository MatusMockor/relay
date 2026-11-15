import react from '@vitejs/plugin-react';
import { relayVitestPreset } from '@relay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  relayVitestPreset,
  defineConfig({
    plugins: [react()],
    test: {
      setupFiles: ['src/renderer/test/support/testing-library-setup.ts'],
      testTransformMode: { ssr: ['**/test/integration/**/*.test.{ts,tsx}'] },
    },
  }),
);
