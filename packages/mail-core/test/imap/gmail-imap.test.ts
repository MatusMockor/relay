import type { MailProvider } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAccount } from '../support/accounts';
import { collect } from '../support/collect';
import { type GmailImapStub, startGmailImapStub } from '../support/gmail/gmail-imap-stub';
import { createProvider } from '../support/provider-harness';

const gmailAccount = (port: number): MailAccount => {
  const user = { email: 'me@gmail.test', login: 'me@gmail.test', password: 'secret' };
  const endpoint = { host: '127.0.0.1', port, secure: false };
  return buildAccount(user, {
    settings: { imap: endpoint, smtp: endpoint, username: user.login },
  });
};

describe('ImapMailProvider against a scripted Gmail IMAP server', () => {
  let stub: GmailImapStub;
  let provider: MailProvider;

  beforeEach(async () => {
    stub = await startGmailImapStub();
    provider = createProvider(gmailAccount(stub.port), { kind: 'password', password: 'secret' });
  });

  afterEach(async () => {
    await provider.close();
    await stub.close();
  });

  it('detects Gmail roles, system folders and labels from X-GM-EXT-1', async () => {
    const mailboxes = await provider.listMailboxes();
    const roles = Object.fromEntries(mailboxes.map(({ path, role }) => [path, role]));

    expect(roles).toEqual({
      INBOX: 'inbox',
      '[Gmail]/All Mail': 'archive',
      '[Gmail]/Drafts': 'drafts',
      '[Gmail]/Important': 'system',
      '[Gmail]/Sent Mail': 'sent',
      '[Gmail]/Spam': 'spam',
      '[Gmail]/Starred': 'system',
      '[Gmail]/Trash': 'trash',
      Archive: 'label',
      Faktúry: 'label',
      Projekty: 'label',
      'Projekty/Alfa': 'label',
    });
    expect(mailboxes.find(({ path }) => path === 'Projekty/Alfa')).toMatchObject({
      name: 'Alfa',
      delimiter: '/',
    });
  });

  it('decodes X-GM-LABELS and maps X-GM-MSGID to the email id', async () => {
    const messages = await collect(provider.fetchSince('INBOX', null));

    expect(messages.map(({ uid, labels, emailId }) => ({ uid, labels, emailId }))).toEqual([
      {
        uid: 1,
        labels: ['Projekty/Alfa', '\\Important', '\\Inbox'],
        emailId: '1790000000000000001',
      },
      { uid: 2, labels: ['Faktúry', '\\Inbox'], emailId: '1790000000000000002' },
    ]);
    expect(messages[0]?.keywords).toEqual([]);
    const fetch = stub.commands.find((command) => command.includes('UID FETCH'));
    expect(fetch).toContain('X-GM-LABELS');
    expect(fetch).toContain('X-GM-MSGID');
  });

  it('reads X-GM-LABELS and X-GM-MSGID into message summaries', async () => {
    const summaries = await provider.fetchSummaries('[Gmail]/All Mail', 11, [7, 5]);

    expect(
      summaries.map(({ uid, labels, emailId, snippet }) => ({ uid, labels, emailId, snippet })),
    ).toEqual([
      {
        uid: 5,
        labels: ['Projekty/Alfa', '\\Important', '\\Inbox'],
        emailId: '1790000000000000001',
        snippet: 'Hello.',
      },
      { uid: 7, labels: ['"VIP"', 'Archive'], emailId: '1790000000000000003', snippet: 'Hello.' },
    ]);
    const header = Buffer.from(summaries[0]?.header ?? []).toString('utf8');
    expect(header).toContain('Subject: Alfa');
    expect(header).not.toContain('Received:');
    const fetches = stub.commands.filter((command) => command.includes('UID FETCH'));
    expect(fetches[0]).toContain('X-GM-LABELS');
    expect(fetches[0]).toContain('X-GM-MSGID');
    expect(fetches[0]).toContain('BODYSTRUCTURE');
    expect(fetches[1]).toContain('BODY.PEEK[TEXT]<0.4096>');
  });

  it('reads label changes of the requested UIDs only', async () => {
    const changes = await collect(provider.fetchFlagChanges('[Gmail]/All Mail', '0', [5, 7]));

    expect(changes.map(({ uid, labels }) => ({ uid, labels }))).toEqual([
      { uid: 5, labels: ['Projekty/Alfa', '\\Important', '\\Inbox'] },
      { uid: 7, labels: ['"VIP"', 'Archive'] },
    ]);
    const fetches = stub.commands.filter((command) => command.includes('UID FETCH'));
    expect(fetches).toHaveLength(1);
    expect(fetches[0]).toMatch(/UID FETCH 5,7 /);
    expect(fetches[0]).toContain('X-GM-LABELS');
  });

  it('skips the server when no UIDs are requested', async () => {
    expect(await collect(provider.fetchFlagChanges('[Gmail]/All Mail', '0', []))).toEqual([]);
    expect(stub.commands.some((command) => command.includes('UID FETCH'))).toBe(false);
  });
});
