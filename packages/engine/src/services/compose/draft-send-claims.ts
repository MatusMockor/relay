import type { DraftId, UserId } from '@relay/shared/domain';
import { ConflictError, NotFoundError } from '../../errors';
import type { DraftRepository } from '../../ports/draft-repository';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';

export const DRAFT_SEND_LEASE_MS = 600_000;

export class DraftSendClaims {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly logger: Logger,
  ) {}

  async claim(userId: UserId, draftId: DraftId, claimedAt: string): Promise<void> {
    const staleBefore = new Date(Date.parse(claimedAt) - DRAFT_SEND_LEASE_MS).toISOString();
    if (await this.drafts.claimForSend(userId, draftId, { claimedAt, staleBefore })) {
      return;
    }
    if ((await this.drafts.findById(userId, draftId)) === null) {
      throw new NotFoundError('Draft', draftId);
    }
    throw new ConflictError('The draft is already being sent');
  }

  async release(userId: UserId, draftId: DraftId, claimedAt: string): Promise<void> {
    await this.drafts.releaseSendClaim(userId, draftId, claimedAt).catch((error: unknown) => {
      this.logger.warn('Releasing a draft send claim failed', {
        draftId,
        error: errorMessage(error),
      });
    });
  }
}
