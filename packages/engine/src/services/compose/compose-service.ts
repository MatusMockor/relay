import type {
  CreateDraftBody,
  DraftAttachmentAdded,
  DraftAttachmentsForwarded,
  SendBody,
  SendResponse,
  UpdateDraftBody,
} from '@relay/shared/api';
import type {
  AttachmentId,
  Draft,
  DraftId,
  MessageId,
  ScheduledSend,
  ScheduledSendId,
  UserId,
} from '@relay/shared/domain';
import type { AttachmentUpload } from '../../model/attachment';
import type { OutgoingHeaders } from '../../model/outgoing-message';
import type { Clock } from '../../ports/clock';
import type { DraftAttachmentService } from './draft-attachment-service';
import type { DraftSender } from './draft-sender';
import type { DraftService } from './draft-service';
import type { ScheduledSendService } from './scheduled-send-service';
import type { SendService } from './send-service';

export interface ComposeServiceDeps {
  readonly drafts: DraftService;
  readonly attachments: DraftAttachmentService;
  readonly draftSender: DraftSender;
  readonly sending: SendService;
  readonly scheduled: ScheduledSendService;
  readonly clock: Clock;
}

export class ComposeService {
  constructor(private readonly deps: ComposeServiceDeps) {}

  listDrafts(userId: UserId): Promise<Draft[]> {
    return this.deps.drafts.list(userId);
  }

  getDraft(userId: UserId, draftId: DraftId): Promise<Draft> {
    return this.deps.drafts.require(userId, draftId);
  }

  createDraft(userId: UserId, body: CreateDraftBody): Promise<Draft> {
    return this.deps.drafts.create(userId, body);
  }

  updateDraft(userId: UserId, draftId: DraftId, patch: UpdateDraftBody): Promise<Draft> {
    return this.deps.drafts.update(userId, draftId, patch);
  }

  deleteDraft(userId: UserId, draftId: DraftId): Promise<void> {
    return this.deps.drafts.delete(userId, draftId);
  }

  addDraftAttachment(
    userId: UserId,
    draftId: DraftId,
    upload: AttachmentUpload,
  ): Promise<DraftAttachmentAdded> {
    return this.deps.attachments.add(userId, draftId, upload);
  }

  removeDraftAttachment(
    userId: UserId,
    draftId: DraftId,
    attachmentId: AttachmentId,
  ): Promise<Draft> {
    return this.deps.attachments.remove(userId, draftId, attachmentId);
  }

  forwardAttachments(
    userId: UserId,
    draftId: DraftId,
    messageId: MessageId,
  ): Promise<DraftAttachmentsForwarded> {
    return this.deps.attachments.forward(userId, draftId, messageId);
  }

  listScheduled(userId: UserId): Promise<ScheduledSend[]> {
    return this.deps.scheduled.listPending(userId);
  }

  cancelScheduled(userId: UserId, scheduledSendId: ScheduledSendId): Promise<void> {
    return this.deps.scheduled.cancel(userId, scheduledSendId);
  }

  recoverStaleScheduled(): Promise<number> {
    return this.deps.scheduled.recoverStale();
  }

  sendDueScheduled(limit?: number): Promise<ScheduledSend[]> {
    return this.deps.scheduled.sendDue(limit);
  }

  async sendDraftWithHeaders(
    userId: UserId,
    draftId: DraftId,
    headers: OutgoingHeaders,
  ): Promise<void> {
    await this.deps.draftSender.send(userId, draftId, headers);
  }

  async send(userId: UserId, body: SendBody): Promise<SendResponse> {
    if (this.isFuture(body.scheduledAt)) {
      const draftId =
        body.source === 'draft'
          ? body.draftId
          : (await this.deps.drafts.create(userId, body.draft)).id;
      const scheduledSend = await this.deps.scheduled.schedule(userId, draftId, body.scheduledAt);
      return { status: 'scheduled', scheduledSend };
    }
    if (body.source === 'inline') {
      return { status: 'sent', ...(await this.deps.sending.sendNow(userId, body.draft)) };
    }
    return { status: 'sent', ...(await this.deps.draftSender.send(userId, body.draftId)) };
  }

  private isFuture(at: string | undefined): at is string {
    return at !== undefined && Date.parse(at) > this.deps.clock.now().getTime();
  }
}
