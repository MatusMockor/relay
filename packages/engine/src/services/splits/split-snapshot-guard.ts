import type { AccountId, Split, UserId } from '@relay/shared/domain';
import type { SplitRepository } from '../../ports/split-repository';
import type { EngineEvents } from '../shared/engine-events';
import type { SplitMembershipEvaluator } from './split-membership-evaluator';

export interface SplitSnapshotGuardDeps {
  readonly splits: SplitRepository;
  readonly evaluator: SplitMembershipEvaluator;
  readonly events: EngineEvents;
}

export class SplitSnapshotGuard {
  constructor(private readonly deps: SplitSnapshotGuardDeps) {}

  async settle(userId: UserId, accountId: AccountId, snapshot: readonly Split[]): Promise<void> {
    const current = await this.deps.splits.listForAccount(userId, accountId);
    if (JSON.stringify(current) === JSON.stringify(snapshot)) {
      return;
    }
    for (const thread of await this.deps.evaluator.evaluate(userId, accountId)) {
      await this.deps.events.emit(userId, 'thread.upserted', { thread });
    }
  }
}
