import { compareRevisions, type StoredCalendarEvent } from '@relay/engine';
import { CalendarEventIdSchema, type MailAccount, MessageIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase } from '../src';
import { insertLegacyAccount } from './support/legacy-account';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, type TempDirectory } from './support/test-database';

const START = '2026-11-02T09:00:00.000Z';
const D1 = '2026-11-10T08:00:00.000Z';
const D3 = '2026-11-12T08:00:00.000Z';
const icsOf = (...lines: string[]) =>
  [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    ...lines,
    'RRULE:FREQ=WEEKLY',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
const ICS = icsOf('DTSTAMP:20261101T080000Z', 'SEQUENCE:0');

const row = (
  account: MailAccount,
  id: string,
  uid: string,
  fields: Partial<StoredCalendarEvent>,
): StoredCalendarEvent => ({
  id: CalendarEventIdSchema.parse(id),
  userId: account.userId,
  source: { kind: 'invite', accountId: account.id },
  uid,
  recurrenceId: null,
  sequence: 0,
  dtstamp: D1,
  status: 'cancelled',
  method: 'CANCEL',
  summary: 'Porada',
  location: null,
  description: null,
  organizer: null,
  attendees: [],
  allDay: false,
  startsAt: START,
  endsAt: '2026-11-02T10:00:00.000Z',
  recurring: true,
  rangeEndsAt: null,
  ics: ICS,
  myPartstat: null,
  myEmail: null,
  messageId: null,
  threadId: null,
  createdAt: D1,
  updatedAt: D1,
  revision: 0,
  ...fields,
});

const cutAt = (
  account: MailAccount,
  id: string,
  uid: string,
  message: string,
  recurrenceId = START,
) =>
  row(account, id, uid, {
    recurrenceId,
    messageId: MessageIdSchema.parse(message),
    thisAndFuture: true,
    endsSeries: true,
    recurring: false,
    sequence: 1,
    dtstamp: D3,
  });

const cancelledBy = (
  account: MailAccount,
  id: string,
  uid: string,
  message: string,
  fields: Partial<StoredCalendarEvent> = {},
) =>
  row(account, id, uid, {
    sequence: 1,
    dtstamp: D3,
    messageId: MessageIdSchema.parse(message),
    ...fields,
  });

const summaryOf = (event: StoredCalendarEvent) => [
  event.id,
  event.status,
  event.method,
  event.sequence,
  event.dtstamp,
];

describe('calendar cut-at-start masters migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('restores masters cancelled by a cut at their start and keeps other cancellations', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0018_calendar_cut_start_masters', directory.path),
    });
    const account = insertLegacyAccount(database);
    const events = createSqliteRepositories(database).calendarEvents;
    const legacy = [
      cancelledBy(account, 'cev-p', 'p', 'msg-p'),
      cutAt(account, 'cev-p-cut', 'p', 'msg-p'),
      cancelledBy(account, 'cev-q', 'q', 'msg-q', {
        ics: icsOf('DTSTAMP:20261105T070000Z', 'SEQUENCE:4', 'STATUS:TENTATIVE'),
      }),
      cutAt(account, 'cev-q-cut', 'q', 'msg-q', '2026-11-01T09:00:00.000Z'),
      cancelledBy(account, 'cev-r', 'r', 'msg-r-all'),
      cutAt(account, 'cev-r-cut', 'r', 'msg-r-cut'),
      cancelledBy(account, 'cev-t', 't', 'msg-t'),
      cutAt(account, 'cev-t-cut', 't', 'msg-t', '2026-11-09T09:00:00.000Z'),
      cancelledBy(account, 'cev-u', 'u', 'msg-u', { ics: icsOf() }),
      cutAt(account, 'cev-u-cut', 'u', 'msg-u'),
      row(account, 'cev-s', 's', { status: 'confirmed', method: 'REQUEST' }),
    ];
    for (const event of legacy) {
      await events.saveIfCurrent(event);
    }

    migrate(database);

    const source = { kind: 'invite', accountId: account.id } as const;
    const seriesOf = async (uid: string) => {
      const series = await events.findSeries(source, uid);
      return {
        master: series.find((event) => event.recurrenceId === null) as StoredCalendarEvent,
        cut: series.find((event) => event.endsSeries === true),
      };
    };
    const restored = await seriesOf('p');
    expect(summaryOf(restored.master)).toEqual([
      'cev-p',
      'confirmed',
      'REQUEST',
      0,
      '2026-11-01T08:00:00.000Z',
    ]);
    expect(compareRevisions(restored.cut as StoredCalendarEvent, restored.master)).toBeGreaterThan(
      0,
    );
    const tentative = await seriesOf('q');
    expect(summaryOf(tentative.master)).toEqual([
      'cev-q',
      'tentative',
      'REQUEST',
      4,
      '2026-11-05T07:00:00.000Z',
    ]);
    expect(
      compareRevisions(tentative.cut as StoredCalendarEvent, tentative.master),
    ).toBeGreaterThan(0);
    expect(summaryOf((await seriesOf('r')).master)).toEqual([
      'cev-r',
      'cancelled',
      'CANCEL',
      1,
      D3,
    ]);
    expect(summaryOf((await seriesOf('t')).master)).toEqual([
      'cev-t',
      'cancelled',
      'CANCEL',
      1,
      D3,
    ]);
    expect(summaryOf((await seriesOf('u')).master)).toEqual([
      'cev-u',
      'confirmed',
      'REQUEST',
      0,
      null,
    ]);
    expect(summaryOf((await seriesOf('s')).master)).toEqual([
      'cev-s',
      'confirmed',
      'REQUEST',
      0,
      D1,
    ]);
    database.close();
  });
});
