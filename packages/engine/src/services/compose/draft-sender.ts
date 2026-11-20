import type { DraftId, UserId } from '@relay/shared/domain';
import { ConflictError } from '../../errors';
import type { OutgoingHeaders } from '../../model/outgoing-message';
import type { Clock } from '../../ports/clock';
import type { DraftSendClaims } from './draft-send-claims';
import type { DraftService } from './draft-service';
import type { ScheduledSendConfirmations } from './scheduled-send-confirmations';
import type { SendLeases } from './send-leases';
import type { SendService, SentOutcome } from './send-service';
import type { SentDraftCleanup } from './sent-draft-cleanup';

export interface DraftSenderDeps {
  readonly drafts: DraftService;
  readonly claims: DraftSendClaims;
  readonly leases: SendLeases;
  readonly sending: SendService;
  readonly cleanup: SentDraftCleanup;
  readonly confirmations: ScheduledSendConfirmations;
  readonly clock: Clock;
}

export class DraftSender {
  constructor(private readonly deps: DraftSenderDeps) {}

  async send(
    userId: UserId,
    draftId: DraftId,
    headers: OutgoingHeaders = {},
  ): Promise<SentOutcome> {
    const claimedAt = this.deps.clock.now().toISOString();
    await this.deps.claims.claim(userId, draftId, claimedAt);
    try {
      if (await this.deps.confirmations.holdsDraft(userId, draftId)) {
        throw new ConflictError('The draft was already sent by its scheduled send');
      }
      const draft = await this.deps.drafts.require(userId, draftId);
      return await this.deps.leases.holdDraft(userId, draftId, claimedAt, async (lease) => {
        const outcome = await this.deps.sending.sendNow(userId, draft, lease, headers);
        await this.deps.cleanup.remove({ userId, draftId, updatedAt: draft.updatedAt, claimedAt });
        return outcome;
      });
    } catch (error) {
      await this.deps.claims.release(userId, draftId, claimedAt);
      throw error;
    }
  }
}
