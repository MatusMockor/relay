import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { IcalCalendarParser } from '@relay/calendar';
import { MailparserMessageParser } from '@relay/mail-core';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';
import { FEED_CA_FILE, type FeedServer, startFeedServer } from './support/feed-server';
import { inviteMail } from './support/invite-mail';

const ZONE = 'Europe/Bratislava';
const DAY = { from: '2026-11-16T00:00:00+01:00', to: '2026-11-17T00:00:00+01:00', timeZone: ZONE };
const FEED_PATH = '/calendar/ical/private-7f3a9c/basic.ics';
const HTML_PATH = '/calendar/login.ics';
const FLAKY_PATH = '/calendar/flaky.ics';
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  'UID:feed-1@google.com',
  'DTSTAMP:20261115T080000Z',
  'DTSTART:20261116T130000Z',
  'DTEND:20261116T140000Z',
  'SUMMARY:Obed s rodinou',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const readInbox = async (client: ImapFlow): Promise<string[]> => {
  const lock = await client.getMailboxLock('INBOX');
  try {
    if (client.mailbox === false || client.mailbox.exists === 0) {
      return [];
    }
    const sources: string[] = [];
    for await (const message of client.fetch('1:*', { source: true })) {
      sources.push(message.source?.toString('utf8') ?? '');
    }
    return sources;
  } finally {
    lock.release();
  }
};

describe('calendar over the server', () => {
  let app: TestApp;
  let feed: FeedServer;
  let owner: GreenMailUser;
  let organizer: GreenMailUser;
  let ownerImap: ImapFlow;
  let organizerImap: ImapFlow;
  let flakyGone = false;

  beforeAll(async () => {
    feed = await startFeedServer((request, response) => {
      if (request.url === HTML_PATH) {
        response.writeHead(200, { 'content-type': 'text/html' }).end('<html>Prihlásenie</html>');
        return;
      }
      if (request.url === FLAKY_PATH && !flakyGone) {
        response.writeHead(200, { 'content-type': 'text/calendar' }).end(FEED);
        return;
      }
      if (request.url !== FEED_PATH) {
        response.writeHead(404).end();
        return;
      }
      if (request.headers['if-none-match'] === '"f1"') {
        response.writeHead(304).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/calendar', etag: '"f1"' }).end(FEED);
    });
    app = await startTestApp({
      env: {
        JOBS_ENABLED: 'true',
        CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS: 'true',
        CALENDAR_FEEDS_CA_FILE: FEED_CA_FILE,
      },
    });
    owner = await createGreenMailUser('cal');
    organizer = await createGreenMailUser('org');
    ownerImap = await openImap(owner);
    organizerImap = await openImap(organizer);
  });

  afterAll(async () => {
    await ownerImap.logout();
    await organizerImap.logout();
    await app.close();
    await feed.close();
    await deleteGreenMailUser(owner);
    await deleteGreenMailUser(organizer);
  });

  it('turns an emailed invitation into an event and answers it with an iMIP REPLY', async () => {
    const session = await registerUser(app.api, `cal-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const uid = `${randomUUID()}@google.com`;
    await ownerImap.append(
      'INBOX',
      await inviteMail({
        uid,
        organizer: organizer.email,
        attendee: owner.email,
        summary: 'Plánovanie Q1',
      }),
    );
    const account = await addImapAccount(app.api, token, owner);
    const [thread] = await waitForInbox(app.api, token, (threads) => threads.length === 1);
    const socket = await authenticateRealtime(app.baseUrl, token);

    let items: Awaited<ReturnType<typeof app.api.ok<typeof api.calendar.occurrences>>>['items'] =
      [];
    await expect
      .poll(async () => {
        items = (await app.api.ok(api.calendar.occurrences, { query: DAY }, token)).items;
        return items.length;
      })
      .toBe(1);
    expect(items).toEqual([
      expect.objectContaining({
        uid,
        title: 'Plánovanie Q1',
        start: '2026-11-16T09:00:00.000Z',
        end: '2026-11-16T10:00:00.000Z',
        accountId: account.id,
        color: account.color,
        threadId: thread?.id,
        myStatus: 'needs-action',
      }),
    ]);
    const [invitation] = await app.api.ok(
      api.calendar.invitations,
      { query: { threadId: thread?.id ?? '', timeZone: ZONE } },
      token,
    );
    expect(invitation).toMatchObject({
      canRespond: true,
      location: 'Zasadačka Dunaj',
      organizer: { email: organizer.email },
    });

    const answered = await app.api.ok(
      api.calendar.rsvp,
      { params: { id: invitation?.eventId ?? '' }, body: { response: 'accepted', timeZone: ZONE } },
      token,
    );
    expect(answered.myStatus).toBe('accepted');
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'calendar.updated',
    );
    let replies: string[] = [];
    await expect
      .poll(
        async () => {
          replies = await readInbox(organizerImap);
          return replies.length;
        },
        { timeout: 10_000 },
      )
      .toBe(1);
    const [reply] = replies;
    expect(reply).toMatch(/Content-Type: text\/calendar; charset=utf-8; method=REPLY/);
    const parsed = await new MailparserMessageParser(app.clock).parse(
      new TextEncoder().encode(reply),
    );
    expect(parsed.subject).toBe('Prijaté: Plánovanie Q1');
    const calendar = new IcalCalendarParser().parse(parsed.calendarParts?.[0] ?? '');
    expect(calendar?.method).toBe('REPLY');
    expect(calendar?.events[0]).toMatchObject({
      uid,
      sequence: 0,
      organizer: { email: organizer.email },
      attendees: [{ email: owner.email, partstat: 'accepted' }],
    });
    expect(
      await app.api.ok(api.calendar.occurrences, { query: DAY }, session.accessToken),
    ).toMatchObject({ items: [{ myStatus: 'accepted' }] });
    const other = await registerUser(app.api, `cal-${randomUUID().slice(0, 8)}@relay.test`);
    expect(await app.api.ok(api.calendar.occurrences, { query: DAY }, other.accessToken)).toEqual({
      items: [],
    });
  });

  it('subscribes to an https feed, keeps its URL secret and revalidates with the ETag', async () => {
    const session = await registerUser(app.api, `feed-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const url = `${feed.origin}${FEED_PATH}`;

    const created = await app.api.ok(
      api.calendar.createSubscription,
      { body: { name: 'Rodina', url, color: '#22aa66' } },
      token,
    );
    expect(created).toMatchObject({ status: 'ok', eventCount: 1, host: '127.0.0.1' });
    expect(JSON.stringify(created)).not.toContain('private-7f3a9c');
    const listed = await app.api.ok(api.calendar.listSubscriptions, {}, token);
    expect(JSON.stringify(listed)).not.toContain('private-7f3a9c');
    const { items } = await app.api.ok(api.calendar.occurrences, { query: DAY }, token);
    expect(items).toEqual([
      expect.objectContaining({
        title: 'Obed s rodinou',
        color: '#22aa66',
        sourceKind: 'subscription',
      }),
    ]);

    const refreshed = await app.api.ok(
      api.calendar.refreshSubscription,
      { params: { id: created.id } },
      token,
    );
    expect(refreshed.status).toBe('ok');
    expect(feed.requests.at(-1)?.headers['if-none-match']).toBe('"f1"');

    const rejected = await app.api.fail(
      api.calendar.createSubscription,
      { body: { name: 'Zlý', url: 'http://example.com/x.ics', color: '#22aa66' } },
      token,
    );
    expect(rejected.status).toBe(400);
    await app.api.ok(api.calendar.deleteSubscription, { params: { id: created.id } }, token);
    expect(await app.api.ok(api.calendar.occurrences, { query: DAY }, token)).toEqual({
      items: [],
    });
  });

  it('rejects a broken feed on add and keeps a feed that fails later as an error', async () => {
    const session = await registerUser(app.api, `feed-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const subscribe = (path: string) =>
      app.api.fail(
        api.calendar.createSubscription,
        { body: { name: 'Zlý', url: `${feed.origin}${path}`, color: '#22aa66' } },
        token,
      );

    const missing = await subscribe('/calendar/missing.ics');
    const html = await subscribe(HTML_PATH);

    expect(missing).toMatchObject({
      status: 400,
      error: {
        code: 'validation_failed',
        message: 'Kalendár sa nepodarilo pridať. Server kalendára vrátil stav 404.',
      },
    });
    expect(html.error.message).toBe(
      'Kalendár sa nepodarilo pridať. Súbor nie je platný iCalendar.',
    );
    expect(await app.api.ok(api.calendar.listSubscriptions, {}, token)).toEqual([]);

    const flaky = await app.api.ok(
      api.calendar.createSubscription,
      { body: { name: 'Neskôr zlý', url: `${feed.origin}${FLAKY_PATH}`, color: '#22aa66' } },
      token,
    );
    flakyGone = true;
    const failed = await app.api.ok(
      api.calendar.refreshSubscription,
      { params: { id: flaky.id } },
      token,
    );
    expect(flaky).toMatchObject({ status: 'ok', eventCount: 1 });
    expect(failed).toMatchObject({
      status: 'error',
      lastError: 'Server kalendára vrátil stav 404.',
      eventCount: 1,
    });
    expect(await app.api.ok(api.calendar.listSubscriptions, {}, token)).toHaveLength(1);
  });
});
