import { randomUUID } from 'node:crypto';
import { type AiJobRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AiJob } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailToolsTokenService } from '../../src/ai/mcp/mail-tools-token.service';
import { ServerMailToolsResolver } from '../../src/ai/mcp/server-mail-tools-resolver';
import { registerUser } from '../support/auth-flow';
import { callMcp, MCP_INITIALIZE, mcpToolCall } from '../support/mcp-client';
import { startTestApp, type TestApp } from '../support/test-app';

describe('mail tools MCP endpoint', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const claim = async (job: AiJob, owner: string, leaseMs: number): Promise<void> => {
    const now = app.clock.now();
    const claimed = await app.app
      .get<symbol, AiJobRepository>(PORT_TOKENS.AiJobRepository)
      .claim(job.id, {
        owner,
        now: now.toISOString(),
        leaseUntil: new Date(now.getTime() + leaseMs).toISOString(),
      });
    expect(claimed).toMatchObject({ status: 'running' });
  };

  const bearerOf = (headers: Readonly<Record<string, string>> | undefined): string =>
    (headers?.['Authorization'] ?? '').replace('Bearer ', '');

  const runToken = async (job: AiJob, owner: string): Promise<string> => {
    const endpoint = await app.app.get(ServerMailToolsResolver).resolve(job, owner);
    expect(endpoint?.url).toBe(`${app.baseUrl}/mcp`);
    return bearerOf(endpoint?.headers);
  };

  it('accepts only short-lived tokens of a running job', async () => {
    const session = await registerUser(app.api, `mcp-${randomUUID().slice(0, 8)}@relay.test`);
    const access = session.accessToken;
    await app.api.ok(api.settings.update, { body: { ai: { location: 'local' } } }, access);
    const job = await app.api.ok(
      api.ai.createJob,
      {
        body: {
          input: { kind: 'chatAnswer', question: 'Čo je nové?', threadId: null, history: [] },
        },
      },
      access,
    );
    const tokens = app.app.get(MailToolsTokenService);
    const queuedToken = await tokens.issue({
      userId: session.user.id,
      jobId: job.id,
      holder: { kind: 'run', owner: 'server-a:1' },
    });

    expect((await callMcp(app.baseUrl, MCP_INITIALIZE)).status).toBe(401);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, access)).status).toBe(401);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, queuedToken.token)).status).toBe(401);

    await claim(job, 'server-a:1', 20 * 60_000);
    const response = await callMcp(app.baseUrl, MCP_INITIALIZE, queuedToken.token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { serverInfo: { name: expect.any(String) as string } },
    });

    app.clock.advance(16 * 60_000);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, queuedToken.token)).status).toBe(401);
  });

  it('rejects the token of a run whose job was reclaimed by another worker', async () => {
    const session = await registerUser(app.api, `mcp-${randomUUID().slice(0, 8)}@relay.test`);
    const access = session.accessToken;
    await app.api.ok(api.settings.update, { body: { ai: { location: 'server' } } }, access);
    const job = await app.api.ok(
      api.ai.createJob,
      {
        body: {
          input: { kind: 'chatAnswer', question: 'Čo je nové?', threadId: null, history: [] },
        },
      },
      access,
    );
    await claim(job, 'server-a:1', 60_000);
    const stale = await runToken(job, 'server-a:1');
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, stale)).status).toBe(200);

    app.clock.advance(61_000);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, stale)).status).toBe(401);
    await claim(job, 'server-b:1', 60_000);
    const current = await runToken(job, 'server-b:1');

    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, stale)).status).toBe(401);
    expect((await callMcp(app.baseUrl, mcpToolCall('list_tasks', {}), stale)).status).toBe(401);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, current)).status).toBe(200);
  });
});
