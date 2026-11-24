import {
  AUTOMATION_PREVIEW_DAYS,
  AUTOMATION_PREVIEW_SAMPLES,
  type AutomationPreviewResponse,
  type AutomationPreviewSample,
} from '@relay/shared/api';
import type { AccountId, AutomationCriteria, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type {
  AutomationCandidateRepository,
  InboxCandidate,
} from '../../ports/automation-candidate-repository';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type {
  AutomationBacklogMatcher,
  BacklogMatch,
  JiraByMessage,
} from './automation-backlog-matcher';
import { BACKLOG_LIMIT } from './automation-backlog';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecentMatchesDeps {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly candidates: AutomationCandidateRepository;
  readonly matcher: AutomationBacklogMatcher;
  readonly clock: Clock;
}

export interface AccountMatches {
  readonly accountId: AccountId;
  readonly candidates: readonly InboxCandidate[];
  readonly matches: readonly BacklogMatch[];
}

export interface RecentMatchResult {
  readonly accounts: readonly AccountMatches[];
  readonly truncated: boolean;
}

const newestFirst = (left: BacklogMatch, right: BacklogMatch): number =>
  right.lastMessageAt.localeCompare(left.lastMessageAt);

export class RecentMatches {
  constructor(private readonly deps: RecentMatchesDeps) {}

  async collect(
    userId: UserId,
    accountId: AccountId | null,
    criteria: AutomationCriteria,
    jiraOf?: (candidates: readonly InboxCandidate[]) => JiraByMessage,
  ): Promise<RecentMatchResult> {
    const since = new Date(this.deps.clock.now().getTime() - AUTOMATION_PREVIEW_DAYS * DAY_MS);
    const query = { since: since.toISOString(), limit: BACKLOG_LIMIT };
    const accounts: AccountMatches[] = [];
    let truncated = false;
    for (const id of await this.accountIds(userId, accountId)) {
      const candidates = await this.deps.candidates.listRecent(id, query);
      truncated = truncated || candidates.length >= query.limit;
      const matches = await this.deps.matcher.match(
        userId,
        id,
        candidates,
        criteria,
        jiraOf?.(candidates),
      );
      accounts.push({ accountId: id, candidates, matches });
    }
    return { accounts, truncated };
  }

  async respond(userId: UserId, result: RecentMatchResult): Promise<AutomationPreviewResponse> {
    const sorted = result.accounts.flatMap((account) => account.matches).sort(newestFirst);
    return {
      days: AUTOMATION_PREVIEW_DAYS,
      count: sorted.length,
      truncated: result.truncated,
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
