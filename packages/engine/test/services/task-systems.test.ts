import type { TaskSystemConnectionId } from '@relay/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  ProviderError,
  ReauthorizationRequiredError,
  ValidationError,
} from '../../src';
import type { RemoteExternalTask } from '../../src';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

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

const updates = (engine: TestEngine) =>
  engine.events.published.filter(({ event }) => event.type === 'taskSystems.updated');

describe('TaskSystemService', () => {
  let engine: TestEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  it('verifies the credentials, stores the secret and never returns it', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);

    expect(connection).toEqual({
      id: expect.any(String) as string,
      userId: USER_ID,
      provider: 'jira',
      label: 'acme.atlassian.net',
      siteUrl: 'https://acme.atlassian.net',
      accountName: 'Alice Doe',
      status: 'ok',
      lastError: null,
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    });
    expect(engine.taskSystems.jira.calls[0]?.access).toEqual({
      siteUrl: INPUT.siteUrl,
      credentials: { provider: 'jira', email: INPUT.email, apiToken: INPUT.apiToken },
    });
    expect(engine.taskSystems.secrets.of(USER_ID, connection.id)).toEqual({
      provider: 'jira',
      email: INPUT.email,
      apiToken: INPUT.apiToken,
    });
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([connection]);
    expect(await engine.services.taskSystems.list(OTHER_USER_ID)).toEqual([]);
    expect(updates(engine)).toHaveLength(1);
  });

  it('reconnects the same account in place with the new token and label', async () => {
    const first = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.clock.advance(60_000);

    const second = await engine.services.taskSystems.connect(USER_ID, {
      ...INPUT,
      apiToken: 'token-2',
      label: 'Acme Jira',
    });

    expect(second).toMatchObject({ id: first.id, label: 'Acme Jira', createdAt: first.createdAt });
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(await engine.services.taskSystems.list(USER_ID)).toHaveLength(1);
    expect(engine.taskSystems.secrets.of(USER_ID, first.id)).toMatchObject({ apiToken: 'token-2' });
  });

  it('stores nothing when the verification fails', async () => {
    engine.taskSystems.jira.failWith = new ReauthorizationRequiredError('Jira odmietla údaje.');

    await expect(engine.services.taskSystems.connect(USER_ID, INPUT)).rejects.toThrow(
      ForbiddenError,
    );

    engine.taskSystems.jira.failWith = new Error('socket hang up');
    await expect(engine.services.taskSystems.connect(USER_ID, INPUT)).rejects.toThrow(
      ProviderError,
    );
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([]);
    expect(engine.taskSystems.secrets.stored.size).toBe(0);
    expect(updates(engine)).toHaveLength(0);
  });

  it('removes a new connection again when the secret cannot be stored', async () => {
    engine.taskSystems.secrets.failSet = new Error('keychain locked');

    await expect(engine.services.taskSystems.connect(USER_ID, INPUT)).rejects.toThrow(
      'keychain locked',
    );
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([]);
  });

  it('refuses providers without an adapter', async () => {
    engine.taskSystems.unsupported.add('jira');

    await expect(engine.services.taskSystems.connect(USER_ID, INPUT)).rejects.toThrow(
      ValidationError,
    );
  });

  it('lists the tasks of a connection tagged with the connection', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.jira.tasks = [TASK];
    engine.taskSystems.jira.truncated = true;

    expect(await engine.services.taskSystems.listTasks(USER_ID, connection.id)).toEqual({
      items: [{ ...TASK, connectionId: connection.id, provider: 'jira' }],
      truncated: true,
    });
    expect(engine.taskSystems.jira.calls.at(-1)?.access.siteUrl).toBe('https://acme.atlassian.net');
    await expect(
      engine.services.taskSystems.listTasks(OTHER_USER_ID, connection.id),
    ).rejects.toThrow(NotFoundError);
  });

  it('marks the connection as failing when the token is rejected and recovers later', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.jira.failWith = new ReauthorizationRequiredError('Token je neplatný.');

    await expect(engine.services.taskSystems.listTasks(USER_ID, connection.id)).rejects.toThrow(
      ForbiddenError,
    );
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ status: 'error', lastError: 'Token je neplatný.' }),
    ]);
    expect(updates(engine)).toHaveLength(2);

    engine.taskSystems.jira.failWith = null;
    await engine.services.taskSystems.listTasks(USER_ID, connection.id);
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ status: 'ok', lastError: null }),
    ]);
    expect(updates(engine)).toHaveLength(3);
  });

  it('keeps the status on transient failures and maps unknown errors', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.jira.failWith = new Error('ECONNRESET');

    await expect(engine.services.taskSystems.listTasks(USER_ID, connection.id)).rejects.toThrow(
      ProviderError,
    );
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ status: 'ok' }),
    ]);
  });

  it('fails as forbidden when the secret is gone', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.secrets.stored.clear();

    await expect(engine.services.taskSystems.listTasks(USER_ID, connection.id)).rejects.toThrow(
      ForbiddenError,
    );
    expect((await engine.services.taskSystems.list(USER_ID))[0]?.status).toBe('error');
  });

  it('disconnects by deleting the secret and the connection', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);

    await expect(
      engine.services.taskSystems.disconnect(OTHER_USER_ID, connection.id),
    ).rejects.toThrow(NotFoundError);
    await engine.services.taskSystems.disconnect(USER_ID, connection.id);

    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([]);
    expect(engine.taskSystems.secrets.stored.size).toBe(0);
    expect(updates(engine).at(-1)?.event.data).toEqual({ connectionId: connection.id });
    await expect(
      engine.services.taskSystems.listTasks(USER_ID, 'tsc_gone' as TaskSystemConnectionId),
    ).rejects.toThrow(NotFoundError);
  });

  it('stores the credentials the adapter settled on', async () => {
    engine.taskSystems.jira.credentials = {
      provider: 'jira',
      email: INPUT.email,
      apiToken: INPUT.apiToken,
      route: { kind: 'gateway', cloudId: 'cloud-1' },
    };

    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);

    expect(engine.taskSystems.secrets.of(USER_ID, connection.id)).toMatchObject({
      route: { kind: 'gateway', cloudId: 'cloud-1' },
    });
  });

  it('keeps a failing connection failing when the new secret cannot be stored', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.jira.failWith = new ReauthorizationRequiredError('Token je neplatný.');
    await expect(engine.services.taskSystems.listTasks(USER_ID, connection.id)).rejects.toThrow();
    engine.taskSystems.jira.failWith = null;
    engine.taskSystems.secrets.failSet = new Error('keychain locked');

    await expect(
      engine.services.taskSystems.connect(USER_ID, { ...INPUT, apiToken: 'token-2' }),
    ).rejects.toThrow('keychain locked');

    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ id: connection.id, status: 'error' }),
    ]);
    expect(engine.taskSystems.secrets.of(USER_ID, connection.id)).toMatchObject({
      apiToken: 'token-1',
    });
  });

  it('settles concurrent first connects of one account on a single connection', async () => {
    const [first, second] = await Promise.all([
      engine.services.taskSystems.connect(USER_ID, INPUT),
      engine.services.taskSystems.connect(USER_ID, { ...INPUT, apiToken: 'token-2' }),
    ]);

    expect(second.id).toBe(first.id);
    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ id: first.id, status: 'ok' }),
    ]);
  });

  it('removes the connection before its secret', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.secrets.failDelete = new Error('keychain locked');

    await expect(engine.services.taskSystems.disconnect(USER_ID, connection.id)).rejects.toThrow(
      'keychain locked',
    );

    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([]);
  });

  it('ignores an auth failure of a request made with replaced credentials', async () => {
    const connection = await engine.services.taskSystems.connect(USER_ID, INPUT);
    engine.taskSystems.jira.failWith = new ReauthorizationRequiredError('Token je neplatný.');
    engine.taskSystems.jira.beforeAnswer = async () => {
      engine.taskSystems.jira.beforeAnswer = null;
      await engine.taskSystems.secrets.set(USER_ID, connection.id, {
        provider: 'jira',
        email: INPUT.email,
        apiToken: 'token-2',
      });
    };

    await expect(engine.services.taskSystems.listTasks(USER_ID, connection.id)).rejects.toThrow(
      ForbiddenError,
    );

    expect(await engine.services.taskSystems.list(USER_ID)).toEqual([
      expect.objectContaining({ status: 'ok', lastError: null }),
    ]);
  });
});
