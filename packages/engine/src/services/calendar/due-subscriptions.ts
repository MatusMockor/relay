import type { CalendarSubscriptionRepository } from '../../ports/calendar-subscription-repository';
import type { Clock } from '../../ports/clock';
import type { SubscriptionRefresher } from './subscription-refresher';

export const DEFAULT_FEED_REFRESH_SECONDS = 900;
const BATCH = 20;

export interface DueSubscriptionsDeps {
  readonly subscriptions: CalendarSubscriptionRepository;
  readonly refresher: SubscriptionRefresher;
  readonly clock: Clock;
  readonly refreshSeconds: number;
}

export class DueSubscriptions {
  constructor(private readonly deps: DueSubscriptionsDeps) {}

  async refreshDue(): Promise<number> {
    const cutoff = new Date(this.deps.clock.now().getTime() - this.deps.refreshSeconds * 1000);
    const due = await this.deps.subscriptions.listDue(cutoff.toISOString(), BATCH);
    for (const record of due) {
      await this.deps.refresher.refresh(record);
    }
    return due.length;
  }
}
