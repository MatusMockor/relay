import type { MailAccount, User } from '@relay/shared/domain';
import pg from 'pg';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';
import {
  buildAccount,
  buildMailbox,
  buildUser,
  mailboxByRole,
  type SeededAccount,
} from './fixtures';

const insertLegacyAccount = async (databaseUrl: string, account: MailAccount): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
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
  } finally {
    await client.end();
  }
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
  const mailboxes = await repositories.mailboxes.upsertMany(account.id, [
    buildMailbox(account.id, 'inbox'),
    buildMailbox(account.id, 'sent'),
  ]);
  return {
    user,
    account,
    mailboxes: {
      inbox: mailboxByRole(mailboxes, 'inbox'),
      sent: mailboxByRole(mailboxes, 'sent'),
    },
  };
};
