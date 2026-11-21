import type { SplitOverlap, SplitOverlapKind, SplitPreviewBody } from '@relay/shared/api';
import {
  type AccountId,
  type Automation,
  type AutomationCriteria,
  type Split,
  splitCriteria,
  type UserId,
} from '@relay/shared/domain';
import type { InboxCandidate } from '../../ports/automation-candidate-repository';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { SplitRepository } from '../../ports/split-repository';
import {
  type AutomationBacklogMatcher,
  type JiraByMessage,
  usesJira,
} from '../automations/automation-backlog-matcher';
import type { AccountMatches } from '../automations/recent-matches';
import { threadJiraOf } from './thread-jira';

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

interface AccountJira {
  readonly thread: JiraByMessage;
  message: JiraByMessage | null;
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

const matchedCandidates = (account: AccountMatches): InboxCandidate[] => {
  const matched = new Set(account.matches.map((match) => match.threadId));
  return account.candidates.filter((candidate) => matched.has(candidate.threadId));
};

export class SplitOverlapFinder {
  constructor(private readonly deps: SplitOverlapDeps) {}

  async find(
    userId: UserId,
    body: SplitPreviewBody,
    accounts: readonly AccountMatches[],
  ): Promise<SplitOverlap[]> {
    const rivals = await this.rivals(userId, body);
    const counts = new Map(rivals.map((rival) => [rival, 0]));
    for (const account of accounts.filter((item) => item.matches.length > 0)) {
      const candidates = matchedCandidates(account);
      const jira: AccountJira = { thread: threadJiraOf(candidates), message: null };
      for (const rival of rivals) {
        if (rival.accountId !== null && rival.accountId !== account.accountId) {
          continue;
        }
        const known = await this.jiraFor(userId, rival, candidates, jira);
        const caught = await this.deps.matcher.match(
          userId,
          account.accountId,
          candidates,
          rival.criteria,
          known,
        );
        counts.set(rival, (counts.get(rival) ?? 0) + caught.length);
      }
    }
    return rivals.flatMap((rival) => {
      const count = counts.get(rival) ?? 0;
      return count === 0 ? [] : [{ kind: rival.kind, id: rival.id, name: rival.name, count }];
    });
  }

  private async jiraFor(
    userId: UserId,
    rival: OverlapRival,
    candidates: readonly InboxCandidate[],
    jira: AccountJira,
  ): Promise<JiraByMessage> {
    if (rival.kind === 'split' || !usesJira(rival.criteria)) {
      return jira.thread;
    }
    jira.message ??= await this.deps.matcher.jiraOf(userId, candidates);
    return jira.message;
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
}
