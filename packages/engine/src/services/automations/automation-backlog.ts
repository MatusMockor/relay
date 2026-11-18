import type { ApplyAutomationResponse } from '@relay/shared/api';
import {
  type AccountId,
  type Automation,
  MAIL_AUTOMATION_ACTION_TYPES,
  type UserId,
} from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AutomationRunRepository } from '../../ports/automation-run-repository';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { AutomationActionExecutor } from './automation-action-executor';
import type { AutomationBacklogMatcher, BacklogMatch } from './automation-backlog-matcher';

export const BACKLOG_LIMIT = 500;

export interface AutomationBacklogDeps {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly runs: AutomationRunRepository;
  readonly matcher: AutomationBacklogMatcher;
  readonly executor: AutomationActionExecutor;
  readonly clock: Clock;
}

const newestFirst = (left: BacklogMatch, right: BacklogMatch): number =>
  right.thread.lastMessageAt.localeCompare(left.thread.lastMessageAt);

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
      matches.push(...(await this.deps.matcher.inboxMatches(accountId, automation)));
    }
    let applied = 0;
    for (const match of matches.sort(newestFirst).slice(0, BACKLOG_LIMIT)) {
      if (await this.applyTo(userId, { ...automation, actions }, match)) {
        applied += 1;
      }
    }
    return { matched: matches.length, applied };
  }

  private async applyTo(
    userId: UserId,
    automation: Automation,
    { messageIds }: BacklogMatch,
  ): Promise<boolean> {
    const createdAt = this.deps.clock.now().toISOString();
    const claims: boolean[] = [];
    for (const messageId of messageIds) {
      claims.push(
        await this.deps.runs.claim({ userId, automationId: automation.id, messageId, createdAt }),
      );
    }
    const claimedId = messageIds.find((_messageId, index) => claims[index] === true);
    if (claimedId === undefined) {
      return false;
    }
    const message = await this.deps.messages.findById(userId, claimedId);
    if (message === null) {
      return false;
    }
    const headers =
      (await this.deps.messages.findHeaders(userId, claimedId)) ?? new Map<string, string[]>();
    await this.deps.executor.execute(
      { userId, automation, arrival: { message, headers, jira: null, live: false } },
      automation.actions,
    );
    return true;
  }

  private async accountIds(userId: UserId, automation: Automation): Promise<AccountId[]> {
    if (automation.accountId !== null) {
      return [automation.accountId];
    }
    return (await this.deps.accounts.listByUser(userId)).map((account) => account.id);
  }
}
