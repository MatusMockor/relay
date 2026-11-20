import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import { storedMessages } from '../support/history';
import {
  ARCHIVE_SIZE,
  backfillAll,
  hasLocalBody,
  isRemote,
  newerThan,
  olderThan,
  setupOffline,
} from '../support/offline-window';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('offline window eviction', () => {
  it('evicts exactly the bodies older than a shortened window and leaves newer rows untouched', async () => {
    const setup = await setupOffline('all');
    await backfillAll(setup);
    const { engine } = setup;
    expect(storedMessages(engine)).toHaveLength(ARCHIVE_SIZE);
    expect(storedMessages(engine).every(hasLocalBody)).toBe(true);
    const newer = newerThan(engine, '3m');
    const older = olderThan(engine, '3m');
    expect(older.length).toBeGreaterThan(0);
    engine.events.clear();

    setup.window.set('3m');
    const report = await engine.services.bodyRetention.evictDue(USER_ID);

    expect(report).toEqual({ evicted: older.length, more: false });
    expect(newerThan(engine, '3m')).toEqual(newer);
    olderThan(engine, '3m').forEach((message) => {
      const before = present(older.find((entry) => entry.id === message.id));
      expect(message).toEqual({ ...before, textBody: null, htmlBody: null, bodyState: 'remote' });
    });
    expect(engine.events.ofType('threads.changed').map((event) => event.data)).toEqual([
      { accountId: setup.seeded.account.id, count: older.length },
    ]);
    expect(await engine.services.bodyRetention.evictDue(USER_ID)).toEqual({
      evicted: 0,
      more: false,
    });
    expect(await engine.services.offlineStats.forUser(USER_ID)).toEqual({
      local: newer.length,
      remote: older.length,
    });
  });

  it('evicts in chunks and stops a tick after its chunk budget', async () => {
    const setup = await setupOffline('all', { evictChunk: 5, evictChunksPerTick: 2 });
    await backfillAll(setup);
    const older = olderThan(setup.engine, '3m').length;
    setup.window.set('3m');

    const first = await setup.engine.services.bodyRetention.evictDue(USER_ID);

    expect(first).toEqual({ evicted: 10, more: true });
    let evicted = first.evicted;
    for (let tick = 0; tick < 20 && evicted < older; tick += 1) {
      evicted += (await setup.engine.services.bodyRetention.evictDue(USER_ID)).evicted;
    }
    expect(evicted).toBe(older);
    expect(olderThan(setup.engine, '3m').every(isRemote)).toBe(true);
  });

  it('keeps an old moved message without a server UID and evicts it on the next tick', async () => {
    const setup = await setupOffline('3m', {}, { uidplus: false });
    const { engine, seeded } = setup;
    seeded.server.addMailbox('Projekty', 'custom');
    deliverMail(seeded.server, 'INBOX', {
      id: 'old-moved',
      date: '2025-01-10T08:00:00.000Z',
      internalDate: '2026-11-14T08:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const moved = () =>
      present(storedMessages(engine).find((message) => message.subject === 'Subject old-moved'));
    expect(hasLocalBody(moved())).toBe(true);
    const projects = present(
      await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Projekty'),
    );
    await engine.services.actions.apply(USER_ID, moved().threadId, {
      type: 'move',
      mailboxId: projects.id,
    });
    expect(moved().uid).toBe(0);

    await engine.services.bodyRetention.evictDue(USER_ID);

    expect(hasLocalBody(moved())).toBe(true);
    await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    expect(moved().uid).toBeGreaterThan(0);
    expect(moved().mailboxId).toBe(projects.id);

    await engine.services.bodyRetention.evictDue(USER_ID);

    expect(isRemote(moved())).toBe(true);
    expect(moved().textBody).toBeNull();
    expect(moved().snippet).toBe('Body of old-moved');
  });

  it('does nothing without an offline window store, like on the server', async () => {
    const engine = createTestEngine();

    expect(await engine.services.bodyRetention.evictDue(USER_ID)).toEqual({
      evicted: 0,
      more: false,
    });
    expect(await engine.services.offlineStats.forUser(USER_ID)).toEqual({ local: 0, remote: 0 });
  });
});
