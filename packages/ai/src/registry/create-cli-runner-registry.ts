import { CliDetector } from '../detection/cli-detector';
import { ClaudeCodeRunner } from '../runners/claude/claude-code-runner';
import type { CliRunnerOptions } from '../runners/cli-runner-options';
import { CodexRunner } from '../runners/codex/codex-runner';
import { DefaultAiRunnerRegistry } from './default-ai-runner-registry';

export interface CliRunnerRegistryOptions extends Omit<CliRunnerOptions, 'model'> {
  readonly models?: { readonly claude?: string | null; readonly codex?: string | null };
}

export function createCliRunnerRegistry(
  options: CliRunnerRegistryOptions,
): DefaultAiRunnerRegistry {
  const shared = { ...options, detector: options.detector ?? new CliDetector() };
  return new DefaultAiRunnerRegistry([
    new ClaudeCodeRunner({ ...shared, model: options.models?.claude ?? null }),
    new CodexRunner({ ...shared, model: options.models?.codex ?? null }),
  ]);
}
