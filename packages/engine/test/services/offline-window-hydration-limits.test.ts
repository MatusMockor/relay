import type { Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import { storedMessages } from '../support/history';
import {
  backfillAll,
  hasLocalBody,
  isRemote,
  newerThan,
  type OfflineSetup,
  setupOffline,
} from '../support/offline-window';
import { USER_ID } from '../support/test-engine';

const MB = 1024 * 1024;

const bySubject = (setup: OfflineSetup, id: string): Message =>
  present(storedMessages(setup.engine).find((message) => message.subject === `Subject ${id}`));

const deliverSized = (id: string, date: string, bytes: number) => ({
  id,
  date,
  headers: { 'X-Test-Calendar': 'x'.repeat(bytes) },
});

describe('offline window hydration limits', () => {
  it('announces hydrated bodies with one threads.changed even when nothing in the thread summary changed', async () => {
    const setup = await setupOffline('3m', { hydrateMessages: 4 });
    await backfillAll(setup);
    const { engine, seeded } = setup;
    const remote = new Set(
      storedMessages(engine)
        .filter(isRemote)
        .map((message) => message.id),
    );
    engine.events.clear();

    setup.window.set('1y');
    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ hydrated: 4 });
    const hydrated = storedMessages(engine).filter(
      (message) => remote.has(message.id) && hasLocalBody(message),
    );
    expect(hydrated).toHaveLength(4);
    const threads = new Set(hydrated.map((message) => message.threadId));
    expect(engine.events.ofType('threads.changed').map((event) => event.data)).toEqual([
      { accountId: seeded.account.id, count: threads.size },
    ]);
    expect(engine.events.ofType('message.upserted')).toEqual([]);
    expect(engine.events.ofType('thread.upserted')).toEqual([]);
  });

  it('fetches a large body on its own and never fetches a body over the per-message cap', async () => {
    const setup = await setupOffline('3m', {}, {}, (server) => {
      deliverMail(server, 'Archive', deliverSized('huge', '2026-06-10T08:00:00.000Z', 25 * MB));
      deliverMail(server, 'Archive', deliverSized('large', '2026-06-09T08:00:00.000Z', 3 * MB));
    });
    await backfillAll(setup);
    const { engine, seeded } = setup;
    const huge = bySubject(setup, 'huge');
    const large = bySubject(setup, 'large');
    expect([isRemote(huge), isRemote(large)]).toEqual([true, true]);
    seeded.server.uidFetches.length = 0;

    setup.window.set('1y');
    await backfillAll(setup);

    const fetches = seeded.server.uidFetches.filter((fetch) => fetch.path === 'Archive');
    expect(fetches.length).toBeGreaterThan(1);
    expect(fetches.flatMap((fetch) => fetch.uids)).not.toContain(huge.uid);
    expect(fetches.filter((fetch) => fetch.uids.includes(large.uid))).toEqual([
      { path: 'Archive', uids: [large.uid] },
    ]);
    expect(fetches.every((fetch) => fetch.uids.length <= 10)).toBe(true);
    expect(isRemote(bySubject(setup, 'huge'))).toBe(true);
    expect(hasLocalBody(bySubject(setup, 'large'))).toBe(true);
    expect(
      newerThan(engine, '1y')
        .filter((message) => message.id !== huge.id)
        .every(hasLocalBody),
    ).toBe(true);
  });
});
