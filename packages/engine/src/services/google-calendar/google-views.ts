import type { GoogleCalendar, GoogleCalendarConnection } from '@relay/shared/domain';
import type { GoogleCalendarRecord, GoogleConnectionRecord } from '../../model/google-calendar';

export const toCalendarView = (record: GoogleCalendarRecord): GoogleCalendar => ({
  id: record.id,
  connectionId: record.connectionId,
  name: record.name,
  color: record.color,
  enabled: record.enabled,
  primary: record.primary,
  accessRole: record.accessRole,
  timeZone: record.timeZone,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: record.lastSyncedAt,
});

const byPrimaryThenName = (a: GoogleCalendarRecord, b: GoogleCalendarRecord): number =>
  Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, 'sk');

export const toConnectionView = (
  record: GoogleConnectionRecord,
  calendars: readonly GoogleCalendarRecord[],
): GoogleCalendarConnection => ({
  id: record.id,
  userId: record.userId,
  email: record.email,
  accountId: record.accountId,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: record.lastSyncedAt,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  calendars: [...calendars].sort(byPrimaryThenName).map(toCalendarView),
});
