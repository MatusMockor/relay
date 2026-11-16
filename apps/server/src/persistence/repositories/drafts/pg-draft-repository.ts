import type {
  DraftRepository,
  DraftRevision,
  DraftSendClaim,
  DraftSendRenewal,
} from '@relay/engine';
import type {
  Draft,
  DraftAttachment,
  DraftContent,
  DraftId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { drafts } from '../../schema';
import { assertOwned } from '../../support/ownership';
import { leaseStaleBefore } from '../../support/stale-lease';
import { toDate } from '../../support/timestamps';
import { replaceDraftAttachments } from './draft-attachments-store';
import { draftSelection } from './draft-selection';
import { toDraft, toDraftInsert, toDraftUpdate } from './draft.mapper';

type StoredDraftRow = typeof drafts.$inferSelect & { attachments: DraftAttachment[] };

const toStoredDraft = ({ attachments, ...row }: StoredDraftRow): Draft => toDraft(row, attachments);

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
      .select(draftSelection)
      .from(drafts)
      .where(eq(drafts.userId, userId))
      .orderBy(desc(drafts.updatedAt), desc(drafts.id));
    return rows.map(toStoredDraft);
  }

  async findById(userId: UserId, draftId: DraftId): Promise<Draft | null> {
    const rows = await this.db
      .select(draftSelection)
      .from(drafts)
      .where(and(eq(drafts.userId, userId), eq(drafts.id, draftId)));
    const [row] = rows;
    return row === undefined ? null : toStoredDraft(row);
  }

  async findByThread(userId: UserId, threadId: ThreadId): Promise<Draft | null> {
    const rows = await this.db
      .select(draftSelection)
      .from(drafts)
      .where(and(eq(drafts.userId, userId), eq(drafts.inReplyToThreadId, threadId)))
      .orderBy(desc(drafts.updatedAt), desc(drafts.id))
      .limit(1);
    const [row] = rows;
    return row === undefined ? null : toStoredDraft(row);
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
    revision: DraftRevision,
  ): Promise<Draft | null> {
    return this.db.transaction(async (tx) => {
      await assertDraftReferences(tx, userId, changes);
      const rows = await tx
        .update(drafts)
        .set({ ...toDraftUpdate(changes), updatedAt: toDate(revision.next) })
        .where(
          and(
            eq(drafts.userId, userId),
            eq(drafts.id, draftId),
            eq(drafts.updatedAt, toDate(revision.expected)),
          ),
        )
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

  async deleteRevision(userId: UserId, draftId: DraftId, updatedAt: string): Promise<boolean> {
    const rows = await this.db
      .delete(drafts)
      .where(
        and(
          eq(drafts.userId, userId),
          eq(drafts.id, draftId),
          eq(drafts.updatedAt, toDate(updatedAt)),
        ),
      )
      .returning({ id: drafts.id });
    return rows.length > 0;
  }

  async claimForSend(userId: UserId, draftId: DraftId, claim: DraftSendClaim): Promise<boolean> {
    const rows = await this.db
      .update(drafts)
      .set({ sendClaimedAt: toDate(claim.claimedAt), sendRenewedAt: null })
      .where(
        and(
          eq(drafts.userId, userId),
          eq(drafts.id, draftId),
          leaseStaleBefore(drafts.sendClaimedAt, drafts.sendRenewedAt, claim.staleBefore),
        ),
      )
      .returning({ id: drafts.id });
    return rows.length > 0;
  }

  async releaseSendClaim(userId: UserId, draftId: DraftId, claimedAt: string): Promise<boolean> {
    const rows = await this.db
      .update(drafts)
      .set({ sendClaimedAt: null, sendRenewedAt: null })
      .where(
        and(
          eq(drafts.userId, userId),
          eq(drafts.id, draftId),
          eq(drafts.sendClaimedAt, toDate(claimedAt)),
        ),
      )
      .returning({ id: drafts.id });
    return rows.length > 0;
  }

  async renewSendClaim(
    userId: UserId,
    draftId: DraftId,
    renewal: DraftSendRenewal,
  ): Promise<boolean> {
    const rows = await this.db
      .update(drafts)
      .set({ sendRenewedAt: toDate(renewal.renewedAt) })
      .where(
        and(
          eq(drafts.userId, userId),
          eq(drafts.id, draftId),
          eq(drafts.sendClaimedAt, toDate(renewal.claimedAt)),
        ),
      )
      .returning({ id: drafts.id });
    return rows.length > 0;
  }
}
