import type { Mailbox } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { present, type SeededAccount, seedAccount } from '../support/fixtures';
import {
  backfillUntilDone,
  processedOf,
  seedHistory,
  storedMessages,
  storedUidsIn,
} from '../support/history';
import { MemoryHistoryBackfills } from '../support/memory/memory-history-backfills';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ARCHIVE_SIZE = 1500;
const RESET_SIZE = 700;
const TIGHT = { sliceMessages: 500, sliceMs: 15_000, batch: 100 };

interface Setup {
  readonly engine: TestEngine;
  readonly seeded: SeededAccount;
  readonly archive: Mailbox;
  readonly backfills: MemoryHistoryBackfills;
}

const setup = async (size = ARCHIVE_SIZE): Promise<Setup> => {
  const created: MemoryHistoryBackfills[] = [];
  const engine = createTestEngine({
    sync: { history: TIGHT },
    historyBackfills: (db) => {
      const backfills = new MemoryHistoryBackfills(db);
      created.push(backfills);
      return backfills;
    },
  });
  const seeded = await seedAccount(engine);
  seedHistory(seeded.server, 'Archive', size);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const archive = present(
    await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Archive'),
  );
  engine.events.clear();
  return { engine, seeded, archive, backfills: present(created[0]) };
};

const allUids = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);

describe('history backfill', () => {
  it('fills the gap below the initial window newest first within the slice budget', async () => {
    const { engine, seeded, archive } = await setup();
    const initial = storedUidsIn(engine, archive.id);
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.length).toBeLessThan(100);
    const lowestInitial = present(initial[0]);

    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ skipped: false, processed: 500, more: true });
    const added = storedUidsIn(engine, archive.id).filter((uid) => !initial.includes(uid));
    expect(added).toEqual(
      allUids(500)
        .map((offset) => lowestInitial - offset)
        .reverse(),
    );
  });

  it('saves the cursor after every batch', async () => {
    const { engine, seeded, archive, backfills } = await setup();
    const lowest = present(storedUidsIn(engine, archive.id)[0]);

    await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    const archiveCursors = backfills.saved.filter((cursor) => cursor.mailboxId === archive.id);
    expect(archiveCursors.map((cursor) => cursor.belowUid)).toEqual([
      ARCHIVE_SIZE + 1,
      lowest - 100,
      lowest - 200,
      lowest - 300,
      lowest - 400,
      lowest - 500,
    ]);
  });

  it('completes over several slices without duplicates and stays done', async () => {
    const { engine, seeded, archive } = await setup();
    const initial = storedUidsIn(engine, archive.id).length;

    const reports = await backfillUntilDone(engine, seeded.account.id);

    expect(reports.length).toBeGreaterThan(2);
    expect(reports.at(-1)).toMatchObject({ skipped: false, more: false });
    expect(reports.reduce((sum, report) => sum + processedOf(report), 0)).toBe(
      ARCHIVE_SIZE - initial,
    );
    expect(storedUidsIn(engine, archive.id)).toEqual(allUids(ARCHIVE_SIZE));
    const done = present(engine.db.tables.historyCursors.get(archive.id));
    expect(done.belowUid).toBe(1);
    expect(done.doneAt).not.toBeNull();
    const again = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);
    expect(again).toMatchObject({ skipped: false, processed: 0, more: false });
  });

  it('stores history rows without bodies and keeps initial window rows local', async () => {
    const { engine, seeded, archive } = await setup();
    const initial = new Set(storedUidsIn(engine, archive.id));

    await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    const archived = storedMessages(engine).filter((message) => message.mailboxId === archive.id);
    const history = archived.filter((message) => !initial.has(message.uid));
    const local = archived.filter((message) => initial.has(message.uid));
    expect(history.every((message) => message.bodyState === 'remote')).toBe(true);
    expect(history.every((message) => message.textBody === null)).toBe(true);
    expect(history.every((message) => message.htmlBody === null)).toBe(true);
    expect(present(history[0]).snippet).toMatch(/^Body of archive-\d+$/);
    expect(local.every((message) => message.bodyState === undefined)).toBe(true);
    expect(seeded.server.fetchedMessages).toEqual([]);
  });

  it('restarts a mailbox from the top after its UIDVALIDITY changed', async () => {
    const { engine, seeded, archive } = await setup(RESET_SIZE);
    await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);
    seeded.server.resetUidValidity('Archive');

    const skipped = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(skipped).toMatchObject({ skipped: false, processed: 0, more: true });
    const perMailbox = skipped.skipped ? [] : skipped.perMailbox;
    expect(perMailbox).toContainEqual({ mailboxId: archive.id, processed: 0, done: false });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const reports = await backfillUntilDone(engine, seeded.account.id);
    expect(reports.at(-1)).toMatchObject({ more: false });
    expect(storedUidsIn(engine, archive.id)).toEqual(allUids(RESET_SIZE));
    expect(present(engine.db.tables.historyCursors.get(archive.id)).uidValidity).toBe(
      seeded.server.mailbox('Archive').uidValidity,
    );
  });

  it('reports the history backfill as unsupported without the store capability', async () => {
    const engine = createTestEngine({ historyBackfills: null });
    const { account } = await seedAccount(engine);

    expect(await engine.services.sync.backfillHistory(USER_ID, account.id)).toEqual({
      skipped: true,
      reason: 'unsupported',
    });
  });
});
