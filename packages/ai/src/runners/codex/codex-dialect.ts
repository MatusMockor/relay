import type { CliExit } from '../../process/cli-process';
import type { CliDialect, CliFailure, DialectInvocation, DialectRunInput } from '../cli-dialect';
import type { CliEventMapper } from '../cli-signal';
import { classifyCliFailure } from '../failure-classifier';
import { CodexEventMapper } from './codex-event-mapper';
import { codexMcpOverrides } from './codex-mcp-overrides';
import { codexBuiltinToolOverrides } from './codex-tool-policy';
import { modelArgs } from '../model-args';

const AUTH_PATTERN =
  /not logged in|codex login|unauthorized|\b401\b|authentication|refresh token|token expired/i;

export class CodexCliDialect implements CliDialect {
  readonly kind = 'codex' as const;

  constructor(private readonly model: string | null) {}

  prepare(input: DialectRunInput): Promise<DialectInvocation> {
    const mcp =
      input.mailTools === null || input.tools.length === 0
        ? { args: [], env: {} }
        : codexMcpOverrides(input.mailTools, input.tools);
    const args = [
      'exec',
      '--json',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--color',
      'never',
      '--cd',
      input.workspace.dir,
      '-c',
      'approval_policy="never"',
      '-c',
      'shell_environment_policy.inherit="none"',
      ...codexBuiltinToolOverrides(),
      ...mcp.args,
      ...modelArgs(input.model ?? this.model),
      ...(input.effort == null ? [] : ['-c', `model_reasoning_effort="${input.effort}"`]),
      '-',
    ];
    return Promise.resolve({
      args,
      stdin: `${input.system}\n\n${input.prompt}`,
      env: mcp.env,
    });
  }

  createMapper(): CliEventMapper {
    return new CodexEventMapper();
  }

  classifyFailure(exit: CliExit, lastError: string | null): CliFailure {
    return classifyCliFailure(exit, lastError, AUTH_PATTERN);
  }
}
