import type { DraftId, ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { ScheduledSendRepository } from '../../ports/scheduled-send-repository';
import type { EngineEvents } from '../shared/engine-events';
import type { DraftService } from './draft-service';
import type { ScheduledSendConfirmations } from './scheduled-send-confirmations';
import type { ScheduledSendDelivery } from './scheduled-send-delivery';

export interface ScheduledSendServiceDeps {
  readonly scheduledSends: ScheduledSendRepository;
  readonly drafts: DraftService;
  readonly delivery: ScheduledSendDelivery;
  readonly confirmations: ScheduledSendConfirmations;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export const DEFAULT_SCHEDULED_SEND_BATCH = 50;
export const SCHEDULED_SEND_LEASE_MS = 600_000;

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
    const scheduledSend = await this.create({
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
    const existing = await this.deps.scheduledSends.findById(userId, scheduledSendId);
    if (existing === null) {
      throw new NotFoundError('Scheduled send', scheduledSendId);
    }
    if (await this.deps.confirmations.isPending(existing)) {
      throw new ConflictError('Scheduled send was already delivered');
    }
    const cancelled = await this.deps.scheduledSends.cancel(
      userId,
      scheduledSendId,
      this.staleBefore(),
    );
    const current = await this.deps.scheduledSends.findById(userId, scheduledSendId);
    if (current === null) {
      throw new NotFoundError('Scheduled send', scheduledSendId);
    }
    if (!cancelled) {
      throw new ConflictError(`Scheduled send is already ${current.status}`);
    }
    await this.deps.events.emit(userId, 'scheduledSend.upserted', { scheduledSend: current });
  }

  async recoverStale(): Promise<number> {
    const unconfirmed = await this.deps.confirmations.replay();
    return this.deps.scheduledSends.releaseStaleSending(this.staleBefore(), unconfirmed);
  }

  async sendDue(limit = DEFAULT_SCHEDULED_SEND_BATCH): Promise<ScheduledSend[]> {
    await this.recoverStale();
    const due = await this.deps.scheduledSends.listDue(this.deps.clock.now().toISOString(), limit);
    const processed: ScheduledSend[] = [];
    for (const item of due) {
      const claimedAt = this.deps.clock.now().toISOString();
      if (!(await this.deps.scheduledSends.claim(item.id, claimedAt))) {
        continue;
      }
      await this.deps.delivery.deliver(item, claimedAt);
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

  private create(scheduledSend: ScheduledSend): Promise<ScheduledSend> {
    return this.deps.scheduledSends.create(scheduledSend).catch((error: unknown) => {
      if (error instanceof ConflictError) {
        throw new ConflictError('The draft already has a scheduled send', { cause: error });
      }
      throw error;
    });
  }

  private staleBefore(): string {
    return new Date(this.deps.clock.now().getTime() - SCHEDULED_SEND_LEASE_MS).toISOString();
  }
}
