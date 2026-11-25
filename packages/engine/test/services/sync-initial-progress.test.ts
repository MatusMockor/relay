import { describe, expect, it } from 'vitest';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T12:00:00.000Z`;

const staged = (engine: TestEngine) =>
  engine.events
    .ofType('sync.progress')
    .filter((event) => event.data.stage !== undefined)
    .map(({ data }) => [data.stage, data.processed, data.total] as const);

const seedMail = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  Array.from({ length: 12 }, (_, index) => index + 1).forEach((date) => {
    deliverMail(seeded.server, 'INBOX', { id: `in-${String(date)}`, date: day(date) });
  });
  [1, 2, 3].forEach((date) => {
    deliverMail(seeded.server, 'Sent', { id: `out-${String(date)}`, date: day(date) });
  });
  return seeded;
};

describe('initial sync progress', () => {
  it('reports header reading, the first inbox batch and the rest per account', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 5, firstBatchSize: 4, firstPageConversations: 0 },
    });
    const { account } = await seedMail(engine);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(staged(engine)).toEqual([
      ['headers', 0, 3],
      ['headers', 1, 3],
      ['inbox', 0, 4],
      ['inbox', 4, 4],
      ['headers', 2, 3],
      ['headers', 3, 3],
      ['backlog', 4, 15],
      ['backlog', 9, 15],
      ['backlog', 14, 15],
      ['backlog', 15, 15],
    ]);
    const progress = engine.events.ofType('sync.progress');
    expect(
      progress
        .filter((event) => event.data.stage !== undefined)
        .every((event) => event.data.mailboxId === null && event.data.phase === 'messages'),
    ).toBe(true);
    expect(progress.at(-1)?.data.phase).toBe('idle');
    expect(progress.at(-1)?.data.stage).toBeUndefined();
  });

  it('reports no initial stages once every mailbox finished its initial sync', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedMail(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    deliverMail(server, 'INBOX', { id: 'fresh', date: day(14) });
    engine.events.clear();

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(staged(engine)).toEqual([]);
    expect(engine.events.ofType('sync.progress').map((event) => event.data.phase)).toContain(
      'messages',
    );
  });

  it('does not report the first batch as downloaded when the inbox changed meanwhile', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 5, firstBatchSize: 4, firstPageConversations: 0 },
    });
    const { account, server } = await seedMail(engine);
    engine.events.beforePublish = (event) => {
      if (event.type === 'sync.progress' && event.data.stage === 'inbox') {
        server.resetUidValidity('INBOX');
      }
    };

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const inbox = staged(engine).filter(([stage]) => stage === 'inbox');
    expect(inbox).toEqual([
      ['inbox', 0, 4],
      ['inbox', 0, 4],
    ]);
  });
});
