import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import {
  type CalendarEventRepository,
  type MailboxRepository,
  PORT_TOKENS,
  type PendingWorkRepository,
  type StoredCalendarEvent,
} from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AccountId } from '@relay/shared/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { waitForInvites } from './support/invite-settle';
import { type SeriesMessage, type SeriesParties, seriesMail } from './support/series-mail';

const WINDOW = { from: '2026-11-01T00:00:00Z', to: '2026-11-14T00:00:00Z', timeZone: 'UTC' };
const REPLIED_AT = '2026-11-02T12:00:00.000Z';

const daily: SeriesMessage = {
  method: 'REQUEST',
  subject: 'Pozvánka: Report',
  lines: [
    'DTSTAMP:20261101T070000Z',
    'SEQUENCE:0',
    'SUMMARY:Report',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T093000Z',
    'RRULE:FREQ=DAILY;COUNT=5',
  ],
};

const moved: SeriesMessage = {
  method: 'REQUEST',
  subject: 'Presunuté 03.11.',
  lines: [
    'DTSTAMP:20261101T090000Z',
    'SEQUENCE:1',
    'SUMMARY:Report presunutý',
    'RECURRENCE-ID:20261103T090000Z',
    'DTSTART:20261103T150000Z',
    'DTEND:20261103T153000Z',
  ],
};

describe('one-time rebuild of invitation series over the server (Postgres)', () => {
  let app: TestApp;
  let owner: GreenMailUser;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  beforeEach(async () => {
    owner = await createGreenMailUser('rebuild');
  });

  afterEach(async () => {
    await deleteGreenMailUser(owner);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restores rows an older version overwrote and keeps the local answer', async () => {
    const series: SeriesParties = {
      uid: `rebuild-${randomUUID()}@rebuild.test`,
      organizer: 'peter@partner.test',
      attendee: owner.email,
    };
    const session = await registerUser(app.api, `rb-${randomUUID().slice(0, 8)}@relay.test`);
    const client = await openImap(owner);
    await client.append('INBOX', await seriesMail(series, daily));
    await client.append('INBOX', await seriesMail(series, moved));
    await client.logout();
    const account = await addImapAccount(app.api, session.accessToken, owner);
    await waitForInvites(app, session.accessToken, account.id, 2);
    const events = app.app.get<symbol, CalendarEventRepository>(
      PORT_TOKENS.CalendarEventRepository,
    );
    const source = { kind: 'invite', accountId: account.id } as const;
    const rowsOf = () => events.findSeries(source, series.uid);
    const before = await rowsOf();
    const master = before.find((row) => row.recurrenceId === null) as StoredCalendarEvent;
    const instance = before.find((row) => row.recurrenceId !== null) as StoredCalendarEvent;
    await events.saveIfCurrent({ ...master, messageId: instance.messageId });
    await events.saveIfCurrent({
      ...instance,
      status: 'cancelled',
      method: 'CANCEL',
      sequence: 2,
      myPartstat: 'accepted',
      attendees: instance.attendees.map((attendee) =>
        attendee.email === owner.email
          ? { ...attendee, partstat: 'accepted', repliedAt: REPLIED_AT }
          : attendee,
      ),
    });

    await seedRebuild(account.id);
    await app.api.ok(api.sync.now, { body: { accountId: account.id } }, session.accessToken);
    const work = app.app.get<symbol, PendingWorkRepository>(PORT_TOKENS.PendingWorkRepository);
    await expect
      .poll(async () => (await work.list(account.id, 'calendar-rebuild')).length, {
        timeout: 20_000,
        interval: 250,
      })
      .toBe(0);

    const after = await rowsOf();
    expect(after.find((row) => row.recurrenceId === null)).toMatchObject({
      id: master.id,
      messageId: master.messageId,
    });
    const restored = after.find((row) => row.id === instance.id);
    expect(restored).toMatchObject({ status: 'confirmed', sequence: 1, myPartstat: 'accepted' });
    expect(restored?.attendees.find((attendee) => attendee.email === owner.email)).toMatchObject({
      partstat: 'accepted',
      repliedAt: REPLIED_AT,
    });
    expect(await work.list(account.id, 'calendar-rebuild-part')).toEqual([]);
    const shown = (
      await app.api.ok(api.calendar.occurrences, { query: WINDOW }, session.accessToken)
    ).items.map((item) => `${item.start.slice(5, 16)} ${item.title}`);
    expect(shown).toContain('11-03T15:00 Report presunutý');
  });

  const seedRebuild = async (accountId: AccountId) => {
    const work = app.app.get<symbol, PendingWorkRepository>(PORT_TOKENS.PendingWorkRepository);
    const mailboxes = await app.app
      .get<symbol, MailboxRepository>(PORT_TOKENS.MailboxRepository)
      .listForSync(accountId);
    for (const mailbox of mailboxes) {
      await work.put({
        accountId,
        kind: 'calendar-rebuild',
        ref: mailbox.id,
        payload: { mailboxId: mailbox.id, afterUid: 0 },
        createdAt: new Date().toISOString(),
      });
    }
  };
});
