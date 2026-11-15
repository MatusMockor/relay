import { MAIL_MCP_SERVER_NAME } from '../../prompts/mail-tools';
import type { CliExit } from '../../process/cli-process';
import type { CliDialect, CliFailure, DialectInvocation, DialectRunInput } from '../cli-dialect';
import type { CliEventMapper } from '../cli-signal';
import { classifyCliFailure } from '../failure-classifier';
import { claudeMcpConfig } from './claude-mcp-config';
import { ClaudeStreamMapper } from './claude-stream-mapper';

const AUTH_PATTERN =
  /not logged in|invalid api key|please run \/login|authentication_error|oauth token|unauthorized|\b401\b/i;

export class ClaudeCliDialect implements CliDialect {
  readonly kind = 'claude' as const;

  constructor(private readonly model: string | null) {}

  async prepare(input: DialectRunInput): Promise<DialectInvocation> {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--input-format',
      'text',
      '--system-prompt',
      input.system,
      '--tools',
      '',
      '--strict-mcp-config',
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--disable-slash-commands',
      ...(await this.toolArgs(input)),
      ...(this.model === null ? [] : ['--model', this.model]),
    ];
    return { args, stdin: input.prompt, env: {} };
  }

  createMapper(): CliEventMapper {
    return new ClaudeStreamMapper();
  }

  classifyFailure(exit: CliExit, lastError: string | null): CliFailure {
    return classifyCliFailure(exit, lastError, AUTH_PATTERN);
  }

  private async toolArgs(input: DialectRunInput): Promise<string[]> {
    if (input.mailTools === null || input.tools.length === 0) {
      return [];
    }
    const configPath = await input.workspace.writePrivateFile(
      'mcp-config.json',
      claudeMcpConfig(input.mailTools),
    );
    const allowed = input.tools.map((tool) => `mcp__${MAIL_MCP_SERVER_NAME}__${tool}`);
    return ['--mcp-config', configPath, '--allowedTools', allowed.join(',')];
  }
}
