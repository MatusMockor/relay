import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { seedHistory, storedMessages, storedUidsIn } from '../support/history';
import { createTestEngine, USER_ID } from '../support/test-engine';

const RECONCILE = { newestFlagUids: 10, rotatingFlagUids: 10, fullExpungeDiffMs: 60 * 60_000 };

const smallWindowSetup = async () => {
  const engine = createTestEngine({
    sync: { reconcile: RECONCILE, initialMessageLimit: 4 },
    historyBackfills: null,
  });
  const seeded = await seedAccount(engine, {}, { condstore: false });
  const old = seedHistory(seeded.server, 'INBOX', 400);
  const recent = Array.from({ length: 4 }, (_, index) =>
    deliverMail(seeded.server, 'INBOX', { id: `recent-${String(index)}` }),
  );
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const inbox = present(await engine.repositories.mailboxes.findByPath(seeded.account.id, 'INBOX'));
  return { engine, ...seeded, inbox, old, recent };
};

describe('flag scan budget without CONDSTORE', () => {
  it('fetches flags only for the stored UIDs of a large remote mailbox', async () => {
    const { engine, account, server, inbox, recent } = await smallWindowSetup();
    expect(storedUidsIn(engine, inbox.id)).toEqual(recent);
    server.flagScans.length = 0;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.flagScans.filter((scan) => scan.path === 'INBOX')).toEqual([
      { path: 'INBOX', uids: recent },
    ]);
  });

  it('still applies a flag change on a stored message of the initial window', async () => {
    const { engine, account, server, inbox, old, recent } = await smallWindowSetup();
    const target = present(recent[1]);
    server.updateFlags('INBOX', target, { seen: true });
    server.updateFlags('INBOX', present(old[0]), { seen: true });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const stored = storedMessages(engine).filter((message) => message.mailboxId === inbox.id);
    expect(stored.find((message) => message.uid === target)?.flags.seen).toBe(true);
    expect(stored.map((message) => message.uid).sort((left, right) => left - right)).toEqual(
      recent,
    );
  });
});
