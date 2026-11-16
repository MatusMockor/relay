import type { InviteCandidate, InviteCandidateRepository } from '@relay/engine';
import type { MailboxId, MessageId, ThreadId } from '@relay/shared/domain';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { messages } from '../schema';

const hasCalendarPart = sql`exists (
  select 1 from json_each(${messages.attachments})
  where lower(json_extract(json_each.value, '$.contentType')) in ('text/calendar', 'application/ics', 'application/x-ics')
    or lower(coalesce(json_extract(json_each.value, '$.filename'), '')) like '%.ics'
)`;

export class SqliteInviteCandidateRepository implements InviteCandidateRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<InviteCandidate[]> {
    return this.executor.execute((db) =>
      db
        .select({ messageId: messages.id, threadId: messages.threadId, uid: messages.uid })
        .from(messages)
        .where(and(eq(messages.mailboxId, mailboxId), gt(messages.uid, afterUid), hasCalendarPart))
        .orderBy(asc(messages.uid))
        .limit(limit)
        .all()
        .map((row) => ({
          messageId: row.messageId as MessageId,
          threadId: row.threadId as ThreadId,
          uid: row.uid,
        })),
    );
  }
}
