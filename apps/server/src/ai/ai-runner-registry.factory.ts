import type { AiRunnerRegistry } from '@relay/engine';
import { CliDetector, CliLocator, createCliRunnerRegistry } from '@relay/ai';
import type { ServerConfig } from '../config/server-config';

const createLocator = (cliPath: string | null): CliLocator =>
  cliPath === null ? new CliLocator() : new CliLocator({ pathEnv: cliPath, extraDirs: [] });

export const createServerAiRunnerRegistry = (config: ServerConfig): AiRunnerRegistry =>
  createCliRunnerRegistry({
    location: 'server',
    detector: new CliDetector({ locator: createLocator(config.ai.cliPath) }),
  });
