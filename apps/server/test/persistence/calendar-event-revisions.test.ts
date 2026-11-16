import type { StoredCalendarEvent } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { at, newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const buildEvent = (
  account: MailAccount,
  overrides: Partial<StoredCalendarEvent> = {},
): StoredCalendarEvent => ({
  id: newId('calendarEvent'),
  userId: account.userId,
  source: { kind: 'invite', accountId: account.id },
  uid: `${newId('calendarEvent')}@partner.test`,
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

const ACCEPTED = {
  myPartstat: 'accepted',
  attendees: [{ name: null, email: 'me@example.com', partstat: 'accepted', role: null }],
  updatedAt: at(0),
} as const;

describe('Postgres calendar event revisions', () => {
  const context = usePgTestContext();

  const storedEvent = async () => {
    const { account } = await seedAccount(context.repositories);
    const saved = await context.repositories.calendarEvents.saveIfCurrent(buildEvent(account));
    expect(saved?.revision).toBe(1);
    return { account, saved: saved as StoredCalendarEvent };
  };

  it('inserts a new event once and advances the revision on every write', async () => {
    const events = context.repositories.calendarEvents;
    const { account, saved } = await storedEvent();
    expect(
      await events.saveIfCurrent(buildEvent(account, { uid: saved.uid, summary: 'Kópia' })),
    ).toBeNull();

    const upserted = await events.upsert(buildEvent(account, { uid: saved.uid, sequence: 1 }));
    expect(upserted).toMatchObject({ id: saved.id, revision: 2 });
    const answered = await events.updateResponse(saved.id, {
      ...ACCEPTED,
      expectedRevision: upserted.revision,
    });
    expect(answered?.revision).toBe(3);
  });

  it('rejects a write from an older read even when the timestamps are identical', async () => {
    const events = context.repositories.calendarEvents;
    const { account, saved } = await storedEvent();
    const answered = await events.updateResponse(saved.id, {
      ...ACCEPTED,
      expectedRevision: saved.revision,
    });
    expect(answered).toMatchObject({ updatedAt: saved.updatedAt, revision: 2 });

    expect(await events.saveIfCurrent({ ...saved, summary: 'Staré čítanie' })).toBeNull();
    expect(
      await events.updateResponse(saved.id, { ...ACCEPTED, expectedRevision: saved.revision }),
    ).toBeNull();
    expect(await events.findById(account.userId, saved.id)).toMatchObject({
      summary: 'Plánovanie Q1',
      myPartstat: 'accepted',
    });
  });

  it('sees an answer committed during an open ingestion transaction and retries on it', async () => {
    const events = context.repositories.calendarEvents;
    const { account, saved } = await storedEvent();

    const outcome = await context.db.transaction(async (tx) => {
      const inner = createPgRepositories(tx).calendarEvents;
      const read = await inner.findById(account.userId, saved.id);
      await events.updateResponse(saved.id, { ...ACCEPTED, expectedRevision: saved.revision });
      const stale = await inner.saveIfCurrent({ ...(read ?? saved), summary: 'Agenda' });
      const reread = await inner.findById(account.userId, saved.id);
      const fresh = await inner.saveIfCurrent({ ...(reread ?? saved), summary: 'Agenda' });
      return { stale, fresh };
    });

    expect(outcome.stale).toBeNull();
    expect(outcome.fresh).toMatchObject({ summary: 'Agenda', myPartstat: 'accepted', revision: 3 });
  });

  it('rejects an answer read before an ingestion write that commits first', async () => {
    const events = context.repositories.calendarEvents;
    const { saved } = await storedEvent();
    const answers: Promise<StoredCalendarEvent | null>[] = [];

    await context.db.transaction(async (tx) => {
      const inner = createPgRepositories(tx).calendarEvents;
      expect(await inner.saveIfCurrent({ ...saved, summary: 'Agenda' })).not.toBeNull();
      answers.push(
        events.updateResponse(saved.id, { ...ACCEPTED, expectedRevision: saved.revision }),
      );
    });

    expect(await Promise.all(answers)).toEqual([null]);
  });
});
