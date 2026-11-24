import type { MergeMember } from '@relay/engine';
import { type AccountId, MessagePlacementSchema } from '@relay/shared/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { messages } from '../../../schema';
import { toIsoOrNull } from '../../../support/timestamps';
import { MESSAGE_ID_ORDER, placedInInbox } from '../keeper-order';
import { messageSelection } from '../message-selection';
import { emailIdIn } from './merge-locks';

const PlacementsSchema = MessagePlacementSchema.array();

const memberSelection = {
  id: messages.id,
  emailId: messages.emailId,
  threadId: messages.threadId,
  mailboxId: messages.mailboxId,
  uid: messages.uid,
  jiraEffectsAt: messages.jiraEffectsAt,
  inviteEffectsAt: messages.inviteEffectsAt,
  inInbox: sql<boolean>`${placedInInbox()}`,
  order: sql<number>`(row_number() over (partition by ${messages.emailId} order by ${MESSAGE_ID_ORDER}))::int`,
  bodyLength: sql<number>`(coalesce(length(${messages.textBody}), 0) + coalesce(length(${messages.htmlBody}), 0))::int`,
  placements: messageSelection.placements,
};

const selectMembers = (db: DbExecutor, accountId: AccountId, emailIds: readonly string[]) =>
  db
    .select(memberSelection)
    .from(messages)
    .where(and(eq(messages.accountId, accountId), emailIdIn(emailIds)))
    .orderBy(asc(messages.emailId), asc(MESSAGE_ID_ORDER));

type MemberRow = Awaited<ReturnType<typeof selectMembers>>[number];

const toMember = (row: MemberRow): MergeMember => ({
  id: row.id,
  order: row.order,
  threadId: row.threadId,
  inInbox: row.inInbox,
  primary: { mailboxId: row.mailboxId, uid: row.uid },
  placements: PlacementsSchema.parse(row.placements),
  bodyState: 'local',
  bodyLength: row.bodyLength,
  gates: {
    jiraEffectsAt: toIsoOrNull(row.jiraEffectsAt),
    inviteEffectsAt: toIsoOrNull(row.inviteEffectsAt),
  },
});

export const readMergeMembers = async (
  db: DbExecutor,
  accountId: AccountId,
  emailIds: readonly string[],
): Promise<Map<string, MergeMember[]>> => {
  const rows = await selectMembers(db, accountId, emailIds);
  const groups = new Map<string, MergeMember[]>();
  for (const row of rows) {
    const emailId = row.emailId ?? '';
    groups.set(emailId, [...(groups.get(emailId) ?? []), toMember(row)]);
  }
  return groups;
};
