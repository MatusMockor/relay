import type { DraftId, UserId } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { DraftSendClaims } from './draft-send-claims';
import type { DraftService } from './draft-service';

export interface SentDraftRevision {
  readonly userId: UserId;
  readonly draftId: DraftId;
  readonly updatedAt: string;
  readonly claimedAt: string;
}

export type SentDraftRemoval = 'removed' | 'kept' | 'failed';

export class SentDraftCleanup {
  constructor(
    private readonly drafts: DraftService,
    private readonly claims: DraftSendClaims,
    private readonly logger: Logger,
  ) {}

  async remove(sent: SentDraftRevision): Promise<SentDraftRemoval> {
    try {
      if (await this.drafts.deleteSentRevision(sent.userId, sent.draftId, sent.updatedAt)) {
        return 'removed';
      }
    } catch (error) {
      this.logger.warn('Removing a sent draft failed', {
        draftId: sent.draftId,
        error: errorMessage(error),
      });
      return 'failed';
    }
    await this.keep(sent);
    return 'kept';
  }

  keep(sent: SentDraftRevision): Promise<void> {
    return this.claims.release(sent.userId, sent.draftId, sent.claimedAt);
  }
}
