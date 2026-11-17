import { UidValidityChangedError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProviderHarness, type ProviderHarness } from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';
import { collect } from '../support/collect';

describe('ImapMailProvider initial sync reads against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  const appendMail = (subject: string, ids: { messageId?: string; inReplyTo?: string } = {}) =>
    harness.provider.append('INBOX', rawMail({ to: harness.user.email, subject, ...ids }), {});

  it('fetches the requested uids in the requested order across batches', async () => {
    await appendMail('first');
    await appendMail('second');
    await appendMail('third');
    const { uidValidity } = await harness.provider.status('INBOX');

    const newestFirst = await collect(harness.provider.fetchUids('INBOX', uidValidity, [3, 2, 1]));

    expect(newestFirst.map((message) => message.uid)).toEqual([3, 2, 1]);
    expect(new TextDecoder().decode(newestFirst[0]?.source)).toContain('Subject: third');
    const gaps = await collect(harness.provider.fetchUids('INBOX', uidValidity, [9, 2]));
    expect(gaps.map((message) => message.uid)).toEqual([2]);
    expect(await collect(harness.provider.fetchUids('INBOX', uidValidity, []))).toEqual([]);
  });

  it('reads the threading headers, subjects and dates of the requested uids', async () => {
    await appendMail('Kickoff', { messageId: '<root@relay.test>' });
    await appendMail('=?UTF-8?B?UmU6IFBvcmFkYSB2IHPDoWxl?=', {
      messageId: '<reply@relay.test>',
      inReplyTo: '<root@relay.test>',
    });
    await appendMail('Lunch', { messageId: '<lunch@relay.test>' });
    const { uidValidity } = await harness.provider.status('INBOX');

    const headers = await harness.provider.fetchThreadHeaders('INBOX', uidValidity, [3, 1, 2]);

    const sent = '2026-11-15T09:00:00.000Z';
    expect(headers.map(({ internalDate: _date, ...rest }) => rest)).toEqual([
      {
        uid: 1,
        date: sent,
        subject: 'Kickoff',
        messageId: '<root@relay.test>',
        inReplyTo: [],
        references: [],
      },
      {
        uid: 2,
        date: sent,
        subject: 'Re: Porada v sále',
        messageId: '<reply@relay.test>',
        inReplyTo: ['<root@relay.test>'],
        references: ['<root@relay.test>'],
      },
      {
        uid: 3,
        date: sent,
        subject: 'Lunch',
        messageId: '<lunch@relay.test>',
        inReplyTo: [],
        references: [],
      },
    ]);
    headers.forEach((header) => {
      expect(Number.isNaN(Date.parse(header.internalDate))).toBe(false);
    });
  });

  it('refuses both reads under a stale UIDVALIDITY', async () => {
    await appendMail('only');
    const { uidValidity } = await harness.provider.status('INBOX');
    const stale = uidValidity + 1;

    await expect(collect(harness.provider.fetchUids('INBOX', stale, [1]))).rejects.toBeInstanceOf(
      UidValidityChangedError,
    );
    await expect(harness.provider.fetchThreadHeaders('INBOX', stale, [1])).rejects.toBeInstanceOf(
      UidValidityChangedError,
    );
  });
});
