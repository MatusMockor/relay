import type { AccountId, UserId } from '@relay/shared/domain';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { messages, threads } from '../../schema';
import type { ThreadFolderPlan } from './thread-folder-plan';

export interface PlanConditions {
  readonly owner: (userId: UserId, accountId: AccountId | null) => SQL | undefined;
  readonly inMailbox: (mailboxId: string) => SQL;
}

const orderFirst: PlanConditions = {
  owner: (userId, accountId) =>
    and(
      eq(threads.userId, userId),
      accountId === null ? undefined : eq(threads.accountId, accountId),
    ),
  inMailbox: (mailboxId) =>
    sql`exists (select 1 from ${messages} where ${messages.mailboxId} = ${mailboxId} and ${messages.threadId} = ${threads.id})`,
};

const mailboxFirst: PlanConditions = {
  owner: (userId, accountId) =>
    and(
      sql`+${threads.userId} = ${userId}`,
      accountId === null ? undefined : sql`+${threads.accountId} = ${accountId}`,
    ),
  inMailbox: (mailboxId) =>
    sql`${threads.id} in (select ${messages.threadId} from ${messages} where ${messages.mailboxId} = ${mailboxId})`,
};

export const planConditionsOf = (plan: ThreadFolderPlan): PlanConditions =>
  plan === 'mailbox-first' ? mailboxFirst : orderFirst;
