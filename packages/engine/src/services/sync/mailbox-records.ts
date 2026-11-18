import type { AccountId, Mailbox } from '@relay/shared/domain';
import type { RemoteMailbox } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { MailboxStatuses } from './mailbox-status-probe';

export interface MailboxRecordInput {
  readonly accountId: AccountId;
  readonly remote: readonly RemoteMailbox[];
  readonly known: ReadonlyMap<string, Mailbox>;
  readonly statuses: MailboxStatuses;
}

export const mailboxRecords = (input: MailboxRecordInput, ids: IdGenerator): Mailbox[] =>
  input.remote.map((mailbox) => {
    const known = input.known.get(mailbox.path);
    const status = input.statuses.get(mailbox.path);
    return {
      id: known?.id ?? ids.generate('mailbox'),
      accountId: input.accountId,
      name: mailbox.name,
      path: mailbox.path,
      delimiter: mailbox.delimiter,
      role: mailbox.role,
      subscribed: mailbox.subscribed,
      uidValidity: status?.uidValidity ?? known?.uidValidity ?? null,
      unreadCount: status?.unseen ?? known?.unreadCount ?? 0,
      totalCount: status?.messages ?? known?.totalCount ?? 0,
    };
  });

const fingerprint = (mailbox: Mailbox): string =>
  JSON.stringify([
    mailbox.id,
    mailbox.path,
    mailbox.name,
    mailbox.delimiter,
    mailbox.role,
    mailbox.subscribed,
    mailbox.unreadCount,
    mailbox.totalCount,
  ]);

export const sameMailboxes = (left: readonly Mailbox[], right: readonly Mailbox[]): boolean => {
  const before = new Set(left.map(fingerprint));
  return left.length === right.length && right.every((mailbox) => before.has(fingerprint(mailbox)));
};
