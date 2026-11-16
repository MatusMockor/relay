import type { StoredCalendarEvent } from '@relay/engine';
import { CalendarEventIdSchema, type MailAccount } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const CUT = '2026-11-23T09:00:00.000Z';

const buildEvent = (
  account: MailAccount,
  overrides: Partial<StoredCalendarEvent> = {},
): StoredCalendarEvent => ({
  id: CalendarEventIdSchema.parse(`evt-${String(Math.random()).slice(2, 10)}`),
  userId: LOCAL_USER_ID,
  source: { kind: 'invite', accountId: account.id },
  uid: 'weekly@partner.test',
  recurrenceId: null,
  sequence: 0,
  dtstamp: '2026-11-15T07:00:00.000Z',
  status: 'confirmed',
  summary: 'Porada',
  location: null,
  description: null,
  organizer: { name: 'Peter', email: 'peter@partner.test' },
  attendees: [],
  method: 'REQUEST',
  myPartstat: null,
  myEmail: null,
  allDay: false,
  startsAt: '2026-11-02T09:00:00.000Z',
  endsAt: '2026-11-02T10:00:00.000Z',
  recurring: true,
  rangeEndsAt: '2026-11-24T10:00:00.000Z',
  ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
  messageId: null,
  threadId: null,
  createdAt: '2026-11-15T08:00:00.000Z',
  updatedAt: '2026-11-15T08:00:00.000Z',
  revision: 0,
  ...overrides,
});

const tombstone = (account: MailAccount): StoredCalendarEvent =>
  buildEvent(account, {
    recurrenceId: CUT,
    thisAndFuture: true,
    endsSeries: true,
    status: 'cancelled',
    method: 'CANCEL',
    sequence: 1,
    recurring: false,
    startsAt: CUT,
    endsAt: CUT,
    rangeEndsAt: CUT,
  });

describe('SQLite THISANDFUTURE rows', () => {
  let store: TestStore;
  let account: MailAccount;

  beforeEach(async () => {
    store = createTestStore();
    account = (await seedAccount(store.repositories)).account;
  });

  afterEach(() => {
    store.database.close();
  });

  it('keeps the range flag and the bounded series range through every write path', async () => {
    const events = store.repositories.calendarEvents;
    const master = await events.saveIfCurrent(buildEvent(account));
    const cut = await events.saveIfCurrent(tombstone(account));

    expect(master).not.toHaveProperty('thisAndFuture');
    expect(cut).toMatchObject({ thisAndFuture: true, endsSeries: true, revision: 1 });
    expect(await events.findSeries(tombstone(account).source, 'weekly@partner.test')).toEqual([
      master,
      cut,
    ]);
    const november = await events.listForRange(LOCAL_USER_ID, {
      from: '2026-11-16T00:00:00.000Z',
      to: '2026-11-17T00:00:00.000Z',
    });
    expect(november.map((row) => row.recurrenceId)).toEqual([null, CUT]);
    expect(
      await events.listForRange(LOCAL_USER_ID, {
        from: '2026-12-07T00:00:00.000Z',
        to: '2026-12-08T00:00:00.000Z',
      }),
    ).toEqual([]);

    const { thisAndFuture: _flag, endsSeries: _ends, ...plain } = cut as StoredCalendarEvent;
    const rewritten = await events.saveIfCurrent({ ...plain, sequence: 2 });
    expect(rewritten).not.toHaveProperty('thisAndFuture');
    expect(rewritten).not.toHaveProperty('endsSeries');
    const upserted = await events.upsert({ ...tombstone(account), sequence: 3 });
    expect(upserted).toMatchObject({
      id: cut?.id,
      thisAndFuture: true,
      endsSeries: true,
      sequence: 3,
    });

    const anchor = await events.saveIfCurrent(
      buildEvent(account, {
        recurrenceId: '2026-11-16T09:00:00.000Z',
        thisAndFuture: true,
        rangeRevision: { sequence: 1, dtstamp: '2026-11-14T07:00:00.000Z' },
        status: 'cancelled',
        sequence: 3,
        recurring: false,
        startsAt: '2026-11-16T11:00:00.000Z',
        endsAt: '2026-11-16T11:30:00.000Z',
        rangeEndsAt: null,
      }),
    );
    expect(anchor).toMatchObject({
      sequence: 3,
      rangeRevision: { sequence: 1, dtstamp: '2026-11-14T07:00:00.000Z' },
    });
    expect(master).not.toHaveProperty('rangeRevision');
  });
});
