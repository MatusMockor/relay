import type { SplitOverlap, SplitOverlapKind, SplitPreviewBody } from '@relay/shared/api';
import {
  type AccountId,
  type Automation,
  type AutomationCriteria,
  type Split,
  splitCriteria,
  type UserId,
} from '@relay/shared/domain';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { SplitRepository } from '../../ports/split-repository';
import type { AutomationBacklogMatcher } from '../automations/automation-backlog-matcher';
import type { AccountMatches } from '../automations/recent-matches';

const PLACING_ACTIONS: ReadonlySet<string> = new Set(['archive', 'moveTo']);

export interface OverlapRival {
  readonly kind: SplitOverlapKind;
  readonly id: string;
  readonly name: string;
  readonly accountId: AccountId | null;
  readonly criteria: AutomationCriteria;
}

export interface SplitOverlapDeps {
  readonly splits: SplitRepository;
  readonly automations: AutomationRepository;
  readonly matcher: AutomationBacklogMatcher;
}

const earlierSplits = (splits: readonly Split[], splitId: Split['id'] | null): Split[] => {
  const own = splits.find((split) => split.id === splitId);
  return splits.filter(
    (split) => split.id !== splitId && (own === undefined || split.order < own.order),
  );
};

const splitRival = (split: Split): OverlapRival => ({
  kind: 'split',
  id: split.id,
  name: split.name,
  accountId: split.accountId,
  criteria: splitCriteria(split),
});

const automationRival = (automation: Automation): OverlapRival => ({
  kind: 'automation',
  id: automation.id,
  name: automation.name,
  accountId: automation.accountId,
  criteria: automation,
});

const byOrder = <Item extends { readonly order: number }>(left: Item, right: Item): number =>
  left.order - right.order;

export class SplitOverlapFinder {
  constructor(private readonly deps: SplitOverlapDeps) {}

  async find(
    userId: UserId,
    body: SplitPreviewBody,
    accounts: readonly AccountMatches[],
  ): Promise<SplitOverlap[]> {
    const overlaps: SplitOverlap[] = [];
    for (const rival of await this.rivals(userId, body)) {
      const count = await this.count(userId, rival, accounts);
      if (count > 0) {
        overlaps.push({ kind: rival.kind, id: rival.id, name: rival.name, count });
      }
    }
    return overlaps;
  }

  private async rivals(userId: UserId, body: SplitPreviewBody): Promise<OverlapRival[]> {
    const splits = earlierSplits(await this.deps.splits.listByUser(userId), body.splitId);
    const automations = (await this.deps.automations.listByUser(userId)).filter(
      (automation) =>
        automation.enabled && automation.actions.some((action) => PLACING_ACTIONS.has(action.type)),
    );
    return [
      ...[...splits].sort(byOrder).map(splitRival),
      ...[...automations].sort(byOrder).map(automationRival),
    ];
  }

  private async count(
    userId: UserId,
    rival: OverlapRival,
    accounts: readonly AccountMatches[],
  ): Promise<number> {
    let count = 0;
    for (const account of accounts) {
      if (account.matches.length === 0) {
        continue;
      }
      if (rival.accountId !== null && rival.accountId !== account.accountId) {
        continue;
      }
      const matched = new Set(account.matches.map((match) => match.threadId));
      const candidates = account.candidates.filter((candidate) => matched.has(candidate.threadId));
      const caught = await this.deps.matcher.match(
        userId,
        account.accountId,
        candidates,
        rival.criteria,
      );
      count += caught.length;
    }
    return count;
  }
}
