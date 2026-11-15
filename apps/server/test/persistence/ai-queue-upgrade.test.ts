import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiJobIdSchema } from '@relay/shared/domain';
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
import { at, buildUser } from './support/fixtures';
import { createTestDatabase, type TestDatabase } from './support/test-database';

describe('AI queue migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-old-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await database.drop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('keeps queued jobs and makes interrupted running jobs claimable again', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const user = await createPgRepositories(connection.db).users.create(buildUser(), 'hash');
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    await client.query(
      `INSERT INTO ai_jobs (id, user_id, kind, status, runner_location, runner, input, created_at, updated_at)
       VALUES ('job_old', $1, 'oneLiner', 'queued', 'server', 'claude', '{"kind":"oneLiner","threadId":"thr_1"}', $2, $2),
              ('job_stuck', $1, 'summary', 'running', 'server', 'claude', '{"kind":"summary","threadId":"thr_1"}', $3, $3)`,
      [user.id, at(1), at(0)],
    );
    await client.end();

    await runMigrations({ databaseUrl: database.url });
    const { aiJobs } = createPgRepositories(connection.db);

    const queued = await aiJobs.listQueued({ location: 'server', now: at(10), limit: 10 });
    expect(queued.map((job) => job.id)).toEqual(['job_stuck', 'job_old']);
    const stored = await aiJobs.findById(user.id, AiJobIdSchema.parse('job_old'));
    expect(stored).toMatchObject({ status: 'queued', input: { threadId: 'thr_1' } });
  });
});
