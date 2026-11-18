import { fileURLToPath } from 'node:url';
import { migrate as runDrizzleMigrations } from 'drizzle-orm/better-sqlite3/migrator';
import { backfillNormalizedSubjects } from './backfill-normalized-subjects';
import { repairLabelNameKeys } from './repair-label-name-keys';
import type { SqliteDatabase } from './sqlite-database';

export const SQLITE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface MigrateOptions {
  readonly migrationsFolder?: string;
}

export const migrate = (database: SqliteDatabase, options: MigrateOptions = {}): void => {
  runDrizzleMigrations(database.db, {
    migrationsFolder: options.migrationsFolder ?? SQLITE_MIGRATIONS_FOLDER,
  });
  backfillNormalizedSubjects(database);
  repairLabelNameKeys(database);
};
