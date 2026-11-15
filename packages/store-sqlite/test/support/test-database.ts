import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Repositories } from '@relay/engine';
import {
  createSqliteRepositories,
  migrate,
  openDatabase,
  type SqliteDatabase,
  SqliteUnitOfWork,
} from '../../src';

export interface TestStore {
  readonly database: SqliteDatabase;
  readonly repositories: Repositories;
  readonly unitOfWork: SqliteUnitOfWork;
}

export const createTestStore = (path = ':memory:'): TestStore => {
  const database = openDatabase(path);
  migrate(database);
  return {
    database,
    repositories: createSqliteRepositories(database),
    unitOfWork: new SqliteUnitOfWork(database),
  };
};

export interface TempDirectory {
  readonly path: string;
  remove(): void;
}

export const createTempDirectory = (): TempDirectory => {
  const path = mkdtempSync(join(tmpdir(), 'relay-store-sqlite-'));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
};

export const tempDatabasePath = (directory: TempDirectory): string =>
  join(directory.path, 'relay.sqlite');
