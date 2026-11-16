import type { StoredCalendarEvent } from '@relay/engine';
import { CalendarEventIdSchema, type MailAccount } from '@relay/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const STAMP = '2026-11-15T08:00:00.000Z';

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
  createdAt: STAMP,
  updatedAt: STAMP,
  revision: 0,
  ...overrides,
});

const ACCEPTED = {
  myPartstat: 'accepted',
  attendees: [{ name: null, email: 'me@example.com', partstat: 'accepted', role: null }],
  updatedAt: STAMP,
} as const;

describe('SQLite calendar event revisions', () => {
  let store: TestStore;
  let account: MailAccount;

  beforeEach(async () => {
    store = createTestStore();
    account = (await seedAccount(store.repositories)).account;
  });

  it('inserts a new event once and advances the revision on every write', async () => {
    const events = store.repositories.calendarEvents;
    const saved = await events.saveIfCurrent(buildEvent(account));
    expect(saved?.revision).toBe(1);
    expect(await events.saveIfCurrent(buildEvent(account, { summary: 'Druhá kópia' }))).toBeNull();

    const upserted = await events.upsert(buildEvent(account, { summary: 'Presunuté' }));
    expect(upserted).toMatchObject({ id: saved?.id, revision: 2 });
    const answered = await events.updateResponse(upserted.id, {
      ...ACCEPTED,
      expectedRevision: upserted.revision,
    });
    expect(answered?.revision).toBe(3);
  });

  it('rejects a write from an older read even when the timestamps are identical', async () => {
    const events = store.repositories.calendarEvents;
    const read = await events.saveIfCurrent(buildEvent(account));
    expect(read).not.toBeNull();
    const original = read as StoredCalendarEvent;
    const answered = await events.updateResponse(original.id, {
      ...ACCEPTED,
      expectedRevision: original.revision,
    });
    expect(answered).toMatchObject({ updatedAt: original.updatedAt, revision: 2 });

    expect(await events.saveIfCurrent({ ...original, summary: 'Staré čítanie' })).toBeNull();
    expect(
      await events.updateResponse(original.id, {
        ...ACCEPTED,
        expectedRevision: original.revision,
      }),
    ).toBeNull();
    expect(await events.findById(LOCAL_USER_ID, original.id)).toMatchObject({
      summary: 'Plánovanie Q1',
      myPartstat: 'accepted',
    });

    const current = await events.findById(LOCAL_USER_ID, original.id);
    const fresh = await events.saveIfCurrent({ ...(current ?? original), summary: 'Agenda' });
    expect(fresh).toMatchObject({ summary: 'Agenda', myPartstat: 'accepted', revision: 3 });
  });
});
