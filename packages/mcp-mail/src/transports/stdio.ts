import type { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { MailToolBackend } from '../backend/mail-tool-backend';
import { createMailMcpServer } from '../server';

export interface StdioStreams {
  readonly stdin?: Readable;
  readonly stdout?: Writable;
}

export interface RunningMailMcpServer {
  close(): Promise<void>;
}

export async function serveMailMcpOverStdio(
  backend: MailToolBackend,
  streams: StdioStreams = {},
): Promise<RunningMailMcpServer> {
  const server = createMailMcpServer(backend);
  await server.connect(new StdioServerTransport(streams.stdin, streams.stdout));
  return { close: () => server.close() };
}
