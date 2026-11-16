import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { type MailAccount, AccountIdSchema } from '@relay/shared/domain';
import type { LocalRuntime } from '../../../src/main/composition/local-runtime';
import type { GreenMailAccount } from './greenmail';

export const seedImapAccount = async (
  runtime: LocalRuntime,
  mailbox: GreenMailAccount,
  imapPort = mailbox.imapPort,
): Promise<MailAccount> => {
  const account: MailAccount = {
    id: AccountIdSchema.parse(runtime.infrastructure.ids.generate('account')),
    userId: LOCAL_USER_ID,
    provider: 'imap',
    displayName: 'Test',
    senderName: 'Test',
    email: mailbox.email,
    color: '#4f6ef7',
    isPrimary: true,
    syncIntervalSeconds: 300,
    settings: {
      imap: { host: mailbox.host, port: imapPort, secure: false },
      smtp: { host: mailbox.host, port: mailbox.smtpPort, secure: false },
      username: mailbox.email,
    },
    status: 'disconnected',
    lastError: null,
    lastSyncedAt: null,
    createdAt: new Date().toISOString(),
  };
  await runtime.infrastructure.vault.set(account.id, {
    kind: 'password',
    password: mailbox.password,
  });
  return runtime.engine.repositories.accounts.create(account);
};

export const imapAccountBody = (mailbox: GreenMailAccount) => ({
  provider: 'imap' as const,
  email: mailbox.email,
  displayName: 'Práca',
  settings: {
    imap: { host: mailbox.host, port: mailbox.imapPort, secure: false },
    smtp: { host: mailbox.host, port: mailbox.smtpPort, secure: false },
    username: mailbox.email,
  },
  password: mailbox.password,
});
