import { CliAiRunner } from '../cli-ai-runner';
import type { CliRunnerOptions } from '../cli-runner-options';
import { CodexCliDialect } from './codex-dialect';

export class CodexRunner extends CliAiRunner {
  constructor(options: CliRunnerOptions) {
    super(new CodexCliDialect(options.model ?? null), options);
  }
}
