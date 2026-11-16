import type { CreateDraftBody, UpdateDraftBody } from '@relay/shared/api';
import type { Draft, DraftId, UserId } from '@relay/shared/domain';
import { ConflictError, NotFoundError } from '../../errors';
import type { AttachmentReferenceLock } from '../attachments/attachment-reference-lock';
import type { AttachmentSweeper } from '../attachments/attachment-sweeper';
import type { Clock } from '../../ports/clock';
import type { DraftRepository } from '../../ports/draft-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { EngineEvents } from '../shared/engine-events';
import type { DraftReferenceGuard } from './draft-reference-guard';
import type { DraftThreadFlag } from './draft-thread-flag';

export interface DraftServiceDeps {
  readonly drafts: DraftRepository;
  readonly references: DraftReferenceGuard;
  readonly blobs: Pick<AttachmentSweeper, 'release'>;
  readonly referenceLock: AttachmentReferenceLock;
  readonly threadFlag: DraftThreadFlag;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export class DraftService {
  constructor(private readonly deps: DraftServiceDeps) {}

  list(userId: UserId): Promise<Draft[]> {
    return this.deps.drafts.listByUser(userId);
  }

  find(userId: UserId, draftId: DraftId): Promise<Draft | null> {
    return this.deps.drafts.findById(userId, draftId);
  }

  async require(userId: UserId, draftId: DraftId): Promise<Draft> {
    const draft = await this.deps.drafts.findById(userId, draftId);
    if (draft === null) {
      throw new NotFoundError('Draft', draftId);
    }
    return draft;
  }

  async create(userId: UserId, content: CreateDraftBody): Promise<Draft> {
    await this.deps.references.assert(userId, null, content);
    const now = this.deps.clock.now().toISOString();
    const draft = await this.deps.referenceLock.shared(() =>
      this.deps.drafts.create(userId, {
        ...content,
        id: this.deps.ids.generate('draft'),
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.deps.events.emit(userId, 'draft.upserted', { draft });
    await this.deps.threadFlag.sync(userId, draft.inReplyToThreadId);
    return draft;
  }

  update(userId: UserId, draftId: DraftId, patch: UpdateDraftBody): Promise<Draft> {
    return this.change(userId, draftId, () => patch);
  }

  async change(
    userId: UserId,
    draftId: DraftId,
    patchOf: (current: Draft) => UpdateDraftBody,
  ): Promise<Draft> {
    const current = await this.require(userId, draftId);
    const patch = patchOf(current);
    await this.deps.references.assert(userId, draftId, { ...current, ...patch });
    const draft = await this.deps.referenceLock.shared(() =>
      this.deps.drafts.update(userId, draftId, patch, {
        expected: current.updatedAt,
        next: this.nextRevision(current.updatedAt),
      }),
    );
    if (draft === null) {
      await this.require(userId, draftId);
      throw new ConflictError('The draft was changed by another update');
    }
    await this.releaseDropped(current, draft);
    await this.deps.events.emit(userId, 'draft.upserted', { draft });
    await this.deps.threadFlag.sync(userId, current.inReplyToThreadId);
    await this.deps.threadFlag.sync(userId, draft.inReplyToThreadId);
    return draft;
  }

  async delete(userId: UserId, draftId: DraftId, attempt = 1): Promise<void> {
    const draft = await this.require(userId, draftId);
    if (await this.deps.drafts.deleteRevision(userId, draftId, draft.updatedAt)) {
      await this.removed(userId, draft);
      return;
    }
    if (attempt >= 3) {
      throw new ConflictError('The draft was changed while it was being deleted');
    }
    await this.delete(userId, draftId, attempt + 1);
  }

  async deleteSent(userId: UserId, draft: Draft): Promise<boolean> {
    if (!(await this.deps.drafts.deleteRevision(userId, draft.id, draft.updatedAt))) {
      return false;
    }
    await this.removed(userId, draft);
    return true;
  }

  async deleteSentRevision(userId: UserId, draftId: DraftId, updatedAt: string): Promise<boolean> {
    const draft = await this.deps.drafts.findById(userId, draftId);
    if (draft?.updatedAt !== updatedAt) {
      return false;
    }
    return this.deleteSent(userId, draft);
  }

  private nextRevision(previous: string): string {
    const now = this.deps.clock.now().getTime();
    return new Date(Math.max(now, Date.parse(previous) + 1)).toISOString();
  }

  private async releaseDropped(before: Draft, after: Draft): Promise<void> {
    const kept = new Set(after.attachments.map((attachment) => attachment.id));
    const dropped = before.attachments
      .map((attachment) => attachment.id)
      .filter((id) => !kept.has(id));
    if (dropped.length === 0) {
      return;
    }
    await this.deps.blobs.release(dropped).catch((error: unknown) => {
      this.deps.logger.warn('Removing a dropped draft attachment failed', {
        attachmentIds: dropped,
        error: errorMessage(error),
      });
    });
  }

  private async removed(userId: UserId, draft: Draft): Promise<void> {
    await this.deps.blobs.release(draft.attachments.map((attachment) => attachment.id));
    await this.deps.events.emit(userId, 'draft.removed', { draftId: draft.id });
    await this.deps.threadFlag.sync(userId, draft.inReplyToThreadId);
  }
}
