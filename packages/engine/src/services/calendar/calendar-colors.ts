import type { UserId } from '@relay/shared/domain';
import type { CalendarSource } from '../../model/calendar';
import type { AccountRepository } from '../../ports/account-repository';
import type { CalendarSubscriptionRepository } from '../../ports/calendar-subscription-repository';
import type { GoogleCalendarRepository } from '../../ports/google-calendar-repositories';
import { sourceKey } from './calendar-source';

export const FALLBACK_CALENDAR_COLOR = '#8a8f98';

export type ColorLookup = (source: CalendarSource) => string;

export class CalendarColors {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly subscriptions: CalendarSubscriptionRepository,
    private readonly googleCalendars: GoogleCalendarRepository | null = null,
  ) {}

  async lookup(userId: UserId): Promise<ColorLookup> {
    const [accounts, subscriptions, googleCalendars] = await Promise.all([
      this.accounts.listByUser(userId),
      this.subscriptions.list(userId),
      this.googleCalendars?.listByUser(userId) ?? [],
    ]);
    const colors = new Map<string, string>([
      ...accounts.map((account): [string, string] => [account.id, account.color]),
      ...subscriptions.map((entry): [string, string] => [entry.id, entry.color]),
      ...googleCalendars.map((entry): [string, string] => [entry.id, entry.color]),
    ]);
    return (source) => colors.get(sourceKey(source)) ?? FALLBACK_CALENDAR_COLOR;
  }
}
