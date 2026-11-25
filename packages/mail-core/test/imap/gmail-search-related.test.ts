import type { MailProvider } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAccount } from '../support/accounts';
import { type GmailImapStub, startGmailImapStub } from '../support/gmail/gmail-imap-stub';
import { createProvider } from '../support/provider-harness';

const ALL_MAIL = '[Gmail]/All Mail';

const gmailAccount = (port: number): MailAccount => {
  const user = { email: 'me@gmail.test', login: 'me@gmail.test', password: 'secret' };
  const endpoint = { host: '127.0.0.1', port, secure: false };
  return buildAccount(user, {
    settings: { imap: endpoint, smtp: endpoint, username: user.login },
  });
};

describe('Gmail related search and thread headers against a scripted Gmail server', () => {
  let stub: GmailImapStub;
  let provider: MailProvider;

  const start = async () => {
    stub = await startGmailImapStub();
    provider = createProvider(gmailAccount(stub.port), { kind: 'password', password: 'secret' });
  };

  const searches = () => stub.commands.filter((line) => line.includes('UID SEARCH'));

  afterEach(async () => {
    await provider.close();
    await stub.close();
  });

  it('uses indexed X-GM-RAW rfc822msgid queries when matching by message-id', async () => {
    await start();

    const found = await provider.searchRelated(
      ALL_MAIL,
      11,
      ['<MatusMockor/relay/pull/134@github.com>', '<other@relay.test>'],
      { match: 'message-id', since: new Date('2026-11-01T00:00:00.000Z') },
    );

    expect(found).toEqual([5, 6, 7]);
    expect(searches()).toHaveLength(1);
    expect(searches()[0]).toContain(
      'UID SEARCH X-GM-RAW "rfc822msgid:\\"MatusMockor/relay/pull/134@github.com\\" OR rfc822msgid:\\"other@relay.test\\""',
    );
  });

  it('keeps HEADER search for full related lookups so replies are still found', async () => {
    await start();

    await provider.searchRelated(ALL_MAIL, 11, ['<plan@relay.test>'], { match: 'all' });

    expect(searches()).toHaveLength(1);
    expect(searches()[0]).not.toContain('X-GM-RAW');
    expect(searches()[0]).toContain('HEADER MESSAGE-ID');
    expect(searches()[0]).toContain('HEADER IN-REPLY-TO');
    expect(searches()[0]).toContain('HEADER REFERENCES');
  });

  it('returns Gmail emailId and labels in fetchThreadHeaders metadata', async () => {
    await start();

    const headers = await provider.fetchThreadHeaders(ALL_MAIL, 11, [5, 6]);

    expect(headers.map((header) => header.meta)).toEqual([
      expect.objectContaining({
        uid: 5,
        emailId: '1790000000000000001',
        labels: ['Projekty/Alfa', '\\Important', '\\Inbox'],
      }),
      expect.objectContaining({
        uid: 6,
        emailId: '1790000000000000002',
        labels: ['Faktúry', '\\Inbox'],
      }),
    ]);
  });
});
