import type { CreateDraftBody, UpdateDraftBody, UploadAttachmentBody } from '@relay/shared/api';
import {
  type Draft,
  type DraftAttachment,
  type DraftContent,
  type DraftId,
  MAX_ATTACHMENT_BYTES,
  type UserId,
} from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AttachmentStore } from '../../ports/attachment-store';
import type { Clock } from '../../ports/clock';
import type { DraftRepository } from '../../ports/draft-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { EngineEvents } from '../shared/engine-events';
import type { DraftThreadFlag } from './draft-thread-flag';

export interface DraftServiceDeps {
  readonly drafts: DraftRepository;
  readonly accounts: AccountRepository;
  readonly threads: ThreadRepository;
  readonly attachments: AttachmentStore;
  readonly threadFlag: DraftThreadFlag;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const decodeBase64 = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export class DraftService {
  constructor(private readonly deps: DraftServiceDeps) {}

  list(userId: UserId): Promise<Draft[]> {
    return this.deps.drafts.listByUser(userId);
  }

  async require(userId: UserId, draftId: DraftId): Promise<Draft> {
    const draft = await this.deps.drafts.findById(userId, draftId);
    if (draft === null) {
      throw new NotFoundError('Draft', draftId);
    }
    return draft;
  }

  async create(userId: UserId, content: CreateDraftBody): Promise<Draft> {
    await this.assertReferences(userId, content);
    const now = this.deps.clock.now().toISOString();
    const draft = await this.deps.drafts.create(userId, {
      ...content,
      id: this.deps.ids.generate('draft'),
      createdAt: now,
      updatedAt: now,
    });
    await this.deps.events.emit(userId, 'draft.upserted', { draft });
    await this.deps.threadFlag.sync(userId, draft.inReplyToThreadId);
    return draft;
  }

  async update(userId: UserId, draftId: DraftId, patch: UpdateDraftBody): Promise<Draft> {
    const current = await this.require(userId, draftId);
    await this.assertReferences(userId, { ...current, ...patch });
    const draft = await this.deps.drafts.update(
      userId,
      draftId,
      patch,
      this.deps.clock.now().toISOString(),
    );
    if (draft === null) {
      throw new NotFoundError('Draft', draftId);
    }
    await this.deps.events.emit(userId, 'draft.upserted', { draft });
    await this.deps.threadFlag.sync(userId, current.inReplyToThreadId);
    await this.deps.threadFlag.sync(userId, draft.inReplyToThreadId);
    return draft;
  }

  async delete(userId: UserId, draftId: DraftId): Promise<void> {
    const draft = await this.require(userId, draftId);
    await this.deps.drafts.delete(userId, draftId);
    for (const attachment of draft.attachments) {
      await this.deps.attachments.delete(userId, attachment.id);
    }
    await this.deps.events.emit(userId, 'draft.removed', { draftId });
    await this.deps.threadFlag.sync(userId, draft.inReplyToThreadId);
  }

  async uploadAttachment(userId: UserId, body: UploadAttachmentBody): Promise<DraftAttachment> {
    const content = decodeBase64(body.contentBase64);
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError('Attachment is too large');
    }
    return this.deps.attachments.put(userId, {
      filename: body.filename,
      contentType: body.contentType,
      content,
    });
  }

  private async assertReferences(userId: UserId, content: DraftContent): Promise<void> {
    const account = await this.deps.accounts.findById(userId, content.accountId);
    if (account === null) {
      throw new NotFoundError('Account', content.accountId);
    }
    if (content.inReplyToThreadId === null) {
      return;
    }
    const thread = await this.deps.threads.findById(userId, content.inReplyToThreadId);
    if (thread === null) {
      throw new NotFoundError('Thread', content.inReplyToThreadId);
    }
  }
}
