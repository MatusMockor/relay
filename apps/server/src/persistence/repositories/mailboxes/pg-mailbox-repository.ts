import type { MailboxCounts, MailboxLocation, MailboxRepository } from '@relay/engine';
import type { AccountId, Mailbox, MailboxId, MailboxRole, UserId } from '@relay/shared/domain';
import { and, asc, eq, notInArray, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { mailboxes } from '../../schema';
import { findAccountOwner } from '../../support/account-owner';
import { toMailbox, toMailboxInsert } from './mailbox.mapper';

export class PgMailboxRepository implements MailboxRepository {
  constructor(private readonly db: DbExecutor) {}

  async listByAccount(userId: UserId, accountId: AccountId): Promise<Mailbox[]> {
    const rows = await this.db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, userId), eq(mailboxes.accountId, accountId)))
      .orderBy(asc(mailboxes.path));
    return rows.map(toMailbox);
  }

  async listForSync(accountId: AccountId): Promise<Mailbox[]> {
    const rows = await this.db
      .select()
      .from(mailboxes)
      .where(eq(mailboxes.accountId, accountId))
      .orderBy(asc(mailboxes.path));
    return rows.map(toMailbox);
  }

  async findById(mailboxId: MailboxId): Promise<Mailbox | null> {
    const [row] = await this.db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId));
    return row === undefined ? null : toMailbox(row);
  }

  async findByRole(accountId: AccountId, role: MailboxRole): Promise<Mailbox | null> {
    const [row] = await this.db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.accountId, accountId), eq(mailboxes.role, role)))
      .orderBy(asc(mailboxes.path))
      .limit(1);
    return row === undefined ? null : toMailbox(row);
  }

  async findByPath(accountId: AccountId, path: string): Promise<Mailbox | null> {
    const [row] = await this.db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.accountId, accountId), eq(mailboxes.path, path)));
    return row === undefined ? null : toMailbox(row);
  }

  async upsertMany(accountId: AccountId, items: readonly Mailbox[]): Promise<Mailbox[]> {
    if (items.length === 0) {
      return [];
    }
    const userId = await findAccountOwner(this.db, accountId);
    const byPath = new Map(items.map((mailbox) => [mailbox.path, mailbox]));
    const rows = await this.db
      .insert(mailboxes)
      .values(
        [...byPath.values()].map((mailbox) => toMailboxInsert(userId, { ...mailbox, accountId })),
      )
      .onConflictDoUpdate({
        target: [mailboxes.accountId, mailboxes.path],
        set: {
          name: sql`excluded.name`,
          delimiter: sql`excluded.delimiter`,
          role: sql`excluded.role`,
          subscribed: sql`excluded.subscribed`,
          uidValidity: sql`excluded.uid_validity`,
        },
      })
      .returning();
    return rows.map(toMailbox);
  }

  async deleteMissing(accountId: AccountId, keepPaths: readonly string[]): Promise<MailboxId[]> {
    const keep = keepPaths.length === 0 ? sql`true` : notInArray(mailboxes.path, [...keepPaths]);
    const rows = await this.db
      .delete(mailboxes)
      .where(and(eq(mailboxes.accountId, accountId), keep))
      .returning({ id: mailboxes.id });
    return rows.map((row) => row.id);
  }

  async updateCounts(mailboxId: MailboxId, counts: MailboxCounts): Promise<void> {
    await this.db
      .update(mailboxes)
      .set({ unreadCount: counts.unreadCount, totalCount: counts.totalCount })
      .where(eq(mailboxes.id, mailboxId));
  }

  async relocate(mailboxId: MailboxId, location: MailboxLocation): Promise<void> {
    await this.db
      .update(mailboxes)
      .set({ path: location.path, name: location.name, delimiter: location.delimiter })
      .where(eq(mailboxes.id, mailboxId));
  }

  async relocateTree(
    accountId: AccountId,
    fromPath: string,
    target: MailboxLocation,
  ): Promise<void> {
    const root = eq(mailboxes.path, fromPath);
    const descendants =
      target.delimiter === null
        ? sql`false`
        : sql`starts_with(${mailboxes.path}, ${fromPath + target.delimiter}::text)`;
    await this.db
      .update(mailboxes)
      .set({
        path: sql`case when ${root} then ${target.path}::text else ${target.path}::text || substr(${mailboxes.path}, length(${fromPath}::text) + 1) end`,
        name: sql`case when ${root} then ${target.name}::text else ${mailboxes.name} end`,
        delimiter: sql`case when ${root} then ${target.delimiter}::text else ${mailboxes.delimiter} end`,
      })
      .where(and(eq(mailboxes.accountId, accountId), or(root, descendants)));
  }

  async saveUidValidity(mailboxId: MailboxId, uidValidity: number): Promise<void> {
    await this.db.update(mailboxes).set({ uidValidity }).where(eq(mailboxes.id, mailboxId));
  }
}
