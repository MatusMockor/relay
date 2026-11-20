import type { ThreadFolderQuery } from '@relay/engine';
import { eq, sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { messages } from '../../schema';

export const SPARSE_MAILBOX_MESSAGES = 2_000;

export type ThreadFolderPlan = 'order-first' | 'mailbox-first';

const mailboxMessagesUpTo = (db: RelayDb, mailboxId: string, cap: number): number => {
  const probe = db
    .select({ one: sql`1`.as('one') })
    .from(messages)
    .where(eq(messages.mailboxId, mailboxId))
    .limit(cap)
    .as('probe');
  const [row] = db
    .select({ count: sql<number>`count(*)` })
    .from(probe)
    .all();
  return row?.count ?? 0;
};

export const threadFolderPlanOf = (db: RelayDb, query: ThreadFolderQuery): ThreadFolderPlan => {
  if (query.mailboxId === null || query.everywhere === true) {
    return 'order-first';
  }
  const found = mailboxMessagesUpTo(db, query.mailboxId, SPARSE_MAILBOX_MESSAGES);
  return found < SPARSE_MAILBOX_MESSAGES ? 'mailbox-first' : 'order-first';
};
