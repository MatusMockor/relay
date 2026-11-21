import {
  type ReplaceSplitsBody,
  type SplitPreviewBody,
  type SplitPreviewResponse,
  splitInputsOf,
} from '@relay/shared/api';
import type { Split, SplitEntry, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import type { SplitRepository } from '../../ports/split-repository';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import type { SplitMembershipEvaluator } from './split-membership-evaluator';
import type { SplitPreview } from './split-preview';
import { resolveSplits, withUnsupportedSplits } from './split-replacement';
import { validateSplitRules } from './split-rule-validator';

export interface SplitServiceDeps {
  readonly splits: SplitRepository;
  readonly accounts: AccountRepository;
  readonly evaluator: SplitMembershipEvaluator;
  readonly preview: SplitPreview;
  readonly events: EngineEvents;
  readonly ids: IdGenerator;
  readonly patterns: SplitPatternPolicy;
}

export class SplitService {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: SplitServiceDeps) {}

  async list(userId: UserId): Promise<SplitEntry[]> {
    return withUnsupportedSplits(
      await this.deps.splits.listByUser(userId),
      await this.deps.splits.listUnsupported(userId),
    );
  }

  replace(userId: UserId, body: ReplaceSplitsBody): Promise<SplitEntry[]> {
    return this.serializer.run(userId, () => this.replaceNow(userId, body));
  }

  preview(userId: UserId, body: SplitPreviewBody): Promise<SplitPreviewResponse> {
    return this.deps.preview.preview(userId, body);
  }

  reevaluate(userId: UserId): Promise<number> {
    return this.serializer.run(userId, () => this.reevaluateNow(userId));
  }

  private async replaceNow(userId: UserId, body: ReplaceSplitsBody): Promise<SplitEntry[]> {
    const inputs = splitInputsOf(body.splits);
    validateSplitRules(inputs, this.deps.patterns);
    await this.assertAccounts(userId, inputs);
    const current = await this.deps.splits.listByUser(userId);
    const { splits, keep } = resolveSplits(body.splits, {
      userId,
      known: new Map(current.map((split) => [split.id, split])),
      unsupported: await this.deps.splits.listUnsupported(userId),
      newId: () => this.deps.ids.generate('split'),
    });
    await this.deps.splits.replaceAll(userId, splits, keep);
    const stored = await this.list(userId);
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

  private async assertAccounts(
    userId: UserId,
    inputs: readonly { readonly accountId: Split['accountId'] }[],
  ): Promise<void> {
    const accountIds = new Set(inputs.flatMap((split) => split.accountId ?? []));
    for (const accountId of accountIds) {
      if ((await this.deps.accounts.findById(userId, accountId)) === null) {
        throw new NotFoundError('Account', accountId);
      }
    }
  }
}
