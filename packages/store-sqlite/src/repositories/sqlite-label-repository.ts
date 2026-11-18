import type { LabelRepository } from '@relay/engine';
import {
  type AccountId,
  type Label,
  type LabelId,
  type LabelKind,
  labelNameKey,
  type UserId,
} from '@relay/shared/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toLabel } from '../mappers/label-mapper';
import { accounts, labels, threads } from '../schema';

export class SqliteLabelRepository implements LabelRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  list(userId: UserId, accountId: AccountId | null): Promise<Label[]> {
    return this.executor.execute((db) =>
      db
        .select({ label: labels })
        .from(labels)
        .innerJoin(accounts, eq(accounts.id, labels.accountId))
        .where(
          and(
            eq(accounts.userId, userId),
            accountId === null ? undefined : eq(labels.accountId, accountId),
          ),
        )
        .orderBy(asc(labels.name), asc(labels.id))
        .all()
        .map((row) => toLabel(row.label)),
    );
  }

  findById(userId: UserId, labelId: LabelId): Promise<Label | null> {
    return this.executor.execute((db) => this.find(db, userId, labelId));
  }

  findByName(accountId: AccountId, name: string): Promise<Label | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(labels)
        .where(and(eq(labels.accountId, accountId), eq(labels.nameKey, labelNameKey(name))))
        .get();
      return row === undefined ? null : toLabel(row);
    });
  }

  findByRemoteName(
    accountId: AccountId,
    kind: LabelKind,
    remoteName: string,
  ): Promise<Label | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(labels)
        .where(
          and(
            eq(labels.accountId, accountId),
            eq(labels.kind, kind),
            eq(labels.remoteName, remoteName),
          ),
        )
        .get();
      return row === undefined ? null : toLabel(row);
    });
  }

  listByKind(accountId: AccountId, kind: LabelKind): Promise<Label[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(labels)
        .where(and(eq(labels.accountId, accountId), eq(labels.kind, kind)))
        .orderBy(asc(labels.name), asc(labels.id))
        .all()
        .map(toLabel),
    );
  }

  upsert(label: Label): Promise<Label> {
    return this.executor.execute((db) => {
      const nameKey = labelNameKey(label.name);
      db.insert(labels)
        .values({ ...label, nameKey })
        .onConflictDoUpdate({
          target: labels.id,
          set: {
            accountId: label.accountId,
            name: label.name,
            nameKey: sql`case when ${labels.name} = ${label.name} then ${labels.nameKey} else ${nameKey} end`,
            color: label.color,
            kind: label.kind,
            remoteName: label.remoteName,
          },
        })
        .run();
      return label;
    });
  }

  delete(userId: UserId, labelId: LabelId): Promise<boolean> {
    return this.executor.execute((db) => {
      if (this.find(db, userId, labelId) === null) {
        return false;
      }
      db.delete(labels).where(eq(labels.id, labelId)).run();
      db.update(threads)
        .set({
          labelIds: sql`(select json_group_array(value) from json_each(${threads.labelIds}) where value <> ${labelId})`,
        })
        .where(
          and(
            eq(threads.userId, userId),
            sql`exists (select 1 from json_each(${threads.labelIds}) where value = ${labelId})`,
          ),
        )
        .run();
      return true;
    });
  }

  private find(db: RelayDb, userId: UserId, labelId: LabelId): Label | null {
    const row = db
      .select({ label: labels })
      .from(labels)
      .innerJoin(accounts, eq(accounts.id, labels.accountId))
      .where(and(eq(accounts.userId, userId), eq(labels.id, labelId)))
      .get();
    return row === undefined ? null : toLabel(row.label);
  }
}
