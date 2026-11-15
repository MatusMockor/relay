import { randomUUID } from 'node:crypto';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { installStubClaude, type StubClaude } from '../support/stub-claude';
import { startTestApp, type TestApp } from '../support/test-app';

describe('server-side AI jobs', () => {
  let app: TestApp;
  let claude: StubClaude;

  beforeAll(async () => {
    claude = await installStubClaude(JSON.stringify({ text: 'Ahoj zo servera', threadIds: [] }));
    app = await startTestApp({ env: { JOBS_ENABLED: 'true', AI_CLI_PATH: claude.dir } });
  });

  afterAll(async () => {
    await app.close();
    await claude.dispose();
  });

  it('reports the server CLIs', async () => {
    const session = await registerUser(app.api, `ai-${randomUUID().slice(0, 8)}@relay.test`);
    const runners = await app.api.ok(api.ai.runners, {}, session.accessToken);
    expect(runners).toEqual([
      expect.objectContaining({
        runner: 'claude',
        location: 'server',
        installed: true,
        authenticated: true,
        version: '2.1.0',
      }),
      expect.objectContaining({ runner: 'codex', location: 'server', installed: false }),
    ]);
  });

  it('runs a job through pg-boss with the server runner and mail tools', async () => {
    const session = await registerUser(app.api, `ai-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const settings = await app.api.ok(api.settings.get, {}, token);
    expect(settings.ai.location).toBe('server');
    const socket = await authenticateRealtime(app.baseUrl, token);

    const job = await app.api.ok(
      api.ai.createJob,
      {
        body: {
          input: { kind: 'chatAnswer', question: 'Čo je nové?', threadId: null, history: [] },
        },
      },
      token,
    );
    expect(job).toMatchObject({ status: 'queued', runnerLocation: 'server', runner: 'claude' });

    await expect
      .poll(
        async () => (await app.api.ok(api.ai.getJob, { params: { id: job.id } }, token)).status,
        {
          timeout: 15_000,
        },
      )
      .toBe('done');
    const finished = await app.api.ok(api.ai.getJob, { params: { id: job.id } }, token);
    expect(finished.output).toEqual({
      kind: 'chatAnswer',
      text: 'Ahoj zo servera',
      references: [],
    });
    await socket.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'ai.job.updated' &&
        message.event.data.job.status === 'done',
    );

    const configs = await claude.mcpConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toContain(`${app.baseUrl}/mcp`);
    expect(configs[0]).toContain('Bearer ');
    socket.close();
  });

  it('leaves local jobs for the desktop and moves them back when the user switches', async () => {
    const session = await registerUser(app.api, `ai-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    await app.api.ok(api.settings.update, { body: { ai: { location: 'local' } } }, token);
    const job = await app.api.ok(
      api.ai.createJob,
      {
        body: { input: { kind: 'chatAnswer', question: 'Lokálne?', threadId: null, history: [] } },
      },
      token,
    );
    expect(job).toMatchObject({ status: 'queued', runnerLocation: 'local' });

    await app.api.ok(api.settings.update, { body: { ai: { location: 'server' } } }, token);

    await expect
      .poll(async () => await app.api.ok(api.ai.getJob, { params: { id: job.id } }, token), {
        timeout: 15_000,
      })
      .toMatchObject({ status: 'done', runnerLocation: 'server' });
  });
});
