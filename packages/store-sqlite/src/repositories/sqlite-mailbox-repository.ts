import type { MailboxCounts, MailboxRepository } from '@relay/engine';
import type { AccountId, Mailbox, MailboxId, MailboxRole, UserId } from '@relay/shared/domain';
import { MailboxIdSchema } from '@relay/shared/domain';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toMailbox } from '../mappers/mailbox-mapper';
import { accounts, mailboxes } from '../schema';

export class SqliteMailboxRepository implements MailboxRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByAccount(userId: UserId, accountId: AccountId): Promise<Mailbox[]> {
    return this.executor.execute((db) =>
      db
        .select({ mailbox: mailboxes })
        .from(mailboxes)
        .innerJoin(accounts, eq(accounts.id, mailboxes.accountId))
        .where(and(eq(accounts.userId, userId), eq(mailboxes.accountId, accountId)))
        .orderBy(asc(mailboxes.path))
        .all()
        .map((row) => toMailbox(row.mailbox)),
    );
  }

  listForSync(accountId: AccountId): Promise<Mailbox[]> {
    return this.executor.execute((db) => this.listAll(db, accountId));
  }

  findById(mailboxId: MailboxId): Promise<Mailbox | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).get();
      return row === undefined ? null : toMailbox(row);
    });
  }

  findByRole(accountId: AccountId, role: MailboxRole): Promise<Mailbox | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(mailboxes)
        .where(and(eq(mailboxes.accountId, accountId), eq(mailboxes.role, role)))
        .orderBy(asc(mailboxes.path))
        .get();
      return row === undefined ? null : toMailbox(row);
    });
  }

  findByPath(accountId: AccountId, path: string): Promise<Mailbox | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(mailboxes)
        .where(and(eq(mailboxes.accountId, accountId), eq(mailboxes.path, path)))
        .get();
      return row === undefined ? null : toMailbox(row);
    });
  }

  upsertMany(accountId: AccountId, items: readonly Mailbox[]): Promise<Mailbox[]> {
    return this.executor.execute((db) => {
      items.forEach((mailbox) => {
        db.insert(mailboxes)
          .values({ ...mailbox, accountId })
          .onConflictDoUpdate({
            target: [mailboxes.accountId, mailboxes.path],
            set: {
              name: mailbox.name,
              delimiter: mailbox.delimiter,
              role: mailbox.role,
              unreadCount: mailbox.unreadCount,
              totalCount: mailbox.totalCount,
            },
          })
          .run();
      });
      const paths = new Set(items.map((mailbox) => mailbox.path));
      return this.listAll(db, accountId).filter((mailbox) => paths.has(mailbox.path));
    });
  }

  deleteMissing(accountId: AccountId, keepPaths: readonly string[]): Promise<MailboxId[]> {
    return this.executor.execute((db) =>
      db
        .delete(mailboxes)
        .where(and(eq(mailboxes.accountId, accountId), notInArray(mailboxes.path, [...keepPaths])))
        .returning({ id: mailboxes.id })
        .all()
        .map((row) => MailboxIdSchema.parse(row.id)),
    );
  }

  updateCounts(mailboxId: MailboxId, counts: MailboxCounts): Promise<void> {
    return this.executor.execute((db) => {
      db.update(mailboxes)
        .set({ unreadCount: counts.unreadCount, totalCount: counts.totalCount })
        .where(eq(mailboxes.id, mailboxId))
        .run();
    });
  }

  private listAll(db: RelayDb, accountId: AccountId): Mailbox[] {
    return db
      .select()
      .from(mailboxes)
      .where(eq(mailboxes.accountId, accountId))
      .orderBy(asc(mailboxes.path))
      .all()
      .map(toMailbox);
  }
}
