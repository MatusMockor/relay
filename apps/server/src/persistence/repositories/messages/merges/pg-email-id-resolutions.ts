import type { EmailIdResolutions, ResolvedEmailId, UnresolvedPlacement } from '@relay/engine';
import { type MailboxId, PENDING_UID } from '@relay/shared/domain';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { messagePlacements, messages } from '../../../schema';

const uniqueByUid = (resolved: readonly ResolvedEmailId[]): ResolvedEmailId[] => [
  ...new Map(
    resolved
      .filter((entry) => entry.uid > PENDING_UID && entry.emailId.length > 0)
      .map((entry) => [entry.uid, entry]),
  ).values(),
];

export class PgEmailIdResolutions implements EmailIdResolutions {
  constructor(private readonly db: DbExecutor) {}

  async listUnresolved(
    mailboxId: MailboxId,
    afterUid: number,
    limit: number,
  ): Promise<UnresolvedPlacement[]> {
    return this.db
      .select({ messageId: messagePlacements.messageId, uid: messagePlacements.uid })
      .from(messagePlacements)
      .innerJoin(messages, eq(messages.id, messagePlacements.messageId))
      .where(
        and(
          eq(messagePlacements.mailboxId, mailboxId),
          gt(messagePlacements.uid, Math.max(afterUid, PENDING_UID)),
          isNull(messages.emailId),
        ),
      )
      .orderBy(asc(messagePlacements.uid))
      .limit(limit);
  }

  async fillEmailIds(mailboxId: MailboxId, resolved: readonly ResolvedEmailId[]): Promise<number> {
    const entries = uniqueByUid(resolved);
    if (entries.length === 0) {
      return 0;
    }
    const result = await this.db.execute(sql`update messages m set email_id = fetched.email_id
      from unnest(
        ${sql.param(entries.map((entry) => entry.uid))}::bigint[],
        ${sql.param(entries.map((entry) => entry.emailId))}::text[]
      ) as fetched(uid, email_id)
      inner join message_placements mp on mp.mailbox_id = ${mailboxId} and mp.uid = fetched.uid
      where m.id = mp.message_id and m.email_id is null`);
    return result.rowCount ?? 0;
  }
}
