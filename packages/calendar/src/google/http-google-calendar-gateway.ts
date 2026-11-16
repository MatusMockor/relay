import type {
  CalendarParser,
  GoogleAttendanceChange,
  GoogleCalendarGateway,
  GoogleEventDraft,
  GoogleEventListRequest,
  GoogleEventListResult,
  GoogleWriteResult,
  RemoteEventRef,
  RemoteGoogleCalendar,
  RemoteGoogleEvent,
} from '@relay/engine';
import { ProviderError, ValidationError } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import { z } from 'zod';
import {
  GoogleApiClient,
  type GoogleApiClientOptions,
  type GoogleApiOutcome,
} from './google-api-client';
import { type GoogleEvent, GoogleEventListSchema, GoogleEventSchema } from './google-api-schemas';
import { listGoogleCalendars } from './google-calendar-list';
import { insertBody, withResponse } from './google-event-body';
import { GoogleEventMapper } from './google-event-mapper';

const PAGE_SIZE = '250';
const eventPath = (ref: RemoteEventRef) => [
  'calendars',
  ref.calendarRemoteId,
  'events',
  ref.remoteId,
];

export class HttpGoogleCalendarGateway implements GoogleCalendarGateway {
  private readonly api: GoogleApiClient;
  private readonly mapper: GoogleEventMapper;

  constructor(options: GoogleApiClientOptions & { readonly parser: CalendarParser }) {
    this.api = new GoogleApiClient(options);
    this.mapper = new GoogleEventMapper(options.parser);
  }

  listCalendars(connectionId: CalendarConnectionId): Promise<RemoteGoogleCalendar[]> {
    return listGoogleCalendars(this.api, connectionId);
  }

  async listEvents(
    connectionId: CalendarConnectionId,
    request: GoogleEventListRequest,
  ): Promise<GoogleEventListResult> {
    const outcome = await this.api.send(
      connectionId,
      {
        method: 'GET',
        path: ['calendars', request.calendarRemoteId, 'events'],
        query: {
          maxResults: PAGE_SIZE,
          singleEvents: 'false',
          showDeleted: 'true',
          syncToken: request.syncToken,
          timeMin: request.syncToken === null ? request.timeMin : null,
          pageToken: request.pageToken,
        },
      },
      GoogleEventListSchema,
    );
    if (outcome.kind === 'status' && outcome.status === 410) {
      return { kind: 'expired' };
    }
    if (outcome.kind === 'status') {
      throw new ProviderError(`Google kalendár ${request.calendarRemoteId} nie je dostupný.`);
    }
    const zone = request.timeZone ?? outcome.value.timeZone ?? null;
    return {
      kind: 'page',
      changes: outcome.value.items.flatMap((item) => this.mapper.change(item, zone) ?? []),
      nextPageToken: outcome.value.nextPageToken ?? null,
      nextSyncToken: outcome.value.nextSyncToken ?? null,
    };
  }

  async getEvent(ref: RemoteEventRef, timeZone: string | null): Promise<RemoteGoogleEvent | null> {
    const outcome = await this.api.send(
      ref.connectionId,
      { method: 'GET', path: eventPath(ref) },
      GoogleEventSchema,
    );
    if (outcome.kind === 'status' || outcome.value.status === 'cancelled') {
      return null;
    }
    return this.mapper.event(outcome.value, timeZone);
  }

  async setAttendance(
    ref: RemoteEventRef,
    change: GoogleAttendanceChange,
    timeZone: string | null,
  ): Promise<GoogleWriteResult<RemoteGoogleEvent>> {
    const current = await this.api.send(
      ref.connectionId,
      { method: 'GET', path: eventPath(ref) },
      GoogleEventSchema,
    );
    if (current.kind === 'status' || current.value.status === 'cancelled') {
      return { kind: 'gone' };
    }
    if (current.value.etag !== change.etag) {
      return { kind: 'conflict' };
    }
    const attendees = withResponse(
      current.value.attendees ?? [],
      change.attendeeEmail,
      change.response,
    );
    if (attendees === null) {
      throw new ValidationError('Na túto udalosť nemôžeš odpovedať.');
    }
    const patched = await this.api.send(
      ref.connectionId,
      {
        method: 'PATCH',
        path: eventPath(ref),
        query: { sendUpdates: 'all' },
        body: { attendees },
        ifMatch: change.etag,
      },
      GoogleEventSchema,
    );
    return this.written(patched, timeZone);
  }

  async insertEvent(
    connectionId: CalendarConnectionId,
    calendarRemoteId: string,
    draft: GoogleEventDraft,
  ): Promise<RemoteGoogleEvent> {
    const created = await this.api.send(
      connectionId,
      {
        method: 'POST',
        path: ['calendars', calendarRemoteId, 'events'],
        query: { sendUpdates: draft.attendees.length === 0 ? 'none' : 'all' },
        body: insertBody(draft),
      },
      GoogleEventSchema,
    );
    const event = created.kind === 'ok' ? this.mapper.event(created.value, draft.timeZone) : null;
    if (event === null) {
      throw new ProviderError('Google kalendár udalosť nevytvoril.');
    }
    return event;
  }

  async deleteEvent(ref: RemoteEventRef, etag: string): Promise<GoogleWriteResult<null>> {
    const outcome = await this.api.send(
      ref.connectionId,
      { method: 'DELETE', path: eventPath(ref), query: { sendUpdates: 'all' }, ifMatch: etag },
      z.null(),
    );
    if (outcome.kind === 'ok') {
      return { kind: 'ok', value: null };
    }
    return outcome.status === 412 ? { kind: 'conflict' } : { kind: 'gone' };
  }

  private written(
    outcome: GoogleApiOutcome<GoogleEvent>,
    timeZone: string | null,
  ): GoogleWriteResult<RemoteGoogleEvent> {
    if (outcome.kind === 'status') {
      return outcome.status === 412 ? { kind: 'conflict' } : { kind: 'gone' };
    }
    const event = this.mapper.event(outcome.value, timeZone);
    if (event === null) {
      throw new ProviderError('Google kalendár vrátil neplatnú udalosť.');
    }
    return { kind: 'ok', value: event };
  }
}
