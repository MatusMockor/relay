import type { ThreadFolderQuery } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addThread, folderIds } from './support/folder-scenario';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

type TermCase = readonly [string, Partial<ThreadFolderQuery>, readonly string[]];

const TERM_CASES: readonly TermCase[] = [
  ['matches word prefixes in any order', { search: 'oct inv' }, ['t-invoice']],
  ['skips terms inside a word', { search: 'voice' }, []],
  ['requires every term', { search: 'invoice friday' }, []],
  ['matches terms across fields', { search: 'novak invoice' }, ['t-invoice']],
  ['ignores the letter case', { search: 'INVOICE' }, ['t-invoice']],
  ['folds diacritics in the sender', { search: 'novak', searchField: 'from' }, ['t-invoice']],
  ['folds diacritics in the query', { search: 'nováková', searchField: 'from' }, ['t-invoice']],
  ['matches sender email parts', { search: 'klient.sk', searchField: 'from' }, ['t-invoice']],
  ['skips recipient names in the sender field', { search: 'bielikova', searchField: 'from' }, []],
  ['folds diacritics in the subject', { search: 'stastn', searchField: 'subject' }, ['t-greeting']],
  ['ignores punctuation-only terms', { search: '- !' }, ['t-greeting', 't-invoice']],
];

const at = (minute: number): string => new Date(Date.UTC(2026, 10, 15, 8, minute)).toISOString();

describe('SqliteThreadRepository.queryFolder search terms', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    const work = await seedAccount(store.repositories);
    await addThread(
      store,
      work,
      't-invoice',
      { lastMessageAt: at(1) },
      {
        subject: 'Invoice October',
        from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
        snippet: 'Please pay.',
        textBody: 'Please pay.',
        date: at(1),
      },
    );
    await addThread(
      store,
      work,
      't-greeting',
      { lastMessageAt: at(2) },
      {
        subject: 'Šťastný deň',
        from: { name: 'Peter Kráľ', email: 'peter@partner.sk' },
        to: [{ name: 'Zuzana Bieliková', email: 'zuzana@firma.sk' }],
        snippet: 'Pekný deň.',
        textBody: 'Pekný deň.',
        date: at(2),
      },
    );
  });

  afterEach(() => {
    store.database.close();
  });

  it.each(TERM_CASES)('%s', async (_name, query, expected) => {
    expect(await folderIds(store, query)).toEqual(expected);
  });
});
