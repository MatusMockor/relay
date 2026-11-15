import type { ThreadFolderQuery } from '@relay/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { at, seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('full-text search in queryFolder', () => {
  const context = usePgTestContext();
  let seeded: SeededAccount;

  const search = async (text: string, overrides: Partial<ThreadFolderQuery> = {}) =>
    (
      await context.repositories.threads.queryFolder(seeded.user.id, {
        view: 'inbox',
        accountId: null,
        splitId: null,
        labelId: null,
        search: text,
        cursor: null,
        limit: 50,
        ...overrides,
      })
    ).items.map((thread) => thread.subject);

  beforeAll(async () => {
    seeded = await seedAccount(context.repositories);
    await seedThread(
      context.repositories,
      seeded,
      { subject: 'Faktúra za október', lastMessageAt: at(1) },
      {
        textBody: 'Dobrý deň, v prílohe posielam faktúru.',
        from: { name: 'Účtovníčka Šárka', email: 'sarka@uctovnictvo.sk' },
      },
    );
    await seedThread(
      context.repositories,
      seeded,
      { subject: 'Stretnutie v piatok', lastMessageAt: at(2) },
      {
        textBody: 'Môžeme sa stretnúť o 14:00 v kaviarni?',
        from: { name: 'Peter', email: 'peter@firma.sk' },
      },
    );
    await seedThread(
      context.repositories,
      seeded,
      { subject: 'Release REL-42', lastMessageAt: at(3), state: 'done' },
      {
        textBody: 'Nasadené na produkciu.',
        to: [{ name: 'Ján Kováč', email: 'jan.kovac@relay.test' }],
      },
    );
    const stranger = await seedAccount(context.repositories);
    await seedThread(context.repositories, stranger, { subject: 'Faktúra cudzia' });
  });

  it('matches with and without diacritics in both directions', async () => {
    await expect(search('faktura')).resolves.toEqual(['Faktúra za október']);
    await expect(search('FAKTÚRA')).resolves.toEqual(['Faktúra za október']);
    await expect(search('stretnúť')).resolves.toEqual(['Stretnutie v piatok']);
    await expect(search('kaviarni')).resolves.toEqual(['Stretnutie v piatok']);
  });

  it('matches word prefixes and requires every term', async () => {
    await expect(search('fakt okt')).resolves.toEqual(['Faktúra za október']);
    await expect(search('fakt piatok')).resolves.toEqual([]);
  });

  it('searches sender and recipient names and email parts', async () => {
    await expect(search('sarka')).resolves.toEqual(['Faktúra za október']);
    await expect(search('uctovnictvo.sk')).resolves.toEqual(['Faktúra za október']);
    await expect(search('peter@firma.sk')).resolves.toEqual(['Stretnutie v piatok']);
    await expect(search('kovac', { view: 'done' })).resolves.toEqual(['Release REL-42']);
  });

  it('combines search with the folder view and never leaks other users', async () => {
    await expect(search('rel-42')).resolves.toEqual([]);
    await expect(search('rel-42', { view: 'done' })).resolves.toEqual(['Release REL-42']);
    await expect(search('cudzia')).resolves.toEqual([]);
  });

  it('splits terms on punctuation', async () => {
    await expect(search('faktura,oktober')).resolves.toEqual(['Faktúra za október']);
    await expect(search('stretnutie;piatok')).resolves.toEqual(['Stretnutie v piatok']);
    await expect(search('faktura,piatok')).resolves.toEqual([]);
  });

  it('treats query syntax characters as plain text', async () => {
    await expect(search("faktura & ! | ( ) : * ' \\")).resolves.toEqual(['Faktúra za október']);
    await expect(search('!!!')).resolves.toEqual(['Stretnutie v piatok', 'Faktúra za október']);
  });
});
