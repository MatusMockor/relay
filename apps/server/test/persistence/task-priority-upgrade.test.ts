import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskIdSchema } from '@relay/shared/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  openPostgresConnection,
  type PostgresConnection,
} from '../../src/persistence/database/postgres-connection';
import {
  DEFAULT_MIGRATIONS_FOLDER,
  runMigrations,
} from '../../src/persistence/migrations/migration-runner';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { buildUser } from './support/fixtures';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const insertLegacyTask = async (databaseUrl: string, userId: string): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(
    "INSERT INTO tasks (id, user_id, title, state, source, created_at, updated_at) VALUES ($1, $2, $3, 'open', 'jira', now(), now())",
    ['task_legacy', userId, 'Stará úloha'],
  );
  await client.end();
};

describe('task priority migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-task-priority-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0034_task_priority');
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, end) }),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await database.drop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('reads tasks stored before the migration without a priority', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const user = buildUser();
    await repositories.users.create(user, 'hash');
    await insertLegacyTask(database.url, user.id);

    await runMigrations({ databaseUrl: database.url });

    expect(
      await repositories.tasks.findById(user.id, TaskIdSchema.parse('task_legacy')),
    ).toMatchObject({ id: 'task_legacy', title: 'Stará úloha', priority: 'none' });
  });
});
