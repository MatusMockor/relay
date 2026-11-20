import { ThreadListQuerySchema } from '@relay/shared/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

type TermCase = readonly [string, Record<string, string>, readonly string[]];

const TERM_CASES: readonly TermCase[] = [
  ['matches word prefixes in any order', { q: 'oct inv' }, ['Invoice October']],
  ['skips terms inside a word', { q: 'voice' }, []],
  ['requires every term', { q: 'invoice friday' }, []],
  ['matches terms across fields', { q: 'novak invoice' }, ['Invoice October']],
  ['ignores the letter case', { q: 'INVOICE' }, ['Invoice October']],
  ['folds diacritics in the sender', { q: 'novak', searchField: 'from' }, ['Invoice October']],
  ['folds diacritics in the query', { q: 'nováková', searchField: 'from' }, ['Invoice October']],
  ['matches sender email parts', { q: 'klient.sk', searchField: 'from' }, ['Invoice October']],
  ['skips recipient names in the sender field', { q: 'bielikova', searchField: 'from' }, []],
  ['folds diacritics in the subject', { q: 'stastn', searchField: 'subject' }, ['Šťastný deň']],
  ['ignores punctuation-only terms', { q: '- !' }, ['Šťastný deň', 'Invoice October']],
];

const subjectsOf = async (engine: TestEngine, raw: Record<string, string>): Promise<string[]> =>
  (
    await engine.services.inbox.list(
      USER_ID,
      ThreadListQuerySchema.parse({ view: 'inbox', ...raw }),
    )
  ).items.map((thread) => thread.subject);

describe('InboxQueryService search terms', () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = createTestEngine();
    const seeded = await seedAccount(engine);
    deliverMail(seeded.server, 'INBOX', {
      id: 'invoice',
      subject: 'Invoice October',
      from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
      body: 'Please pay.',
      date: '2026-11-15T08:00:00.000Z',
    });
    deliverMail(seeded.server, 'INBOX', {
      id: 'greeting',
      subject: 'Šťastný deň',
      to: [{ name: 'Zuzana Bieliková', email: 'zuzana@firma.sk' }],
      body: 'Pekný deň.',
      seen: true,
      date: '2026-11-15T09:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  });

  it.each(TERM_CASES)('%s', async (_name, query, expected) => {
    await expect(subjectsOf(engine, query)).resolves.toEqual(expected);
  });
});
