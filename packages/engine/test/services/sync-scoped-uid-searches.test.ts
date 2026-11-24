import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { UidListOptions } from '../../src';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { storedUidsIn } from '../support/history';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const MAX_UID = 4_294_967_295;

const queriesOf = (server: FakeMailServer, path: string): UidListOptions[] =>
  server.uidQueries.filter((query) => query.path === path).map(({ options }) => options);

const unscoped = (options: UidListOptions): boolean =>
  options.range === undefined && options.among === undefined && options.newest === undefined;

const archiveOf = async (engine: TestEngine, accountId: AccountId) =>
  present(await engine.repositories.mailboxes.findByPath(accountId, 'Archive'));

const largeArchive = async (condstore: boolean) => {
  const engine = createTestEngine({ sync: { initialMessageLimit: 20 } });
  const seeded = await seedAccount(engine, {}, { condstore });
  const uids = Array.from({ length: 60 }, (_, index) =>
    deliverMail(seeded.server, 'Archive', { id: `archive-${String(index)}` }),
  );
  const sync = () => engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  await sync();
  const archive = await archiveOf(engine, seeded.account.id);
  return { engine, server: seeded.server, archive, uids, sync };
};

describe('sync of a large mailbox', () => {
  it('lists only the newest UIDs of the initial window instead of the whole mailbox', async () => {
    const { engine, server, archive, uids } = await largeArchive(true);

    expect(queriesOf(server, 'Archive')).toEqual([{ newest: 20 }]);
    expect(storedUidsIn(engine, archive.id)).toEqual(uids.slice(-20));
  });

  it('skips the expunge diff while the mailbox size is unchanged', async () => {
    const { engine, server, archive, uids, sync } = await largeArchive(false);
    await sync();
    const newest = present(uids.at(-1));
    server.updateFlags('Archive', newest, { seen: true });
    server.uidQueries.length = 0;

    await sync();
    await sync();

    expect(queriesOf(server, 'Archive')).toEqual([]);
    const stored = [...engine.db.tables.messages.values()].find(
      (message) => message.mailboxId === archive.id && message.uid === newest,
    );
    expect(stored?.flags.seen).toBe(true);
  });

  it('checks expunges against the stored UIDs only', async () => {
    const { engine, server, archive, sync } = await largeArchive(true);
    const stored = storedUidsIn(engine, archive.id);
    const gone = present(stored[4]);
    server.expunge('Archive', gone);
    server.uidQueries.length = 0;

    await sync();

    expect(queriesOf(server, 'Archive')).toEqual([{ among: stored }]);
    expect(storedUidsIn(engine, archive.id)).toEqual(stored.filter((uid) => uid !== gone));
  });

  it('catches an expunge hidden behind an arrival that keeps the message count', async () => {
    const { engine, server, archive, sync } = await largeArchive(true);
    const stored = storedUidsIn(engine, archive.id);
    const gone = present(stored[0]);
    server.expunge('Archive', gone);
    const fresh = deliverMail(server, 'Archive', { id: 'fresh' });
    server.uidQueries.length = 0;

    await sync();

    expect(queriesOf(server, 'Archive').some(unscoped)).toBe(false);
    expect(storedUidsIn(engine, archive.id)).toEqual([
      ...stored.filter((uid) => uid !== gone),
      fresh,
    ]);
  });

  it('resumes an interrupted initial window from its frozen floor UID', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1, initialMessageLimit: 3 } });
    const { account, server } = await seedAccount(engine);
    ['m1', 'm2', 'm3', 'm4'].forEach((id) => deliverMail(server, 'INBOX', { id }));
    server.interruptStreamAfter = 1;
    const interrupted = await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(interrupted.ok).toBe(false);
    server.uidQueries.length = 0;

    const resumed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(resumed.ok).toBe(true);
    expect(queriesOf(server, 'INBOX')[0]).toEqual({ range: { from: 2, to: MAX_UID } });
    expect(server.uidQueries.some(({ options }) => unscoped(options))).toBe(false);
  });
});
