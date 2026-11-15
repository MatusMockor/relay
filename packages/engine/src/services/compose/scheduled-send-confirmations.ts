import type { Draft, DraftId, ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import type {
  PendingWork,
  PendingWorkInput,
  ScheduledSendSentWork,
} from '../../model/pending-work';
import type { Logger } from '../../ports/logger';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { ScheduledSendRepository } from '../../ports/scheduled-send-repository';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { SentDraftCleanup } from './sent-draft-cleanup';

const KIND = 'scheduled-send-sent';

type Confirmation = PendingWorkInput<typeof KIND>;

export interface DeliveredScheduledSend {
  readonly draft: Draft;
  readonly sentAt: string;
  readonly claimedAt: string;
}

export interface ScheduledSendConfirmationsDeps {
  readonly scheduledSends: ScheduledSendRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly cleanup: SentDraftCleanup;
  readonly events: EngineEvents;
  readonly logger: Logger;
}

export class ScheduledSendConfirmations {
  private readonly unpersisted = new Map<ScheduledSendId, Confirmation>();

  constructor(private readonly deps: ScheduledSendConfirmationsDeps) {}

  async defer(item: ScheduledSend, delivered: DeliveredScheduledSend): Promise<void> {
    const confirmation: Confirmation = {
      accountId: item.accountId,
      kind: KIND,
      ref: item.id,
      payload: {
        scheduledSendId: item.id,
        userId: item.userId,
        draftId: delivered.draft.id,
        draftUpdatedAt: delivered.draft.updatedAt,
        sentAt: delivered.sentAt,
        claimedAt: delivered.claimedAt,
      },
      createdAt: delivered.sentAt,
    };
    if (!(await this.persist(confirmation))) {
      this.unpersisted.set(item.id, confirmation);
    }
  }

  async isPending(item: ScheduledSend): Promise<boolean> {
    if (this.unpersisted.has(item.id)) {
      return true;
    }
    const key = { accountId: item.accountId, kind: KIND, ref: item.id } as const;
    return (await this.deps.pendingWork.find(key)) !== null;
  }

  async holdsDraft(userId: UserId, draftId: DraftId): Promise<boolean> {
    const holds = (payload: ScheduledSendSentWork): boolean =>
      payload.userId === userId && payload.draftId === draftId;
    if ([...this.unpersisted.values()].some((confirmation) => holds(confirmation.payload))) {
      return true;
    }
    return (await this.deps.pendingWork.listByKind(KIND)).some((work) => holds(work.payload));
  }

  async replay(): Promise<ScheduledSendId[]> {
    for (const [id, confirmation] of [...this.unpersisted]) {
      if (await this.persist(confirmation)) {
        this.unpersisted.delete(id);
      }
    }
    const unconfirmed = [...this.unpersisted.keys()];
    for (const work of await this.deps.pendingWork.listByKind(KIND)) {
      if (!(await this.confirm(work))) {
        unconfirmed.push(work.payload.scheduledSendId);
      }
    }
    return unconfirmed;
  }

  private async confirm(work: PendingWork<typeof KIND>): Promise<boolean> {
    const { payload } = work;
    try {
      const current = await this.record(work);
      const sent = {
        userId: payload.userId,
        draftId: payload.draftId,
        updatedAt: payload.draftUpdatedAt,
        claimedAt: payload.claimedAt,
      };
      if (current?.status !== 'sent') {
        await this.deps.cleanup.keep(sent);
      }
      if (current?.status === 'sent' && (await this.deps.cleanup.remove(sent)) === 'failed') {
        return false;
      }
      await this.deps.pendingWork.remove([work]);
      if (current !== null) {
        await this.deps.events.emit(payload.userId, 'scheduledSend.upserted', {
          scheduledSend: current,
        });
      }
      return true;
    } catch (error) {
      this.deps.logger.warn('Confirming a delivered scheduled send failed', {
        scheduledSendId: payload.scheduledSendId,
        error: errorMessage(error),
      });
      return false;
    }
  }

  private async record(work: PendingWork<typeof KIND>): Promise<ScheduledSend | null> {
    const { payload } = work;
    await this.deps.scheduledSends.markSent(
      payload.scheduledSendId,
      payload.sentAt,
      payload.claimedAt,
    );
    return this.deps.scheduledSends.findById(payload.userId, payload.scheduledSendId);
  }

  private async persist(confirmation: Confirmation): Promise<boolean> {
    try {
      await this.deps.pendingWork.put(confirmation);
      return true;
    } catch (error) {
      this.deps.logger.error('Persisting a delivered scheduled send failed', {
        scheduledSendId: confirmation.ref,
        error: errorMessage(error),
      });
      return false;
    }
  }
}
