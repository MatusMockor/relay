import { randomBytes } from 'node:crypto';
import type { TaskSystemConnectionRecord } from '@relay/engine';
import type { TaskSystemCredentials, UserId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from '../../src/persistence/credentials/aes-gcm-cipher';
import { AesGcmTaskSystemSecrets } from '../../src/persistence/credentials/aes-gcm-task-system-secrets';
import { PgTaskSystemSecretStore } from '../../src/persistence/credentials/pg-task-system-secret-store';
import { taskSystemConnections } from '../../src/persistence/schema';
import { at, buildUser, newId } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const credentials: TaskSystemCredentials = {
  provider: 'jira',
  email: 'alice@acme.test',
  apiToken: 'jira-api-secret',
};

const connectionOf = (
  userId: UserId,
  overrides: Partial<TaskSystemConnectionRecord> = {},
): TaskSystemConnectionRecord => ({
  id: newId('taskSystemConnection'),
  userId,
  provider: 'jira',
  label: 'Acme Jira',
  siteUrl: 'https://acme.atlassian.net',
  accountName: 'Alice Novák',
  externalAccountId: 'acc-1',
  status: 'ok',
  lastError: null,
  createdAt: at(0),
  updatedAt: at(0),
  ...overrides,
});

describe('Postgres task system persistence', () => {
  const context = usePgTestContext();

  const seedUser = async () => {
    const user = buildUser();
    await context.repositories.users.create(user, 'hash');
    return user;
  };

  it('saves, finds, lists and updates connections per user', async () => {
    const user = await seedUser();
    const other = await seedUser();
    const repository = context.repositories.taskSystemConnections;
    const first = await repository.save(connectionOf(user.id));
    const second = await repository.save(
      connectionOf(user.id, { siteUrl: 'https://other.atlassian.net', createdAt: at(5) }),
    );
    await repository.save(connectionOf(other.id));

    expect(await repository.list(user.id)).toEqual([first, second]);
    expect(await repository.findById(other.id, first.id)).toBeNull();
    expect(
      await repository.findByAccount(user.id, {
        provider: 'jira',
        siteUrl: 'https://acme.atlassian.net',
        externalAccountId: 'acc-1',
      }),
    ).toEqual(first);

    const renamed = await repository.save({ ...first, label: 'Nová', updatedAt: at(10) });
    expect(renamed).toEqual({ ...first, label: 'Nová', updatedAt: at(10) });

    const change = { status: 'error', lastError: 'Token je neplatný.', updatedAt: at(20) } as const;
    expect(await repository.recordStatus(other.id, first.id, change)).toBeNull();
    expect(await repository.recordStatus(user.id, first.id, change)).toMatchObject(change);

    const racer = await repository.save(
      connectionOf(user.id, { label: 'Súbežné', createdAt: at(30), updatedAt: at(30) }),
    );
    expect(racer).toMatchObject({ id: first.id, label: 'Súbežné', createdAt: first.createdAt });
    expect(await repository.list(user.id)).toHaveLength(2);

    expect(await repository.delete(other.id, first.id)).toBe(false);
    expect(await repository.delete(user.id, first.id)).toBe(true);
    expect(await repository.list(user.id)).toEqual([second]);
  });

  it('encrypts the credentials in the connection row and keeps them on upsert', async () => {
    const user = await seedUser();
    const repository = context.repositories.taskSystemConnections;
    const connection = await repository.save(connectionOf(user.id));
    const cipher = new AesGcmCipher(randomBytes(32));
    const secrets = new AesGcmTaskSystemSecrets(new PgTaskSystemSecretStore(context.db), cipher);

    await secrets.set(user.id, connection.id, credentials);
    await repository.save({ ...connection, accountName: 'Alice' });

    const [row] = await context.db
      .select({ envelope: taskSystemConnections.credentialsEnvelope })
      .from(taskSystemConnections)
      .where(eq(taskSystemConnections.id, connection.id));
    expect(row?.envelope).not.toContain('jira-api-secret');
    expect(await secrets.get(user.id, connection.id)).toEqual(credentials);
    const other = await seedUser();
    expect(await secrets.get(other.id, connection.id)).toBeNull();
    await secrets.delete(other.id, connection.id);
    expect(await secrets.get(user.id, connection.id)).toEqual(credentials);
    const foreign = new AesGcmTaskSystemSecrets(
      new PgTaskSystemSecretStore(context.db),
      new AesGcmCipher(randomBytes(32)),
    );
    await expect(foreign.get(user.id, connection.id)).rejects.toThrow();

    await secrets.delete(user.id, connection.id);
    expect(await secrets.get(user.id, connection.id)).toBeNull();
    await expect(secrets.set(other.id, connection.id, credentials)).rejects.toThrow(
      'does not exist',
    );
    await expect(secrets.set(user.id, newId('taskSystemConnection'), credentials)).rejects.toThrow(
      'does not exist',
    );
  });
});
