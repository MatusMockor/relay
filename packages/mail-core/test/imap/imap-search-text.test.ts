import { UidValidityChangedError, type RemoteTextSearch } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProviderHarness, type ProviderHarness } from '../support/provider-harness';
import { textSearchMail, type TextSearchMailInput } from '../support/text-search-mail';

const search = (query: Partial<RemoteTextSearch> & Pick<RemoteTextSearch, 'terms'>) => ({
  field: 'all' as const,
  limit: 50,
  ...query,
});

describe('ImapMailProvider text search against GreenMail', () => {
  let harness: ProviderHarness;
  let uidValidity: number;

  const appendAt = async (input: Omit<TextSearchMailInput, 'to'>, date: string) => {
    const admin = await harness.admin();
    await admin.append(
      'INBOX',
      textSearchMail({ ...input, to: harness.user.email }),
      [],
      new Date(date),
    );
  };

  beforeEach(async () => {
    harness = await createProviderHarness();
    await appendAt(
      {
        from: { name: 'Jana', email: 'jana@relay.test' },
        subject: 'Zmluva',
        body: 'Dodávka: žltý kôň príde v pondelok.',
        charset: 'utf-8',
      },
      '2025-01-10T09:00:00.000Z',
    );
    await appendAt(
      {
        from: { name: 'Peter', email: 'peter@relay.test' },
        subject: 'Stajňa',
        body: 'Kôň je žltý a rýchly.',
        charset: 'iso-8859-2',
      },
      '2023-06-01T09:00:00.000Z',
    );
    await appendAt(
      {
        from: { name: 'Mária', email: 'maria@relay.test' },
        subject: 'Žltý kôň na predaj',
        body: 'Bez ďalšieho textu.',
        charset: 'utf-8',
      },
      '2026-02-01T09:00:00.000Z',
    );
    await appendAt(
      {
        from: { name: 'Ivan', email: 'ivan@relay.test' },
        subject: 'Obed',
        body: 'Ideme na obed?',
        charset: 'utf-8',
      },
      '2026-03-01T09:00:00.000Z',
    );
    uidValidity = (await harness.provider.status('INBOX')).uidValidity;
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('finds a Slovak term in UTF-8 and ISO-8859-2 bodies and in subjects, newest first', async () => {
    const found = await harness.provider.searchText(
      'INBOX',
      uidValidity,
      search({ terms: ['žltý', 'kôň'] }),
    );

    expect(found).toEqual({ uids: [3, 2, 1], complete: true });
  });

  it('limits the terms to the subject or the sender', async () => {
    const subject = await harness.provider.searchText(
      'INBOX',
      uidValidity,
      search({ terms: ['kôň'], field: 'subject' }),
    );
    const from = await harness.provider.searchText(
      'INBOX',
      uidValidity,
      search({ terms: ['maria@relay.test'], field: 'from' }),
    );

    expect(subject.uids).toEqual([3]);
    expect(from.uids).toEqual([3]);
  });

  it('bounds the search by date and caps the number of uids', async () => {
    const older = await harness.provider.searchText(
      'INBOX',
      uidValidity,
      search({ terms: ['kôň'], before: new Date('2024-01-01T00:00:00.000Z') }),
    );
    const capped = await harness.provider.searchText(
      'INBOX',
      uidValidity,
      search({ terms: ['kôň'], limit: 2 }),
    );

    expect(older.uids).toEqual([2]);
    expect(capped).toEqual({ uids: [3, 2], complete: true });
  });

  it('answers an empty mailbox without searching and refuses a stale UIDVALIDITY', async () => {
    await harness.provider.createMailbox('Prazdny');
    const empty = await harness.provider.status('Prazdny');

    expect(
      await harness.provider.searchText('Prazdny', empty.uidValidity, search({ terms: ['kôň'] })),
    ).toEqual({ uids: [], complete: true });
    await expect(
      harness.provider.searchText('INBOX', uidValidity + 1, search({ terms: ['kôň'] })),
    ).rejects.toBeInstanceOf(UidValidityChangedError);
  });
});
