import type { Page, PageRequest, StoredMatchSubject } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { RelayDb } from '../database/sqlite-database';
import { CursorCodec } from '../pagination/cursor-codec';
import { assertPageLimit } from '../pagination/page-limit';
import { toPage } from '../pagination/to-page';
import { messages } from '../schema';
import { matchSubjectColumns, toStoredMatchSubject } from './match-subject-row';

const seqCursor = new CursorCodec(z.object({ seq: z.number().int() }));

export const listMatchSubjects = (
  db: RelayDb,
  accountId: AccountId,
  page: PageRequest,
): Page<StoredMatchSubject> => {
  const limit = assertPageLimit(page.limit);
  const after = seqCursor.decode(page.cursor);
  const rows = db
    .select(matchSubjectColumns)
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
  return toPage(rows, limit, toStoredMatchSubject, (row) => seqCursor.encode({ seq: row.seq }));
};
