import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const AI = { runner: 'claude', model: null, effort: null, instructions: null };

const insertLegacyAutomation = async (
  databaseUrl: string,
  row: readonly [string, string, string, number, string | null, string[]],
): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const [id, userId, name, position, preset, actions] = row;
  await client.query(
    'INSERT INTO automations (id, user_id, account_id, name, enabled, position, preset, conditions, ai, actions) VALUES ($1, $2, null, $3, true, $4, $5, $6, $7, $8)',
    [
      id,
      userId,
      name,
      position,
      preset,
      JSON.stringify([{ type: 'jira', projectKeys: [] }]),
      JSON.stringify(AI),
      JSON.stringify(actions),
    ],
  );
  await client.end();
};

describe('automation action objects migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-actions-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex(
      (entry) => entry.tag === '0026_automation_action_objects',
    );
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

  it('turns stored action names into action objects', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const user = buildUser();
    await repositories.users.create(user, 'hash');
    await insertLegacyAutomation(database.url, [
      'automation_jira',
      user.id,
      'Jira tasky',
      0,
      'jiraTasks',
      ['task'],
    ]);
    await insertLegacyAutomation(database.url, [
      'automation_tibor',
      user.id,
      'Tibor',
      1,
      null,
      ['summary', 'notify', 'archive'],
    ]);

    await runMigrations({ databaseUrl: database.url });

    const automations = await repositories.automations.listByUser(user.id);
    expect(automations.map((automation) => [automation.id, automation.actions])).toEqual([
      ['automation_jira', [{ type: 'task' }]],
      ['automation_tibor', [{ type: 'summary' }, { type: 'notify' }, { type: 'archive' }]],
    ]);
  });
});
