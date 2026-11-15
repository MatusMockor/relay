import { defineConfig, mergeConfig } from 'vitest/config';
import { relayVitestPreset } from './vitest/index';

export default mergeConfig(relayVitestPreset, defineConfig({}));
