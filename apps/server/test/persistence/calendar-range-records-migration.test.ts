import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calendarRecurrenceKey, type StoredCalendarEvent } from '@relay/engine';
import { CalendarEventIdSchema, type MailAccount } from '@relay/shared/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  openPostgresConnection,
  type PostgresConnection,
} from '../../src/persistence/database/postgres-connection';
import {
  DEFAULT_MIGRATIONS_FOLDER,
  runMigrations,
} from '../../src/persistence/migrations/migration-runner';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const RANGE_ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'RECURRENCE-ID;RANGE=THISANDFUTURE:20261116T090000Z',
  'X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const TENTATIVE_ICS = RANGE_ICS.replace('X-MICROSOFT-CDO-BUSYSTATUS', 'STATUS');

interface LegacyRow {
  readonly id: string;
  readonly uid: string;
  readonly recurrenceId: string | null;
  readonly thisAndFuture?: boolean;
  readonly endsSeries?: boolean;
  readonly range?: readonly [number, string];
  readonly sequence: number;
  readonly dtstamp: string;
  readonly status: string;
  readonly allDay?: boolean;
  readonly ics?: string;
}

const D1 = '2026-11-10T08:00:00.000Z';
const D3 = '2026-11-12T08:00:00.000Z';
const at = (day: string) => `2026-${day}T09:00:00.000Z`;
const range = (day: string) => `${at(day)};RANGE=THISANDFUTURE`;

const LEGACY: readonly LegacyRow[] = [
  { id: 'cev-master', uid: 'a', recurrenceId: null, sequence: 0, dtstamp: D1, status: 'confirmed' },
  {
    id: 'cev-plain',
    uid: 'a',
    recurrenceId: at('11-09'),
    sequence: 1,
    dtstamp: D1,
    status: 'confirmed',
  },
  {
    id: 'cev-anchor',
    uid: 'a',
    recurrenceId: at('11-16'),
    thisAndFuture: true,
    range: [1, D1],
    sequence: 3,
    dtstamp: D3,
    status: 'cancelled',
    allDay: true,
  },
  {
    id: 'cev-recut',
    uid: 'a',
    recurrenceId: at('11-23'),
    thisAndFuture: true,
    endsSeries: true,
    range: [2, D1],
    sequence: 3,
    dtstamp: D3,
    status: 'cancelled',
  },
  {
    id: 'cev-range',
    uid: 'a',
    recurrenceId: at('12-07'),
    thisAndFuture: true,
    sequence: 4,
    dtstamp: D1,
    status: 'confirmed',
  },
  {
    id: 'cev-b-master',
    uid: 'b',
    recurrenceId: null,
    sequence: 0,
    dtstamp: D1,
    status: 'confirmed',
  },
  {
    id: 'cev-b-cut',
    uid: 'b',
    recurrenceId: at('11-30'),
    thisAndFuture: true,
    endsSeries: true,
    sequence: 1,
    dtstamp: D1,
    status: 'cancelled',
  },
  {
    id: 'cev-b-tentative',
    uid: 'b',
    recurrenceId: at('11-16'),
    thisAndFuture: true,
    range: [1, D1],
    sequence: 2,
    dtstamp: D3,
    status: 'cancelled',
    ics: TENTATIVE_ICS,
  },
  {
    id: 'cev-c-master',
    uid: 'c',
    recurrenceId: null,
    sequence: 2,
    dtstamp: D3,
    status: 'cancelled',
  },
  {
    id: 'cev-c-range',
    uid: 'c',
    recurrenceId: at('11-16'),
    thisAndFuture: true,
    range: [1, D1],
    sequence: 2,
    dtstamp: D3,
    status: 'cancelled',
  },
];

const insertLegacyRows = async (databaseUrl: string, account: MailAccount): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const row of LEGACY) {
      const starts = row.recurrenceId ?? '2026-11-02T09:00:00.000Z';
      await client.query(
        `INSERT INTO calendar_events (id, user_id, account_id, series_key, uid, recurrence_key, recurrence_id, this_and_future, ends_series, range_sequence, range_dtstamp, sequence, dtstamp, method, status, summary, attendees, all_day, starts_at, ends_at, recurring, range_ends_at, ics, message_id, thread_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Porada', '[]', $16, $17, $18, $19, NULL, $20, 'msg-cancel', 'thr-cancel', '2026-11-15T08:00:00.000Z', '2026-11-15T08:00:00.000Z')`,
        [
          row.id,
          account.userId,
          account.id,
          `invite:${account.id}:${row.uid}`,
          row.uid,
          row.recurrenceId ?? '',
          row.recurrenceId,
          row.thisAndFuture === true,
          row.endsSeries === true,
          row.range?.[0] ?? null,
          row.range?.[1] ?? null,
          row.sequence,
          row.dtstamp,
          row.status === 'cancelled' ? 'CANCEL' : 'REQUEST',
          row.status,
          row.allDay === true,
          starts,
          new Date(Date.parse(starts) + 3_600_000).toISOString(),
          row.recurrenceId === null,
          row.ics ?? RANGE_ICS,
        ],
      );
    }
  } finally {
    await client.end();
  }
};

const GENERATED = /^cev_[0-9a-f]{32}$/;

const summaryOf = (row: StoredCalendarEvent) => [
  GENERATED.test(row.id) ? 'generated' : row.id,
  calendarRecurrenceKey(row),
  row.status,
  row.method,
  row.sequence,
  row.dtstamp,
  row.thisAndFuture === true,
  row.endsSeries === true,
];

describe('calendar range records migration', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-range-records-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0018_calendar_range_records');
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, end) }),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await database.drop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('splits rows that held an instance and a range into an occurrence row and a range record', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const { account } = await seedLegacyAccount(database.url, repositories);
    await insertLegacyRows(database.url, account);

    await runMigrations({ databaseUrl: database.url });

    const events = repositories.calendarEvents;
    const source = { kind: 'invite', accountId: account.id } as const;
    expect((await events.findSeries(source, 'a')).map(summaryOf)).toEqual([
      ['cev-master', '', 'confirmed', 'REQUEST', 0, D1, false, false],
      ['cev-plain', at('11-09'), 'confirmed', 'REQUEST', 1, D1, false, false],
      ['generated', at('11-16'), 'cancelled', 'CANCEL', 3, D3, false, false],
      ['cev-anchor', range('11-16'), 'confirmed', 'REQUEST', 1, D1, true, false],
      ['generated', at('11-23'), 'cancelled', 'CANCEL', 3, D3, false, false],
      ['cev-recut', range('11-23'), 'cancelled', 'CANCEL', 2, D1, true, true],
      ['cev-range', range('12-07'), 'confirmed', 'REQUEST', 4, D1, true, false],
    ]);
    expect((await events.findSeries(source, 'b')).map(summaryOf)).toEqual([
      ['cev-b-master', '', 'confirmed', 'REQUEST', 0, D1, false, false],
      ['generated', at('11-16'), 'cancelled', 'CANCEL', 2, D3, false, false],
      ['cev-b-tentative', range('11-16'), 'tentative', 'REQUEST', 1, D1, true, false],
      ['cev-b-cut', range('11-30'), 'cancelled', 'CANCEL', 1, D1, true, true],
    ]);
    expect((await events.findSeries(source, 'c')).map(summaryOf)).toEqual([
      ['cev-c-master', '', 'cancelled', 'CANCEL', 2, D3, false, false],
      ['cev-c-range', range('11-16'), 'cancelled', 'CANCEL', 2, D3, true, false],
    ]);
    const anchor = (await events.findSeries(source, 'a')).find(
      (row) => row.recurrenceId === at('11-16') && row.thisAndFuture !== true,
    );
    expect(anchor).toMatchObject({
      allDay: true,
      recurring: false,
      threadId: 'thr-cancel',
      rangeEndsAt: '2026-11-17T10:00:00.000Z',
      ics: RANGE_ICS,
    });
    const restored = await events.saveIfCurrent({
      ...(anchor as StoredCalendarEvent),
      id: CalendarEventIdSchema.parse('cev-b-at-cut'),
      uid: 'b',
      recurrenceId: at('11-30'),
      status: 'confirmed',
      revision: 0,
    });
    expect(restored).toMatchObject({ recurrenceId: at('11-30'), status: 'confirmed' });
  });
});
