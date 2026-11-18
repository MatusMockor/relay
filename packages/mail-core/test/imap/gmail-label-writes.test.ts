import type { MailProvider } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodeModifiedUtf7 } from '../../src/imap/modified-utf7';
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

const stores = (stub: GmailImapStub): string[] =>
  stub.commands
    .filter((command) => command.includes('UID STORE'))
    .map((command) => command.replace(/^\S+ /, ''));

describe('modified UTF-7 encoding', () => {
  it.each([
    ['Účty a faktúry', '&ANoBDQ-ty a fakt&APo-ry'],
    ['Tom & Jerry', 'Tom &- Jerry'],
    ['日本語', '&ZeVnLIqe-'],
    ['Projekty/Alfa', 'Projekty/Alfa'],
  ])('encodes %s', (decoded, encoded) => {
    expect(encodeModifiedUtf7(decoded)).toBe(encoded);
  });
});

describe('Gmail label writes against a scripted Gmail IMAP server', () => {
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

  it('adds and removes labels through X-GM-LABELS with encoded names', async () => {
    await provider.setLabels('[Gmail]/All Mail', [5, 7], {
      add: ['Faktúry', 'Klienti s.r.o.'],
      remove: ['Projekty/Alfa'],
    });

    expect(stores(stub)).toEqual([
      'UID STORE 5,7 +X-GM-LABELS (Fakt&APo-ry "Klienti s.r.o.")',
      'UID STORE 5,7 -X-GM-LABELS (Projekty/Alfa)',
    ]);
    expect(stub.commands.some((command) => command.includes('SELECT "[Gmail]/All Mail"'))).toBe(
      true,
    );
  });

  it('sends nothing when there is nothing to change', async () => {
    await provider.setLabels('[Gmail]/All Mail', [5], { add: [], remove: [] });
    await provider.setLabels('[Gmail]/All Mail', [], { add: ['Faktúry'], remove: [] });

    expect(stores(stub)).toEqual([]);
  });
});
