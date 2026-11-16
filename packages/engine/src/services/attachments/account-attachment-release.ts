import type { AccountId, AttachmentId, UserId } from '@relay/shared/domain';
import type { DraftRepository } from '../../ports/draft-repository';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { AttachmentSweeper } from './attachment-sweeper';

export class AccountAttachmentRelease {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly sweeper: AttachmentSweeper,
    private readonly logger: Logger,
  ) {}

  async attachmentsOf(userId: UserId, accountId: AccountId): Promise<AttachmentId[]> {
    const drafts = await this.drafts.listByUser(userId);
    return drafts
      .filter((draft) => draft.accountId === accountId)
      .flatMap((draft) => draft.attachments.map((attachment) => attachment.id));
  }

  async release(accountId: AccountId, ids: readonly AttachmentId[]): Promise<void> {
    await this.sweeper.release(ids).catch((error: unknown) => {
      this.logger.warn('Removing attachments of a removed account failed', {
        accountId,
        error: errorMessage(error),
      });
    });
  }
}
