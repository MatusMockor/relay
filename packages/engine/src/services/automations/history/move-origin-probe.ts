import type { AccountId, MessageId, MoveOriginRef } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';

export type OriginOwnership = 'owned' | 'none' | 'foreign';

const keyOf = ({ messageId, revision }: MoveOriginRef): string => `${messageId}:${revision}`;

export class MoveOriginProbe {
  constructor(private readonly pendingWork: PendingWorkRepository) {}

  async ownership(
    accountId: AccountId,
    messageIds: readonly MessageId[],
    recorded: readonly MoveOriginRef[],
  ): Promise<OriginOwnership> {
    const thread = new Set<string>(messageIds);
    const current = (await this.pendingWork.list(accountId, 'move-origin')).filter((origin) =>
      thread.has(origin.ref),
    );
    if (current.length === 0) {
      return 'none';
    }
    const ours = new Set(recorded.map(keyOf));
    return current.every((origin) => ours.has(`${origin.ref}:${origin.revision}`))
      ? 'owned'
      : 'foreign';
  }
}
