import type { AccountId, Mailbox, MailboxId, MailboxRole, UserId } from '@relay/shared/domain';

export interface MailboxCounts {
  readonly unreadCount: number;
  readonly totalCount: number;
}

export interface MailboxLocation {
  readonly path: string;
  readonly name: string;
  readonly delimiter: string | null;
}

export interface MailboxRepository {
  listByAccount(userId: UserId, accountId: AccountId): Promise<Mailbox[]>;
  listForSync(accountId: AccountId): Promise<Mailbox[]>;
  findById(mailboxId: MailboxId): Promise<Mailbox | null>;
  findByRole(accountId: AccountId, role: MailboxRole): Promise<Mailbox | null>;
  findByPath(accountId: AccountId, path: string): Promise<Mailbox | null>;
  upsertMany(accountId: AccountId, mailboxes: readonly Mailbox[]): Promise<Mailbox[]>;
  deleteMissing(accountId: AccountId, keepPaths: readonly string[]): Promise<MailboxId[]>;
  updateCounts(mailboxId: MailboxId, counts: MailboxCounts): Promise<void>;
  adjustUnreadCount(mailboxId: MailboxId, delta: number): Promise<void>;
  relocate(mailboxId: MailboxId, location: MailboxLocation): Promise<void>;
  relocateTree(accountId: AccountId, fromPath: string, target: MailboxLocation): Promise<void>;
  saveUidValidity(mailboxId: MailboxId, uidValidity: number): Promise<void>;
}
