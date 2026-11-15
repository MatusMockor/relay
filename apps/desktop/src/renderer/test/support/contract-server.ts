import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  DEFAULT_USER_SETTINGS,
  type EndpointDefinition,
  listEndpoints,
  type NamedEndpoint,
} from '@relay/shared';
import { acceptWebSocket, type TestSocket } from './ws-server';
import { TEST_ME } from './fixtures';

export interface RecordedRequest {
  readonly key: string;
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

export interface RawBody {
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface HandlerResult {
  readonly status?: number;
  readonly body: unknown;
  readonly raw?: RawBody;
  readonly delayMs?: number;
}

export type Handler = (request: RecordedRequest, params: Record<string, string>) => HandlerResult;

export interface ContractServer {
  readonly url: string;
  readonly requests: RecordedRequest[];
  readonly sockets: TestSocket[];
  handle(key: string, handler: Handler): void;
  onSocketMessage(handler: (socket: TestSocket, text: string) => void): void;
  close(): Promise<void>;
}

const patternOf = (endpoint: EndpointDefinition): RegExp =>
  new RegExp(`^${endpoint.path.replace(/:([A-Za-z0-9_]+)/g, '(?<$1>[^/]+)')}$`);

const defaultBody = (named: NamedEndpoint): unknown => {
  const key = `${named.area}.${named.name}`;
  if (key === 'health.get') {
    return { name: 'relay', version: 'test', apiVersion: 1 };
  }
  if (key === 'settings.get' || key === 'settings.update') {
    return DEFAULT_USER_SETTINGS;
  }
  if (key === 'auth.me') {
    return TEST_ME;
  }
  const candidates: unknown[] = [
    [],
    { items: [], nextCursor: null },
    { ok: true },
    { pending: [] },
  ];
  return candidates.find((candidate) => named.endpoint.response.safeParse(candidate).success);
};

const readBody = (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text === '' ? undefined : JSON.parse(text));
    });
  });

export const startContractServer = async (): Promise<ContractServer> => {
  const endpoints = listEndpoints();
  const handlers = new Map<string, Handler>();
  const requests: RecordedRequest[] = [];
  const sockets: TestSocket[] = [];
  const upgraded = new Set<Duplex>();
  let onSocketMessage: (socket: TestSocket, text: string) => void = () => undefined;
  const respond = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    response.end(JSON.stringify(body));
  };
  const send = (response: ServerResponse, result: HandlerResult) => {
    if (result.raw !== undefined) {
      response.writeHead(result.status ?? 200, {
        'content-type': result.raw.contentType,
        'access-control-allow-origin': '*',
      });
      response.end(Buffer.from(result.raw.bytes));
      return;
    }
    respond(response, result.status ?? 200, result.body);
  };
  const server: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const match = endpoints
        .map((named) => ({
          named,
          found:
            named.endpoint.method === request.method
              ? patternOf(named.endpoint).exec(url.pathname)
              : null,
        }))
        .find((item) => item.found !== null);
      if (match === undefined) {
        respond(response, 404, { error: { code: 'not_found', message: 'Unknown endpoint' } });
        return;
      }
      const key = `${match.named.area}.${match.named.name}`;
      const recorded = {
        key,
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        authorization: request.headers.authorization,
        body,
      };
      requests.push(recorded);
      const result = handlers.get(key)?.(recorded, { ...match.found?.groups }) ?? {
        body: defaultBody(match.named),
      };
      if (result.delayMs !== undefined) {
        setTimeout(() => {
          send(response, result);
        }, result.delayMs);
        return;
      }
      send(response, result);
    });
  });
  server.on('upgrade', (request, socket) => {
    upgraded.add(socket);
    socket.on('close', () => upgraded.delete(socket));
    sockets.push(
      acceptWebSocket(request, socket, (client, text) => {
        onSocketMessage(client, text);
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    requests,
    sockets,
    handle: (key, handler) => handlers.set(key, handler),
    onSocketMessage: (handler) => {
      onSocketMessage = handler;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        upgraded.forEach((socket) => socket.destroy());
        server.close(() => {
          resolve();
        });
      }),
  };
};
