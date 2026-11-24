import { beforeEach, describe, expect, it } from 'vitest';
import { RateLimitedError } from '../../src';
import type { RemoteExternalTask } from '../../src';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const INPUT = {
  provider: 'jira',
  siteUrl: 'https://acme.atlassian.net/jira/your-work',
  email: 'alice@acme.test',
  apiToken: 'token-1',
} as const;

const TASK: RemoteExternalTask = {
  externalId: '10001',
  key: 'ACME-1',
  title: 'Opraviť prihlásenie',
  url: 'https://acme.atlassian.net/browse/ACME-1',
  status: { name: 'In Progress', category: 'inProgress' },
  priority: 'high',
  projectName: 'Acme',
  dueDate: '2026-11-20',
  updatedAt: '2026-11-14T08:00:00.000Z',
};

describe('TaskSystemService with Linear and GitHub Issues', () => {
  let engine: TestEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  it('connects Linear with its API key and labels it with the organization', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, {
      provider: 'linear',
      apiKey: 'lin_api_1',
    });
    engine.taskSystems.linear.tasks = [{ ...TASK, key: 'ENG-1', url: 'https://linear.app/x' }];

    expect(connection).toMatchObject({
      provider: 'linear',
      label: 'Acme',
      siteUrl: 'https://linear.app/acme',
    });
    expect(engine.taskSystems.linear.calls[0]?.access).toEqual({
      siteUrl: 'https://linear.app',
      credentials: { provider: 'linear', apiKey: 'lin_api_1' },
    });
    expect(engine.taskSystems.secrets.of(USER_ID, connection.id)).toEqual({
      provider: 'linear',
      apiKey: 'lin_api_1',
    });
    const tasks = await engine.services.taskSystems.listTasks(USER_ID, connection.id);
    expect(tasks.items.map((task) => [task.provider, task.key])).toEqual([['linear', 'ENG-1']]);
    expect(engine.taskSystems.linear.calls.at(-1)?.access).toEqual({
      siteUrl: 'https://linear.app/acme',
      credentials: { provider: 'linear', apiKey: 'lin_api_1' },
    });
  });

  it('connects GitHub Issues with a token next to other systems', async () => {
    await engine.services.taskSystems.connect(USER_ID, INPUT);
    const connection = await engine.services.taskSystems.connect(USER_ID, {
      provider: 'github',
      token: 'ghp_1',
    });
    engine.taskSystems.github.tasks = [{ ...TASK, key: 'acme/web#7' }];

    expect(connection).toMatchObject({ provider: 'github', label: 'alice' });
    expect(engine.taskSystems.github.calls[0]?.access.credentials).toEqual({
      provider: 'github',
      token: 'ghp_1',
    });
    expect((await engine.services.taskSystems.list(USER_ID)).map((item) => item.provider)).toEqual([
      'jira',
      'github',
    ]);
    const tasks = await engine.services.taskSystems.listTasks(USER_ID, connection.id);
    expect(tasks.items).toEqual([
      { ...TASK, key: 'acme/web#7', connectionId: connection.id, provider: 'github' },
    ]);
  });

  it('falls back to the host name when the account has no label', async () => {
    engine.taskSystems.github.account = { ...engine.taskSystems.github.account, defaultLabel: ' ' };

    const connection = await engine.services.taskSystems.connect(USER_ID, {
      provider: 'github',
      token: 'ghp_1',
    });

    expect(connection.label).toBe('github.com');
  });

  it('keeps the connection ok and passes a rate limit through', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, {
      provider: 'github',
      token: 'ghp_1',
    });
    engine.taskSystems.github.failWith = new RateLimitedError('GitHub dočasne obmedzil.');

    const listing = engine.services.taskSystems.listTasks(USER_ID, connection.id);

    await expect(listing).rejects.toThrow(RateLimitedError);
    await expect(listing).rejects.toMatchObject({ code: 'rate_limited' });
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ status: 'ok', lastError: null }),
    ]);
  });
});
