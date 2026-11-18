import type { Mailbox, MailAccount, User, UserId } from '@relay/shared/domain';
import pg from 'pg';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';
import { buildAccount, buildMailbox, buildUser, type SeededAccount } from './fixtures';

const withClient = async (
  databaseUrl: string,
  work: (client: pg.Client) => Promise<void>,
): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
};

const insertLegacyAccount = (databaseUrl: string, account: MailAccount): Promise<void> =>
  withClient(databaseUrl, async (client) => {
    await client.query(
      `INSERT INTO mail_accounts (id, user_id, provider, display_name, email, color, is_primary, sync_interval_seconds, settings, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        account.id,
        account.userId,
        account.provider,
        account.displayName,
        account.email,
        account.color,
        account.isPrimary,
        account.syncIntervalSeconds,
        JSON.stringify(account.settings),
        account.status,
        account.createdAt,
      ],
    );
  });

export const insertLegacyMailboxes = async (
  databaseUrl: string,
  userId: UserId,
  mailboxes: readonly Mailbox[],
): Promise<Mailbox[]> => {
  await withClient(databaseUrl, async (client) => {
    for (const mailbox of mailboxes) {
      await client.query(
        `INSERT INTO mailboxes (id, user_id, account_id, name, path, delimiter, role, unread_count, total_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          mailbox.id,
          userId,
          mailbox.accountId,
          mailbox.name,
          mailbox.path,
          mailbox.delimiter,
          mailbox.role,
          mailbox.unreadCount,
          mailbox.totalCount,
        ],
      );
    }
  });
  return [...mailboxes];
};

export const seedLegacyAccount = async (
  databaseUrl: string,
  repositories: ServerRepositories,
  overrides: Partial<MailAccount> = {},
  user: User = buildUser(),
): Promise<SeededAccount> => {
  await repositories.users.create(user, 'hash');
  const account = buildAccount(user.id, overrides);
  await insertLegacyAccount(databaseUrl, account);
  const inbox = buildMailbox(account.id, 'inbox');
  const sent = buildMailbox(account.id, 'sent');
  await insertLegacyMailboxes(databaseUrl, user.id, [inbox, sent]);
  return { user, account, mailboxes: { inbox, sent } };
};
