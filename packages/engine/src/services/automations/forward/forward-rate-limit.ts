import type { AccountId, UserId } from '@relay/shared/domain';
import type { AutomationActivityRepository } from '../../../ports/automation-activity-repository';
import type { Clock } from '../../../ports/clock';
import { AutomationActionRefusal } from '../automation-action-refusal';

export const MAX_FORWARDS_PER_HOUR = 20;
const HOUR_MS = 60 * 60_000;

export class ForwardRateLimit {
  constructor(
    private readonly activity: AutomationActivityRepository,
    private readonly clock: Clock,
  ) {}

  async assert(userId: UserId, accountId: AccountId): Promise<void> {
    const since = new Date(this.clock.now().getTime() - HOUR_MS).toISOString();
    const sent = await this.activity.countOkActionsSince(userId, accountId, 'forward', since);
    if (sent >= MAX_FORWARDS_PER_HOUR) {
      throw new AutomationActionRefusal(
        `Účet už za poslednú hodinu automaticky preposlal ${String(MAX_FORWARDS_PER_HOUR)} mailov, ďalšie preposlanie sa preskočilo`,
      );
    }
  }
}
