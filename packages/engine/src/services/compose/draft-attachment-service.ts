import type { DraftAttachmentAdded, DraftAttachmentsForwarded } from '@relay/shared/api';
import type {
  AttachmentId,
  Draft,
  DraftAttachment,
  DraftId,
  MessageId,
  UserId,
} from '@relay/shared/domain';
import { ConflictError, NotFoundError } from '../../errors';
import type { AttachmentContent, AttachmentUpload } from '../../model/attachment';
import type { AttachmentStore } from '../../ports/attachment-store';
import type { MessageRepository } from '../../ports/message-repository';
import { assertDraftCapacity, assertFileSize } from './attachment-limits';
import { attachmentContentType, attachmentFilename } from './attachment-naming';
import type { DraftService } from './draft-service';

const MAX_ATTEMPTS = 3;

export interface AttachmentContentReader {
  content(userId: UserId, attachmentId: AttachmentId): Promise<AttachmentContent>;
}

export interface DraftAttachmentServiceDeps {
  readonly drafts: DraftService;
  readonly store: AttachmentStore;
  readonly messages: MessageRepository;
  readonly content: AttachmentContentReader;
}

export class DraftAttachmentService {
  constructor(private readonly deps: DraftAttachmentServiceDeps) {}

  async add(
    userId: UserId,
    draftId: DraftId,
    upload: AttachmentUpload,
  ): Promise<DraftAttachmentAdded> {
    assertFileSize(upload.content.byteLength);
    const current = await this.deps.drafts.require(userId, draftId);
    assertDraftCapacity(current.attachments, [{ size: upload.content.byteLength }]);
    const attachment = await this.deps.store.put(userId, {
      filename: attachmentFilename([upload.filename]),
      contentType: attachmentContentType(upload.contentType),
      content: upload.content,
    });
    const draft = await this.attach(userId, draftId, [attachment]);
    return { draft, attachment };
  }

  async remove(userId: UserId, draftId: DraftId, attachmentId: AttachmentId): Promise<Draft> {
    return this.retrying(() =>
      this.deps.drafts.change(userId, draftId, (current) => {
        if (!current.attachments.some((attachment) => attachment.id === attachmentId)) {
          throw new NotFoundError('Attachment', attachmentId);
        }
        return {
          attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
        };
      }),
    );
  }

  async forward(
    userId: UserId,
    draftId: DraftId,
    messageId: MessageId,
  ): Promise<DraftAttachmentsForwarded> {
    const draft = await this.deps.drafts.require(userId, draftId);
    const message = await this.deps.messages.findById(userId, messageId);
    if (message === null) {
      throw new NotFoundError('Message', messageId);
    }
    const originals = message.attachments.filter((attachment) => !attachment.inline);
    if (originals.length === 0) {
      return { draft, attachments: [] };
    }
    assertDraftCapacity(draft.attachments, originals);
    const copies: DraftAttachment[] = [];
    try {
      for (const original of originals) {
        const found = await this.deps.content.content(userId, original.id);
        assertFileSize(found.content.byteLength);
        copies.push(
          await this.deps.store.put(userId, {
            filename: attachmentFilename([original.filename, found.filename]),
            contentType: attachmentContentType(original.contentType),
            content: found.content,
          }),
        );
      }
    } catch (error) {
      await this.discard(userId, copies);
      throw error;
    }
    return { draft: await this.attach(userId, draftId, copies), attachments: copies };
  }

  private async attach(
    userId: UserId,
    draftId: DraftId,
    added: readonly DraftAttachment[],
  ): Promise<Draft> {
    try {
      return await this.retrying(() =>
        this.deps.drafts.change(userId, draftId, (current) => {
          assertDraftCapacity(current.attachments, added);
          return { attachments: [...current.attachments, ...added] };
        }),
      );
    } catch (error) {
      await this.discardUnreferenced(userId, draftId, added);
      throw error;
    }
  }

  private async discardUnreferenced(
    userId: UserId,
    draftId: DraftId,
    added: readonly DraftAttachment[],
  ): Promise<void> {
    const lookup = await this.deps.drafts.find(userId, draftId).then(
      (draft) => ({ known: true as const, draft }),
      () => ({ known: false as const }),
    );
    if (!lookup.known) {
      return;
    }
    const kept = new Set(lookup.draft?.attachments.map((attachment) => attachment.id) ?? []);
    await this.discard(
      userId,
      added.filter((attachment) => !kept.has(attachment.id)),
    );
  }

  private async retrying(work: () => Promise<Draft>, attempt = 1): Promise<Draft> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof ConflictError) || attempt >= MAX_ATTEMPTS) {
        throw error;
      }
      return this.retrying(work, attempt + 1);
    }
  }

  private async discard(userId: UserId, attachments: readonly DraftAttachment[]): Promise<void> {
    await Promise.all(
      attachments.map((attachment) =>
        this.deps.store.delete(userId, attachment.id).catch(() => false),
      ),
    );
  }
}
