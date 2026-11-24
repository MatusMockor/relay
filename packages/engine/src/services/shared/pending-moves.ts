import {
  type AccountId,
  type MailboxId,
  type MailboxRole,
  type MailboxRoleOf,
  type Message,
  type MessageId,
  type MessagePlacement,
  isPlacedIn,
  primaryPlacement,
} from '@relay/shared/domain';
import type { ProviderOpWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { holdsMoveTarget } from './move-target-held';
import { placementKey } from './placement-key';

export interface PendingMove {
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
}

interface SourcedMove {
  readonly source: MailboxId;
  readonly move: PendingMove;
}

export class PendingMoves {
  private constructor(
    private readonly sourced: ReadonlyMap<string, PendingMove>,
    private readonly legacy: ReadonlyMap<MessageId, PendingMove>,
    private readonly sources: ReadonlyMap<MessageId, readonly SourcedMove[]>,
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
    const sources = new Map<MessageId, SourcedMove[]>();
    for (const { messageId, change, source } of ops) {
      if (change.kind !== 'move') {
        continue;
      }
      if (source === undefined) {
        legacy.set(messageId, change);
        continue;
      }
      sourced.set(placementKey(messageId, source.mailboxId), change);
      sources.set(messageId, [
        ...(sources.get(messageId) ?? []),
        { source: source.mailboxId, move: change },
      ]);
    }
    return new PendingMoves(sourced, legacy, sources);
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
    const unplaced = this.legacy.get(message.id) ?? this.orphanOf(message, roleOf);
    if (unplaced === undefined) {
      return undefined;
    }
    const primary = primaryPlacement(message, roleOf);
    return primary.mailboxId === placement.mailboxId ? unplaced : undefined;
  }

  private orphanOf(message: Message, roleOf: MailboxRoleOf): PendingMove | undefined {
    const orphan = (this.sources.get(message.id) ?? []).find(
      ({ source, move }) => !isPlacedIn(message, source) && !holdsMoveTarget(message, move, roleOf),
    );
    return orphan?.move;
  }
}
