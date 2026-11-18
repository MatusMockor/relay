import type { MailProvider } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAccount } from '../support/accounts';
import { type GmailImapStub, startGmailImapStub } from '../support/gmail/gmail-imap-stub';
import { createProvider } from '../support/provider-harness';

const gmailAccount = (port: number): MailAccount => {
  const user = { email: 'me@gmail.test', login: 'me@gmail.test', password: 'secret' };
  const endpoint = { host: '127.0.0.1', port, secure: false };
  return buildAccount(user, {
    settings: { imap: endpoint, smtp: endpoint, username: user.login },
  });
};

const folderCommands = (stub: GmailImapStub): string[] =>
  stub.commands
    .map((command) => command.replace(/^\S+ /, ''))
    .filter((command) => /^(CREATE|RENAME|DELETE|SUBSCRIBE|UNSUBSCRIBE) /.test(command));

describe('Gmail label folders against a scripted Gmail IMAP server', () => {
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

  it('creates a nested label', async () => {
    const created = await provider.createMailbox('Beta', 'Projekty');

    expect(created).toMatchObject({ path: 'Projekty/Beta', role: 'label' });
    expect(new Set(folderCommands(stub))).toEqual(
      new Set(['CREATE Projekty/Beta', 'SUBSCRIBE Projekty/Beta']),
    );
  });

  it('renames a label tree with encoded names and moves the subscriptions', async () => {
    const renamed = await provider.renameMailbox('Projekty', 'Zákazníci');

    expect(renamed).toMatchObject({ path: 'Zákazníci', name: 'Zákazníci', role: 'label' });
    const paths = (await provider.listMailboxes()).map((mailbox) => mailbox.path);
    expect(paths).toContain('Zákazníci/Alfa');
    expect(paths.filter((path) => path.startsWith('Projekty'))).toEqual([]);
    expect(folderCommands(stub)).toEqual([
      'RENAME Projekty Z&AOE-kazn&AO0-ci',
      'SUBSCRIBE Z&AOE-kazn&AO0-ci',
      'UNSUBSCRIBE Projekty',
      'SUBSCRIBE Z&AOE-kazn&AO0-ci/Alfa',
      'UNSUBSCRIBE Projekty/Alfa',
    ]);
  });

  it('deletes a label', async () => {
    await provider.deleteMailbox('Faktúry');

    const paths = (await provider.listMailboxes()).map((mailbox) => mailbox.path);
    expect(paths).not.toContain('Faktúry');
    expect(folderCommands(stub)).toEqual(['DELETE Fakt&APo-ry', 'UNSUBSCRIBE Fakt&APo-ry']);
  });
});
