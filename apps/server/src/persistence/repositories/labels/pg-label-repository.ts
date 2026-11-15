import { ConflictError, type LabelRepository } from '@relay/engine';
import type { AccountId, Label, LabelId, UserId } from '@relay/shared/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { labels } from '../../schema';
import { findAccountOwner } from '../../support/account-owner';
import { toLabel, toLabelInsert } from './label.mapper';

export class PgLabelRepository implements LabelRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(userId: UserId, accountId: AccountId | null): Promise<Label[]> {
    const rows = await this.db
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.userId, userId),
          accountId === null ? undefined : eq(labels.accountId, accountId),
        ),
      )
      .orderBy(asc(labels.name), asc(labels.id));
    return rows.map(toLabel);
  }

  async findById(userId: UserId, labelId: LabelId): Promise<Label | null> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.userId, userId), eq(labels.id, labelId)));
    return row === undefined ? null : toLabel(row);
  }

  async findByName(accountId: AccountId, name: string): Promise<Label | null> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.accountId, accountId), eq(labels.name, name)));
    return row === undefined ? null : toLabel(row);
  }

  async upsert(label: Label): Promise<Label> {
    const userId = await findAccountOwner(this.db, label.accountId);
    const [row] = await this.db
      .insert(labels)
      .values(toLabelInsert(userId, label))
      .onConflictDoUpdate({
        target: labels.id,
        set: { name: label.name, color: label.color },
        setWhere: eq(labels.userId, userId),
      })
      .returning();
    if (row === undefined) {
      throw new ConflictError(`Label ${label.id} belongs to another user`);
    }
    return toLabel(row);
  }

  async delete(userId: UserId, labelId: LabelId): Promise<boolean> {
    const rows = await this.db
      .delete(labels)
      .where(and(eq(labels.userId, userId), eq(labels.id, labelId)))
      .returning({ id: labels.id });
    return rows.length > 0;
  }
}
