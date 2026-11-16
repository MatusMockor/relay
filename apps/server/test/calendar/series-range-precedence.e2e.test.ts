import { randomUUID } from 'node:crypto';
import { type CalendarEventRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AccountId } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { type SeriesMessage, seriesMail } from './support/series-mail';

describe('THISANDFUTURE range precedence over the server (Postgres)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
  });

  const occurrences = async (
    token: string,
    window: { from: string; to: string; timeZone: string },
  ) =>
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

  it('keeps a later range in force when an earlier range anchor is cancelled', async () => {
    const mailbox = await createGreenMailUser('precedence');
    const client = await openImap(mailbox);
    const session = await registerUser(app.api, `prec-${randomUUID().slice(0, 8)}@relay.test`);
    const series = {
      uid: `precedence-${randomUUID()}@range.test`,
      organizer: 'peter@partner.test',
      attendee: mailbox.email,
    };
    const move = (day: string, hour: string, sequence: number): SeriesMessage => ({
      method: 'REQUEST',
      subject: `Report o ${hour}:00 od ${day}`,
      lines: [
        'DTSTAMP:20261102T080000Z',
        `SEQUENCE:${String(sequence)}`,
        `SUMMARY:Report o ${hour}:00`,
        `RECURRENCE-ID;RANGE=THISANDFUTURE:202611${day}T090000Z`,
        `DTSTART:202611${day}T${hour}0000Z`,
        `DTEND:202611${day}T${hour}3000Z`,
      ],
    });
    const messages: SeriesMessage[] = [
      {
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
      },
      move('03', '11', 1),
      move('05', '13', 2),
      {
        method: 'CANCEL',
        subject: 'Zrušené 3.11.',
        lines: ['DTSTAMP:20261102T090000Z', 'SEQUENCE:3', 'RECURRENCE-ID:20261103T090000Z'],
      },
    ];
    for (const message of messages) {
      await client.append('INBOX', await seriesMail(series, message));
    }
    await addImapAccount(app.api, session.accessToken, mailbox);
    const week = { from: '2026-11-01T00:00:00Z', to: '2026-11-08T00:00:00Z', timeZone: 'UTC' };

    await expect
      .poll(() => occurrences(session.accessToken, week), { timeout: 20_000, interval: 250 })
      .toEqual([
        ['precedence', '2026-11-01T09:00:00.000Z', 'Report'],
        ['precedence', '2026-11-02T09:00:00.000Z', 'Report'],
        ['precedence', '2026-11-04T11:00:00.000Z', 'Report o 11:00'],
        ['precedence', '2026-11-05T13:00:00.000Z', 'Report o 13:00'],
        ['precedence', '2026-11-06T13:00:00.000Z', 'Report o 13:00'],
        ['precedence', '2026-11-07T13:00:00.000Z', 'Report o 13:00'],
      ]);
    await client.logout();
    await deleteGreenMailUser(mailbox);
  });
});
