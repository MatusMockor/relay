import { randomBytes } from 'node:crypto';
import type {
  GoogleCalendarRecord,
  GoogleConnectionRecord,
  GoogleEventRecord,
} from '@relay/engine';
import type { OAuthCredentials, UserId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from '../../src/persistence/credentials/aes-gcm-cipher';
import { AesGcmGoogleCalendarCredentials } from '../../src/persistence/credentials/aes-gcm-google-calendar-credentials';
import { PgGoogleCalendarCredentialStore } from '../../src/persistence/credentials/pg-google-calendar-credential-store';
import { googleCalendarConnections } from '../../src/persistence/schema';
import { at, buildUser, newId } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const credentials: OAuthCredentials = {
  kind: 'oauth',
  provider: 'gmail',
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  expiresAt: at(60),
  scope: 'https://www.googleapis.com/auth/calendar.events',
};

const connectionOf = (userId: UserId): GoogleConnectionRecord => ({
  id: newId('calendarConnection'),
  userId,
  email: 'me@gmail.test',
  accountId: null,
  status: 'pending',
  lastError: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  createdAt: at(0),
  updatedAt: at(0),
});

const calendarOf = (connection: GoogleConnectionRecord): GoogleCalendarRecord => ({
  id: newId('googleCalendar'),
  userId: connection.userId,
  connectionId: connection.id,
  remoteId: 'me@gmail.test',
  name: 'Ja',
  color: '#7986cb',
  enabled: true,
  primary: true,
  accessRole: 'owner',
  timeZone: 'Europe/Bratislava',
  status: 'pending',
  lastError: null,
  lastSyncedAt: null,
  syncToken: null,
  createdAt: at(0),
  updatedAt: at(0),
});

const eventOf = (
  calendar: GoogleCalendarRecord,
  summary: string,
  etag: string,
): GoogleEventRecord => ({
  calendarId: calendar.id,
  remoteId: 'evt',
  etag,
  event: {
    id: newId('calendarEvent'),
    userId: calendar.userId,
    source: { kind: 'google', calendarId: calendar.id },
    uid: 'evt@google.com',
    recurrenceId: null,
    sequence: 0,
    dtstamp: at(0),
    status: 'confirmed',
    summary,
    location: null,
    description: null,
    organizer: null,
    attendees: [],
    method: null,
    myPartstat: null,
    myEmail: 'me@gmail.test',
    allDay: false,
    startsAt: '2026-11-16T09:00:00.000Z',
    endsAt: '2026-11-16T10:00:00.000Z',
    recurring: false,
    rangeEndsAt: '2026-11-16T10:00:00.000Z',
    ics: 'ICS',
    messageId: null,
    threadId: null,
    createdAt: at(0),
    updatedAt: at(0),
    revision: 0,
  },
});

describe('Postgres Google calendar persistence', () => {
  const context = usePgTestContext();

  const seed = async () => {
    const user = buildUser();
    await context.repositories.users.create(user, 'hash');
    const connection = await context.repositories.googleConnections.save(connectionOf(user.id));
    const calendar = await context.repositories.googleCalendars.save(calendarOf(connection));
    return { user, connection, calendar };
  };

  it('encrypts connection tokens and replaces them only when unchanged', async () => {
    const { connection } = await seed();
    const secrets = new AesGcmGoogleCalendarCredentials(
      new PgGoogleCalendarCredentialStore(context.db),
      new AesGcmCipher(randomBytes(32)),
    );

    await secrets.set(connection.id, credentials);

    const [row] = await context.db
      .select({ envelope: googleCalendarConnections.credentialsEnvelope })
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.id, connection.id));
    expect(row?.envelope).not.toContain('refresh-secret');
    expect(await secrets.get(connection.id)).toEqual(credentials);
    const refreshed = { ...credentials, accessToken: 'access-2' };
    expect(await secrets.setIfUnchanged(connection.id, refreshed, credentials)).toBe(false);
    expect(await secrets.setIfUnchanged(connection.id, credentials, refreshed)).toBe(true);
    expect(
      await context.repositories.googleConnections.findById(connection.userId, connection.id),
    ).toEqual(connection);
    await secrets.delete(connection.id);
    expect(await secrets.get(connection.id)).toBeNull();
  });

  it('upserts Google events with their ETag and cascades a disconnect', async () => {
    const { user, connection, calendar } = await seed();
    const first = eventOf(calendar, 'A', '"1"');
    await context.repositories.googleEvents.save([first]);
    await context.repositories.googleEvents.save([eventOf(calendar, 'A2', '"2"')]);

    const stored = await context.repositories.googleEvents.findByRemoteId(calendar.id, 'evt');
    expect(stored).toMatchObject({ etag: '"2"', event: { id: first.event.id, summary: 'A2' } });
    const day = { from: '2026-11-16T00:00:00.000Z', to: '2026-11-17T00:00:00.000Z' };
    expect(
      (await context.repositories.calendarEvents.listForRange(user.id, day)).map(
        (event) => event.source,
      ),
    ).toEqual([{ kind: 'google', calendarId: calendar.id }]);

    await context.repositories.googleConnections.delete(user.id, connection.id);
    expect(await context.repositories.googleCalendars.listByUser(user.id)).toEqual([]);
    expect(await context.repositories.calendarEvents.listForRange(user.id, day)).toEqual([]);
  });

  it('keeps advancing revisions through saves and whole calendar replacement', async () => {
    const { calendar } = await seed();
    const events = context.repositories.googleEvents;
    const first = eventOf(calendar, 'A', '"1"');
    await events.save([first]);
    await events.save([eventOf(calendar, 'A2', '"2"')]);
    expect((await events.findByRemoteId(calendar.id, 'evt'))?.event.revision).toBe(2);

    const replacement = eventOf(calendar, 'A3', '"3"');
    await events.replaceCalendar(calendar.id, [
      { ...replacement, event: { ...replacement.event, id: first.event.id } },
    ]);

    const replaced = await events.findByRemoteId(calendar.id, 'evt');
    expect(replaced?.event).toMatchObject({ id: first.event.id, summary: 'A3', revision: 3 });
  });

  it('returns the stored sync token when locking a calendar for sync', async () => {
    const { calendar } = await seed();
    await context.repositories.googleCalendars.recordSync(calendar.id, {
      status: 'ok',
      lastError: null,
      syncedAt: at(5),
      syncToken: 'sync-1',
    });

    expect(await context.repositories.googleCalendars.lockForSync(calendar.id)).toMatchObject({
      syncToken: 'sync-1',
      lastSyncedAt: at(5),
    });
  });
});
