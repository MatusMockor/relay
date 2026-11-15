import { relayVitestPreset } from '@relay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(relayVitestPreset, defineConfig({ test: { environment: 'jsdom' } }));
