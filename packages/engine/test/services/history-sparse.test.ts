import type { MailboxId } from '@relay/shared/domain';
import type { SyncReport, UidRange } from '../../src';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, type SeededAccount, seedAccount } from '../support/fixtures';
import { backfillUntilDone, historyDate, storedUidsIn } from '../support/history';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const TOP_UID = 10_000_000;
const SPARSE_UIDS = [1, 2, 4_000_000];

interface Sparse {
  readonly engine: TestEngine;
  readonly seeded: SeededAccount;
  readonly archiveId: MailboxId;
}

const sparseArchive = async (history: {
  readonly sliceSearches: number;
  readonly sliceMs?: number;
}): Promise<Sparse> => {
  const engine = createTestEngine({
    sync: { history: { sliceMessages: 500, sliceMs: 15_000, batch: 100, ...history } },
  });
  const seeded = await seedAccount(engine);
  const archive = seeded.server.mailbox('Archive');
  for (const [index, uid] of [...SPARSE_UIDS, TOP_UID].entries()) {
    archive.uidNext = uid;
    const date = uid === TOP_UID ? TEST_NOW : historyDate(index, SPARSE_UIDS.length);
    deliverMail(seeded.server, 'Archive', { id: `sparse-${String(uid)}`, date });
  }
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const mailbox = await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Archive');
  seeded.server.uidSearches.length = 0;
  return { engine, seeded, archiveId: present(mailbox).id };
};

const rangeKey = (range: UidRange): string => `${String(range.from)}:${String(range.to)}`;

const belowUidOf = (engine: TestEngine, archiveId: MailboxId): number =>
  present(engine.db.tables.historyCursors.get(archiveId)).belowUid;

describe('history backfill of a sparse mailbox', () => {
  it('persists empty range progress across slices and completes without repeated searches', async () => {
    const { engine, seeded, archiveId } = await sparseArchive({ sliceSearches: 5 });
    expect(storedUidsIn(engine, archiveId)).toEqual([TOP_UID]);

    const first = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(first).toMatchObject({ skipped: false, processed: 0, more: true });
    expect(seeded.server.uidSearches).toHaveLength(5);
    const fifth = present(seeded.server.uidSearches[4]);
    expect(belowUidOf(engine, archiveId)).toBe(fifth.from);

    const reports = await backfillUntilDone(engine, seeded.account.id);

    expect(reports.at(-1)).toMatchObject({ skipped: false, more: false });
    expect(reports.length).toBeGreaterThan(3);
    expect(storedUidsIn(engine, archiveId)).toEqual([...SPARSE_UIDS, TOP_UID]);
    const searches = seeded.server.uidSearches.map(rangeKey);
    expect(new Set(searches).size).toBe(searches.length);
    const done = present(engine.db.tables.historyCursors.get(archiveId));
    expect(done.doneAt).not.toBeNull();
  });

  it('stops walking empty ranges at the slice deadline and resumes below them', async () => {
    const { engine, seeded, archiveId } = await sparseArchive({
      sliceSearches: 64,
      sliceMs: 15_000,
    });
    seeded.server.onUidSearch = () => {
      engine.clock.advance(6_000);
    };

    await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(seeded.server.uidSearches).toHaveLength(3);
    const third = present(seeded.server.uidSearches[2]);
    expect(belowUidOf(engine, archiveId)).toBe(third.from);

    await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(seeded.server.uidSearches).toHaveLength(6);
    expect(present(seeded.server.uidSearches[3]).to).toBe(third.from - 1);
  });

  it('yields to a requested sync after the current empty range search', async () => {
    const { engine, seeded, archiveId } = await sparseArchive({ sliceSearches: 64 });
    const requested: { sync: Promise<SyncReport> | null } = { sync: null };
    seeded.server.onUidSearch = () => {
      if (seeded.server.uidSearches.length < 2) {
        return;
      }
      seeded.server.onUidSearch = null;
      requested.sync = engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    };

    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ skipped: false, processed: 0, more: true });
    const walked = seeded.server.uidSearches.slice(0, 2);
    expect(belowUidOf(engine, archiveId)).toBe(present(walked[1]).from);
    expect(await present(requested.sync)).toMatchObject({ ok: true });
    expect(seeded.server.uidSearches.slice(0, 2)).toEqual(walked);
  });
});
