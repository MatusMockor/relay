import { randomUUID } from 'node:crypto';
import { api, type AuthSession, type ClaimedAiJob } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loginUser, registerUser } from '../support/auth-flow';
import {
  callMcp,
  MCP_INITIALIZE,
  mcpToolCall,
  ToolCallResponseSchema,
} from '../support/mcp-client';
import { startTestApp, type TestApp } from '../support/test-app';

describe('mail tools for AI jobs run by a desktop worker', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const localUser = async (prefix: string): Promise<AuthSession> => {
    const session = await registerUser(app.api, `${prefix}-${randomUUID().slice(0, 8)}@relay.test`);
    await app.api.ok(
      api.settings.update,
      { body: { ai: { location: 'local' } } },
      session.accessToken,
    );
    return session;
  };

  const claimOne = async (token: string): Promise<ClaimedAiJob> => {
    const batch = await app.api.ok(api.ai.claimJobs, { body: { limit: 1 } }, token);
    expect(batch.jobs).toHaveLength(1);
    const [claim] = batch.jobs;
    expect(claim).toBeDefined();
    return claim as ClaimedAiJob;
  };

  it('issues a mail tools token scoped to the claimed job that expires', async () => {
    const session = await localUser('token');
    const token = session.accessToken;
    const rewrite = await app.api.ok(
      api.ai.createJob,
      { body: { input: { kind: 'rewrite', text: 'ahoj', instruction: 'Prepíš', draftId: null } } },
      token,
    );
    const early = await app.api.fail(
      api.ai.jobMailToolsToken,
      { params: { id: rewrite.id }, body: { leaseId: 'nope' } },
      token,
    );
    expect(early.status).toBe(409);
    const claim = await claimOne(token);
    const other = await loginUser(app.api, session.user.email);
    const foreign = await app.api.fail(
      api.ai.jobMailToolsToken,
      { params: { id: rewrite.id }, body: { leaseId: claim.leaseId } },
      other.accessToken,
    );
    expect(foreign.status).toBe(409);

    const grant = await app.api.ok(
      api.ai.jobMailToolsToken,
      { params: { id: rewrite.id }, body: { leaseId: claim.leaseId } },
      token,
    );
    expect(grant.path).toBe('/mcp');
    expect(Date.parse(grant.expiresAt)).toBe(
      Math.floor(app.clock.now().getTime() / 1000) * 1000 + 5 * 60_000,
    );
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, grant.token)).status).toBe(200);
    const write = await callMcp(
      app.baseUrl,
      mcpToolCall('create_task', { title: 'Zaplatiť všetko' }),
      grant.token,
    );
    expect(write.status).toBe(200);
    const writeResult = ToolCallResponseSchema.parse(await write.json());
    expect(writeResult.result.isError).toBe(true);
    const tasks = await app.api.ok(api.tasks.list, { query: {} }, token);
    expect(tasks.items).toEqual([]);
    const read = ToolCallResponseSchema.parse(
      await (
        await callMcp(app.baseUrl, mcpToolCall('list_folder', { view: 'inbox' }), grant.token)
      ).json(),
    );
    expect(read.result.isError).toBeUndefined();

    for (let step = 0; step < 4; step += 1) {
      app.clock.advance(80_000);
      await app.api.ok(
        api.ai.heartbeatJob,
        { params: { id: rewrite.id }, body: { leaseId: claim.leaseId } },
        token,
      );
    }
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, grant.token)).status).toBe(401);

    const fresh = await app.api.ok(
      api.ai.jobMailToolsToken,
      { params: { id: rewrite.id }, body: { leaseId: claim.leaseId } },
      token,
    );
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, fresh.token)).status).toBe(200);
    await app.api.ok(
      api.ai.completeJob,
      {
        params: { id: rewrite.id },
        body: {
          leaseId: claim.leaseId,
          runner: 'claude',
          output: { kind: 'rewrite', text: 'Ahoj.' },
        },
      },
      token,
    );
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, fresh.token)).status).toBe(401);
  });

  it('lets chat jobs create tasks through their mail tools token', async () => {
    const session = await localUser('chat');
    const token = session.accessToken;
    const job = await app.api.ok(
      api.ai.createJob,
      { body: { input: { kind: 'chatAnswer', question: 'Zavolaj', threadId: null, history: [] } } },
      token,
    );
    const claim = await claimOne(token);
    const grant = await app.api.ok(
      api.ai.jobMailToolsToken,
      { params: { id: job.id }, body: { leaseId: claim.leaseId } },
      token,
    );

    const created = ToolCallResponseSchema.parse(
      await (
        await callMcp(
          app.baseUrl,
          mcpToolCall('create_task', { title: 'Zavolať Jane' }),
          grant.token,
        )
      ).json(),
    );

    expect(created.result.isError).toBeUndefined();
    const tasks = await app.api.ok(api.tasks.list, { query: {} }, token);
    expect(tasks.items.map((task) => task.title)).toEqual(['Zavolať Jane']);
  });

  it('drops the token of a device that lost its lease or was revoked', async () => {
    const session = await localUser('handoff');
    const laptop = session.accessToken;
    const job = await app.api.ok(
      api.ai.createJob,
      { body: { input: { kind: 'chatAnswer', question: 'Ahoj', threadId: null, history: [] } } },
      laptop,
    );
    const first = await claimOne(laptop);
    const laptopGrant = await app.api.ok(
      api.ai.jobMailToolsToken,
      { params: { id: job.id }, body: { leaseId: first.leaseId } },
      laptop,
    );
    const desk = await loginUser(app.api, session.user.email);

    app.clock.advance(121_000);
    const second = await claimOne(desk.accessToken);
    expect(second.job.id).toBe(job.id);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, laptopGrant.token)).status).toBe(401);

    const deskGrant = await app.api.ok(
      api.ai.jobMailToolsToken,
      { params: { id: job.id }, body: { leaseId: second.leaseId } },
      desk.accessToken,
    );
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, deskGrant.token)).status).toBe(200);
    await app.api.ok(api.devices.revoke, { params: { id: desk.device.id } }, laptop);
    expect((await callMcp(app.baseUrl, MCP_INITIALIZE, deskGrant.token)).status).toBe(401);
  });
});
