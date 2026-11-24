import type { TaskSystemConnectionRecord } from '@relay/engine';
import { TaskSystemConnectionIdSchema, UserIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { createTestStore, type TestStore } from './support/test-database';

const NOW = '2026-11-15T08:00:00.000Z';
const OTHER_USER = UserIdSchema.parse('usr_other');

const connection = (
  overrides: Partial<TaskSystemConnectionRecord> = {},
): TaskSystemConnectionRecord => ({
  id: TaskSystemConnectionIdSchema.parse('tsc-1'),
  userId: LOCAL_USER_ID,
  provider: 'jira',
  label: 'Acme Jira',
  siteUrl: 'https://acme.atlassian.net',
  accountName: 'Alice Novák',
  externalAccountId: 'acc-1',
  status: 'ok',
  lastError: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('SqliteTaskSystemConnectionRepository', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('saves, finds and lists connections per user', async () => {
    const { taskSystemConnections: repository } = store.repositories;
    const second = connection({
      id: TaskSystemConnectionIdSchema.parse('tsc-2'),
      siteUrl: 'https://other.atlassian.net',
      createdAt: '2026-11-15T09:00:00.000Z',
    });
    await repository.save(second);
    await repository.save(connection());
    await repository.save(
      connection({ id: TaskSystemConnectionIdSchema.parse('tsc-3'), userId: OTHER_USER }),
    );

    expect((await repository.list(LOCAL_USER_ID)).map((record) => record.id)).toEqual([
      'tsc-1',
      'tsc-2',
    ]);
    expect(await repository.findById(LOCAL_USER_ID, connection().id)).toEqual(connection());
    expect(await repository.findById(OTHER_USER, connection().id)).toBeNull();
    expect(
      await repository.findByAccount(LOCAL_USER_ID, {
        provider: 'jira',
        siteUrl: 'https://acme.atlassian.net',
        externalAccountId: 'acc-1',
      }),
    ).toEqual(connection());
    expect(
      await repository.findByAccount(LOCAL_USER_ID, {
        provider: 'jira',
        siteUrl: 'https://acme.atlassian.net',
        externalAccountId: 'acc-2',
      }),
    ).toBeNull();
  });

  it('updates a saved connection in place and keeps its creation time', async () => {
    const { taskSystemConnections: repository } = store.repositories;
    await repository.save(connection());

    const updated = await repository.save(
      connection({ label: 'Nová', createdAt: '2030-01-01T00:00:00.000Z', updatedAt: 'x' }),
    );

    expect(updated).toMatchObject({ label: 'Nová', createdAt: NOW, updatedAt: 'x' });
    expect(await repository.list(LOCAL_USER_ID)).toHaveLength(1);
  });

  it('records the status only for the owner', async () => {
    const { taskSystemConnections: repository } = store.repositories;
    await repository.save(connection());
    const change = {
      status: 'error',
      lastError: 'Token je neplatný.',
      updatedAt: 'later',
    } as const;

    expect(await repository.recordStatus(OTHER_USER, connection().id, change)).toBeNull();
    expect(await repository.recordStatus(LOCAL_USER_ID, connection().id, change)).toMatchObject(
      change,
    );
  });

  it('deletes only the owner connection', async () => {
    const { taskSystemConnections: repository } = store.repositories;
    await repository.save(connection());

    expect(await repository.delete(OTHER_USER, connection().id)).toBe(false);
    expect(await repository.delete(LOCAL_USER_ID, connection().id)).toBe(true);
    expect(await repository.list(LOCAL_USER_ID)).toEqual([]);
  });
});
