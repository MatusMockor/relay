import { readFile, writeFile } from 'node:fs/promises';
import {
  GOOGLE_CALENDAR_STUB_SCOPES,
  type GoogleCalendarStub,
  startGoogleCalendarStub,
} from '@relay/config/test-infra';
import type { CalendarOccurrence } from '@relay/shared/domain';
import type { RelayBridge } from '@relay/shared/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { createTempDir, type TempDir } from './support/temp-dir';

const EMAIL = 'me@gmail.test';
const ZONE = 'Europe/Bratislava';
const HOUR = 3_600_000;

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const inHours = (hours: number): string => {
  const base = new Date(Date.now() + 24 * HOUR);
  base.setUTCHours(0, 0, 0, 0);
  return new Date(base.getTime() + hours * HOUR).toISOString();
};

const window = () => ({ from: inHours(0), to: inHours(24), timeZone: ZONE });

const occurrences = async (bridge: RelayBridge): Promise<CalendarOccurrence[]> =>
  expectOk(await bridge.invoke('local.calendar.occurrences', window())).items;

describe('local mode Google calendar (SQLite + Google stub)', () => {
  let dir: TempDir;
  let google: GoogleCalendarStub;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    google = await startGoogleCalendarStub(EMAIL);
    google.grantCode('auth-code-1', GOOGLE_CALENDAR_STUB_SCOPES);
    google.calendars.push({
      id: EMAIL,
      summary: 'Ja',
      primary: true,
      selected: true,
      accessRole: 'owner',
      backgroundColor: '#33b679',
      timeZone: ZONE,
    });
    google.put(EMAIL, {
      id: 'inv',
      iCalUID: 'inv@partner.test',
      summary: 'Pozvánka',
      start: { dateTime: inHours(9) },
      end: { dateTime: inHours(10) },
      organizer: { email: 'boss@partner.test' },
      attendees: [
        { email: 'boss@partner.test', organizer: true, responseStatus: 'accepted' },
        { email: EMAIL, self: true, responseStatus: 'needsAction' },
      ],
    });
    await writeFile(
      dir.file('google-oauth.json'),
      JSON.stringify({ clientId: 'relay-client', tokenEndpoint: google.tokenUrl }),
    );
    harness = startLocalRuntime(dir, { env: { RELAY_GOOGLE_CALENDAR_API_URL: google.apiUrl } });
  });

  afterEach(async () => {
    await harness.close();
    await google.close();
    await dir.remove();
  });

  it('connects over the loopback flow, syncs, answers, creates and deletes events', async () => {
    const { bridge } = harness;
    expect(expectOk(await bridge.invoke('local.calendar.google.overview'))).toMatchObject({
      configured: true,
      connections: [],
    });

    const authorized = expectOk(
      await bridge.invoke('oauth.google.authorizeCalendar', { mode: 'local' }),
    );
    expect(authorized.mode === 'local' && authorized.connection.status).toBe('ok');

    const invitation = (await occurrences(bridge)).find((entry) => entry.title === 'Pozvánka');
    expect(invitation).toMatchObject({ color: '#33b679', canRespond: true, sourceKind: 'google' });
    expectOk(
      await bridge.invoke('local.calendar.google.respond', {
        eventId: invitation?.eventId ?? '',
        response: 'tentative',
      }),
    );
    const attendees = google.event(EMAIL, 'inv')?.attendees as { responseStatus: string }[];
    expect(attendees[1]?.responseStatus).toBe('tentative');

    const calendarId =
      authorized.mode === 'local' ? (authorized.connection.calendars[0]?.id ?? '') : '';
    const created = expectOk(
      await bridge.invoke('local.calendar.google.createEvent', {
        calendarId,
        title: 'Sviatok',
        allDay: true,
        start: inHours(0),
        end: inHours(24),
        timeZone: ZONE,
        location: null,
        attendees: [],
      }),
    );
    expect((await occurrences(bridge)).map((entry) => entry.title)).toContain('Sviatok');
    expectOk(
      await bridge.invoke('local.calendar.google.deleteEvent', { eventId: created.eventId }),
    );
    expect((await occurrences(bridge)).map((entry) => entry.title)).toEqual(['Pozvánka']);
    expect(harness.events.some((event) => event.type === 'calendar.updated')).toBe(true);

    const secrets = await readFile(dir.file('secrets.bin'));
    expect(secrets.toString('utf8')).not.toContain('refresh-1');
  });

  it('explains how to configure the client id when it is missing', async () => {
    await harness.close();
    const empty = await createTempDir();
    harness = startLocalRuntime(empty);
    const { bridge } = harness;

    const overview = expectOk(await bridge.invoke('local.calendar.google.overview'));
    expect(overview.configured).toBe(false);
    expect(overview.setupHint).toContain('RELAY_GOOGLE_CLIENT_ID');
    const failed = await bridge.invoke('oauth.google.authorizeCalendar', { mode: 'local' });
    expect(failed).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    await empty.remove();
  });
});
