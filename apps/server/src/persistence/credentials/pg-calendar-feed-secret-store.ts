import type { CalendarSubscriptionId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { calendarSubscriptions } from '../schema';

export class PgCalendarFeedSecretStore {
  constructor(private readonly db: DbExecutor) {}

  async find(subscriptionId: CalendarSubscriptionId): Promise<string | null> {
    const [row] = await this.db
      .select({ envelope: calendarSubscriptions.urlEnvelope })
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.id, subscriptionId));
    return row?.envelope ?? null;
  }

  async save(subscriptionId: CalendarSubscriptionId, envelope: string | null): Promise<boolean> {
    const rows = await this.db
      .update(calendarSubscriptions)
      .set({ urlEnvelope: envelope })
      .where(eq(calendarSubscriptions.id, subscriptionId))
      .returning({ id: calendarSubscriptions.id });
    return rows.length > 0;
  }
}
