import type { ThreadFolderQuery } from '@relay/engine';
import type { ThreadId } from '@relay/shared/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';
import { seedSearchFilterScenario } from './support/search-filter-scenario';

type FilterCase = readonly [string, Partial<ThreadFolderQuery>, readonly string[]];

const FILTER_CASES: readonly FilterCase[] = [
  ['searches every column by default', { search: 'jana' }, ['t-meeting', 't-invoice']],
  ['limits the search to the sender', { search: 'jana', searchField: 'from' }, ['t-invoice']],
  ['matches sender email parts', { search: 'klient.sk', searchField: 'from' }, ['t-invoice']],
  ['folds diacritics in the sender field', { search: 'novak', searchField: 'from' }, ['t-invoice']],
  ['skips recipient names in the sender field', { search: 'bielikova', searchField: 'from' }, []],
  ['skips recipient emails in the sender field', { search: 'zuzana', searchField: 'from' }, []],
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

describe('PgThreadRepository.queryFolder search filters', () => {
  const context = usePgTestContext();
  let work: SeededAccount;
  let keys: Map<ThreadId, string>;

  const keysOf = async (overrides: Partial<ThreadFolderQuery>): Promise<string[]> =>
    (
      await context.repositories.threads.queryFolder(work.user.id, {
        view: 'inbox',
        accountId: null,
        splitId: null,
        labelId: null,
        mailboxId: null,
        search: null,
        cursor: null,
        limit: 50,
        ...overrides,
      })
    ).items.map((thread) => keys.get(thread.id) ?? thread.subject);

  beforeAll(async () => {
    work = await seedAccount(context.repositories);
    keys = new Map(await seedSearchFilterScenario(context.repositories, work));
  });

  it.each(FILTER_CASES)('%s', async (_name, query, expected) => {
    expect(await keysOf(query)).toEqual(expected);
  });

  it('ignores the mailbox scope everywhere', async () => {
    await expect(
      keysOf({
        everywhere: true,
        view: 'mailbox',
        mailboxId: work.mailboxes.sent.id,
        search: 'faktur',
      }),
    ).resolves.toEqual(['t-archived', 't-meeting', 't-invoice']);
    await expect(keysOf({ view: 'mailbox', mailboxId: work.mailboxes.sent.id })).resolves.toEqual(
      [],
    );
  });

  it('keeps the account scope everywhere', async () => {
    const home = await seedAccount(context.repositories, work.user);
    const { thread } = await seedThread(
      context.repositories,
      home,
      {},
      { subject: 'Faktúra domov' },
    );
    keys.set(thread.id, 't-home');

    await expect(keysOf({ everywhere: true, search: 'faktur' })).resolves.toContain('t-home');
    await expect(
      keysOf({ everywhere: true, search: 'faktur', accountId: home.account.id }),
    ).resolves.toEqual(['t-home']);
  });
});
