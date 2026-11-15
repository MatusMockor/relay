import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLITE_MIGRATIONS_FOLDER } from '../../src';

interface JournalEntry {
  readonly tag: string;
}

interface Journal {
  readonly entries: readonly JournalEntry[];
}

export const writeMigrationsBefore = (tag: string, directory: string): string => {
  const journalPath = join(SQLITE_MIGRATIONS_FOLDER, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  const end = journal.entries.findIndex((entry) => entry.tag === tag);
  const entries = journal.entries.slice(0, end);
  const folder = join(directory, 'migrations');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  entries.forEach((entry) => {
    copyFileSync(
      join(SQLITE_MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  });
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  return folder;
};
