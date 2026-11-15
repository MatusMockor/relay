import type { DraftId, ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { ScheduledSendRepository } from '../../ports/scheduled-send-repository';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { DraftService } from './draft-service';
import type { SendService } from './send-service';

export interface ScheduledSendServiceDeps {
  readonly scheduledSends: ScheduledSendRepository;
  readonly drafts: DraftService;
  readonly sending: SendService;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export const DEFAULT_SCHEDULED_SEND_BATCH = 50;

export class ScheduledSendService {
  constructor(private readonly deps: ScheduledSendServiceDeps) {}

  listPending(userId: UserId): Promise<ScheduledSend[]> {
    return this.deps.scheduledSends.listPending(userId);
  }

  async schedule(userId: UserId, draftId: DraftId, at: string): Promise<ScheduledSend> {
    const now = this.deps.clock.now();
    if (Date.parse(at) <= now.getTime()) {
      throw new ValidationError('Scheduled time must be in the future');
    }
    const draft = await this.deps.drafts.require(userId, draftId);
    const scheduledSend = await this.deps.scheduledSends.create({
      id: this.deps.ids.generate('scheduledSend'),
      userId,
      accountId: draft.accountId,
      draftId,
      scheduledAt: new Date(Date.parse(at)).toISOString(),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: now.toISOString(),
    });
    await this.deps.events.emit(userId, 'scheduledSend.upserted', { scheduledSend });
    return scheduledSend;
  }

  async cancel(userId: UserId, scheduledSendId: ScheduledSendId): Promise<void> {
    const cancelled = await this.deps.scheduledSends.cancel(userId, scheduledSendId);
    const current = await this.deps.scheduledSends.findById(userId, scheduledSendId);
    if (current === null) {
      throw new NotFoundError('Scheduled send', scheduledSendId);
    }
    if (!cancelled) {
      throw new ConflictError(`Scheduled send is already ${current.status}`);
    }
    await this.deps.events.emit(userId, 'scheduledSend.upserted', { scheduledSend: current });
  }

  async sendDue(limit = DEFAULT_SCHEDULED_SEND_BATCH): Promise<ScheduledSend[]> {
    const due = await this.deps.scheduledSends.listDue(this.deps.clock.now().toISOString(), limit);
    const processed: ScheduledSend[] = [];
    for (const item of due) {
      if (!(await this.deps.scheduledSends.claim(item.id))) {
        continue;
      }
      await this.deliver(item);
      const current = await this.deps.scheduledSends.findById(item.userId, item.id);
      if (current !== null) {
        await this.deps.events.emit(item.userId, 'scheduledSend.upserted', {
          scheduledSend: current,
        });
        processed.push(current);
      }
    }
    return processed;
  }

  private async deliver(item: ScheduledSend): Promise<void> {
    try {
      const draft = await this.deps.drafts.require(item.userId, item.draftId);
      await this.deps.sending.sendNow(item.userId, draft, draft.id);
      await this.deps.scheduledSends.markSent(item.id, this.deps.clock.now().toISOString());
    } catch (error) {
      await this.deps.scheduledSends.markFailed(item.id, errorMessage(error));
    }
  }
}
