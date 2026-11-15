import { ProviderError, type MailboxChange } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProvider,
  createProviderHarness,
  type ProviderHarness,
} from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';
import { collect } from '../support/collect';

describe('ImapMailProvider against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  const appendMail = (subject: string, mailbox = 'INBOX') =>
    harness.provider.append(mailbox, rawMail({ to: harness.user.email, subject }), {});

  it('lists selectable mailboxes with detected roles', async () => {
    const admin = await harness.admin();
    for (const path of [
      'Sent',
      'Drafts',
      'Trash',
      'Junk',
      'Archive',
      '[Gmail].All Mail',
      'Projekty',
    ]) {
      await admin.mailboxCreate(path);
    }

    const mailboxes = await harness.provider.listMailboxes();
    const roles = Object.fromEntries(mailboxes.map((mailbox) => [mailbox.path, mailbox.role]));

    expect(roles).toEqual({
      INBOX: 'inbox',
      Sent: 'sent',
      Drafts: 'drafts',
      Trash: 'trash',
      Junk: 'spam',
      Archive: 'archive',
      '[Gmail].All Mail': 'archive',
      Projekty: 'custom',
    });
    expect(mailboxes.find((mailbox) => mailbox.path === 'Sent')?.delimiter).toBe('.');
  });

  it('fetches everything first and then only messages after the cursor', async () => {
    await appendMail('first');
    await appendMail('second');
    await appendMail('third');

    const initial = await collect(harness.provider.fetchSince('INBOX', null));
    expect(initial.map((message) => message.uid)).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(initial[0]?.source)).toContain('Subject: first');

    const status = await harness.provider.status('INBOX');
    const cursor = {
      uidValidity: status.uidValidity,
      lastUid: 3,
      highestModseq: status.highestModseq,
    };
    await appendMail('fourth');

    const incremental = await collect(harness.provider.fetchSince('INBOX', cursor));
    expect(incremental.map((message) => message.uid)).toEqual([4]);

    const caughtUp = await collect(harness.provider.fetchSince('INBOX', { ...cursor, lastUid: 4 }));
    expect(caughtUp).toEqual([]);

    const resynced = await collect(
      harness.provider.fetchSince('INBOX', { ...cursor, uidValidity: status.uidValidity + 1 }),
    );
    expect(resynced.map((message) => message.uid)).toEqual([1, 2, 3, 4]);
  });

  it('reports mailbox status', async () => {
    await appendMail('one');
    await harness.provider.append('INBOX', rawMail({ to: harness.user.email, subject: 'two' }), {
      seen: true,
    });

    const status = await harness.provider.status('INBOX');

    expect(status).toMatchObject({
      path: 'INBOX',
      messages: 2,
      unseen: 1,
      uidNext: 3,
      highestModseq: null,
    });
    expect(status.uidValidity).toBeGreaterThan(0);
  });

  it('fetches a single message and returns null for an unknown uid', async () => {
    const appended = await appendMail('single');
    expect(appended.uid).toBe(1);

    const message = await harness.provider.fetchMessage('INBOX', 1);
    expect(message?.flags).toEqual({ seen: false, flagged: false, answered: false });
    expect(message?.size).toBeGreaterThan(0);
    expect(await harness.provider.fetchMessage('INBOX', 99)).toBeNull();
  });

  it('adds and removes system flags and reports them as flag changes', async () => {
    await appendMail('flags');
    await harness.provider.setFlags('INBOX', [1], { add: ['seen', 'flagged'], remove: [] });
    await harness.provider.setFlags('INBOX', [1], { add: ['answered'], remove: ['flagged'] });

    const changes = await collect(harness.provider.fetchFlagChanges('INBOX', '0'));

    expect(changes).toEqual([
      { uid: 1, flags: { seen: true, flagged: false, answered: true }, keywords: [], modseq: null },
    ]);
  });

  it('adds and removes keywords', async () => {
    await appendMail('keywords');
    await harness.provider.setKeywords('INBOX', [1], {
      add: ['$label1', 'relay-done'],
      remove: [],
    });
    expect((await harness.provider.fetchMessage('INBOX', 1))?.keywords).toEqual([
      '$label1',
      'relay-done',
    ]);

    await harness.provider.setKeywords('INBOX', [1], { add: [], remove: ['$label1'] });
    expect((await harness.provider.fetchMessage('INBOX', 1))?.keywords).toEqual(['relay-done']);
  });

  it('moves messages and returns the uid map', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Archive');
    await appendMail('keep');
    await appendMail('archive me');

    const result = await harness.provider.move('INBOX', [2], 'Archive');

    expect(result.uidMap.get(2)).toBe(1);
    expect(await harness.provider.listUids('INBOX')).toEqual([1]);
    expect(await harness.provider.listUids('Archive')).toEqual([1]);
  });

  it('appends with flags and returns the new uid', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Sent');

    const result = await harness.provider.append(
      'Sent',
      rawMail({ to: 'x@relay.test', subject: 'sent' }),
      {
        seen: true,
      },
    );

    expect(result.uid).toBe(1);
    expect(result.uidValidity).toBeGreaterThan(0);
    expect((await harness.provider.fetchMessage('Sent', 1))?.flags.seen).toBe(true);
  });

  it('lists uids so the engine can detect expunged messages', async () => {
    await appendMail('a');
    await appendMail('b');
    await appendMail('c');
    const admin = await harness.admin();
    await admin.mailboxOpen('INBOX');
    await admin.messageDelete('2', { uid: true });

    expect(await harness.provider.listUids('INBOX')).toEqual([1, 3]);
  });

  it('notifies about new and expunged messages while idling', async () => {
    await appendMail('existing');
    const changes: MailboxChange[] = [];
    const dispose = await harness.provider.idle('INBOX', (change) => changes.push(change));

    await appendMail('arrives during idle');
    await vi.waitFor(
      () => {
        expect(changes).toContainEqual({ type: 'exists', mailboxPath: 'INBOX', count: 2 });
      },
      { timeout: 10_000, interval: 100 },
    );

    const admin = await harness.admin();
    await admin.mailboxOpen('INBOX');
    await admin.messageDelete('1', { uid: true });
    await vi.waitFor(
      () => {
        expect(changes.some((change) => change.type === 'expunge')).toBe(true);
      },
      { timeout: 10_000, interval: 100 },
    );

    await dispose();
  });

  it('fails with a ProviderError when the server is unreachable', async () => {
    const unreachable = {
      ...harness.account,
      settings: {
        ...harness.account.settings,
        imap: { host: '127.0.0.1', port: 1, secure: false },
      },
    };
    const provider = createProvider(unreachable, { kind: 'password', password: 'x' });

    await expect(provider.connect()).rejects.toBeInstanceOf(ProviderError);
    await provider.close();
  });

  it('returns empty results for empty mailboxes', async () => {
    expect(await collect(harness.provider.fetchSince('INBOX', null))).toEqual([]);
    expect(await harness.provider.listUids('INBOX')).toEqual([]);
    expect(await collect(harness.provider.fetchFlagChanges('INBOX', '0'))).toEqual([]);
  });
});
