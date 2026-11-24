import { describe, expect, it } from 'vitest';
import { deliverMail, type SeededAccount, seedAccount } from '../support/fixtures';
import { cancelOne, master, rows } from '../support/range-invites';
import { deliverAt, sync } from '../support/rebuild-invites';
import { createTestEngine, type TestEngine } from '../support/test-engine';

const LATER = '2026-11-30T09:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
const day = (date: number): string => `2026-11-0${String(date)}T08:00:00.000Z`;

const inviteWork = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'calendar-invite');

const masterStatus = (engine: TestEngine) =>
  rows(engine).find((row) => row.recurrenceId === null)?.status ?? null;

const deliverRequest = (engine: TestEngine, seeded: SeededAccount, path = 'INBOX') => {
  deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(3), path);
};

const deliverCancel = (engine: TestEngine, seeded: SeededAccount, path: string) => {
  const cancel = cancelOne(LATER, { recurrenceId: null, sequence: 1, dtstamp: at(11) });
  deliverAt(engine, seeded, 'all', cancel, day(4), path);
};

const resetOnNextFetch = (seeded: SeededAccount) => {
  seeded.server.beforeNextFetch = (path) => {
    seeded.server.resetUidValidity(path);
  };
};

const resetOnFetchOf = (seeded: SeededAccount, target: string) => {
  seeded.server.beforeNextFetch = (path) => {
    if (path !== target) {
      resetOnFetchOf(seeded, target);
      return;
    }
    seeded.server.resetUidValidity(path);
  };
};

describe('SyncService calendar holds around an unfinished initial sync', () => {
  it('holds new invitations behind held ones after the unfinished mailbox lost its role', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const seeded = await seedAccount(engine);
    const { server } = seeded;
    deliverRequest(engine, seeded);
    resetOnFetchOf(seeded, 'Sent');
    expect((await sync(engine, seeded)).ok).toBe(true);
    expect(inviteWork(engine).map((work) => work.payload)).toMatchObject([{ held: true }]);
    server.mailboxes.set('Sent', { ...server.mailbox('Sent'), role: 'custom' });
    deliverCancel(engine, seeded, 'INBOX');

    const synced = await sync(engine, seeded);

    expect(synced.ok).toBe(true);
    expect(masterStatus(engine)).toBe('cancelled');
    expect(inviteWork(engine)).toEqual([]);
  });

  it('holds a cancellation from an incremental pass until the initial sync of another mailbox is done', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const seeded = await seedAccount(engine);
    deliverRequest(engine, seeded);
    resetOnNextFetch(seeded);
    expect((await sync(engine, seeded)).ok).toBe(true);
    deliverCancel(engine, seeded, 'Sent');

    const synced = await sync(engine, seeded);

    expect(synced.ok).toBe(true);
    expect(masterStatus(engine)).toBe('cancelled');
    expect(inviteWork(engine)).toEqual([]);
  });

  it('keeps held invitations while a mailbox is skipped for a UIDVALIDITY change in its incremental pass', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const seeded = await seedAccount(engine);
    deliverRequest(engine, seeded);
    deliverCancel(engine, seeded, 'Sent');
    resetOnNextFetch(seeded);
    expect((await sync(engine, seeded)).ok).toBe(true);
    resetOnNextFetch(seeded);

    const skipped = await sync(engine, seeded);

    expect(skipped.ok).toBe(true);
    expect(rows(engine)).toEqual([]);
    expect(inviteWork(engine).map((work) => work.payload)).toMatchObject([
      { held: true },
      { held: true },
    ]);

    await sync(engine, seeded);

    expect(masterStatus(engine)).toBe('cancelled');
    expect(inviteWork(engine)).toEqual([]);
  });

  it('releases held invitations when an unfinished mailbox is no longer selected for sync', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const seeded = await seedAccount(engine);
    const { server } = seeded;
    deliverRequest(engine, seeded);
    deliverMail(server, 'Archive', { id: 'older', date: day(2) });
    deliverCancel(engine, seeded, 'Archive');
    server.interruptStreamAfter = 2;
    expect((await sync(engine, seeded)).ok).toBe(false);
    expect(inviteWork(engine)).toHaveLength(2);
    server.mailboxes.set('Archive', { ...server.mailbox('Archive'), role: 'custom' });

    const synced = await sync(engine, seeded);

    expect(synced.ok).toBe(true);
    expect(masterStatus(engine)).toBe('cancelled');
    expect(inviteWork(engine)).toEqual([]);
  });
});
