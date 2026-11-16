import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { type CalendarEventRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AccountId } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { type SeriesMessage, type SeriesParties, seriesMail } from './support/series-mail';

const ZONE = 'Europe/Bratislava';
const AUTUMN = {
  from: '2026-11-01T00:00:00+01:00',
  to: '2027-01-01T00:00:00+01:00',
  timeZone: ZONE,
};
const WINTER = {
  from: '2027-01-01T00:00:00+01:00',
  to: '2027-03-01T00:00:00+01:00',
  timeZone: ZONE,
};

const at = (day: string, time: string) => `TZID=${ZONE}:2026${day}T${time}`;

const weekly = (day: string, summary: string, rule = 'RRULE:FREQ=WEEKLY'): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Pozvánka: ${summary}`,
  lines: [
    'DTSTAMP:20261101T080000Z',
    'SEQUENCE:0',
    `SUMMARY:${summary}`,
    `DTSTART;${at(day, '100000')}`,
    `DTEND;${at(day, '110000')}`,
    rule,
  ],
});

const moved = (day: string, sequence: number, summary: string): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Presunuté: ${summary} ${day}`,
  lines: [
    'DTSTAMP:20261102T080000Z',
    `SEQUENCE:${String(sequence)}`,
    `SUMMARY:${summary}`,
    `RECURRENCE-ID;${at(day, '100000')}`,
    `DTSTART;${at(day, '160000')}`,
    `DTEND;${at(day, '170000')}`,
  ],
});

const fromNowOn = (day: string, summary: string): SeriesMessage => ({
  method: 'REQUEST',
  subject: `Zmena od ${day}: ${summary}`,
  lines: [
    'DTSTAMP:20261103T080000Z',
    'SEQUENCE:1',
    `SUMMARY:${summary}`,
    'LOCATION:Zasadačka Váh',
    `RECURRENCE-ID;RANGE=THISANDFUTURE;${at(day, '100000')}`,
    `DTSTART;${at(day, '110000')}`,
    `DTEND;${at(day, '120000')}`,
  ],
});

const cancelFrom = (day: string, sequence: number): SeriesMessage => ({
  method: 'CANCEL',
  subject: `Zrušené od ${day}`,
  lines: [
    'DTSTAMP:20261110T080000Z',
    `SEQUENCE:${String(sequence)}`,
    'STATUS:CANCELLED',
    `RECURRENCE-ID;RANGE=THISANDFUTURE;${at(day, '100000')}`,
  ],
});

describe('THISANDFUTURE invitations over the server (Postgres)', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let imap: ImapFlow;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
    owner = await createGreenMailUser('range');
    imap = await openImap(owner);
  });

  afterAll(async () => {
    await imap.logout();
    await app.close();
    await deleteGreenMailUser(owner);
  });

  const deliver = async (parties: SeriesParties, messages: readonly SeriesMessage[]) => {
    for (const message of messages) {
      await imap.append('INBOX', await seriesMail(parties, message));
    }
  };

  const occurrences = async (token: string, window: typeof AUTUMN) =>
    (await app.api.ok(api.calendar.occurrences, { query: window }, token)).items
      .filter((item) => item.uid.endsWith('@range.test'))
      .map((item) => [item.uid.split('-')[0], item.start, item.title]);

  const masterRange = async (accountId: AccountId, uid: string) => {
    const events = app.app.get<symbol, CalendarEventRepository>(
      PORT_TOKENS.CalendarEventRepository,
    );
    const series = await events.findSeries({ kind: 'invite', accountId }, uid);
    return series.find((member) => member.recurrenceId === null)?.rangeEndsAt;
  };

  it('shifts, renames and ends series in any arrival order and bounds their stored range', async () => {
    const session = await registerUser(app.api, `range-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const monday = {
      uid: `monday-${randomUUID()}@range.test`,
      organizer: 'peter@partner.test',
      attendee: owner.email,
    };
    const wednesday = { ...monday, uid: `wednesday-${randomUUID()}@range.test` };
    await deliver(monday, [
      weekly('1102', 'Porada'),
      moved('1130', 0, 'Porada (stará výnimka)'),
      fromNowOn('1116', 'Porada o 11:00'),
      cancelFrom('1207', 2),
    ]);
    await deliver(wednesday, [
      cancelFrom('1118', 1),
      weekly('1104', 'Retro'),
      moved('1125', 0, 'Retro (oneskorená výnimka)'),
      moved('1111', 0, 'Retro (presunuté)'),
    ]);
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (threads) => threads.length >= 8);

    await expect
      .poll(() => occurrences(token, AUTUMN), { timeout: 20_000, interval: 250 })
      .toEqual([
        ['monday', '2026-11-02T09:00:00.000Z', 'Porada'],
        ['wednesday', '2026-11-04T09:00:00.000Z', 'Retro'],
        ['monday', '2026-11-09T09:00:00.000Z', 'Porada'],
        ['wednesday', '2026-11-11T15:00:00.000Z', 'Retro (presunuté)'],
        ['monday', '2026-11-16T10:00:00.000Z', 'Porada o 11:00'],
        ['monday', '2026-11-23T10:00:00.000Z', 'Porada o 11:00'],
        ['monday', '2026-11-30T10:00:00.000Z', 'Porada o 11:00'],
      ]);
    expect(await occurrences(token, WINTER)).toEqual([]);
    expect(await masterRange(account.id, monday.uid)).toBe('2026-12-08T11:00:00.000Z');
    expect(await masterRange(account.id, wednesday.uid)).toBe('2026-11-19T10:00:00.000Z');
  });

  it('finds occurrences moved before the start of the series in window queries', async () => {
    const mailbox = await createGreenMailUser('shift');
    const client = await openImap(mailbox);
    const session = await registerUser(app.api, `shift-${randomUUID().slice(0, 8)}@relay.test`);
    const daily = {
      uid: `daily-${randomUUID()}@range.test`,
      organizer: 'peter@partner.test',
      attendee: mailbox.email,
    };
    const messages: SeriesMessage[] = [
      weekly('1210', 'Denný report', 'RRULE:FREQ=DAILY'),
      {
        method: 'REQUEST',
        subject: 'Report skôr',
        lines: [
          'DTSTAMP:20261103T080000Z',
          'SEQUENCE:1',
          'SUMMARY:Report skôr',
          `RECURRENCE-ID;RANGE=THISANDFUTURE;${at('1220', '100000')}`,
          `DTSTART;${at('1201', '100000')}`,
          `DTEND;${at('1201', '110000')}`,
        ],
      },
    ];
    for (const message of messages) {
      await client.append('INBOX', await seriesMail(daily, message));
    }
    await addImapAccount(app.api, session.accessToken, mailbox);
    const fifth = {
      from: '2026-12-05T00:00:00+01:00',
      to: '2026-12-06T00:00:00+01:00',
      timeZone: ZONE,
    };

    await expect
      .poll(() => occurrences(session.accessToken, fifth), { timeout: 20_000, interval: 250 })
      .toEqual([['daily', '2026-12-05T09:00:00.000Z', 'Report skôr']]);
    await client.logout();
    await deleteGreenMailUser(mailbox);
  });

  it('keeps a range change after its anchor is cancelled and restores a cut with a newer range', async () => {
    const mailbox = await createGreenMailUser('restore');
    const client = await openImap(mailbox);
    const session = await registerUser(app.api, `restore-${randomUUID().slice(0, 8)}@relay.test`);
    const parties = (name: string) => ({
      uid: `${name}-${randomUUID()}@range.test`,
      organizer: 'peter@partner.test',
      attendee: mailbox.email,
    });
    const anchor = parties('anchor');
    const restore = parties('restore');
    const dailyAt9: SeriesMessage = {
      method: 'REQUEST',
      subject: 'Pozvánka: Report',
      lines: [
        'DTSTAMP:20261101T080000Z',
        'SEQUENCE:0',
        'SUMMARY:Report',
        'DTSTART:20261101T090000Z',
        'DTEND:20261101T093000Z',
        'RRULE:FREQ=DAILY',
      ],
    };
    const at11 = (day: string, sequence: number): SeriesMessage => ({
      method: 'REQUEST',
      subject: `Report o 11:00 od ${day}`,
      lines: [
        'DTSTAMP:20261102T080000Z',
        `SEQUENCE:${String(sequence)}`,
        'SUMMARY:Report o 11:00',
        `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
        `DTSTART:202611${day}T110000Z`,
        `DTEND:202611${day}T113000Z`,
      ],
    });
    const cancel = (day: string, range: string, sequence: number): SeriesMessage => ({
      method: 'CANCEL',
      subject: `Zrušené ${day}${range}`,
      lines: [
        'DTSTAMP:20261102T090000Z',
        `SEQUENCE:${String(sequence)}`,
        `RECURRENCE-ID${range}:202611${day}T090000Z`,
      ],
    });
    for (const [series, message] of [
      [anchor, dailyAt9],
      [anchor, at11('03', 1)],
      [anchor, cancel('03', '', 2)],
      [restore, dailyAt9],
      [restore, cancel('03', ';RANGE=THISANDFUTURE', 1)],
      [restore, at11('05', 2)],
    ] as const) {
      await client.append('INBOX', await seriesMail(series, message));
    }
    const account = await addImapAccount(app.api, session.accessToken, mailbox);
    const week = { from: '2026-11-01T00:00:00Z', to: '2026-11-07T00:00:00Z', timeZone: 'UTC' };
    const later = { from: '2026-12-20T00:00:00Z', to: '2026-12-21T00:00:00Z', timeZone: 'UTC' };
    const sorted = async (window: typeof week) =>
      (await occurrences(session.accessToken, window)).sort((a, b) =>
        `${a[1] ?? ''}${a[0] ?? ''}`.localeCompare(`${b[1] ?? ''}${b[0] ?? ''}`),
      );

    await expect
      .poll(() => sorted(week), { timeout: 20_000, interval: 250 })
      .toEqual([
        ['anchor', '2026-11-01T09:00:00.000Z', 'Report'],
        ['restore', '2026-11-01T09:00:00.000Z', 'Report'],
        ['anchor', '2026-11-02T09:00:00.000Z', 'Report'],
        ['restore', '2026-11-02T09:00:00.000Z', 'Report'],
        ['anchor', '2026-11-04T11:00:00.000Z', 'Report o 11:00'],
        ['anchor', '2026-11-05T11:00:00.000Z', 'Report o 11:00'],
        ['restore', '2026-11-05T11:00:00.000Z', 'Report o 11:00'],
        ['anchor', '2026-11-06T11:00:00.000Z', 'Report o 11:00'],
        ['restore', '2026-11-06T11:00:00.000Z', 'Report o 11:00'],
      ]);
    expect(await sorted(later)).toEqual([
      ['anchor', '2026-12-20T11:00:00.000Z', 'Report o 11:00'],
      ['restore', '2026-12-20T11:00:00.000Z', 'Report o 11:00'],
    ]);
    expect(await masterRange(account.id, restore.uid)).toBeNull();
    await client.logout();
    await deleteGreenMailUser(mailbox);
  });
});
