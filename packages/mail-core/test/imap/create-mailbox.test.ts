import { ProviderError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { namespacedPath } from '../../src/imap/create-mailbox';
import { createProviderHarness, type ProviderHarness } from '../support/provider-harness';
import { rawMail } from '../support/raw-mail';

describe('namespacedPath', () => {
  it('puts the name into the personal namespace of the server', () => {
    expect(namespacedPath('Archive', { prefix: 'INBOX.', delimiter: '.' })).toBe('INBOX.Archive');
    expect(namespacedPath('Archive', { prefix: 'INBOX', delimiter: '.' })).toBe('INBOX.Archive');
    expect(namespacedPath('Archive', { prefix: 'INBOX/', delimiter: '/' })).toBe('INBOX/Archive');
    expect(namespacedPath('Archive', { prefix: '', delimiter: '.' })).toBe('Archive');
    expect(namespacedPath('Archive', null)).toBe('Archive');
    expect(namespacedPath('INBOX.Archive', { prefix: 'INBOX.', delimiter: '.' })).toBe(
      'INBOX.Archive',
    );
  });
});

describe('ImapMailProvider.createMailbox against GreenMail', () => {
  let harness: ProviderHarness;

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('creates a subscribed mailbox with its detected role and accepts messages', async () => {
    const created = await harness.provider.createMailbox('Archive');

    expect(created).toEqual({
      path: 'Archive',
      name: 'Archive',
      delimiter: '.',
      role: 'archive',
      subscribed: true,
    });
    const listed = await harness.provider.listMailboxes();
    expect(listed.map((mailbox) => mailbox.path).sort()).toEqual(['Archive', 'INBOX']);
    const appended = await harness.provider.append(
      'Archive',
      rawMail({ to: harness.user.email, subject: 'kept' }),
      {},
    );
    expect(appended.uid).toBe(1);
  });

  it('returns the existing mailbox instead of failing when it already exists', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Sent');

    const first = await harness.provider.createMailbox('Sent');
    const second = await harness.provider.createMailbox('Sent');

    expect(first).toMatchObject({ path: 'Sent', role: 'sent' });
    expect(second).toEqual(first);
    const sent = (await harness.provider.listMailboxes()).filter((m) => m.path === 'Sent');
    expect(sent).toHaveLength(1);
  });

  it('refuses a non-selectable folder with the same name instead of using it', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Archive.2026');

    await expect(harness.provider.createMailbox('Archive')).rejects.toBeInstanceOf(ProviderError);
    await expect(harness.provider.createMailbox('Archive')).rejects.toThrow('cannot hold messages');
  });
});
