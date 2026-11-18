import type { Address, MailAccount, UserId } from '@relay/shared/domain';
import { FakeMailServer, type FakeMailServerOptions } from './mail/fake-mail-server';
import { buildRawMessage } from './mail/raw-message';
import { TEST_NOW, type TestEngine, USER_ID } from './test-engine';

export const ME: Address = { name: 'Alice Novak', email: 'alice@example.com' };

export interface SeededAccount {
  readonly account: MailAccount;
  readonly server: FakeMailServer;
}

export const standardServer = (options: FakeMailServerOptions = {}): FakeMailServer => {
  const server = new FakeMailServer(options);
  server.addMailbox('INBOX', 'inbox');
  server.addMailbox('Sent', 'sent');
  server.addMailbox('Archive', 'archive');
  server.addMailbox('Trash', 'trash');
  return server;
};

export const seedAccount = async (
  engine: TestEngine,
  overrides: Partial<MailAccount> = {},
  serverOptions: FakeMailServerOptions = {},
): Promise<SeededAccount> => {
  const email = overrides.email ?? ME.email;
  const userId: UserId = overrides.userId ?? USER_ID;
  const account: MailAccount = {
    id: engine.ids.generate('account'),
    userId,
    provider: 'imap',
    displayName: ME.name ?? 'Alice',
    senderName: ME.name ?? 'Alice',
    email,
    color: '#3366ff',
    isPrimary: true,
    syncIntervalSeconds: 300,
    settings: {
      imap: { host: 'imap.example.com', port: 993, secure: true },
      smtp: { host: 'smtp.example.com', port: 465, secure: true },
      username: email,
    },
    status: 'disconnected',
    lastError: null,
    lastSyncedAt: null,
    createdAt: TEST_NOW,
    ...overrides,
  };
  await engine.repositories.accounts.create(account);
  const server = engine.providers.register(email, standardServer(serverOptions));
  await engine.vault.set(account.id, { kind: 'password', password: server.password });
  return { account, server };
};

export interface MailSpec {
  readonly id: string;
  readonly subject?: string;
  readonly from?: Address;
  readonly to?: readonly Address[];
  readonly date?: string;
  readonly internalDate?: string;
  readonly body?: string;
  readonly inReplyTo?: string;
  readonly references?: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly seen?: boolean;
  readonly keywords?: readonly string[];
  readonly labels?: readonly string[];
  readonly emailId?: string;
}

export const deliverMail = (server: FakeMailServer, path: string, spec: MailSpec): number => {
  const date = spec.date ?? '2026-11-15T08:00:00.000Z';
  const source = buildRawMessage({
    messageId: `<${spec.id}@mail.test>`,
    from: spec.from ?? { name: 'Peter Kral', email: 'peter@partner.test' },
    to: spec.to ?? [ME],
    subject: spec.subject ?? `Subject ${spec.id}`,
    date,
    body: spec.body ?? `Body of ${spec.id}`,
    inReplyTo: spec.inReplyTo === undefined ? null : `<${spec.inReplyTo}@mail.test>`,
    references: spec.references?.map((ref) => `<${ref}@mail.test>`),
    headers: spec.headers,
  });
  return server.deliver(path, source, {
    flags: { seen: spec.seen ?? false },
    keywords: spec.keywords,
    labels: spec.labels,
    emailId: spec.emailId,
    internalDate: spec.internalDate ?? date,
  });
};

export const messageHeader = (id: string): string => `<${id}@mail.test>`;

export { present } from './present';
