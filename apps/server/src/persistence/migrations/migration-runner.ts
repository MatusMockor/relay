import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { backfillNormalizedSubjects } from './backfill-normalized-subjects';
import { repairLabelNameKeys } from './repair-label-name-keys';

export const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../drizzle', import.meta.url),
);

const MIGRATION_LOCK_KEY = 4_217_090_301;

export interface MigrationOptions {
  readonly databaseUrl: string;
  readonly migrationsFolder?: string;
}

export const runMigrations = async (options: MigrationOptions): Promise<void> => {
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(drizzle({ client }), {
      migrationsFolder: options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
    });
    await backfillNormalizedSubjects(client);
    await repairLabelNameKeys(client);
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    await client.end();
  }
};
