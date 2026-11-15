import type { Readable, Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { SocketMailToolBackend } from '../socket/socket-mail-tool-backend';
import { serveMailMcpOverStdio, type RunningMailMcpServer } from '../transports/stdio';

export const MAIL_MCP_TOKEN_ENV = 'RELAY_MAIL_MCP_TOKEN';

export interface RelayMailMcpRuntime {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdin?: Readable;
  readonly stdout?: Writable;
}

export interface RunningRelayMailMcp extends RunningMailMcpServer {
  readonly backend: SocketMailToolBackend;
}

export async function runRelayMailMcp(runtime: RelayMailMcpRuntime): Promise<RunningRelayMailMcp> {
  const { values } = parseArgs({
    args: [...runtime.argv],
    options: { socket: { type: 'string' } },
    strict: true,
  });
  const token = runtime.env[MAIL_MCP_TOKEN_ENV];
  if (values.socket === undefined) {
    throw new Error('Missing --socket <path>');
  }
  if (token === undefined || token.length === 0) {
    throw new Error(`Missing ${MAIL_MCP_TOKEN_ENV} environment variable`);
  }
  const backend = await SocketMailToolBackend.connect(values.socket, token);
  const server = await serveMailMcpOverStdio(backend, runtime);
  return {
    backend,
    close: async () => {
      await server.close();
      backend.close();
    },
  };
}
