import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { MailToolBackend } from '../backend/mail-tool-backend';
import { createMailMcpServer } from '../server';

export type MailBackendResolver = (request: IncomingMessage) => Promise<MailToolBackend | null>;

export type MailMcpHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  parsedBody?: unknown,
) => Promise<void>;

export function createMailMcpHttpHandler(resolveBackend: MailBackendResolver): MailMcpHttpHandler {
  return async (request, response, parsedBody) => {
    const backend = await resolveBackend(request);
    if (backend === null) {
      writeUnauthorized(response);
      return;
    }
    const server = createMailMcpServer(backend);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, parsedBody);
  };
}

function writeUnauthorized(response: ServerResponse): void {
  response.writeHead(401, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    }),
  );
}

export function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  const match = header === undefined ? null : /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}
