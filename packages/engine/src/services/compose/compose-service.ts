import type {
  CreateDraftBody,
  SendBody,
  SendResponse,
  UpdateDraftBody,
  UploadAttachmentBody,
} from '@relay/shared/api';
import type {
  Draft,
  DraftAttachment,
  DraftId,
  ScheduledSend,
  ScheduledSendId,
  UserId,
} from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { DraftService } from './draft-service';
import type { ScheduledSendService } from './scheduled-send-service';
import type { SendService } from './send-service';

export interface ComposeServiceDeps {
  readonly drafts: DraftService;
  readonly sending: SendService;
  readonly scheduled: ScheduledSendService;
  readonly clock: Clock;
}

export class ComposeService {
  constructor(private readonly deps: ComposeServiceDeps) {}

  listDrafts(userId: UserId): Promise<Draft[]> {
    return this.deps.drafts.list(userId);
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

  uploadAttachment(userId: UserId, body: UploadAttachmentBody): Promise<DraftAttachment> {
    return this.deps.drafts.uploadAttachment(userId, body);
  }

  listScheduled(userId: UserId): Promise<ScheduledSend[]> {
    return this.deps.scheduled.listPending(userId);
  }

  cancelScheduled(userId: UserId, scheduledSendId: ScheduledSendId): Promise<void> {
    return this.deps.scheduled.cancel(userId, scheduledSendId);
  }

  sendDueScheduled(limit?: number): Promise<ScheduledSend[]> {
    return this.deps.scheduled.sendDue(limit);
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
      return { status: 'sent', ...(await this.deps.sending.sendNow(userId, body.draft, null)) };
    }
    const draft = await this.deps.drafts.require(userId, body.draftId);
    return { status: 'sent', ...(await this.deps.sending.sendNow(userId, draft, draft.id)) };
  }

  private isFuture(at: string | undefined): at is string {
    return at !== undefined && Date.parse(at) > this.deps.clock.now().getTime();
  }
}
