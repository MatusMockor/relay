import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  api,
  type CompleteAiJobBody,
  type EndpointDefinition,
  type FailAiJobBody,
  parseEndpointRequest,
  type TokenPair,
} from '@relay/shared/api';
import type { AiJob, AiRunnerLocation, ThreadDetail } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { acceptWebSocket, type TestSocket } from '../../../src/renderer/test/support/ws-server';

interface StubJob {
  job: AiJob;
  readonly thread: ThreadDetail | null;
  leaseId: string | null;
}

export interface StubRelayServer {
  readonly url: string;
  readonly calls: string[];
  readonly completed: CompleteAiJobBody[];
  readonly failed: FailAiJobBody[];
  readonly sockets: TestSocket[];
  location: AiRunnerLocation;
  tokens: TokenPair;
  issueTokens(expiresInMs: number): TokenPair;
  queue(job: AiJob, thread?: ThreadDetail | null): void;
  expireLease(jobId: string): void;
  push(event: RealtimeEvent): void;
  close(): Promise<void>;
}

const readBody = (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text === '' ? undefined : (JSON.parse(text) as unknown));
    });
  });

const respond = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const error = (code: string, message: string) => ({ error: { code, message } });

type Route = (
  parsed: { params: { id?: string }; body: unknown },
  stub: StubRelayServer,
  jobs: Map<string, StubJob>,
) => { status: number; body: unknown };

const leased = (jobs: Map<string, StubJob>, id: string | undefined, leaseId: unknown) => {
  const entry = id === undefined ? undefined : jobs.get(id);
  return entry !== undefined && entry.job.status === 'running' && entry.leaseId === leaseId
    ? entry
    : null;
};

const leaseIdOf = (body: unknown): unknown => (body as { leaseId?: unknown }).leaseId;

const ROUTES: readonly (readonly [EndpointDefinition, Route])[] = [
  [
    api.ai.claimJobs,
    (_parsed, stub, jobs) => {
      if (stub.location !== 'local') {
        return { status: 200, body: { location: stub.location, jobs: [] } };
      }
      const entry = [...jobs.values()].find((candidate) => candidate.job.status === 'queued');
      if (entry === undefined) {
        return { status: 200, body: { location: 'local', jobs: [] } };
      }
      entry.job = { ...entry.job, status: 'running' };
      entry.leaseId = randomUUID();
      const leaseUntil = new Date(Date.now() + 120_000).toISOString();
      return {
        status: 200,
        body: {
          location: 'local',
          jobs: [{ job: entry.job, leaseId: entry.leaseId, leaseUntil, thread: entry.thread }],
        },
      };
    },
  ],
  [
    api.ai.heartbeatJob,
    ({ params, body }, _stub, jobs) =>
      leased(jobs, params.id, leaseIdOf(body)) === null
        ? { status: 409, body: error('conflict', 'lease lost') }
        : { status: 200, body: { leaseUntil: new Date(Date.now() + 120_000).toISOString() } },
  ],
  [
    api.ai.jobMailToolsToken,
    ({ params, body }, _stub, jobs) =>
      leased(jobs, params.id, leaseIdOf(body)) === null
        ? { status: 409, body: error('conflict', 'lease lost') }
        : {
            status: 200,
            body: {
              token: `mcp-${params.id ?? ''}`,
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              path: '/mcp',
            },
          },
  ],
  [
    api.ai.completeJob,
    ({ params, body }, stub, jobs) => {
      const entry = leased(jobs, params.id, leaseIdOf(body));
      if (entry === null) {
        return { status: 409, body: error('conflict', 'lease lost') };
      }
      const completed = body as CompleteAiJobBody;
      if (completed.output.kind !== entry.job.kind) {
        return { status: 400, body: error('validation_failed', 'wrong output kind') };
      }
      stub.completed.push(completed);
      entry.job = { ...entry.job, status: 'done', output: completed.output };
      return { status: 200, body: entry.job };
    },
  ],
  [
    api.ai.failJob,
    ({ params, body }, stub, jobs) => {
      const entry = leased(jobs, params.id, leaseIdOf(body));
      if (entry === null) {
        return { status: 409, body: error('conflict', 'lease lost') };
      }
      const failed = body as FailAiJobBody;
      stub.failed.push(failed);
      entry.job = { ...entry.job, status: 'error', error: `${failed.code}: ${failed.message}` };
      return { status: 200, body: entry.job };
    },
  ],
];

const pattern = (endpoint: EndpointDefinition): RegExp =>
  new RegExp(`^${endpoint.path.replace(/:([A-Za-z0-9_]+)/g, '(?<$1>[^/]+)')}$`);

export const startStubRelayServer = async (): Promise<StubRelayServer> => {
  const jobs = new Map<string, StubJob>();
  const sockets: TestSocket[] = [];
  const pair = (expiresInMs: number): TokenPair => ({
    accessToken: `access-${randomUUID()}`,
    accessTokenExpiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    refreshToken: `refresh-${randomUUID()}`,
  });
  const stub: StubRelayServer = {
    url: '',
    calls: [],
    completed: [],
    failed: [],
    sockets,
    location: 'local',
    tokens: pair(15 * 60_000),
    issueTokens: (expiresInMs) => {
      stub.tokens = pair(expiresInMs);
      return stub.tokens;
    },
    queue: (job, thread = null) => {
      jobs.set(job.id, { job, thread, leaseId: null });
    },
    expireLease: (jobId) => {
      const entry = jobs.get(jobId);
      if (entry !== undefined) {
        entry.leaseId = null;
      }
    },
    push: (event) => {
      sockets.forEach((socket) => {
        socket.send(JSON.stringify({ type: 'event', event }));
      });
    },
    close: () => Promise.resolve(),
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await readBody(request);
    const path = new URL(request.url ?? '/', 'http://stub').pathname;
    stub.calls.push(`${request.method ?? 'GET'} ${path}`);
    if (path === api.auth.refresh.path) {
      const refresh = (body as { refreshToken?: unknown } | undefined)?.refreshToken;
      if (refresh !== stub.tokens.refreshToken) {
        respond(response, 401, error('unauthorized', 'reused refresh token'));
        return;
      }
      respond(response, 200, stub.issueTokens(15 * 60_000));
      return;
    }
    if (request.headers.authorization !== `Bearer ${stub.tokens.accessToken}`) {
      respond(response, 401, error('unauthorized', 'bad access token'));
      return;
    }
    for (const [endpoint, route] of ROUTES) {
      const match = request.method === endpoint.method ? pattern(endpoint).exec(path) : null;
      if (match === null) {
        continue;
      }
      const parsed = parseEndpointRequest(endpoint, { params: { ...match.groups }, body });
      if (!parsed.success) {
        respond(response, 400, { error: parsed.error });
        return;
      }
      const result = route({ params: { ...match.groups }, body: parsed.data.body }, stub, jobs);
      respond(response, result.status, result.body);
      return;
    }
    respond(response, 404, error('not_found', 'unknown endpoint'));
  };
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  server.on('upgrade', (request, socket) => {
    sockets.push(
      acceptWebSocket(request, socket, (client, text) => {
        const hello = JSON.parse(text) as { type?: string; accessToken?: string };
        if (hello.type === 'hello' && hello.accessToken === stub.tokens.accessToken) {
          client.send(JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'dev-1' }));
        }
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(stub, {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => {
          socket.close();
        });
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  });
};
