import type { AccountId, MessageId } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';

export class MoveOriginProbe {
  constructor(private readonly pendingWork: PendingWorkRepository) {}

  async replacedSince(
    accountId: AccountId,
    messageIds: readonly MessageId[],
    recordedAt: string,
  ): Promise<boolean> {
    const thread = new Set<string>(messageIds);
    const origins = await this.pendingWork.list(accountId, 'move-origin');
    return origins.some(
      (origin) => thread.has(origin.ref) && Date.parse(origin.createdAt) > Date.parse(recordedAt),
    );
  }
}
