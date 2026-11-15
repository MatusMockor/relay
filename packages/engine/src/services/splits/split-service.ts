import type { ReplaceSplitsBody } from '@relay/shared/api';
import type { Split, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import type { SplitRepository } from '../../ports/split-repository';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import type { SplitMembershipEvaluator } from './split-membership-evaluator';
import { validateSplitRules } from './split-rule-validator';

export interface SplitServiceDeps {
  readonly splits: SplitRepository;
  readonly accounts: AccountRepository;
  readonly evaluator: SplitMembershipEvaluator;
  readonly events: EngineEvents;
  readonly ids: IdGenerator;
  readonly patterns: SplitPatternPolicy;
}

export class SplitService {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: SplitServiceDeps) {}

  list(userId: UserId): Promise<Split[]> {
    return this.deps.splits.listByUser(userId);
  }

  replace(userId: UserId, body: ReplaceSplitsBody): Promise<Split[]> {
    return this.serializer.run(userId, () => this.replaceNow(userId, body));
  }

  reevaluate(userId: UserId): Promise<number> {
    return this.serializer.run(userId, () => this.reevaluateNow(userId));
  }

  private async replaceNow(userId: UserId, body: ReplaceSplitsBody): Promise<Split[]> {
    validateSplitRules(body.splits, this.deps.patterns);
    await this.assertAccounts(userId, body);
    const knownIds = new Set((await this.deps.splits.listByUser(userId)).map((split) => split.id));
    const splits = body.splits.map((input): Split => {
      if (input.id !== undefined && !knownIds.has(input.id)) {
        throw new ValidationError(`Unknown split id ${input.id}`);
      }
      return { ...input, id: input.id ?? this.deps.ids.generate('split'), userId };
    });
    if (new Set(splits.map((split) => split.id)).size !== splits.length) {
      throw new ValidationError('Split ids must be unique');
    }
    const stored = await this.deps.splits.replaceAll(userId, splits);
    await this.deps.events.emit(userId, 'splits.updated', { splits: stored });
    await this.reevaluateNow(userId);
    return stored;
  }

  private async reevaluateNow(userId: UserId): Promise<number> {
    const accounts = await this.deps.accounts.listByUser(userId);
    let changed = 0;
    for (const account of accounts) {
      const threads = await this.deps.evaluator.evaluate(userId, account.id);
      for (const thread of threads) {
        await this.deps.events.emit(userId, 'thread.upserted', { thread });
      }
      changed += threads.length;
    }
    return changed;
  }

  private async assertAccounts(userId: UserId, body: ReplaceSplitsBody): Promise<void> {
    const accountIds = new Set(body.splits.flatMap((split) => split.accountId ?? []));
    for (const accountId of accountIds) {
      if ((await this.deps.accounts.findById(userId, accountId)) === null) {
        throw new NotFoundError('Account', accountId);
      }
    }
  }
}
