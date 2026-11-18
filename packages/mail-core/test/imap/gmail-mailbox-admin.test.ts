import { ProviderError, type MailProvider } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAccount } from '../support/accounts';
import {
  type GmailImapStub,
  type GmailImapStubOptions,
  startGmailImapStub,
} from '../support/gmail/gmail-imap-stub';
import { createProvider } from '../support/provider-harness';

const gmailAccount = (port: number): MailAccount => {
  const user = { email: 'me@gmail.test', login: 'me@gmail.test', password: 'secret' };
  const endpoint = { host: '127.0.0.1', port, secure: false };
  return buildAccount(user, {
    settings: { imap: endpoint, smtp: endpoint, username: user.login },
  });
};

const sent = (stub: GmailImapStub, verb: string): string[] =>
  stub.commands
    .map((command) => command.replace(/^\S+ /, ''))
    .filter((command) => command.startsWith(verb));

describe('mailbox management against a scripted Gmail IMAP server', () => {
  let stub: GmailImapStub;
  let provider: MailProvider;

  const start = async (options: GmailImapStubOptions = {}) => {
    stub = await startGmailImapStub(options);
    provider = createProvider(gmailAccount(stub.port), { kind: 'password', password: 'secret' });
  };

  afterEach(async () => {
    await provider.close();
    await stub.close();
  });

  it('renames a label, moves its subscription and returns the listed mailbox', async () => {
    await start();

    const renamed = await provider.renameMailbox('Projekty', 'Práca');

    expect(sent(stub, 'RENAME')).toEqual(['RENAME Projekty Pr&AOE-ca']);
    expect(sent(stub, 'SUBSCRIBE')).toEqual(['SUBSCRIBE Pr&AOE-ca', 'SUBSCRIBE Pr&AOE-ca/Alfa']);
    expect(sent(stub, 'UNSUBSCRIBE')).toEqual([
      'UNSUBSCRIBE Projekty',
      'UNSUBSCRIBE Projekty/Alfa',
    ]);
    expect(renamed).toMatchObject({
      path: 'Práca',
      name: 'Práca',
      delimiter: '/',
      role: 'label',
    });
    expect(stub.mailboxes.map((mailbox) => mailbox.path)).toContain('Pr&AOE-ca/Alfa');
  });

  it('creates a nested label', async () => {
    await start();

    const created = await provider.createMailbox('Beta', 'Projekty');

    expect(created).toMatchObject({ path: 'Projekty/Beta', role: 'label' });
    expect(sent(stub, 'CREATE')).toEqual(['CREATE Projekty/Beta']);
    expect(stub.mailboxes.map((mailbox) => mailbox.path)).toContain('Projekty/Beta');
  });

  it('deletes a label mailbox', async () => {
    await start();

    await provider.deleteMailbox('Faktúry');

    expect(sent(stub, 'DELETE')).toEqual(['DELETE Fakt&APo-ry']);
    expect(sent(stub, 'UNSUBSCRIBE')).toEqual(['UNSUBSCRIBE Fakt&APo-ry']);
    expect(stub.mailboxes.map((mailbox) => mailbox.path)).not.toContain('Fakt&APo-ry');
  });

  it('rejects custom keywords when the mailbox does not permit them', async () => {
    await start({ permanentFlags: '\\Seen \\Flagged' });

    const stored = provider.setKeywords('INBOX', [1], { add: ['Fakt&c3ba-ry'], remove: [] });

    await expect(stored).rejects.toBeInstanceOf(ProviderError);
    await expect(stored).rejects.toThrow('Server nepodporuje vlastné štítky');
    expect(sent(stub, 'UID STORE')).toEqual([]);
  });

  it('still removes keywords when the mailbox does not permit new ones', async () => {
    await start({ permanentFlags: '\\Seen \\Flagged' });

    await provider.setKeywords('INBOX', [1], { add: [], remove: ['Fakt&c3ba-ry'] });

    expect(sent(stub, 'UID STORE')).toEqual(['UID STORE 1 -FLAGS (Fakt&c3ba-ry)']);
  });
});
