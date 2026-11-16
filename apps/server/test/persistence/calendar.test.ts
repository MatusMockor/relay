import { randomBytes } from 'node:crypto';
import type { CalendarSubscriptionRecord, StoredCalendarEvent } from '@relay/engine';
import type { MailAccount, UserId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { AesGcmCalendarFeedSecrets } from '../../src/persistence/credentials/aes-gcm-calendar-feed-secrets';
import { AesGcmCipher } from '../../src/persistence/credentials/aes-gcm-cipher';
import { PgCalendarFeedSecretStore } from '../../src/persistence/credentials/pg-calendar-feed-secret-store';
import { calendarSubscriptions } from '../../src/persistence/schema';
import { at, newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const buildSubscription = (
  userId: UserId,
  overrides: Partial<CalendarSubscriptionRecord> = {},
): CalendarSubscriptionRecord => ({
  id: newId('calendarSubscription'),
  userId,
  name: 'Rodina',
  color: '#22aa66',
  host: 'calendar.example.test',
  status: 'pending',
  lastError: null,
  lastSyncedAt: null,
  eventCount: 0,
  createdAt: at(0),
  updatedAt: at(0),
  etag: null,
  lastModified: null,
  lastAttemptAt: null,
  ...overrides,
});

const buildEvent = (
  account: MailAccount,
  overrides: Partial<StoredCalendarEvent> = {},
): StoredCalendarEvent => ({
  id: newId('calendarEvent'),
  userId: account.userId,
  source: { kind: 'invite', accountId: account.id },
  uid: 'uid-1@partner.test',
  recurrenceId: null,
  sequence: 0,
  dtstamp: '2026-11-15T07:00:00.000Z',
  status: 'confirmed',
  summary: 'Plánovanie Q1',
  location: null,
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
  createdAt: at(0),
  updatedAt: at(0),
  revision: 0,
  ...overrides,
});

const DAY = { from: '2026-11-16T00:00:00.000Z', to: '2026-11-17T00:00:00.000Z' };

describe('Postgres calendar repositories', () => {
  const context = usePgTestContext();

  it('upserts events by series and lists complete series for a range', async () => {
    const { account } = await seedAccount(context.repositories);
    const events = context.repositories.calendarEvents;
    const first = await events.upsert(
      buildEvent(account, { threadId: newId('thread'), messageId: newId('message') }),
    );
    const moved = await events.upsert(buildEvent(account, { sequence: 1, summary: 'Presunuté' }));
    await events.upsert(
      buildEvent(account, {
        uid: 'weekly',
        recurring: true,
        startsAt: '2026-10-01T08:00:00.000Z',
        endsAt: '2026-10-01T08:15:00.000Z',
        rangeEndsAt: null,
      }),
    );
    await events.upsert(
      buildEvent(account, {
        uid: 'weekly',
        recurrenceId: '2027-01-04T08:00:00.000Z',
        startsAt: '2027-01-04T08:00:00.000Z',
        endsAt: '2027-01-04T08:15:00.000Z',
        rangeEndsAt: '2027-01-04T08:15:00.000Z',
      }),
    );

    expect(moved).toMatchObject({ id: first.id, summary: 'Presunuté', createdAt: first.createdAt });
    const stale = await events.upsert(buildEvent(account, { sequence: 0, summary: 'Staré' }));
    expect(stale).toMatchObject({ sequence: 1, summary: 'Presunuté' });
    const sameRevisionLater = await events.upsert(
      buildEvent(account, { sequence: 1, summary: 'Neskôr', dtstamp: '2026-11-15T09:00:00.000Z' }),
    );
    expect(sameRevisionLater.summary).toBe('Neskôr');
    const rows = await events.listForRange(account.userId, DAY);
    expect(rows.map((row) => [row.uid, row.recurrenceId])).toEqual([
      ['weekly', null],
      ['uid-1@partner.test', null],
      ['weekly', '2027-01-04T08:00:00.000Z'],
    ]);
    const current = await events.findById(account.userId, first.id);
    expect(current).not.toBeNull();
    const response = {
      myPartstat: 'declined',
      attendees: [{ name: null, email: 'me@example.com', partstat: 'declined', role: null }],
      updatedAt: at(5),
    } as const;
    expect(
      await events.updateResponse(first.id, {
        ...response,
        expectedRevision: (current?.revision ?? 0) + 1,
      }),
    ).toBeNull();
    expect(await events.findById(account.userId, first.id)).toMatchObject({
      myPartstat: current?.myPartstat,
      updatedAt: current?.updatedAt,
    });
    const answered = await events.updateResponse(first.id, {
      ...response,
      expectedRevision: current?.revision ?? 0,
    });
    expect(answered).toMatchObject({ myPartstat: 'declined', updatedAt: at(5) });
    await context.repositories.accounts.delete(account.userId, account.id);
    expect(await events.findById(account.userId, first.id)).toBeNull();
  });

  it('manages subscriptions and replaces feed events atomically per subscription', async () => {
    const { account } = await seedAccount(context.repositories);
    const subscriptions = context.repositories.calendarSubscriptions;
    const record = await subscriptions.create(buildSubscription(account.userId));
    const feed = { kind: 'subscription', subscriptionId: record.id } as const;
    await context.repositories.calendarEvents.replaceSubscriptionEvents(record.id, [
      buildEvent(account, { source: feed, uid: 'a' }),
      buildEvent(account, { source: feed, uid: 'b' }),
    ]);
    await context.repositories.calendarEvents.replaceSubscriptionEvents(record.id, [
      buildEvent(account, { source: feed, uid: 'c' }),
    ]);
    await subscriptions.recordFetch(record.id, {
      status: 'ok',
      lastError: null,
      attemptedAt: at(10),
      syncedAt: at(10),
      etag: '"v1"',
      lastModified: null,
      eventCount: 1,
    });

    const rows = await context.repositories.calendarEvents.listForRange(account.userId, DAY);
    expect(rows.filter((row) => row.source.kind === 'subscription').map((row) => row.uid)).toEqual([
      'c',
    ]);
    expect(await subscriptions.findById(account.userId, record.id)).toMatchObject({
      status: 'ok',
      etag: '"v1"',
      eventCount: 1,
      lastAttemptAt: at(10),
    });
    expect((await subscriptions.listDue(at(5), 50)).some((due) => due.id === record.id)).toBe(
      false,
    );
    expect((await subscriptions.listDue(at(20), 50)).some((due) => due.id === record.id)).toBe(
      true,
    );
    expect(await subscriptions.lockForRefresh(record.id)).toBe(true);
    expect(await subscriptions.delete(account.userId, record.id)).toBe(true);
    expect(await subscriptions.lockForRefresh(record.id)).toBe(false);
    expect(await context.repositories.calendarEvents.listForRange(account.userId, DAY)).toEqual([]);
  });

  it('stores feed URLs encrypted and bound to their subscription', async () => {
    const { account } = await seedAccount(context.repositories);
    const subscriptions = context.repositories.calendarSubscriptions;
    const first = await subscriptions.create(buildSubscription(account.userId));
    const second = await subscriptions.create(buildSubscription(account.userId));
    const secrets = new AesGcmCalendarFeedSecrets(
      new PgCalendarFeedSecretStore(context.db),
      new AesGcmCipher(randomBytes(32)),
    );
    const url = 'https://calendar.google.com/calendar/ical/x/private-abc123/basic.ics';
    await secrets.set(first.id, url);

    expect(await secrets.get(first.id)).toBe(url);
    const [row] = await context.db
      .select({ envelope: calendarSubscriptions.urlEnvelope })
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.id, first.id));
    expect(row?.envelope).not.toContain('private-abc123');
    await context.db
      .update(calendarSubscriptions)
      .set({ urlEnvelope: row?.envelope ?? null })
      .where(eq(calendarSubscriptions.id, second.id));
    await expect(secrets.get(second.id)).rejects.toThrow();
    await secrets.delete(first.id);
    expect(await secrets.get(first.id)).toBeNull();
    await expect(secrets.set(newId('calendarSubscription'), url)).rejects.toThrow();
  });
});
