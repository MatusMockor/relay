import {
  type AccountId,
  type MailboxId,
  type MailboxRole,
  type MailboxRoleOf,
  type Message,
  type MessageId,
  type MessagePlacement,
  primaryPlacement,
} from '@relay/shared/domain';
import type { ProviderOpWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { placementKey } from './placement-key';

export interface PendingMove {
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
}

export class PendingMoves {
  private constructor(
    private readonly sourced: ReadonlyMap<string, PendingMove>,
    private readonly legacy: ReadonlyMap<MessageId, PendingMove>,
  ) {}

  static async load(
    pendingWork: PendingWorkRepository,
    accountId: AccountId,
  ): Promise<PendingMoves> {
    const ops = await pendingWork.list(accountId, 'provider-op');
    return PendingMoves.of(ops.map((op) => op.payload));
  }

  private static of(ops: readonly ProviderOpWork[]): PendingMoves {
    const sourced = new Map<string, PendingMove>();
    const legacy = new Map<MessageId, PendingMove>();
    for (const { messageId, change, source } of ops) {
      if (change.kind !== 'move') {
        continue;
      }
      if (source === undefined) {
        legacy.set(messageId, change);
        continue;
      }
      sourced.set(placementKey(messageId, source.mailboxId), change);
    }
    return new PendingMoves(sourced, legacy);
  }

  targetOf(
    message: Message,
    placement: MessagePlacement,
    roleOf: MailboxRoleOf,
  ): PendingMove | undefined {
    const sourced = this.sourced.get(placementKey(message.id, placement.mailboxId));
    if (sourced !== undefined) {
      return sourced;
    }
    const legacy = this.legacy.get(message.id);
    if (legacy === undefined) {
      return undefined;
    }
    return primaryPlacement(message, roleOf).mailboxId === placement.mailboxId ? legacy : undefined;
  }
}
