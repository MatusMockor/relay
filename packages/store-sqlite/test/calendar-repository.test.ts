import type { CalendarSubscriptionRecord, StoredCalendarEvent } from '@relay/engine';
import {
  CalendarEventIdSchema,
  CalendarSubscriptionIdSchema,
  type MailAccount,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const subscriptionId = CalendarSubscriptionIdSchema.parse('sub-1');

const buildSubscription = (
  overrides: Partial<CalendarSubscriptionRecord> = {},
): CalendarSubscriptionRecord => ({
  id: subscriptionId,
  userId: LOCAL_USER_ID,
  name: 'Rodina',
  color: '#22aa66',
  host: 'calendar.example.test',
  status: 'pending',
  lastError: null,
  lastSyncedAt: null,
  eventCount: 0,
  createdAt: '2026-11-15T08:00:00.000Z',
  updatedAt: '2026-11-15T08:00:00.000Z',
  etag: null,
  lastModified: null,
  lastAttemptAt: null,
  ...overrides,
});

const buildEvent = (
  account: MailAccount,
  overrides: Partial<StoredCalendarEvent> = {},
): StoredCalendarEvent => ({
  id: CalendarEventIdSchema.parse(`evt-${String(Math.random()).slice(2, 10)}`),
  userId: LOCAL_USER_ID,
  source: { kind: 'invite', accountId: account.id },
  uid: 'uid-1@partner.test',
  recurrenceId: null,
  sequence: 0,
  dtstamp: '2026-11-15T07:00:00.000Z',
  status: 'confirmed',
  summary: 'Plánovanie Q1',
  location: 'Zasadačka Dunaj',
  description: null,
  organizer: { name: 'Peter', email: 'peter@partner.test' },
  attendees: [{ name: null, email: 'me@example.com', partstat: 'needs-action', role: null }],
  method: 'REQUEST',
  myPartstat: 'needs-action',
  myEmail: 'me@example.com',
  allDay: false,
  startsAt: '2026-11-16T09:00:00.000Z',
  endsAt: '2026-11-16T10:00:00.000Z',
  recurring: false,
  rangeEndsAt: '2026-11-16T10:00:00.000Z',
  ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
  messageId: null,
  threadId: null,
  createdAt: '2026-11-15T08:00:00.000Z',
  updatedAt: '2026-11-15T08:00:00.000Z',
  revision: 0,
  ...overrides,
});

describe('SQLite calendar repositories', () => {
  let store: TestStore;
  let account: MailAccount;

  beforeEach(async () => {
    store = createTestStore();
    account = (await seedAccount(store.repositories)).account;
  });

  afterEach(() => {
    store.database.close();
  });

  it('upserts by series and recurrence, keeping the first id', async () => {
    const { calendarEvents } = store.repositories;
    const first = await calendarEvents.upsert(
      buildEvent(account, {
        threadId: 'thr-not-yet-built' as StoredCalendarEvent['threadId'],
        messageId: 'msg-not-yet-built' as StoredCalendarEvent['messageId'],
      }),
    );
    const updated = await calendarEvents.upsert(
      buildEvent(account, { sequence: 2, summary: 'Presunuté' }),
    );

    expect(updated).toMatchObject({ id: first.id, sequence: 2, summary: 'Presunuté' });
    expect(first.threadId).toBe('thr-not-yet-built');
    const stale = await calendarEvents.upsert(
      buildEvent(account, { sequence: 1, summary: 'Staré' }),
    );
    expect(stale).toMatchObject({ sequence: 2, summary: 'Presunuté' });
    expect(await store.repositories.calendarSubscriptions.lockForRefresh(subscriptionId)).toBe(
      false,
    );
    expect(updated.createdAt).toBe(first.createdAt);
    expect(await calendarEvents.findSeries(first.source, first.uid)).toHaveLength(1);
    expect(await calendarEvents.findById(LOCAL_USER_ID, first.id)).toEqual(updated);
  });

  it('lists whole series that touch the range, including far overrides', async () => {
    const { calendarEvents } = store.repositories;
    await calendarEvents.upsert(
      buildEvent(account, {
        uid: 'weekly',
        recurring: true,
        startsAt: '2026-10-01T08:00:00.000Z',
        endsAt: '2026-10-01T08:15:00.000Z',
        rangeEndsAt: null,
      }),
    );
    await calendarEvents.upsert(
      buildEvent(account, {
        uid: 'weekly',
        recurrenceId: '2026-12-24T08:00:00.000Z',
        startsAt: '2026-12-24T08:00:00.000Z',
        endsAt: '2026-12-24T08:15:00.000Z',
        rangeEndsAt: '2026-12-24T08:15:00.000Z',
      }),
    );
    await calendarEvents.upsert(
      buildEvent(account, {
        uid: 'old',
        startsAt: '2026-01-01T08:00:00.000Z',
        endsAt: '2026-01-01T09:00:00.000Z',
        rangeEndsAt: '2026-01-01T09:00:00.000Z',
      }),
    );

    const rows = await calendarEvents.listForRange(LOCAL_USER_ID, {
      from: '2026-11-16T00:00:00.000Z',
      to: '2026-11-17T00:00:00.000Z',
    });

    expect(rows.map((row) => [row.uid, row.recurrenceId])).toEqual([
      ['weekly', null],
      ['weekly', '2026-12-24T08:00:00.000Z'],
    ]);
    expect(
      await calendarEvents.listForRange('someone-else' as typeof LOCAL_USER_ID, {
        from: '2026-11-16T00:00:00.000Z',
        to: '2026-11-17T00:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('stores responses and cascades with the account', async () => {
    const { calendarEvents, accounts } = store.repositories;
    const event = await calendarEvents.upsert(buildEvent(account));
    const response = {
      myPartstat: 'accepted',
      attendees: [{ name: null, email: 'me@example.com', partstat: 'accepted', role: null }],
      updatedAt: '2026-11-15T09:00:00.000Z',
    } as const;
    expect(
      await calendarEvents.updateResponse(event.id, {
        ...response,
        expectedRevision: event.revision + 1,
      }),
    ).toBeNull();
    expect((await calendarEvents.findById(LOCAL_USER_ID, event.id))?.myPartstat).toBe(
      event.myPartstat,
    );
    const answered = await calendarEvents.updateResponse(event.id, {
      ...response,
      expectedRevision: event.revision,
    });

    expect(answered).toMatchObject({
      myPartstat: 'accepted',
      updatedAt: '2026-11-15T09:00:00.000Z',
    });
    expect(answered?.attendees[0]?.partstat).toBe('accepted');
    await accounts.delete(LOCAL_USER_ID, account.id);
    expect(await calendarEvents.findById(LOCAL_USER_ID, event.id)).toBeNull();
  });

  it('manages subscriptions, due lists, fetch records and feed replacement', async () => {
    const { calendarSubscriptions, calendarEvents } = store.repositories;
    await calendarSubscriptions.create(buildSubscription());
    expect(await calendarSubscriptions.listDue('2026-11-15T09:00:00.000Z', 10)).toHaveLength(1);

    await calendarSubscriptions.recordFetch(subscriptionId, {
      status: 'ok',
      lastError: null,
      attemptedAt: '2026-11-15T08:30:00.000Z',
      syncedAt: '2026-11-15T08:30:00.000Z',
      etag: '"v1"',
      lastModified: null,
      eventCount: 2,
    });
    const feed = { kind: 'subscription', subscriptionId } as const;
    await calendarEvents.replaceSubscriptionEvents(subscriptionId, [
      buildEvent(account, { source: feed, uid: 'a' }),
      buildEvent(account, { source: feed, uid: 'b' }),
    ]);
    await calendarEvents.replaceSubscriptionEvents(subscriptionId, [
      buildEvent(account, { source: feed, uid: 'c' }),
    ]);

    expect(await calendarSubscriptions.findById(LOCAL_USER_ID, subscriptionId)).toMatchObject({
      status: 'ok',
      etag: '"v1"',
      eventCount: 2,
      lastAttemptAt: '2026-11-15T08:30:00.000Z',
    });
    expect(await calendarSubscriptions.listDue('2026-11-15T08:00:00.000Z', 10)).toEqual([]);
    const rows = await calendarEvents.listForRange(LOCAL_USER_ID, {
      from: '2026-11-16T00:00:00.000Z',
      to: '2026-11-17T00:00:00.000Z',
    });
    expect(rows.map((row) => [row.uid, row.source.kind])).toEqual([['c', 'subscription']]);

    const renamed = await calendarSubscriptions.update(LOCAL_USER_ID, subscriptionId, {
      name: 'Rodinný',
      updatedAt: '2026-11-15T09:00:00.000Z',
    });
    expect(renamed?.name).toBe('Rodinný');
    expect(await calendarSubscriptions.delete(LOCAL_USER_ID, subscriptionId)).toBe(true);
    expect(
      await calendarEvents.listForRange(LOCAL_USER_ID, {
        from: '2026-11-16T00:00:00.000Z',
        to: '2026-11-17T00:00:00.000Z',
      }),
    ).toEqual([]);
  });
});
