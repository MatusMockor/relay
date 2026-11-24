import type {
  BodyRepairCandidate,
  MessageBodyRepairRepository,
  RepairedMessageBody,
} from '@relay/engine';
import type { MailboxId, MessageId, ThreadId } from '@relay/shared/domain';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { messages } from '../schema';

const REPLACEMENT_CHARACTER = '\uFFFD';

const hasReplacementCharacter = sql`(
  instr(${messages.textBody}, ${REPLACEMENT_CHARACTER}) > 0
  or instr(${messages.htmlBody}, ${REPLACEMENT_CHARACTER}) > 0
  or instr(${messages.snippet}, ${REPLACEMENT_CHARACTER}) > 0
)`;

export class SqliteMessageBodyRepairRepository implements MessageBodyRepairRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<BodyRepairCandidate[]> {
    return this.executor.execute((db) =>
      db
        .select({
          messageId: messages.id,
          threadId: messages.threadId,
          uid: messages.uid,
          messageIdHeader: messages.messageIdHeader,
        })
        .from(messages)
        .where(
          and(
            eq(messages.mailboxId, mailboxId),
            gt(messages.uid, afterUid),
            hasReplacementCharacter,
          ),
        )
        .orderBy(asc(messages.uid))
        .limit(limit)
        .all()
        .map((row) => ({
          messageId: row.messageId as MessageId,
          threadId: row.threadId as ThreadId,
          uid: row.uid,
          messageIdHeader: row.messageIdHeader,
        })),
    );
  }

  updateBody(messageId: MessageId, body: RepairedMessageBody): Promise<void> {
    return this.executor.execute((db) => {
      db.update(messages)
        .set({ textBody: body.textBody, htmlBody: body.htmlBody, snippet: body.snippet })
        .where(eq(messages.id, messageId))
        .run();
    });
  }
}
