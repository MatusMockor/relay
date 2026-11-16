import type { MailboxId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { calendarOf, DAY_WINDOW, eventData } from '../support/calendar-fixtures';
import { deliverMail, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const sync = (engine: TestEngine, seeded: SeededAccount) =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

const seedLegacyMailbox = async (engine: TestEngine, seeded: SeededAccount) => {
  const inbox = present(
    [...engine.db.tables.mailboxes.values()].find((mailbox) => mailbox.role === 'inbox'),
  );
  engine.db.tables.calendarEvents.clear();
  await engine.repositories.pendingWork.put({
    accountId: seeded.account.id,
    kind: 'calendar-backfill',
    ref: inbox.id,
    payload: { mailboxId: inbox.id, afterUid: 0 },
    createdAt: '2026-11-15T09:00:00.000Z',
  });
  seeded.server.fetchedMessages.length = 0;
  return inbox;
};

const deliverInvites = (engine: TestEngine, seeded: SeededAccount, count: number) => {
  for (let index = 1; index <= count; index += 1) {
    const id = `inv-${index}`;
    engine.calendar.parser.register(
      id,
      calendarOf('REQUEST', eventData({ uid: `evt-${index}@partner.test`, summary: id })),
    );
    deliverMail(seeded.server, 'INBOX', { id, headers: { 'X-Test-Calendar': id } });
  }
  deliverMail(seeded.server, 'INBOX', { id: 'plain' });
};

const titles = async (engine: TestEngine): Promise<string[]> =>
  (await engine.services.calendar.occurrences(USER_ID, DAY_WINDOW))
    .map((occurrence) => occurrence.title)
    .sort();

describe('Calendar invitation back-fill', () => {
  it('ingests invitations of stored messages in bounded, resumable batches', async () => {
    const engine = createTestEngine({ calendar: { inviteBackfillBatch: 2 } });
    const seeded = await seedAccount(engine);
    deliverInvites(engine, seeded, 3);
    await sync(engine, seeded);
    await seedLegacyMailbox(engine, seeded);

    await sync(engine, seeded);

    expect(await titles(engine)).toEqual(['inv-1', 'inv-2']);
    expect(seeded.server.fetchedMessages).toEqual([
      { path: 'INBOX', uid: 1 },
      { path: 'INBOX', uid: 2 },
    ]);
    const [cursor] = [...engine.db.tables.pendingWork.values()];
    expect(cursor?.payload).toMatchObject({ afterUid: 2 });

    await sync(engine, seeded);

    expect(await titles(engine)).toEqual(['inv-1', 'inv-2', 'inv-3']);
    expect(seeded.server.fetchedMessages.map((fetched) => fetched.uid)).toEqual([1, 2, 3]);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('pauses on a provider error and resumes from the cursor on the next sync', async () => {
    const engine = createTestEngine({ calendar: { inviteBackfillBatch: 10 } });
    const seeded = await seedAccount(engine);
    deliverInvites(engine, seeded, 2);
    await sync(engine, seeded);
    await seedLegacyMailbox(engine, seeded);
    seeded.server.failFetchUid = 2;

    await sync(engine, seeded);
    expect(await titles(engine)).toEqual(['inv-1']);
    seeded.server.failFetchUid = null;

    await sync(engine, seeded);
    expect(await titles(engine)).toEqual(['inv-1', 'inv-2']);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('drops the back-fill of a mailbox that no longer exists', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    await sync(engine, seeded);
    await engine.repositories.pendingWork.put({
      accountId: seeded.account.id,
      kind: 'calendar-backfill',
      ref: 'mbx_gone',
      payload: { mailboxId: 'mbx_gone' as MailboxId, afterUid: 0 },
      createdAt: '2026-11-15T09:00:00.000Z',
    });

    await sync(engine, seeded);

    expect(engine.db.tables.pendingWork.size).toBe(0);
  });
});
