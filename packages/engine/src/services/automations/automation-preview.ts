import {
  AUTOMATION_PREVIEW_DAYS,
  AUTOMATION_PREVIEW_SAMPLES,
  type AutomationPreviewBody,
  type AutomationPreviewResponse,
  type AutomationPreviewSample,
} from '@relay/shared/api';
import type { AccountId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AutomationCandidateRepository } from '../../ports/automation-candidate-repository';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import { assertRulePatterns } from '../splits/split-rule-validator';
import type { AutomationBacklogMatcher, BacklogMatch } from './automation-backlog-matcher';
import { BACKLOG_LIMIT } from './automation-backlog';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AutomationPreviewDeps {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly candidates: AutomationCandidateRepository;
  readonly matcher: AutomationBacklogMatcher;
  readonly patterns: SplitPatternPolicy;
  readonly clock: Clock;
}

const newestFirst = (left: BacklogMatch, right: BacklogMatch): number =>
  right.lastMessageAt.localeCompare(left.lastMessageAt);

export class AutomationPreview {
  constructor(private readonly deps: AutomationPreviewDeps) {}

  async preview(userId: UserId, body: AutomationPreviewBody): Promise<AutomationPreviewResponse> {
    assertRulePatterns(
      { kind: 'Automation', name: 'preview', rules: [...body.conditions, ...body.exceptions] },
      this.deps.patterns,
    );
    const since = new Date(this.deps.clock.now().getTime() - AUTOMATION_PREVIEW_DAYS * DAY_MS);
    const query = { since: since.toISOString(), limit: BACKLOG_LIMIT };
    const matches: BacklogMatch[] = [];
    let truncated = false;
    for (const accountId of await this.accountIds(userId, body.accountId)) {
      const candidates = await this.deps.candidates.listRecent(accountId, query);
      truncated = truncated || candidates.length >= query.limit;
      matches.push(...(await this.deps.matcher.match(userId, accountId, candidates, body)));
    }
    const sorted = matches.sort(newestFirst);
    return {
      days: AUTOMATION_PREVIEW_DAYS,
      count: sorted.length,
      truncated,
      samples: await this.samplesOf(userId, sorted.slice(0, AUTOMATION_PREVIEW_SAMPLES)),
    };
  }

  private async samplesOf(
    userId: UserId,
    matches: readonly BacklogMatch[],
  ): Promise<AutomationPreviewSample[]> {
    const samples: AutomationPreviewSample[] = [];
    for (const match of matches) {
      const messageId = match.messageIds.at(-1);
      const message =
        messageId === undefined ? null : await this.deps.messages.findById(userId, messageId);
      if (message !== null) {
        samples.push({
          accountId: match.accountId,
          threadId: match.threadId,
          from: message.from,
          subject: message.subject,
          date: message.date,
        });
      }
    }
    return samples;
  }

  private async accountIds(userId: UserId, accountId: AccountId | null): Promise<AccountId[]> {
    if (accountId === null) {
      return (await this.deps.accounts.listByUser(userId)).map((account) => account.id);
    }
    if ((await this.deps.accounts.findById(userId, accountId)) === null) {
      throw new NotFoundError('Account', accountId);
    }
    return [accountId];
  }
}
