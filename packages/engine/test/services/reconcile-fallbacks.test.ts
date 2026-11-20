import { describe, expect, it } from 'vitest';
import { ReconcileScans } from '../../src/services/sync/reconcile-scans';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { MemoryHistoryBackfills } from '../support/memory/memory-history-backfills';
import { backfillUntilDone, seedHistory, storedUidsIn } from '../support/history';
import { createTestEngine, USER_ID } from '../support/test-engine';

const FULL_DIFF_MS = 60 * 60_000;
const RECONCILE = { newestFlagUids: 10, rotatingFlagUids: 10, fullExpungeDiffMs: FULL_DIFF_MS };

const completedHistory = async (condstore: boolean) => {
  const engine = createTestEngine({ sync: { reconcile: RECONCILE } });
  const seeded = await seedAccount(engine, {}, { condstore });
  const uids = seedHistory(seeded.server, 'Archive', 60);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  await backfillUntilDone(engine, seeded.account.id);
  const archive = present(
    await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Archive'),
  );
  const sync = () => engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return { engine, seeded, archive, uids, sync };
};

describe('reconciler fallbacks', () => {
  it('removes a stale UID of an unchanged CONDSTORE mailbox once the full diff is due', async () => {
    const { engine, seeded, archive, uids, sync } = await completedHistory(true);
    await sync();
    deliverMail(seeded.server, 'Archive', { id: 'fresh' });
    await sync();
    const stale = present(uids[7]);
    seeded.server.expunge('Archive', stale);
    seeded.server.deliver('Archive', new Uint8Array());

    await sync();
    await sync();
    expect(storedUidsIn(engine, archive.id)).toContain(stale);

    engine.clock.advance(FULL_DIFF_MS);
    await sync();

    expect(storedUidsIn(engine, archive.id)).not.toContain(stale);
  });

  it('runs a due full diff for a CONDSTORE mailbox left unchanged since startup', async () => {
    const { engine, seeded, archive, uids, sync } = await completedHistory(true);
    await sync();
    const stale = present(uids[3]);
    seeded.server.expunge('Archive', stale);
    seeded.server.deliver('Archive', new Uint8Array());
    await sync();
    seeded.server.uidListings.length = 0;

    await sync();
    expect(seeded.server.uidListings.filter((path) => path === 'Archive')).toHaveLength(0);
    engine.clock.advance(FULL_DIFF_MS);
    await sync();

    expect(seeded.server.uidListings.filter((path) => path === 'Archive')).toHaveLength(1);
    expect(storedUidsIn(engine, archive.id)).not.toContain(stale);
  });

  it('continues the rotating flag scan from the persisted offset after a restart', async () => {
    const { engine, archive, sync } = await completedHistory(false);
    await sync();
    await sync();
    const offset = present(engine.db.tables.historyFlagOffsets.get(archive.id));
    expect(offset).toBeGreaterThan(0);

    const restarted = new ReconcileScans({
      history: new MemoryHistoryBackfills(engine.db),
      clock: engine.clock,
      options: RECONCILE,
    });
    const local = storedUidsIn(engine, archive.id);
    const scanned = present(await restarted.flagScanUids(archive.id, local));

    const older = [...local].sort((left, right) => right - left).slice(10);
    const expected = [...older, ...older].slice(
      offset % older.length,
      (offset % older.length) + 10,
    );
    expect(scanned).toEqual(expect.arrayContaining(expected));
    expect(scanned).toHaveLength(20);
    expect(engine.db.tables.historyFlagOffsets.get(archive.id)).toBe((offset + 10) % older.length);
  });
});
