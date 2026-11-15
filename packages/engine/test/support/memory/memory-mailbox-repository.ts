import type { AccountId, Mailbox, MailboxId, MailboxRole, UserId } from '@relay/shared/domain';
import type { MailboxCounts, MailboxRepository } from '../../../src';
import { removeWhere } from './memory-account-repository';
import type { MemoryDatabase } from './memory-database';

export class MemoryMailboxRepository implements MailboxRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByAccount(userId: UserId, accountId: AccountId): Promise<Mailbox[]> {
    if (!this.db.ownsAccount(userId, accountId)) {
      return Promise.resolve([]);
    }
    return this.listForSync(accountId);
  }

  listForSync(accountId: AccountId): Promise<Mailbox[]> {
    return Promise.resolve(this.all().filter((mailbox) => mailbox.accountId === accountId));
  }

  findById(mailboxId: MailboxId): Promise<Mailbox | null> {
    return Promise.resolve(this.db.tables.mailboxes.get(mailboxId) ?? null);
  }

  findByRole(accountId: AccountId, role: MailboxRole): Promise<Mailbox | null> {
    const match = this.all().find((box) => box.accountId === accountId && box.role === role);
    return Promise.resolve(match ?? null);
  }

  findByPath(accountId: AccountId, path: string): Promise<Mailbox | null> {
    const match = this.all().find((box) => box.accountId === accountId && box.path === path);
    return Promise.resolve(match ?? null);
  }

  upsertMany(accountId: AccountId, mailboxes: readonly Mailbox[]): Promise<Mailbox[]> {
    const stored = mailboxes.map((mailbox) => {
      const existing = this.all().find(
        (box) => box.accountId === accountId && box.path === mailbox.path,
      );
      const next: Mailbox = { ...mailbox, accountId, id: existing?.id ?? mailbox.id };
      this.db.tables.mailboxes.set(next.id, next);
      return next;
    });
    return Promise.resolve(stored);
  }

  deleteMissing(accountId: AccountId, keepPaths: readonly string[]): Promise<MailboxId[]> {
    return Promise.resolve(
      removeWhere(
        this.db.tables.mailboxes,
        (mailbox) => mailbox.accountId === accountId && !keepPaths.includes(mailbox.path),
      ),
    );
  }

  updateCounts(mailboxId: MailboxId, counts: MailboxCounts): Promise<void> {
    const mailbox = this.db.tables.mailboxes.get(mailboxId);
    if (mailbox !== undefined) {
      this.db.tables.mailboxes.set(mailboxId, { ...mailbox, ...counts });
    }
    return Promise.resolve();
  }

  private all(): Mailbox[] {
    return [...this.db.tables.mailboxes.values()];
  }
}
