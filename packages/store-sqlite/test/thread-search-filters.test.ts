import type { ThreadFolderQuery } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accountId } from './support/fixtures';
import { addThread, folderIds } from './support/folder-scenario';
import { seedSearchFilterScenario } from './support/search-filter-scenario';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

type FilterCase = readonly [string, Partial<ThreadFolderQuery>, readonly string[]];

const FILTER_CASES: readonly FilterCase[] = [
  ['searches every column by default', { search: 'jana' }, ['t-meeting', 't-invoice']],
  ['limits the search to the sender', { search: 'jana', searchField: 'from' }, ['t-invoice']],
  ['matches sender email parts', { search: 'klient.sk', searchField: 'from' }, ['t-invoice']],
  ['limits the search to the subject', { search: 'faktur', searchField: 'subject' }, ['t-invoice']],
  ['requires every term in the field', { search: 'faktur jana', searchField: 'subject' }, []],
  [
    'ignores the field without a search',
    { searchField: 'from' },
    ['t-contract', 't-meeting', 't-invoice'],
  ],
  ['keeps unread threads', { unread: true }, ['t-invoice']],
  ['keeps unread threads of the view', { unread: true, view: 'trash' }, ['t-trash']],
  ['keeps unread search hits', { unread: true, search: 'faktur' }, ['t-invoice']],
  ['keeps threads with a file attachment', { hasAttachment: true }, ['t-contract', 't-invoice']],
  ['skips inline-only attachments', { hasAttachment: true, search: 'piatok' }, []],
  ['requires the attachment on a matched message', { hasAttachment: true, search: 'zmluva' }, []],
  [
    'finds the matched message with the attachment',
    { hasAttachment: true, search: 'sken' },
    ['t-contract'],
  ],
  [
    'searches every folder except trash and spam',
    { everywhere: true, search: 'faktur' },
    ['t-archived', 't-meeting', 't-invoice'],
  ],
  [
    'lists every unheld thread everywhere',
    { everywhere: true },
    ['t-contract', 't-archived', 't-meeting', 't-invoice'],
  ],
  [
    'replaces the view everywhere',
    { everywhere: true, view: 'trash', search: 'faktur' },
    ['t-archived', 't-meeting', 't-invoice'],
  ],
  [
    'combines everywhere with the sender field',
    { everywhere: true, search: 'jana', searchField: 'from' },
    ['t-archived', 't-invoice'],
  ],
  [
    'combines every filter',
    {
      everywhere: true,
      search: 'faktur',
      searchField: 'subject',
      hasAttachment: true,
      unread: true,
    },
    ['t-invoice'],
  ],
  ['combines everywhere with unread', { everywhere: true, unread: true }, ['t-invoice']],
];

describe('SqliteThreadRepository.queryFolder search filters', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
    await seedSearchFilterScenario(store, work);
  });

  afterEach(() => {
    store.database.close();
  });

  it.each(FILTER_CASES)('%s', async (_name, query, expected) => {
    expect(await folderIds(store, query)).toEqual(expected);
  });

  it('ignores the mailbox, label and split scope everywhere', async () => {
    expect(
      await folderIds(store, {
        everywhere: true,
        view: 'mailbox',
        mailboxId: work.sent.id,
        search: 'faktur',
      }),
    ).toEqual(['t-archived', 't-meeting', 't-invoice']);
    expect(await folderIds(store, { view: 'mailbox', mailboxId: work.sent.id })).toEqual([]);
  });

  it('keeps the account scope everywhere', async () => {
    const home = await seedAccount(store.repositories, {
      id: accountId('acc-home'),
      email: 'jan@domov.sk',
    });
    await addThread(store, home, 't-home', {}, { subject: 'Faktúra domov' });

    expect(await folderIds(store, { everywhere: true, search: 'faktur' })).toContain('t-home');
    expect(
      await folderIds(store, { everywhere: true, search: 'faktur', accountId: home.account.id }),
    ).toEqual(['t-home']);
  });
});
