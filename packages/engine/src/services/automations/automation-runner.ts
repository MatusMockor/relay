import type { Automation, UserId } from '@relay/shared/domain';
import type { AutomationMatcher } from '../../ports/automation-matcher';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { AutomationRunRepository } from '../../ports/automation-run-repository';
import type { Clock } from '../../ports/clock';
import { matchSubjectOf } from '../../subjects/match-subject';
import type { InboxArrival, SyncArrivalBatch, SyncArrivalListener } from '../sync/sync-arrivals';
import type { AutomationActionExecutor } from './automation-action-executor';
import { appliesToAccount } from './automation-presets';

export interface AutomationRunnerDeps {
  readonly automations: AutomationRepository;
  readonly runs: AutomationRunRepository;
  readonly matcher: AutomationMatcher;
  readonly executor: AutomationActionExecutor;
  readonly clock: Clock;
}

export class AutomationRunner implements SyncArrivalListener {
  constructor(private readonly deps: AutomationRunnerDeps) {}

  async onArrivals({ userId, account, arrivals }: SyncArrivalBatch): Promise<void> {
    if (account.lastSyncedAt === null) {
      return;
    }
    const live = arrivals.filter((arrival) => arrival.live);
    if (live.length === 0) {
      return;
    }
    const automations = (await this.deps.automations.listByUser(userId))
      .filter((automation) => automation.enabled && appliesToAccount(automation, account.id))
      .sort((left, right) => left.order - right.order);
    for (const arrival of live) {
      for (const automation of automations) {
        await this.apply(userId, automation, arrival);
      }
    }
  }

  private async apply(
    userId: UserId,
    automation: Automation,
    arrival: InboxArrival,
  ): Promise<void> {
    const { message } = arrival;
    const matches = await this.deps.matcher.matches({
      message: matchSubjectOf(message, arrival.headers),
      jira: arrival.jira,
      conditions: automation.conditions,
    });
    if (!matches) {
      return;
    }
    const claimed = await this.deps.runs.claim({
      userId,
      automationId: automation.id,
      messageId: message.id,
      createdAt: this.deps.clock.now().toISOString(),
    });
    if (!claimed) {
      return;
    }
    await this.deps.executor.execute({ userId, automation, arrival }, automation.actions);
  }
}
