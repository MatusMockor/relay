import type { MessageId } from '@relay/shared/domain';
import { asc, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';

export const lockMessagesWhere = async (db: DbExecutor, condition: SQL): Promise<MessageId[]> => {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(condition)
    .orderBy(asc(messages.id))
    .for('update');
  return rows.map((row) => row.id);
};

export const idIn = (ids: readonly string[]): SQL =>
  sql`${messages.id} = any(${sql.param([...new Set(ids)])}::text[])`;

export const lockMessages = (db: DbExecutor, ids: readonly string[]): Promise<MessageId[]> =>
  ids.length === 0 ? Promise.resolve([]) : lockMessagesWhere(db, idIn(ids));
