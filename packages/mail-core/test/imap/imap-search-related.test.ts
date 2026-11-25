import { UidValidityChangedError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProviderHarness, type ProviderHarness } from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';

describe('ImapMailProvider related mail search against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  const appendMail = (subject: string, ids: { messageId: string; inReplyTo?: string }) =>
    harness.provider.append('INBOX', rawMail({ to: harness.user.email, subject, ...ids }), {});

  it('finds mail by its Message-ID and mail that replies to it', async () => {
    await appendMail('Plan', { messageId: '<plan@relay.test>' });
    await appendMail('Re: Plan', {
      messageId: '<plan-reply@relay.test>',
      inReplyTo: '<plan@relay.test>',
    });
    await appendMail('Lunch', { messageId: '<lunch@relay.test>' });
    await appendMail('Re: Trip', {
      messageId: '<trip-reply@relay.test>',
      inReplyTo: '<trip@relay.test>',
    });
    const { uidValidity } = await harness.provider.status('INBOX');

    const plan = await harness.provider.searchRelated('INBOX', uidValidity, ['<plan@relay.test>']);
    const trip = await harness.provider.searchRelated('INBOX', uidValidity, [
      '<trip@relay.test>',
      '<unknown@relay.test>',
    ]);

    expect(plan).toEqual([1, 2]);
    expect(trip).toEqual([4]);
    expect(await harness.provider.searchRelated('INBOX', uidValidity, [])).toEqual([]);
  });

  it('matches only Message-ID when match is message-id, including a single id and since date', async () => {
    await appendMail('Plan', { messageId: '<plan@relay.test>' });
    await appendMail('Re: Plan', {
      messageId: '<plan-reply@relay.test>',
      inReplyTo: '<plan@relay.test>',
    });
    const { uidValidity } = await harness.provider.status('INBOX');

    const exact = await harness.provider.searchRelated(
      'INBOX',
      uidValidity,
      ['<plan@relay.test>'],
      {
        match: 'message-id',
        since: new Date(Date.now() - 86_400_000),
      },
    );

    expect(exact).toEqual([1]);
  });

  it('searches more ids than fit into one command', async () => {
    const ids = Array.from({ length: 45 }, (_, index) => `<bulk-${String(index)}@relay.test>`);
    await appendMail('Bulk', { messageId: ids[44] ?? '' });
    const { uidValidity } = await harness.provider.status('INBOX');

    expect(await harness.provider.searchRelated('INBOX', uidValidity, ids)).toEqual([1]);
  });

  it('refuses a search under a stale UIDVALIDITY', async () => {
    await appendMail('only', { messageId: '<only@relay.test>' });
    const { uidValidity } = await harness.provider.status('INBOX');

    await expect(
      harness.provider.searchRelated('INBOX', uidValidity + 1, ['<only@relay.test>']),
    ).rejects.toBeInstanceOf(UidValidityChangedError);
  });
});
