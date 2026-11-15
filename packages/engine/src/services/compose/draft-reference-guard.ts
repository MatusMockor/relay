import type { DraftContent, DraftId, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { DraftRepository } from '../../ports/draft-repository';
import type { ThreadRepository } from '../../ports/thread-repository';

export class DraftReferenceGuard {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly accounts: AccountRepository,
    private readonly threads: ThreadRepository,
  ) {}

  async assert(userId: UserId, draftId: DraftId | null, content: DraftContent): Promise<void> {
    await this.assertAccount(userId, content);
    await this.assertThread(userId, content);
    await this.assertAttachmentsUnshared(userId, draftId, content);
  }

  private async assertAccount(userId: UserId, content: DraftContent): Promise<void> {
    const account = await this.accounts.findById(userId, content.accountId);
    if (account === null) {
      throw new NotFoundError('Account', content.accountId);
    }
  }

  private async assertThread(userId: UserId, content: DraftContent): Promise<void> {
    if (content.inReplyToThreadId === null) {
      return;
    }
    const thread = await this.threads.findById(userId, content.inReplyToThreadId);
    if (thread === null) {
      throw new NotFoundError('Thread', content.inReplyToThreadId);
    }
  }

  private async assertAttachmentsUnshared(
    userId: UserId,
    draftId: DraftId | null,
    content: DraftContent,
  ): Promise<void> {
    if (content.attachments.length === 0) {
      return;
    }
    const ids = new Set(content.attachments.map((attachment) => attachment.id));
    const others = (await this.drafts.listByUser(userId)).filter((draft) => draft.id !== draftId);
    const shared = others.some((draft) =>
      draft.attachments.some((attachment) => ids.has(attachment.id)),
    );
    if (shared) {
      throw new ValidationError('An attachment is already used by another draft');
    }
  }
}
