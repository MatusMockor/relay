import type { Draft, ScheduledSend } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { ScheduledSendRepository } from '../../ports/scheduled-send-repository';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { DraftService } from './draft-service';
import type { SendService } from './send-service';

const COMPLETION_ATTEMPTS = 3;

type Completion = 'recorded' | 'lost' | 'unknown';

type SendOutcome =
  | { readonly kind: 'sent'; readonly draft: Draft }
  | { readonly kind: 'failed'; readonly error: string };

export interface ScheduledSendDeliveryDeps {
  readonly scheduledSends: ScheduledSendRepository;
  readonly drafts: DraftService;
  readonly sending: SendService;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class ScheduledSendDelivery {
  constructor(private readonly deps: ScheduledSendDeliveryDeps) {}

  async deliver(item: ScheduledSend, claimedAt: string): Promise<void> {
    const outcome = await this.send(item);
    if (outcome.kind === 'failed') {
      await this.recordFailure(item, outcome.error, claimedAt);
      return;
    }
    if ((await this.recordSent(item, claimedAt)) === 'lost') {
      return;
    }
    await this.deps.drafts.deleteSent(item.userId, outcome.draft).catch((error: unknown) => {
      this.deps.logger.warn('Removing a sent draft failed', {
        draftId: outcome.draft.id,
        error: errorMessage(error),
      });
    });
  }

  private async send(item: ScheduledSend): Promise<SendOutcome> {
    try {
      const draft = await this.deps.drafts.require(item.userId, item.draftId);
      await this.deps.sending.sendNow(item.userId, draft, null);
      return { kind: 'sent', draft };
    } catch (error) {
      return { kind: 'failed', error: errorMessage(error) };
    }
  }

  private async recordSent(item: ScheduledSend, claimedAt: string): Promise<Completion> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < COMPLETION_ATTEMPTS; attempt += 1) {
      try {
        const sentAt = this.deps.clock.now().toISOString();
        if (await this.deps.scheduledSends.markSent(item.id, sentAt, claimedAt)) {
          return 'recorded';
        }
        this.lostClaim(item);
        return 'lost';
      } catch (error) {
        lastError = error;
      }
    }
    this.deps.logger.error('Recording a delivered scheduled send failed', {
      scheduledSendId: item.id,
      error: errorMessage(lastError),
    });
    return 'unknown';
  }

  private async recordFailure(
    item: ScheduledSend,
    failure: string,
    claimedAt: string,
  ): Promise<void> {
    try {
      if (!(await this.deps.scheduledSends.markFailed(item.id, failure, claimedAt))) {
        this.lostClaim(item);
      }
    } catch (error) {
      this.deps.logger.warn('Recording a failed scheduled send failed', {
        scheduledSendId: item.id,
        error: errorMessage(error),
      });
    }
  }

  private lostClaim(item: ScheduledSend): void {
    this.deps.logger.warn('A scheduled send was reclaimed or cancelled while it was sending', {
      scheduledSendId: item.id,
    });
  }
}
