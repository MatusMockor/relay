import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type SqliteDatabase } from '../src';
import { createTempDirectory, tempDatabasePath, type TempDirectory } from './support/test-database';

const tableNames = (database: SqliteDatabase): string[] =>
  database.sqlite
    .prepare<[], { name: string }>(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    )
    .all()
    .map((row) => row.name);

describe('openDatabase and migrate', () => {
  const opened: SqliteDatabase[] = [];
  const directories: TempDirectory[] = [];

  afterEach(() => {
    opened.splice(0).forEach((database) => {
      database.close();
    });
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('opens an in-memory database with foreign keys enforced', () => {
    const database = openDatabase(':memory:');
    opened.push(database);
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('uses WAL journaling for file databases', () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(tempDatabasePath(directory));
    opened.push(database);
    expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('creates every domain table and the full-text index', () => {
    const database = openDatabase(':memory:');
    opened.push(database);
    migrate(database);
    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        'accounts',
        'ai_jobs',
        'ai_results',
        'draft_attachments',
        'drafts',
        'labels',
        'mailboxes',
        'message_labels',
        'messages',
        'messages_fts',
        'reminders',
        'scheduled_sends',
        'settings',
        'splits',
        'sync_state',
        'tasks',
        'thread_splits',
        'threads',
      ]),
    );
  });

  it('is idempotent and keeps data across reopening a file database', () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const path = tempDatabasePath(directory);
    const first = openDatabase(path);
    migrate(first);
    first.sqlite.prepare("insert into settings (user_id, value) values ('local', '{}')").run();
    first.close();

    const second = openDatabase(path);
    opened.push(second);
    migrate(second);
    expect(
      second.sqlite.prepare<[], { user_id: string }>('select user_id from settings').all(),
    ).toEqual([{ user_id: 'local' }]);
  });
});
