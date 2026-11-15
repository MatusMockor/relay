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

const fitsSocketLimit = (path: string): boolean =>
  Buffer.byteLength(path, 'utf8') <= MAX_SOCKET_PATH;

export const chooseSocketPath = (directory: string, temporaryDirectory = tmpdir()): string => {
  const preferred = join(directory, 'mail-tools.sock');
  if (fitsSocketLimit(preferred)) {
    return preferred;
  }
  const name = `relay-mail-${randomBytes(6).toString('hex')}.sock`;
  const fallback = join(temporaryDirectory, name);
  if (fitsSocketLimit(fallback) || process.platform === 'win32') {
    return fallback;
  }
  return join('/tmp', name);
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
