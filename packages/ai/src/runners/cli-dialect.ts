import type { AiMailToolsEndpoint } from '@relay/engine';
import type { AiFailureCode, AiRunnerKind } from '@relay/shared/domain';
import type { MailToolName } from '../prompts/mail-tools';
import type { CliExit } from '../process/cli-process';
import type { CliEventMapper } from './cli-signal';
import type { RunWorkspace } from './run-workspace';

export interface DialectRunInput {
  readonly system: string;
  readonly prompt: string;
  readonly tools: readonly MailToolName[];
  readonly mailTools: AiMailToolsEndpoint | null;
  readonly workspace: RunWorkspace;
}

export interface DialectInvocation {
  readonly args: readonly string[];
  readonly stdin: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface CliFailure {
  readonly code: AiFailureCode;
  readonly message: string;
}

export interface CliDialect {
  readonly kind: AiRunnerKind;
  prepare(input: DialectRunInput): Promise<DialectInvocation>;
  createMapper(): CliEventMapper;
  classifyFailure(exit: CliExit, lastError: string | null): CliFailure;
}
