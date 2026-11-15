import type { Draft, ScheduledSend } from '@relay/shared/domain';
import { ConflictError } from '../../errors';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { ScheduledSendRepository } from '../../ports/scheduled-send-repository';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { DraftSendClaims } from './draft-send-claims';
import type { DraftService } from './draft-service';
import type { ScheduledSendConfirmations } from './scheduled-send-confirmations';
import type { SendService } from './send-service';
import type { SentDraftCleanup } from './sent-draft-cleanup';

const COMPLETION_ATTEMPTS = 3;

type Completion = 'recorded' | 'lost' | 'unknown';

type SendOutcome =
  | { readonly kind: 'sent'; readonly draft: Draft }
  | { readonly kind: 'busy' }
  | { readonly kind: 'failed'; readonly error: string };

export interface ScheduledSendDeliveryDeps {
  readonly scheduledSends: ScheduledSendRepository;
  readonly drafts: DraftService;
  readonly claims: DraftSendClaims;
  readonly sending: SendService;
  readonly cleanup: SentDraftCleanup;
  readonly confirmations: ScheduledSendConfirmations;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class ScheduledSendDelivery {
  constructor(private readonly deps: ScheduledSendDeliveryDeps) {}

  async deliver(item: ScheduledSend, claimedAt: string): Promise<void> {
    const outcome = await this.send(item, claimedAt);
    if (outcome.kind === 'busy') {
      this.deps.logger.info('A scheduled send waits for another send of its draft', {
        scheduledSendId: item.id,
      });
      return;
    }
    if (outcome.kind === 'failed') {
      await this.recordFailure(item, outcome.error, claimedAt);
      return;
    }
    const sentAt = this.deps.clock.now().toISOString();
    const completion = await this.recordSent(item, sentAt, claimedAt);
    if (completion === 'unknown') {
      await this.deps.confirmations.defer(item, { draft: outcome.draft, sentAt, claimedAt });
      return;
    }
    const sent = {
      userId: item.userId,
      draftId: item.draftId,
      updatedAt: outcome.draft.updatedAt,
      claimedAt,
    };
    if (completion === 'lost') {
      await this.deps.cleanup.keep(sent);
      return;
    }
    if ((await this.deps.cleanup.remove(sent)) === 'failed') {
      await this.deps.confirmations.defer(item, { draft: outcome.draft, sentAt, claimedAt });
    }
  }

  private async send(item: ScheduledSend, claimedAt: string): Promise<SendOutcome> {
    try {
      await this.deps.claims.claim(item.userId, item.draftId, claimedAt);
    } catch (error) {
      if (error instanceof ConflictError) {
        return { kind: 'busy' };
      }
      return { kind: 'failed', error: errorMessage(error) };
    }
    try {
      const draft = await this.deps.drafts.require(item.userId, item.draftId);
      await this.deps.sending.sendNow(item.userId, draft);
      return { kind: 'sent', draft };
    } catch (error) {
      await this.deps.claims.release(item.userId, item.draftId, claimedAt);
      return { kind: 'failed', error: errorMessage(error) };
    }
  }

  private async recordSent(
    item: ScheduledSend,
    sentAt: string,
    claimedAt: string,
  ): Promise<Completion> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < COMPLETION_ATTEMPTS; attempt += 1) {
      try {
        if (await this.deps.scheduledSends.markSent(item.id, sentAt, claimedAt)) {
          return 'recorded';
        }
        return await this.alreadySettled(item);
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

  private async alreadySettled(item: ScheduledSend): Promise<Completion> {
    const current = await this.deps.scheduledSends.findById(item.userId, item.id);
    if (current?.status === 'sent') {
      return 'recorded';
    }
    this.lostClaim(item);
    return 'lost';
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
