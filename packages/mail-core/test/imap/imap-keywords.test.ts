import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProviderHarness, type ProviderHarness } from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';

describe('IMAP keywords against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  const appendMail = (subject: string, mailbox = 'INBOX') =>
    harness.provider.append(mailbox, rawMail({ to: harness.user.email, subject }), {});

  const rawKeywords = async (mailbox: string, uid: number): Promise<string[]> => {
    const admin = await harness.admin();
    const lock = await admin.getMailboxLock(mailbox);
    try {
      const fetched = await admin.fetchOne(String(uid), { flags: true }, { uid: true });
      return fetched === false ? [] : [...(fetched.flags ?? [])].sort();
    } finally {
      lock.release();
    }
  };

  it('stores encoded keywords and reads them back as readable names', async () => {
    await appendMail('first');

    await harness.provider.setKeywords('INBOX', [1], {
      add: ['Faktúry', 'Moje veci', 'relay-done'],
      remove: [],
    });

    expect(await rawKeywords('INBOX', 1)).toEqual(['Fakt&APo-ry', 'Moje&ACA-veci', 'relay-done']);
    expect((await harness.provider.fetchMessage('INBOX', 1))?.keywords).toEqual([
      'Faktúry',
      'Moje veci',
      'relay-done',
    ]);

    await harness.provider.setKeywords('INBOX', [1], { add: [], remove: ['Moje veci'] });

    expect((await harness.provider.fetchMessage('INBOX', 1))?.keywords).toEqual([
      'Faktúry',
      'relay-done',
    ]);
  });

  it('purges a keyword from every message of a mailbox', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Archive');
    await appendMail('one');
    await appendMail('two');
    await appendMail('three', 'Archive');
    await harness.provider.setKeywords('INBOX', [1, 2], { add: ['Faktúry', 'kept'], remove: [] });
    await harness.provider.setKeywords('Archive', [1], { add: ['Faktúry'], remove: [] });

    await harness.provider.purgeKeyword('INBOX', 'Faktúry');

    expect((await harness.provider.fetchMessage('INBOX', 1))?.keywords).toEqual(['kept']);
    expect((await harness.provider.fetchMessage('INBOX', 2))?.keywords).toEqual(['kept']);
    expect((await harness.provider.fetchMessage('Archive', 1))?.keywords).toEqual(['Faktúry']);
  });

  it('purges an empty mailbox without sending a store', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Empty');

    await expect(harness.provider.purgeKeyword('Empty', 'Faktúry')).resolves.toBeUndefined();
  });
});
