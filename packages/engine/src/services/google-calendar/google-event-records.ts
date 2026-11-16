import type { UserId } from '@relay/shared/domain';
import type {
  GoogleCalendarRecord,
  GoogleEventRecord,
  RemoteGoogleEvent,
} from '../../model/google-calendar';
import type { IdGenerator } from '../../ports/id-generator';

export type KnownEventLookup = (remoteId: string) => Promise<GoogleEventRecord | null>;

export interface GoogleRecordContext {
  readonly userId: UserId;
  readonly calendar: GoogleCalendarRecord;
  readonly now: string;
  readonly known: KnownEventLookup;
}

const uidOf = async (
  event: RemoteGoogleEvent,
  existing: GoogleEventRecord | null,
  known: KnownEventLookup,
): Promise<string | null> => {
  if (event.uid !== null) {
    return event.uid;
  }
  if (existing !== null) {
    return existing.event.uid;
  }
  if (event.recurringRemoteId === null) {
    return null;
  }
  return (await known(event.recurringRemoteId))?.event.uid ?? null;
};

export const buildGoogleRecord = async (
  ids: IdGenerator,
  context: GoogleRecordContext,
  event: RemoteGoogleEvent,
): Promise<GoogleEventRecord | null> => {
  const existing = await context.known(event.remoteId);
  const uid = await uidOf(event, existing, context.known);
  if (uid === null) {
    return null;
  }
  return {
    calendarId: context.calendar.id,
    remoteId: event.remoteId,
    etag: event.etag,
    event: {
      ...event.data,
      uid,
      id: existing?.event.id ?? ids.generate('calendarEvent'),
      userId: context.userId,
      source: { kind: 'google', calendarId: context.calendar.id },
      method: null,
      myPartstat: event.myPartstat,
      myEmail: event.myEmail,
      messageId: null,
      threadId: null,
      createdAt: existing?.event.createdAt ?? context.now,
      updatedAt: context.now,
      revision: existing?.event.revision ?? 0,
    },
  };
};
