import type { Automation, UserId } from '@relay/shared/domain';
import type { AutomationMatcher } from '../../ports/automation-matcher';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { AutomationRunRepository } from '../../ports/automation-run-repository';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { InboxArrival, SyncArrivalBatch, SyncArrivalListener } from '../sync/sync-arrivals';
import { ACTION_ORDER, type AutomationActionHandlers } from './automation-action';
import { appliesToAccount } from './automation-presets';

export interface AutomationRunnerDeps {
  readonly automations: AutomationRepository;
  readonly runs: AutomationRunRepository;
  readonly matcher: AutomationMatcher;
  readonly handlers: AutomationActionHandlers;
  readonly clock: Clock;
  readonly logger: Logger;
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
      message: { from: message.from, subject: message.subject, headers: arrival.headers },
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
    for (const action of ACTION_ORDER.filter((item) => automation.actions.includes(item))) {
      await this.deps.handlers[action]
        .run({ userId, automation, arrival })
        .catch((error: unknown) => {
          this.deps.logger.warn('An automation action failed', {
            automationId: automation.id,
            action,
            messageId: message.id,
            error: errorMessage(error),
          });
        });
    }
  }
}
