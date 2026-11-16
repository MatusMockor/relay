import type { CalendarConnectionId, OAuthCredentials } from '@relay/shared/domain';
import {
  type GoogleAttendanceChange,
  type GoogleCalendarAdapters,
  type GoogleCalendarCredentials,
  type GoogleCalendarGateway,
  type GoogleCalendarSetupSource,
  type GoogleEventChange,
  type GoogleEventDraft,
  type GoogleEventListRequest,
  type GoogleEventListResult,
  type GoogleWriteResult,
  ReauthorizationRequiredError,
  type RemoteEventRef,
  type RemoteGoogleCalendar,
  type RemoteGoogleEvent,
} from '../../../src';
import { remoteEvent } from './google-event-fixtures';

interface LoggedChange {
  readonly seq: number;
  readonly calendarRemoteId: string;
  readonly change: GoogleEventChange;
}

export class FakeGoogleCalendarServer implements GoogleCalendarGateway {
  readonly calendars: RemoteGoogleCalendar[] = [];
  readonly events = new Map<string, Map<string, RemoteGoogleEvent>>();
  readonly requests: GoogleEventListRequest[] = [];
  readonly writes: string[] = [];
  readonly expiredTokens = new Set<string>();
  pageSize = 50;
  failWith: Error | null = null;
  beforeWrite: (() => Promise<void>) | null = null;
  afterWrite: (() => Promise<void>) | null = null;
  private log: LoggedChange[] = [];
  private seq = 0;

  put(calendarRemoteId: string, event: RemoteGoogleEvent): RemoteGoogleEvent {
    const stored = { ...event, etag: `"etag-${String(++this.seq)}"` };
    this.calendarEvents(calendarRemoteId).set(event.remoteId, stored);
    this.log.push({ seq: this.seq, calendarRemoteId, change: { kind: 'event', event: stored } });
    return stored;
  }

  cancel(calendarRemoteId: string, remoteId: string): void {
    this.calendarEvents(calendarRemoteId).delete(remoteId);
    this.log.push({
      seq: ++this.seq,
      calendarRemoteId,
      change: { kind: 'removed', remoteId, uid: null },
    });
  }

  expireTokens(): void {
    for (let seq = 0; seq <= this.seq; seq += 1) {
      this.expiredTokens.add(`sync-${String(seq)}`);
    }
  }

  listCalendars(): Promise<RemoteGoogleCalendar[]> {
    return this.guard(() => [...this.calendars]);
  }

  listEvents(
    _connectionId: CalendarConnectionId,
    request: GoogleEventListRequest,
  ): Promise<GoogleEventListResult> {
    this.requests.push(request);
    return this.guard(() => {
      if (request.syncToken !== null && this.expiredTokens.has(request.syncToken)) {
        return { kind: 'expired' };
      }
      const changes = this.changesFor(request);
      const offset = request.pageToken === null ? 0 : Number(request.pageToken);
      const next = offset + this.pageSize;
      const more = next < changes.length;
      return {
        kind: 'page',
        changes: changes.slice(offset, next),
        nextPageToken: more ? String(next) : null,
        nextSyncToken: more ? null : `sync-${String(this.seq)}`,
      };
    });
  }

  getEvent(ref: RemoteEventRef): Promise<RemoteGoogleEvent | null> {
    return this.guard(() => this.calendarEvents(ref.calendarRemoteId).get(ref.remoteId) ?? null);
  }

  setAttendance(
    ref: RemoteEventRef,
    change: GoogleAttendanceChange,
  ): Promise<GoogleWriteResult<RemoteGoogleEvent>> {
    return this.written(() => {
      this.writes.push(`rsvp ${ref.remoteId} ${change.response}`);
      const current = this.calendarEvents(ref.calendarRemoteId).get(ref.remoteId);
      if (current === undefined) {
        return { kind: 'gone' };
      }
      if (current.etag !== change.etag) {
        return { kind: 'conflict' };
      }
      const attendees = current.data.attendees.map((attendee) =>
        attendee.email === change.attendeeEmail
          ? { ...attendee, partstat: change.response }
          : attendee,
      );
      const value = this.put(ref.calendarRemoteId, {
        ...current,
        myPartstat: change.response,
        data: { ...current.data, attendees },
      });
      return { kind: 'ok', value };
    });
  }

  insertEvent(
    _connectionId: CalendarConnectionId,
    calendarRemoteId: string,
    draft: GoogleEventDraft,
  ): Promise<RemoteGoogleEvent> {
    return this.written(() => {
      this.writes.push(`insert ${draft.title}`);
      const remoteId = `created-${String(this.seq + 1)}`;
      return this.put(
        calendarRemoteId,
        remoteEvent({
          remoteId,
          uid: `${remoteId}@google.com`,
          summary: draft.title,
          startsAt: draft.start,
          endsAt: draft.end,
          allDay: draft.allDay,
          location: draft.location,
          organizer: { name: null, email: 'alice@example.com' },
          myEmail: 'alice@example.com',
        }),
      );
    });
  }

  deleteEvent(ref: RemoteEventRef, etag: string): Promise<GoogleWriteResult<null>> {
    return this.guard(() => {
      this.writes.push(`delete ${ref.remoteId}`);
      const current = this.calendarEvents(ref.calendarRemoteId).get(ref.remoteId);
      if (current === undefined) {
        return { kind: 'gone' };
      }
      if (current.etag !== etag) {
        return { kind: 'conflict' };
      }
      this.cancel(ref.calendarRemoteId, ref.remoteId);
      return { kind: 'ok', value: null };
    });
  }

  private changesFor(request: GoogleEventListRequest): GoogleEventChange[] {
    const since = request.syncToken === null ? null : Number(request.syncToken.split('-')[1]);
    if (since === null) {
      return [...this.calendarEvents(request.calendarRemoteId).values()].map((event) => ({
        kind: 'event' as const,
        event,
      }));
    }
    return this.log
      .filter((entry) => entry.calendarRemoteId === request.calendarRemoteId && entry.seq > since)
      .map((entry) => entry.change);
  }

  private calendarEvents(calendarRemoteId: string): Map<string, RemoteGoogleEvent> {
    const existing = this.events.get(calendarRemoteId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, RemoteGoogleEvent>();
    this.events.set(calendarRemoteId, created);
    return created;
  }

  private async written<Result>(work: () => Result): Promise<Result> {
    const before = this.beforeWrite;
    this.beforeWrite = null;
    await before?.();
    const result = await this.guard(work);
    const after = this.afterWrite;
    this.afterWrite = null;
    await after?.();
    return result;
  }

  private guard<Result>(work: () => Result): Promise<Result> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve(work());
  }
}

export class MemoryGoogleCredentials implements GoogleCalendarCredentials {
  readonly stored = new Map<CalendarConnectionId, OAuthCredentials>();

  set(connectionId: CalendarConnectionId, credentials: OAuthCredentials): Promise<void> {
    this.stored.set(connectionId, credentials);
    return Promise.resolve();
  }

  delete(connectionId: CalendarConnectionId): Promise<void> {
    this.stored.delete(connectionId);
    return Promise.resolve();
  }
}

export class FixedGoogleSetup implements GoogleCalendarSetupSource {
  configured = true;

  setup() {
    return Promise.resolve({
      configured: this.configured,
      setupHint: this.configured ? null : 'Chýba Google client ID.',
    });
  }
}

export interface GoogleCalendarFakes extends GoogleCalendarAdapters {
  readonly gateway: FakeGoogleCalendarServer;
  readonly credentials: MemoryGoogleCredentials;
  readonly setup: FixedGoogleSetup;
}

export const createGoogleCalendarFakes = (): GoogleCalendarFakes => ({
  gateway: new FakeGoogleCalendarServer(),
  credentials: new MemoryGoogleCredentials(),
  setup: new FixedGoogleSetup(),
});

export const reauthorizationError = (): Error =>
  new ReauthorizationRequiredError('Google rejected the refresh token');
