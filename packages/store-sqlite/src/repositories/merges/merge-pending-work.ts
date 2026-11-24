import {
  type MergeMapping,
  type PendingWork,
  type PendingWorkKey,
  remapPendingWork,
} from '@relay/engine';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { toPendingWork } from '../../mappers/pending-work-mapper';
import { pendingWork } from '../../schema';
import { MEMBER_IDS } from './merge-temp-tables';
import { MESSAGE_PENDING_WORK_REFERENCE } from './message-references';

const PAYLOAD_MESSAGE_ID = sql`json_extract(${pendingWork.payload}, '$.messageId')`;

const memberRows = (db: RelayDb, accountId: string): PendingWork[] =>
  db
    .select()
    .from(pendingWork)
    .where(
      and(
        eq(pendingWork.accountId, accountId),
        inArray(pendingWork.kind, [...MESSAGE_PENDING_WORK_REFERENCE.kinds]),
        or(
          sql`${PAYLOAD_MESSAGE_ID} in ${MEMBER_IDS}`,
          and(eq(pendingWork.kind, 'jira-event'), sql`${pendingWork.ref} in ${MEMBER_IDS}`),
        ),
      ),
    )
    .all()
    .map((row) => toPendingWork(row));

const removeRow = (db: RelayDb, key: PendingWorkKey): void => {
  db.delete(pendingWork)
    .where(
      and(
        eq(pendingWork.accountId, key.accountId),
        eq(pendingWork.kind, key.kind),
        eq(pendingWork.ref, key.ref),
      ),
    )
    .run();
};

const writeRow = (db: RelayDb, work: PendingWork): void => {
  db.insert(pendingWork)
    .values({
      accountId: work.accountId,
      kind: work.kind,
      ref: work.ref,
      payload: work.payload,
      revision: work.revision,
      createdAt: work.createdAt,
    })
    .run();
};

export const remapMemberPendingWork = (
  db: RelayDb,
  accountId: string,
  mapping: MergeMapping,
): void => {
  const remap = remapPendingWork(memberRows(db, accountId), mapping);
  remap.remove.forEach((key) => {
    removeRow(db, key);
  });
  remap.write.forEach((work) => {
    writeRow(db, work);
  });
};
