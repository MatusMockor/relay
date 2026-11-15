import { randomUUID } from 'node:crypto';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailToolsTokenService } from '../../src/ai/mcp/mail-tools-token.service';
import { registerUser } from '../support/auth-flow';
import { callMcp, MCP_INITIALIZE } from '../support/mcp-client';
import { startTestApp, type TestApp } from '../support/test-app';

describe('mail tools MCP endpoint', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

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
      holder: null,
    });

    expect((await callMcp(app.baseUrl, MCP_INITIALIZE)).status).toBe(401);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, access)).status).toBe(401);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, queuedToken.token)).status).toBe(401);

    await app.api.ok(api.ai.claimJobs, { body: { limit: 1 } }, access);
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
});
