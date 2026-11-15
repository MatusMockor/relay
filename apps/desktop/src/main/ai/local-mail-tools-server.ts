import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AiMailToolsEndpoint } from '@relay/engine';
import { MAIL_MCP_TOKEN_ENV, type MailToolBackend, MailToolSocketHost } from '@relay/mcp-mail';

const MAX_SOCKET_PATH = 100;

export interface McpEntryCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export type MailToolsEndpoint = AiMailToolsEndpoint & {
  readonly env: Readonly<Record<string, string>>;
};

export const chooseSocketPath = (directory: string): string => {
  const preferred = join(directory, 'mail-tools.sock');
  if (preferred.length <= MAX_SOCKET_PATH) {
    return preferred;
  }
  return join(tmpdir(), `relay-mail-${randomBytes(6).toString('hex')}.sock`);
};

export class LocalMailToolsServer {
  private readonly token = randomBytes(32).toString('base64url');
  private readonly host: MailToolSocketHost;

  constructor(
    private readonly socketPath: string,
    backend: MailToolBackend,
    private readonly entry: McpEntryCommand,
  ) {
    this.host = new MailToolSocketHost({ path: socketPath, token: this.token, backend });
  }

  get endpoint(): MailToolsEndpoint {
    return {
      transport: 'stdio',
      command: this.entry.command,
      args: [...this.entry.args, '--socket', this.socketPath],
      url: null,
      headers: {},
      env: { ...this.entry.env, [MAIL_MCP_TOKEN_ENV]: this.token },
    };
  }

  listen(): Promise<void> {
    return this.host.listen();
  }

  close(): Promise<void> {
    return this.host.close();
  }
}
