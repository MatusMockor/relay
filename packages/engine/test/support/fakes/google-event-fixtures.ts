import type { Address, CalendarAttendee, CalendarPartStat } from '@relay/shared/domain';
import type { RemoteGoogleCalendar, RemoteGoogleEvent } from '../../../src';

export interface RemoteEventInput {
  readonly remoteId: string;
  readonly uid?: string | null;
  readonly recurringRemoteId?: string | null;
  readonly recurrenceId?: string | null;
  readonly summary?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly allDay?: boolean;
  readonly status?: 'confirmed' | 'tentative' | 'cancelled';
  readonly location?: string | null;
  readonly organizer?: Address | null;
  readonly attendees?: readonly CalendarAttendee[];
  readonly myPartstat?: CalendarPartStat | null;
  readonly myEmail?: string | null;
  readonly recurring?: boolean;
}

export const remoteEvent = (input: RemoteEventInput): RemoteGoogleEvent => {
  const startsAt = input.startsAt ?? '2026-11-16T09:00:00.000Z';
  const endsAt = input.endsAt ?? '2026-11-16T10:00:00.000Z';
  const recurring = input.recurring ?? false;
  return {
    remoteId: input.remoteId,
    etag: '"pending"',
    uid: input.uid === undefined ? `${input.remoteId}@google.com` : input.uid,
    recurringRemoteId: input.recurringRemoteId ?? null,
    myPartstat: input.myPartstat ?? null,
    myEmail: input.myEmail ?? 'alice@example.com',
    data: {
      recurrenceId: input.recurrenceId ?? null,
      sequence: 0,
      dtstamp: '2026-11-15T07:00:00.000Z',
      status: input.status ?? 'confirmed',
      summary: input.summary ?? 'Google udalosť',
      location: input.location ?? null,
      description: null,
      organizer: input.organizer === undefined ? null : input.organizer,
      attendees: input.attendees ?? [],
      allDay: input.allDay ?? false,
      startsAt,
      endsAt,
      recurring,
      rangeEndsAt: recurring ? null : endsAt,
      ics: `ICS ${input.remoteId}`,
    },
  };
};

export const remoteCalendar = (
  overrides: Partial<RemoteGoogleCalendar> = {},
): RemoteGoogleCalendar => ({
  remoteId: 'alice@example.com',
  name: 'Alice',
  color: '#039BE5',
  primary: true,
  selected: true,
  accessRole: 'owner',
  timeZone: 'Europe/Bratislava',
  ...overrides,
});

export const googleCredentials = (scope: string) => ({
  kind: 'oauth' as const,
  provider: 'gmail' as const,
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: '2026-11-15T11:00:00.000Z',
  scope,
});

export const CALENDAR_SCOPE =
  'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
