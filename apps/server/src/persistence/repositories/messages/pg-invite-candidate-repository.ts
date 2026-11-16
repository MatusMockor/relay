import type { InviteCandidate, InviteCandidateRepository } from '@relay/engine';
import type { MailboxId } from '@relay/shared/domain';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';

const hasCalendarPart = sql`exists (
  select 1 from jsonb_array_elements(${messages.attachments}) as part(value)
  where lower(part.value ->> 'contentType') in ('text/calendar', 'application/ics', 'application/x-ics')
    or lower(coalesce(part.value ->> 'filename', '')) like '%.ics'
)`;

export class PgInviteCandidateRepository implements InviteCandidateRepository {
  constructor(private readonly db: DbExecutor) {}

  async listAfter(
    mailboxId: MailboxId,
    afterUid: number,
    limit: number,
  ): Promise<InviteCandidate[]> {
    const rows = await this.db
      .select({
        messageId: messages.id,
        threadId: messages.threadId,
        uid: messages.uid,
        date: messages.date,
      })
      .from(messages)
      .where(and(eq(messages.mailboxId, mailboxId), gt(messages.uid, afterUid), hasCalendarPart))
      .orderBy(asc(messages.uid))
      .limit(limit);
    return rows.map((row) => ({ ...row, date: row.date.toISOString() }));
  }
}
