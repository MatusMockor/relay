import type {
  DraftRepository,
  DraftRevision,
  DraftSendClaim,
  DraftSendRenewal,
} from '@relay/engine';
import type {
  Draft,
  DraftContent,
  DraftId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toDraft, toDraftAttachmentRows, toDraftRow } from '../mappers/draft-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { type DraftAttachmentRow, type DraftRow, draftAttachments, drafts } from '../schema';
import { chunked } from './chunked';
import { withResolvedReplyTarget } from './draft-reply-target';
import { leaseStaleBefore } from './stale-lease';

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
      const resolved = withResolvedReplyTarget(db, draft);
      db.insert(drafts).values(toDraftRow(userId, resolved)).run();
      this.replaceAttachments(db, draft.id, draft.attachments);
      return resolved;
    });
  }

  update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    revision: DraftRevision,
  ): Promise<Draft | null> {
    return this.executor.execute((db) => {
      const { attachments, ...content } = withResolvedReplyTarget(db, changes);
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
          .set({ sendClaimedTs: toTimestamp(claim.claimedAt), sendRenewedTs: null })
          .where(
            and(
              ownedBy(userId, draftId),
              leaseStaleBefore(drafts.sendClaimedTs, drafts.sendRenewedTs, claim.staleBefore),
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
          .set({ sendClaimedTs: null, sendRenewedTs: null })
          .where(and(ownedBy(userId, draftId), eq(drafts.sendClaimedTs, toTimestamp(claimedAt))))
          .run().changes > 0,
    );
  }

  renewSendClaim(userId: UserId, draftId: DraftId, renewal: DraftSendRenewal): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(drafts)
          .set({ sendRenewedTs: toTimestamp(renewal.renewedAt) })
          .where(
            and(ownedBy(userId, draftId), eq(drafts.sendClaimedTs, toTimestamp(renewal.claimedAt))),
          )
          .run().changes > 0,
    );
  }

  retargetReplies(from: MessageId, to: MessageId): Promise<void> {
    return this.executor.execute((db) => {
      db.update(drafts)
        .set({ inReplyToMessageId: to })
        .where(eq(drafts.inReplyToMessageId, from))
        .run();
    });
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
