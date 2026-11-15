import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { openSqliteConnection, type SqliteConnection } from '../src';

describe('openSqliteConnection', () => {
  const opened: SqliteConnection[] = [];
  const directories: string[] = [];

  afterEach(() => {
    opened.splice(0).forEach((connection) => {
      connection.close();
    });
    directories.splice(0).forEach((directory) => {
      rmSync(directory, { recursive: true, force: true });
    });
  });

  it('opens an in-memory database with foreign keys enforced', () => {
    const connection = openSqliteConnection({ filename: ':memory:' });
    opened.push(connection);
    expect(connection.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(connection.db.get<{ one: number }>(sql`select 1 as one`)).toEqual({ one: 1 });
  });

  it('uses WAL journaling for file databases and persists data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'relay-sqlite-'));
    directories.push(directory);
    const filename = join(directory, 'relay.sqlite');
    const first = openSqliteConnection({ filename });
    expect(first.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    first.db.run(sql`create table notes (id integer primary key, body text not null)`);
    first.db.run(sql`insert into notes (body) values (${'ahoj'})`);
    first.close();

    const second = openSqliteConnection({ filename, readonly: true });
    opened.push(second);
    expect(second.db.all<{ body: string }>(sql`select body from notes`)).toEqual([
      { body: 'ahoj' },
    ]);
  });
});
