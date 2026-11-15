import react from '@vitejs/plugin-react';
import { relayVitestPreset } from '@relay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  relayVitestPreset,
  defineConfig({
    plugins: [react()],
    test: { testTransformMode: { ssr: ['**/test/integration/**/*.test.{ts,tsx}'] } },
  }),
);
