import type { MailAccount, UserId } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { InviteIngestor } from './invite-ingestor';
import { afterConflict, afterFailure, isDue } from './invite-retry';
import { StaleInviteError } from './invite-write';

export interface InviteWorkProcessorDeps {
  readonly pendingWork: PendingWorkRepository;
  readonly unitOfWork: UnitOfWork;
  readonly ingestor: InviteIngestor;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly logger: Logger;
}

type InviteWork = PendingWork<'calendar-invite'>;

export class InviteWorkProcessor {
  constructor(private readonly deps: InviteWorkProcessorDeps) {}

  async processDue(userId: UserId, account: MailAccount): Promise<void> {
    const now = this.deps.clock.now();
    const work = await this.deps.pendingWork.list(account.id, 'calendar-invite');
    let publish = false;
    for (const item of work.filter((entry) => isDue(entry.payload, now))) {
      const changed = await this.process(userId, account, item);
      publish = publish || (changed && item.payload.publish);
    }
    if (!publish) {
      return;
    }
    await this.deps.events.emit(userId, 'calendar.updated', {
      sourceKind: 'invite',
      sourceId: account.id,
    });
  }

  private async process(userId: UserId, account: MailAccount, item: InviteWork) {
    try {
      return await this.deps.unitOfWork.run(async (repositories) => {
        const changed = await this.deps.ingestor.apply(repositories, userId, {
          ...item.payload,
          account,
        });
        await repositories.pendingWork.remove([item]);
        return changed;
      });
    } catch (error) {
      await this.reschedule(item, error);
      return false;
    }
  }

  private async reschedule(item: InviteWork, cause: unknown): Promise<void> {
    const error = errorMessage(cause);
    const retry = cause instanceof StaleInviteError ? afterConflict : afterFailure;
    const payload = retry(item.payload, this.deps.clock.now(), error);
    this.deps.logger.warn('Calendar invitation could not be stored', {
      accountId: item.accountId,
      messageId: item.payload.messageId,
      attempts: payload.attempts,
      failed: payload.failedAt !== null,
      error,
    });
    await this.deps.pendingWork.replace(item, payload).catch((cause: unknown) => {
      this.deps.logger.warn('Calendar invitation retry could not be scheduled', {
        accountId: item.accountId,
        error: errorMessage(cause),
      });
    });
  }
}
