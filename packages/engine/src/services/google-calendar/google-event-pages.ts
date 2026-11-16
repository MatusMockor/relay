import type {
  GoogleEventChange,
  GoogleEventListRequest,
  GoogleCalendarRecord,
} from '../../model/google-calendar';
import type { GoogleCalendarGateway } from '../../ports/google-calendar-adapters';
import { ProviderError } from '../../errors';
import { GOOGLE_MESSAGES } from './google-messages';

export const MAX_EVENT_PAGES = 200;

export type CollectedChanges =
  | { readonly kind: 'expired' }
  | {
      readonly kind: 'changes';
      readonly changes: readonly GoogleEventChange[];
      readonly syncToken: string | null;
    };

export interface CollectWindow {
  readonly syncToken: string | null;
  readonly timeMin: string | null;
}

export const collectChanges = async (
  gateway: GoogleCalendarGateway,
  calendar: GoogleCalendarRecord,
  window: CollectWindow,
): Promise<CollectedChanges> => {
  const changes: GoogleEventChange[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    const request: GoogleEventListRequest = {
      calendarRemoteId: calendar.remoteId,
      timeZone: calendar.timeZone,
      syncToken: window.syncToken,
      timeMin: window.timeMin,
      pageToken,
    };
    const result = await gateway.listEvents(calendar.connectionId, request);
    if (result.kind === 'expired') {
      return result;
    }
    changes.push(...result.changes);
    if (result.nextPageToken === null) {
      return { kind: 'changes', changes, syncToken: result.nextSyncToken };
    }
    pageToken = result.nextPageToken;
  }
  throw new ProviderError(GOOGLE_MESSAGES.tooManyPages);
};
