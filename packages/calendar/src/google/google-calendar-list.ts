import type { RemoteGoogleCalendar } from '@relay/engine';
import { ProviderError } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import type { z } from 'zod';
import type { GoogleApiClient, GoogleApiOutcome } from './google-api-client';
import { GoogleCalendarListSchema } from './google-api-schemas';

type ListOutcome = GoogleApiOutcome<z.output<typeof GoogleCalendarListSchema>>;

const MAX_PAGES = 20;

export const listGoogleCalendars = async (
  api: GoogleApiClient,
  connectionId: CalendarConnectionId,
): Promise<RemoteGoogleCalendar[]> => {
  const calendars: RemoteGoogleCalendar[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const outcome: ListOutcome = await api.send(
      connectionId,
      {
        method: 'GET',
        path: ['users', 'me', 'calendarList'],
        query: { maxResults: '250', pageToken },
      },
      GoogleCalendarListSchema,
    );
    if (outcome.kind === 'status') {
      throw new ProviderError('Zoznam Google kalendárov nie je dostupný.');
    }
    for (const entry of outcome.value.items.filter((item) => item.deleted !== true)) {
      calendars.push({
        remoteId: entry.id,
        name: entry.summaryOverride ?? entry.summary ?? entry.id,
        color: entry.backgroundColor ?? null,
        primary: entry.primary === true,
        selected: entry.selected === true,
        accessRole: entry.accessRole,
        timeZone: entry.timeZone ?? null,
      });
    }
    if (outcome.value.nextPageToken === undefined) {
      return calendars;
    }
    pageToken = outcome.value.nextPageToken;
  }
  throw new ProviderError('Google vrátil priveľa stránok kalendárov.');
};
