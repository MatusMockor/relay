import type { ApplyAutomationResponse } from '@relay/shared/api';
import {
  type AccountId,
  type Automation,
  MAIL_AUTOMATION_ACTION_TYPES,
  type MessageId,
  type UserId,
} from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AutomationRunRepository } from '../../ports/automation-run-repository';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { AutomationActionExecutor } from './automation-action-executor';
import type { AutomationBacklogMatcher, BacklogMatch } from './automation-backlog-matcher';

export const BACKLOG_LIMIT = 500;

type Outcome = 'applied' | 'failed' | 'skipped';

export interface AutomationBacklogDeps {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly threads: ThreadRepository;
  readonly runs: AutomationRunRepository;
  readonly matcher: AutomationBacklogMatcher;
  readonly executor: AutomationActionExecutor;
  readonly clock: Clock;
}

const newestFirst = (left: BacklogMatch, right: BacklogMatch): number =>
  right.lastMessageAt.localeCompare(left.lastMessageAt);

export class AutomationBacklog {
  constructor(private readonly deps: AutomationBacklogDeps) {}

  async apply(userId: UserId, automation: Automation): Promise<ApplyAutomationResponse> {
    const actions = automation.actions.filter((action) =>
      MAIL_AUTOMATION_ACTION_TYPES.includes(action.type),
    );
    if (actions.length === 0) {
      throw new ValidationError(
        'Pravidlo nemá žiadnu akciu, ktorú by šlo použiť na existujúce maily',
      );
    }
    const matches: BacklogMatch[] = [];
    for (const accountId of await this.accountIds(userId, automation)) {
      matches.push(
        ...(await this.deps.matcher.inboxMatches(userId, accountId, automation, BACKLOG_LIMIT)),
      );
    }
    const selected = matches.sort(newestFirst).slice(0, BACKLOG_LIMIT);
    const outcomes: Outcome[] = [];
    for (const match of selected) {
      outcomes.push(await this.applyTo(userId, { ...automation, actions }, match));
    }
    return {
      matched: selected.length,
      applied: outcomes.filter((outcome) => outcome === 'applied').length,
      failed: outcomes.filter((outcome) => outcome === 'failed').length,
    };
  }

  private async applyTo(
    userId: UserId,
    automation: Automation,
    match: BacklogMatch,
  ): Promise<Outcome> {
    const thread = await this.deps.threads.findByIdForAccount(match.accountId, match.threadId);
    const gate = match.messageIds.at(-1);
    if (thread?.state !== 'inbox' || gate === undefined) {
      return 'skipped';
    }
    if (!(await this.claim(userId, automation, gate))) {
      return 'skipped';
    }
    const claimed = [gate];
    for (const messageId of match.messageIds.slice(0, -1)) {
      if (await this.claim(userId, automation, messageId)) {
        claimed.push(messageId);
      }
    }
    if (await this.execute(userId, automation, gate)) {
      return 'applied';
    }
    await this.deps.runs.release(automation.id, claimed);
    return 'failed';
  }

  private async execute(
    userId: UserId,
    automation: Automation,
    messageId: MessageId,
  ): Promise<boolean> {
    const message = await this.deps.messages.findById(userId, messageId);
    if (message === null) {
      return false;
    }
    const headers =
      (await this.deps.messages.findHeaders(userId, messageId)) ?? new Map<string, string[]>();
    const failed = await this.deps.executor.execute(
      { userId, automation, arrival: { message, headers, jira: null, live: false } },
      automation.actions,
    );
    return failed.length === 0;
  }

  private claim(userId: UserId, automation: Automation, messageId: MessageId): Promise<boolean> {
    return this.deps.runs.claim({
      userId,
      automationId: automation.id,
      messageId,
      createdAt: this.deps.clock.now().toISOString(),
    });
  }

  private async accountIds(userId: UserId, automation: Automation): Promise<AccountId[]> {
    if (automation.accountId !== null) {
      return [automation.accountId];
    }
    return (await this.deps.accounts.listByUser(userId)).map((account) => account.id);
  }
}
