import type { EmailIdResolutions, ResolvedEmailId, UnresolvedPlacement } from '@relay/engine';
import { type MailboxId, MessageIdSchema } from '@relay/shared/domain';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../../executor/sqlite-executor';
import { messagePlacements, messages } from '../../schema';

export class SqliteEmailIdResolutions implements EmailIdResolutions {
  constructor(private readonly executor: SqliteExecutor) {}

  listUnresolved(
    mailboxId: MailboxId,
    afterUid: number,
    limit: number,
  ): Promise<UnresolvedPlacement[]> {
    return this.executor.execute((db) =>
      db
        .select({ messageId: messagePlacements.messageId, uid: messagePlacements.uid })
        .from(messagePlacements)
        .innerJoin(messages, eq(messages.id, messagePlacements.messageId))
        .where(
          and(
            eq(messagePlacements.mailboxId, mailboxId),
            gt(messagePlacements.uid, Math.max(afterUid, 0)),
            isNull(messages.emailId),
          ),
        )
        .orderBy(asc(messagePlacements.uid))
        .limit(limit)
        .all()
        .map((row) => ({ messageId: MessageIdSchema.parse(row.messageId), uid: row.uid })),
    );
  }

  fillEmailIds(mailboxId: MailboxId, resolved: readonly ResolvedEmailId[]): Promise<number> {
    return this.executor.execute((db) =>
      resolved
        .filter(({ uid }) => uid > 0)
        .reduce(
          (filled, { uid, emailId }) =>
            filled +
            db
              .update(messages)
              .set({ emailId })
              .where(
                and(
                  isNull(messages.emailId),
                  sql`${messages.id} = (select ${messagePlacements.messageId} from ${messagePlacements} where ${messagePlacements.mailboxId} = ${mailboxId} and ${messagePlacements.uid} = ${uid})`,
                ),
              )
              .run().changes,
          0,
        ),
    );
  }
}
