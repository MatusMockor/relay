import { relayVitestPreset } from '@relay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  mergeConfig(viteConfig, relayVitestPreset),
  defineConfig({ test: { setupFiles: ['./test/setup.ts'] } }),
);
