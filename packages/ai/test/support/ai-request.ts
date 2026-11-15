import type { AiMailToolsEndpoint, AiRequest } from '@relay/engine';
import { UserIdSchema, type AiEvent, type AiJobInput } from '@relay/shared/domain';
import { CliDetector } from '../../src/detection/cli-detector';
import { CliLocator } from '../../src/detection/cli-locator';

export const STDIO_TOOLS: AiMailToolsEndpoint & { env: Record<string, string> } = {
  transport: 'stdio',
  command: '/usr/bin/node',
  args: ['/opt/relay/mcp.js', '--socket', '/tmp/relay.sock'],
  url: null,
  headers: {},
  env: { RELAY_MAIL_MCP_TOKEN: 'local-secret' },
};

export function aiRequest(
  input: AiJobInput,
  overrides: Partial<Omit<AiRequest, 'input'>> = {},
): AiRequest {
  return {
    jobId: null,
    userId: UserIdSchema.parse('usr_1'),
    runner: 'claude',
    input,
    thread: null,
    mailTools: STDIO_TOOLS,
    timeoutMs: 15_000,
    signal: null,
    ...overrides,
  };
}

export function stubDetector(dir: string): CliDetector {
  return new CliDetector({ locator: new CliLocator({ pathEnv: dir, extraDirs: [] }) });
}

export async function collect(events: AsyncIterable<AiEvent>): Promise<AiEvent[]> {
  const collected: AiEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}
