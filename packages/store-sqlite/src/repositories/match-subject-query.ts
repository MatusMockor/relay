import type { Page, PageRequest, StoredMatchSubject } from '@relay/engine';
import { MessageIdSchema, ThreadIdSchema, type AccountId } from '@relay/shared/domain';
import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { RelayDb } from '../database/sqlite-database';
import { toMessageHeaders } from '../mappers/message-mapper';
import { CursorCodec } from '../pagination/cursor-codec';
import { assertPageLimit } from '../pagination/page-limit';
import { toPage } from '../pagination/to-page';
import { messages } from '../schema';

const seqCursor = new CursorCodec(z.object({ seq: z.number().int() }));

export const listMatchSubjects = (
  db: RelayDb,
  accountId: AccountId,
  page: PageRequest,
): Page<StoredMatchSubject> => {
  const limit = assertPageLimit(page.limit);
  const after = seqCursor.decode(page.cursor);
  const rows = db
    .select({
      seq: messages.seq,
      id: messages.id,
      threadId: messages.threadId,
      fromName: messages.fromName,
      fromEmail: messages.fromEmail,
      subject: messages.subject,
      headers: messages.headers,
    })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, accountId),
        after === null ? undefined : gt(messages.seq, after.seq),
      ),
    )
    .orderBy(asc(messages.seq))
    .limit(limit + 1)
    .all();
  return toPage(
    rows,
    limit,
    (row) => ({
      messageId: MessageIdSchema.parse(row.id),
      threadId: ThreadIdSchema.parse(row.threadId),
      subject: {
        from: row.fromEmail === null ? null : { name: row.fromName, email: row.fromEmail },
        subject: row.subject,
        headers: toMessageHeaders(row.headers),
      },
    }),
    (row) => seqCursor.encode({ seq: row.seq }),
  );
};
