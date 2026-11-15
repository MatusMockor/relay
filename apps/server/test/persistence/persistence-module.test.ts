import { randomBytes } from 'node:crypto';
import type { DynamicModule, INestApplicationContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  type AccountRepository,
  type CredentialVault,
  PORT_TOKENS,
  type UnitOfWork,
} from '@relay/engine';
import type pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerUnitOfWork } from '../../src/core/ports/server-unit-of-work';
import type { UserRepository } from '../../src/core/ports/user-repository';
import { SERVER_PORT_TOKENS } from '../../src/core/tokens';
import { PersistenceModule } from '../../src/persistence/persistence.module';
import { PG_POOL } from '../../src/persistence/persistence.tokens';
import { buildAccount, buildUser } from './support/fixtures';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const contextFor = (
  root: DynamicModule,
  imports: DynamicModule['imports'] = [],
): Promise<INestApplicationContext> =>
  NestFactory.createApplicationContext(
    { ...root, imports },
    { logger: false, abortOnError: false },
  );

describe('PersistenceModule', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup();
    }
  });

  const freshDatabase = async (): Promise<TestDatabase> => {
    const database = await createTestDatabase({ migrate: false });
    cleanups.push(() => database.drop());
    return database;
  };

  it('migrates on start and wires every port from ConfigService', async () => {
    const database = await freshDatabase();
    const app = await contextFor(PersistenceModule.forRoot(), [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            DATABASE_URL: database.url,
            CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
          }),
        ],
      }),
    ]);
    cleanups.push(() => app.close());

    const users = app.get<UserRepository>(SERVER_PORT_TOKENS.UserRepository);
    const accounts = app.get<AccountRepository>(PORT_TOKENS.AccountRepository);
    const vault = app.get<CredentialVault>(PORT_TOKENS.CredentialVault);
    expect(app.get<UnitOfWork>(PORT_TOKENS.UnitOfWork)).toBe(
      app.get<ServerUnitOfWork>(SERVER_PORT_TOKENS.ServerUnitOfWork),
    );

    const user = await users.create(buildUser(), 'hash');
    const account = await app
      .get<ServerUnitOfWork>(SERVER_PORT_TOKENS.ServerUnitOfWork)
      .run((repositories) => repositories.accounts.create(buildAccount(user.id)));
    await vault.set(account.id, { kind: 'password', password: 'secret' });

    await expect(accounts.listByUser(user.id)).resolves.toEqual([account]);
    await expect(vault.get(account.id)).resolves.toEqual({ kind: 'password', password: 'secret' });
  });

  it('accepts an explicit config, skips migrations when disabled and closes the pool', async () => {
    const database = await freshDatabase();
    const app = await contextFor(
      PersistenceModule.forRoot({
        config: {
          databaseUrl: database.url,
          credentialsKey: randomBytes(32),
          migrateOnStart: false,
          maxConnections: 2,
        },
      }),
    );
    const pool = app.get<pg.Pool>(PG_POOL);
    const tables = await pool.query(
      "select count(*)::int as count from information_schema.tables where table_name = 'users'",
    );
    expect(tables.rows).toEqual([{ count: 0 }]);

    await app.close();
    expect(pool.ended).toBe(true);
  });

  it('fails fast with a readable message on invalid config', async () => {
    await expect(
      contextFor(PersistenceModule.forRoot(), [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ DATABASE_URL: 'mysql://nope', CREDENTIALS_ENCRYPTION_KEY: 'c2hvcnQ=' })],
        }),
      ]),
    ).rejects.toThrow(
      /Invalid persistence configuration: DATABASE_URL: .*CREDENTIALS_ENCRYPTION_KEY/,
    );
  });
});
