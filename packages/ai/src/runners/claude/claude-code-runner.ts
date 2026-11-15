import { CliAiRunner } from '../cli-ai-runner';
import type { CliRunnerOptions } from '../cli-runner-options';
import { ClaudeCliDialect } from './claude-dialect';

export class ClaudeCodeRunner extends CliAiRunner {
  constructor(options: CliRunnerOptions) {
    super(new ClaudeCliDialect(options.model ?? null), options);
  }
}
