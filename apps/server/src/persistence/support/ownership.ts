import { NotFoundError } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { drafts, mailAccounts, messages, threads, users } from '../schema';

type OwnershipQuery = (db: DbExecutor, id: string, userId: UserId) => Promise<unknown[]>;

const OWNERSHIP_QUERIES = {
  Account: (db, id, userId) =>
    db
      .select({ id: mailAccounts.id })
      .from(mailAccounts)
      .where(and(sql`${mailAccounts.id} = ${id}`, eq(mailAccounts.userId, userId))),
  Thread: (db, id, userId) =>
    db
      .select({ id: threads.id })
      .from(threads)
      .where(and(sql`${threads.id} = ${id}`, eq(threads.userId, userId))),
  Message: (db, id, userId) =>
    db
      .select({ id: messages.id })
      .from(messages)
      .where(and(sql`${messages.id} = ${id}`, eq(messages.userId, userId))),
  Draft: (db, id, userId) =>
    db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(sql`${drafts.id} = ${id}`, eq(drafts.userId, userId))),
} as const satisfies Record<string, OwnershipQuery>;

export type OwnedEntity = keyof typeof OWNERSHIP_QUERIES;

export const assertOwned = async (
  db: DbExecutor,
  entity: OwnedEntity,
  userId: UserId,
  id: string | null,
): Promise<void> => {
  if (id === null) {
    return;
  }
  const rows = await OWNERSHIP_QUERIES[entity](db, id, userId);
  if (rows.length === 0) {
    throw new NotFoundError(entity, id);
  }
};

export const lockUser = async (db: DbExecutor, userId: UserId): Promise<void> => {
  await db.execute(sql`select 1 from ${users} where ${users.id} = ${userId} for update`);
};
