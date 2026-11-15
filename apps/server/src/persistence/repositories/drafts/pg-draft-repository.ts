import type { DraftRepository } from '@relay/engine';
import type { Draft, DraftContent, DraftId, ThreadId, UserId } from '@relay/shared/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { drafts } from '../../schema';
import { assertOwned } from '../../support/ownership';
import { toDate } from '../../support/timestamps';
import { loadDraftAttachments, replaceDraftAttachments } from './draft-attachments-store';
import { toDraft, toDraftInsert, toDraftUpdate } from './draft.mapper';

type DraftRow = typeof drafts.$inferSelect;

const assertDraftReferences = async (
  db: DbExecutor,
  userId: UserId,
  content: Partial<DraftContent>,
): Promise<void> => {
  await assertOwned(db, 'Account', userId, content.accountId ?? null);
  await assertOwned(db, 'Thread', userId, content.inReplyToThreadId ?? null);
  await assertOwned(db, 'Message', userId, content.inReplyToMessageId ?? null);
};

export class PgDraftRepository implements DraftRepository {
  constructor(private readonly db: DbExecutor) {}

  async listByUser(userId: UserId): Promise<Draft[]> {
    const rows = await this.db
      .select()
      .from(drafts)
      .where(eq(drafts.userId, userId))
      .orderBy(desc(drafts.updatedAt), desc(drafts.id));
    return this.withAttachments(rows);
  }

  async findById(userId: UserId, draftId: DraftId): Promise<Draft | null> {
    const rows = await this.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.userId, userId), eq(drafts.id, draftId)));
    const [draft] = await this.withAttachments(rows);
    return draft ?? null;
  }

  async findByThread(userId: UserId, threadId: ThreadId): Promise<Draft | null> {
    const rows = await this.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.userId, userId), eq(drafts.inReplyToThreadId, threadId)))
      .orderBy(desc(drafts.updatedAt), desc(drafts.id))
      .limit(1);
    const [draft] = await this.withAttachments(rows);
    return draft ?? null;
  }

  async create(userId: UserId, draft: Draft): Promise<Draft> {
    return this.db.transaction(async (tx) => {
      await assertDraftReferences(tx, userId, draft);
      await tx.insert(drafts).values(toDraftInsert(userId, draft));
      await replaceDraftAttachments(
        tx,
        userId,
        draft.id,
        draft.attachments.map((attachment) => attachment.id),
      );
      const stored = await new PgDraftRepository(tx).findById(userId, draft.id);
      return stored ?? draft;
    });
  }

  async update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    updatedAt: string,
  ): Promise<Draft | null> {
    return this.db.transaction(async (tx) => {
      await assertDraftReferences(tx, userId, changes);
      const rows = await tx
        .update(drafts)
        .set({ ...toDraftUpdate(changes), updatedAt: toDate(updatedAt) })
        .where(and(eq(drafts.userId, userId), eq(drafts.id, draftId)))
        .returning({ id: drafts.id });
      if (rows.length === 0) {
        return null;
      }
      if (changes.attachments !== undefined) {
        await replaceDraftAttachments(
          tx,
          userId,
          draftId,
          changes.attachments.map((attachment) => attachment.id),
        );
      }
      return new PgDraftRepository(tx).findById(userId, draftId);
    });
  }

  async delete(userId: UserId, draftId: DraftId): Promise<boolean> {
    const rows = await this.db
      .delete(drafts)
      .where(and(eq(drafts.userId, userId), eq(drafts.id, draftId)))
      .returning({ id: drafts.id });
    return rows.length > 0;
  }

  private async withAttachments(rows: readonly DraftRow[]): Promise<Draft[]> {
    const attachmentsByDraft = await loadDraftAttachments(
      this.db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toDraft(row, attachmentsByDraft.get(row.id) ?? []));
  }
}
