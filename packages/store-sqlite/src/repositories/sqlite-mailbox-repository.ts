import type { MailboxCounts, MailboxLocation, MailboxRepository } from '@relay/engine';
import type { AccountId, Mailbox, MailboxId, MailboxRole, UserId } from '@relay/shared/domain';
import { MailboxIdSchema } from '@relay/shared/domain';
import { and, asc, eq, notInArray, or, sql } from 'drizzle-orm';
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
              subscribed: mailbox.subscribed,
              uidValidity: mailbox.uidValidity,
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

  adjustUnreadCount(mailboxId: MailboxId, delta: number): Promise<void> {
    return this.executor.execute((db) => {
      db.update(mailboxes)
        .set({ unreadCount: sql`max(${mailboxes.unreadCount} + ${delta}, 0)` })
        .where(eq(mailboxes.id, mailboxId))
        .run();
    });
  }

  relocate(mailboxId: MailboxId, location: MailboxLocation): Promise<void> {
    return this.executor.execute((db) => {
      db.update(mailboxes)
        .set({ path: location.path, name: location.name, delimiter: location.delimiter })
        .where(eq(mailboxes.id, mailboxId))
        .run();
    });
  }

  relocateTree(accountId: AccountId, fromPath: string, target: MailboxLocation): Promise<void> {
    const root = eq(mailboxes.path, fromPath);
    const prefix = target.delimiter === null ? null : fromPath + target.delimiter;
    const descendants =
      prefix === null ? sql`0` : sql`substr(${mailboxes.path}, 1, length(${prefix})) = ${prefix}`;
    return this.executor.execute((db) => {
      db.update(mailboxes)
        .set({
          path: sql`case when ${root} then ${target.path} else ${target.path} || substr(${mailboxes.path}, length(${fromPath}) + 1) end`,
          name: sql`case when ${root} then ${target.name} else ${mailboxes.name} end`,
          delimiter: sql`case when ${root} then ${target.delimiter} else ${mailboxes.delimiter} end`,
        })
        .where(and(eq(mailboxes.accountId, accountId), or(root, descendants)))
        .run();
    });
  }

  saveUidValidity(mailboxId: MailboxId, uidValidity: number): Promise<void> {
    return this.executor.execute((db) => {
      db.update(mailboxes).set({ uidValidity }).where(eq(mailboxes.id, mailboxId)).run();
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
