import { CANDIDATE_MESSAGES_PER_THREAD, type StoredMatchSubject } from '@relay/engine';
import { and, asc, eq, inArray, lte, type SQL, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { mailboxes, messages } from '../schema';
import { chunked } from './chunked';
import { matchSubjectColumns, toStoredMatchSubject } from './match-subject-row';

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

export const candidateSubjects = (
  db: RelayDb,
  threadIds: readonly string[],
  filter: SQL | undefined,
): Map<string, StoredMatchSubject[]> => {
  const byThread = new Map<string, StoredMatchSubject[]>();
  chunked(threadIds).forEach((chunk) => {
    const ranked = db
      .select({
        ...matchSubjectColumns,
        dateTs: messages.dateTs,
        rank: sql<number>`row_number() over (partition by ${messages.threadId} order by ${messages.dateTs} desc, ${messages.seq} desc)`.as(
          'rank',
        ),
      })
      .from(messages)
      .innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
      .where(and(inArray(messages.threadId, chunk), filter))
      .as('ranked');
    db.select()
      .from(ranked)
      .where(lte(ranked.rank, CANDIDATE_MESSAGES_PER_THREAD))
      .orderBy(asc(ranked.threadId), asc(ranked.dateTs), asc(ranked.seq))
      .all()
      .forEach((row) => {
        appendTo(byThread, toStoredMatchSubject(row));
      });
  });
  return byThread;
};
