import type { MergeMember } from '@relay/engine';
import {
  MailboxIdSchema,
  type MessageBodyState,
  MessageIdSchema,
  ThreadIdSchema,
} from '@relay/shared/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { messages } from '../../schema';
import { chunked } from '../chunked';
import { keeperOrder, placedInInbox } from '../keeper-order';
import { readMessagePlacements } from '../message-placement-reader';

interface MemberRow {
  readonly id: string;
  readonly emailId: string | null;
  readonly seq: number;
  readonly threadId: string;
  readonly mailboxId: string;
  readonly uid: number;
  readonly bodyState: MessageBodyState;
  readonly bodyLength: number;
  readonly inInbox: number;
  readonly jiraEffectsAt: string | null;
  readonly inviteEffectsAt: string | null;
}

const BODY_LENGTH = sql<number>`length(coalesce(${messages.textBody}, '')) + length(coalesce(${messages.htmlBody}, ''))`;

const readRows = (db: RelayDb, accountId: string, emailIds: readonly string[]): MemberRow[] =>
  chunked(emailIds).flatMap((chunk) =>
    db
      .select({
        id: messages.id,
        emailId: messages.emailId,
        seq: messages.seq,
        threadId: messages.threadId,
        mailboxId: messages.mailboxId,
        uid: messages.uid,
        bodyState: messages.bodyState,
        bodyLength: BODY_LENGTH,
        inInbox: sql<number>`${placedInInbox}`,
        jiraEffectsAt: messages.jiraEffectsAt,
        inviteEffectsAt: messages.inviteEffectsAt,
      })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), inArray(messages.emailId, chunk)))
      .orderBy(...keeperOrder)
      .all(),
  );

const toMember = (
  row: MemberRow,
  placements: Map<string, MergeMember['placements']>,
): MergeMember => ({
  id: MessageIdSchema.parse(row.id),
  order: row.seq,
  threadId: ThreadIdSchema.parse(row.threadId),
  inInbox: row.inInbox === 1,
  primary: { mailboxId: MailboxIdSchema.parse(row.mailboxId), uid: row.uid },
  placements: placements.get(row.id) ?? [],
  bodyState: row.bodyState,
  bodyLength: row.bodyLength,
  gates: { jiraEffectsAt: row.jiraEffectsAt, inviteEffectsAt: row.inviteEffectsAt },
});

export const readMergeMembers = (
  db: RelayDb,
  accountId: string,
  emailIds: readonly string[],
): Map<string, MergeMember[]> => {
  const rows = readRows(db, accountId, emailIds);
  const placements = readMessagePlacements(
    db,
    rows.map((row) => row.id),
  );
  const groups = new Map<string, MergeMember[]>(emailIds.map((emailId) => [emailId, []]));
  rows.forEach((row) => {
    if (row.emailId === null) {
      return;
    }
    groups.get(row.emailId)?.push(toMember(row, placements));
  });
  return groups;
};
