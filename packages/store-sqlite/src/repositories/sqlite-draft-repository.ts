import type { DraftRepository, DraftRevision, DraftSendClaim } from '@relay/engine';
import type { Draft, DraftContent, DraftId, ThreadId, UserId } from '@relay/shared/domain';
import { and, asc, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toDraft, toDraftAttachmentRows, toDraftRow } from '../mappers/draft-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { type DraftAttachmentRow, type DraftRow, draftAttachments, drafts } from '../schema';
import { chunked } from './chunked';

const ownedBy = (userId: UserId, draftId: DraftId) =>
  and(eq(drafts.userId, userId), eq(drafts.id, draftId));

export class SqliteDraftRepository implements DraftRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByUser(userId: UserId): Promise<Draft[]> {
    return this.executor.execute((db) => this.select(db, eq(drafts.userId, userId)));
  }

  findById(userId: UserId, draftId: DraftId): Promise<Draft | null> {
    return this.executor.execute((db) => this.select(db, ownedBy(userId, draftId))[0] ?? null);
  }

  findByThread(userId: UserId, threadId: ThreadId): Promise<Draft | null> {
    return this.executor.execute(
      (db) =>
        this.select(
          db,
          and(eq(drafts.userId, userId), eq(drafts.inReplyToThreadId, threadId)),
        )[0] ?? null,
    );
  }

  create(userId: UserId, draft: Draft): Promise<Draft> {
    return this.executor.execute((db) => {
      db.insert(drafts).values(toDraftRow(userId, draft)).run();
      this.replaceAttachments(db, draft.id, draft.attachments);
      return draft;
    });
  }

  update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    revision: DraftRevision,
  ): Promise<Draft | null> {
    return this.executor.execute((db) => {
      const { attachments, ...content } = changes;
      const result = db
        .update(drafts)
        .set({ ...content, updatedAt: revision.next, updatedTs: toTimestamp(revision.next) })
        .where(and(ownedBy(userId, draftId), eq(drafts.updatedAt, revision.expected)))
        .run();
      if (result.changes === 0) {
        return null;
      }
      if (attachments !== undefined) {
        this.replaceAttachments(db, draftId, attachments);
      }
      return this.select(db, ownedBy(userId, draftId))[0] ?? null;
    });
  }

  delete(userId: UserId, draftId: DraftId): Promise<boolean> {
    return this.executor.execute(
      (db) => db.delete(drafts).where(ownedBy(userId, draftId)).run().changes > 0,
    );
  }

  deleteRevision(userId: UserId, draftId: DraftId, updatedAt: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .delete(drafts)
          .where(and(ownedBy(userId, draftId), eq(drafts.updatedAt, updatedAt)))
          .run().changes > 0,
    );
  }

  claimForSend(userId: UserId, draftId: DraftId, claim: DraftSendClaim): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(drafts)
          .set({ sendClaimedTs: toTimestamp(claim.claimedAt) })
          .where(
            and(
              ownedBy(userId, draftId),
              or(
                isNull(drafts.sendClaimedTs),
                lt(drafts.sendClaimedTs, toTimestamp(claim.staleBefore)),
              ),
            ),
          )
          .run().changes > 0,
    );
  }

  releaseSendClaim(userId: UserId, draftId: DraftId, claimedAt: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(drafts)
          .set({ sendClaimedTs: null })
          .where(and(ownedBy(userId, draftId), eq(drafts.sendClaimedTs, toTimestamp(claimedAt))))
          .run().changes > 0,
    );
  }

  private replaceAttachments(
    db: RelayDb,
    draftId: string,
    attachments: DraftContent['attachments'],
  ): void {
    db.delete(draftAttachments).where(eq(draftAttachments.draftId, draftId)).run();
    if (attachments.length === 0) {
      return;
    }
    db.insert(draftAttachments).values(toDraftAttachmentRows(draftId, attachments)).run();
  }

  private select(db: RelayDb, condition: SQL | undefined): Draft[] {
    const rows: DraftRow[] = db
      .select()
      .from(drafts)
      .where(condition)
      .orderBy(desc(drafts.updatedTs), desc(drafts.id))
      .all();
    const attachmentsByDraft = this.readAttachments(
      db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toDraft(row, attachmentsByDraft.get(row.id) ?? []));
  }

  private readAttachments(
    db: RelayDb,
    draftIds: readonly string[],
  ): Map<string, DraftAttachmentRow[]> {
    const byDraft = new Map<string, DraftAttachmentRow[]>();
    chunked(draftIds).forEach((chunk) => {
      db.select()
        .from(draftAttachments)
        .where(inArray(draftAttachments.draftId, chunk))
        .orderBy(asc(draftAttachments.position))
        .all()
        .forEach((row) => {
          byDraft.set(row.draftId, [...(byDraft.get(row.draftId) ?? []), row]);
        });
    });
    return byDraft;
  }
}
