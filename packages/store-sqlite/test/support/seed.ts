import type { Repositories } from '@relay/engine';
import type { MailAccount, Mailbox } from '@relay/shared/domain';
import { assert } from 'vitest';
import { buildAccount, buildMailbox, mailboxId } from './fixtures';

export interface SeededAccount {
  readonly account: MailAccount;
  readonly inbox: Mailbox;
  readonly sent: Mailbox;
}

export const seedAccount = async (
  repositories: Repositories,
  overrides: Partial<MailAccount> = {},
): Promise<SeededAccount> => {
  const account = await repositories.accounts.create(buildAccount(overrides));
  const stored = await repositories.mailboxes.upsertMany(account.id, [
    buildMailbox({ id: mailboxId(`${account.id}-inbox`), accountId: account.id }),
    buildMailbox({
      id: mailboxId(`${account.id}-sent`),
      accountId: account.id,
      name: 'Sent',
      path: 'Sent',
      role: 'sent',
    }),
  ]);
  const inbox = stored.find((mailbox) => mailbox.role === 'inbox');
  const sent = stored.find((mailbox) => mailbox.role === 'sent');
  assert(inbox !== undefined, 'inbox mailbox was not stored');
  assert(sent !== undefined, 'sent mailbox was not stored');
  return { account, inbox, sent };
};
