import {
  CANDIDATE_MESSAGES_PER_THREAD,
  hasFileAttachments,
  type StoredMatchSubject,
} from '@relay/engine';
import type { ThreadId } from '@relay/shared/domain';
import { and, asc, inArray, lte, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';
import { toMessageHeaders } from '../messages/message-headers';

const appendTo = (
  byThread: Map<string, StoredMatchSubject[]>,
  subject: StoredMatchSubject,
): void => {
  const known = byThread.get(subject.threadId);
  if (known !== undefined) {
    known.push(subject);
    return;
  }
  byThread.set(subject.threadId, [subject]);
};

export const loadCandidateSubjects = async (
  db: DbExecutor,
  threadIds: readonly ThreadId[],
  filter: SQL | undefined,
): Promise<Map<string, StoredMatchSubject[]>> => {
  const byThread = new Map<string, StoredMatchSubject[]>();
  if (threadIds.length === 0) {
    return byThread;
  }
  const ranked = db
    .select({
      id: messages.id,
      threadId: messages.threadId,
      from: messages.from,
      subject: messages.subject,
      headers: messages.headers,
      to: messages.to,
      cc: messages.cc,
      attachments: messages.attachments,
      date: messages.date,
      rank: sql<number>`row_number() over (partition by ${messages.threadId} order by ${messages.date} desc, ${messages.id} desc)`.as(
        'rank',
      ),
    })
    .from(messages)
    .where(and(inArray(messages.threadId, [...threadIds]), filter))
    .as('ranked');
  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, CANDIDATE_MESSAGES_PER_THREAD))
    .orderBy(asc(ranked.threadId), asc(ranked.date), asc(ranked.id));
  rows.forEach((row) => {
    appendTo(byThread, {
      messageId: row.id,
      threadId: row.threadId,
      subject: {
        from: row.from,
        subject: row.subject,
        headers: toMessageHeaders(row.headers),
        to: row.to,
        cc: row.cc,
        hasAttachments: hasFileAttachments(row.attachments),
      },
    });
  });
  return byThread;
};
