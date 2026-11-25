import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { backfillUntilDone, seedHistory, storedUidsIn } from '../support/history';
import { createTestEngine, USER_ID } from '../support/test-engine';

const FULL_DIFF_MS = 60 * 60_000;
const RECONCILE = { newestFlagUids: 10, rotatingFlagUids: 10, fullExpungeDiffMs: FULL_DIFF_MS };

const plainListings = (listings: readonly string[], path: string): number =>
  listings.filter((listing) => listing === path).length;

const historySetup = async (withHistory = true) => {
  const engine = createTestEngine({
    sync: { reconcile: RECONCILE },
    ...(withHistory ? {} : { historyBackfills: null }),
  });
  const seeded = await seedAccount(engine, {}, { condstore: false });
  const uids = seedHistory(seeded.server, 'Archive', 300);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  await backfillUntilDone(engine, seeded.account.id);
  const archive = present(
    await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Archive'),
  );
  return { engine, seeded, archive, uids };
};

describe('mailbox reconciler at scale', () => {
  it('skips the full expunge diff only while a complete history matches the server count', async () => {
    const { engine, seeded, archive, uids } = await historySetup();
    expect(storedUidsIn(engine, archive.id)).toHaveLength(300);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    seeded.server.uidListings.length = 0;

    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(0);

    seeded.server.expunge('Archive', present(uids[5]));
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(1);
    expect(storedUidsIn(engine, archive.id)).toHaveLength(299);
    expect(storedUidsIn(engine, archive.id)).not.toContain(uids[5]);

    seeded.server.uidListings.length = 0;
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(0);

    engine.clock.advance(FULL_DIFF_MS);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(1);
  });

  it('without a history diffs only when the mailbox size changed or the full diff is due', async () => {
    const { engine, seeded, archive } = await historySetup(false);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    seeded.server.uidListings.length = 0;

    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(0);

    const stored = storedUidsIn(engine, archive.id);
    const gone = present(stored[1]);
    seeded.server.expunge('Archive', gone);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(1);
    expect(storedUidsIn(engine, archive.id)).toEqual(stored.filter((uid) => uid !== gone));

    engine.clock.advance(FULL_DIFF_MS);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(plainListings(seeded.server.uidListings, 'Archive')).toBe(2);
  });

  it('rotates a bounded flag scan over all stored UIDs without CONDSTORE', async () => {
    const engine = createTestEngine({ sync: { reconcile: RECONCILE } });
    const { account, server } = await seedAccount(engine, {}, { condstore: false });
    const uids = Array.from({ length: 55 }, (_, index) =>
      deliverMail(server, 'INBOX', { id: `flag-${String(index)}` }),
    );
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const newest = uids.slice(-10);
    server.flagScans.length = 0;

    const passes = 5;
    for (let pass = 0; pass < passes; pass += 1) {
      await engine.services.sync.syncAccount(USER_ID, account.id);
    }

    const scans = server.flagScans.filter((scan) => scan.path === 'INBOX');
    expect(scans).toHaveLength(passes);
    scans.forEach((scan) => {
      expect(scan.uids).toHaveLength(20);
      expect(scan.uids).toEqual(expect.arrayContaining(newest));
    });
    const covered = new Set(scans.flatMap((scan) => scan.uids ?? []));
    expect([...covered].sort((left, right) => left - right)).toEqual(uids);
  });

  it('picks up a flag change on an old message within a full rotation', async () => {
    const engine = createTestEngine({ sync: { reconcile: RECONCILE } });
    const { account, server } = await seedAccount(engine, {}, { condstore: false });
    const uids = Array.from({ length: 55 }, (_, index) =>
      deliverMail(server, 'INBOX', { id: `old-${String(index)}` }),
    );
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const oldest = present(uids[0]);
    server.updateFlags('INBOX', oldest, { seen: true });

    for (let pass = 0; pass < 5; pass += 1) {
      await engine.services.sync.syncAccount(USER_ID, account.id);
    }

    const stored = [...engine.db.tables.messages.values()].find(
      (message) => message.uid === oldest,
    );
    expect(stored?.flags.seen).toBe(true);
  });

  it('scans every stored UID at once while they fit the budget', async () => {
    const engine = createTestEngine({ sync: { reconcile: RECONCILE } });
    const { account, server } = await seedAccount(engine, {}, { condstore: false });
    const uids = Array.from({ length: 20 }, (_, index) =>
      deliverMail(server, 'INBOX', { id: `small-${String(index)}` }),
    );
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.flagScans.length = 0;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.flagScans.filter((scan) => scan.path === 'INBOX')).toEqual([
      { path: 'INBOX', uids },
    ]);
  });
});
