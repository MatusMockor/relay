import { ConflictError, type LabelRepository } from '@relay/engine';
import {
  type AccountId,
  type Label,
  type LabelId,
  type LabelKind,
  labelNameKey,
  type UserId,
} from '@relay/shared/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { labels } from '../../schema';
import { findAccountOwner } from '../../support/account-owner';
import { isUniqueViolation } from '../../support/postgres-errors';
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
      .where(and(eq(labels.accountId, accountId), eq(labels.nameKey, labelNameKey(name))));
    return row === undefined ? null : toLabel(row);
  }

  async findByRemoteName(
    accountId: AccountId,
    kind: LabelKind,
    remoteName: string,
  ): Promise<Label | null> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.accountId, accountId),
          eq(labels.kind, kind),
          eq(labels.remoteName, remoteName),
        ),
      );
    return row === undefined ? null : toLabel(row);
  }

  async listByKind(accountId: AccountId, kind: LabelKind): Promise<Label[]> {
    const rows = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.accountId, accountId), eq(labels.kind, kind)))
      .orderBy(asc(labels.name), asc(labels.id));
    return rows.map(toLabel);
  }

  async upsert(label: Label): Promise<Label> {
    const userId = await findAccountOwner(this.db, label.accountId);
    const insert = toLabelInsert(userId, label);
    const [row] = await this.db
      .insert(labels)
      .values(insert)
      .onConflictDoUpdate({
        target: labels.id,
        set: {
          name: insert.name,
          nameKey: sql`case when ${labels.name} = ${insert.name} then ${labels.nameKey} else ${insert.nameKey} end`,
          color: insert.color,
          kind: insert.kind,
          remoteName: insert.remoteName,
        },
        setWhere: eq(labels.userId, userId),
      })
      .returning()
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`Label ${label.name} conflicts with an existing label`, {
            cause: error,
          });
        }
        throw error;
      });
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
