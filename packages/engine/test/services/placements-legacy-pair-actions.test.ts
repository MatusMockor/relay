import type { ThreadAction } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { present } from '../support/fixtures';
import { providerOps } from '../support/gmail-move-setup';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC: LegacySpec = { id: 'n1', subject: 'Ponuka', date: '2026-11-14T08:00:00.000Z' };

const legacyPair = async (engine: TestEngine) => {
  const seeded = await seedLegacyDuplicates(engine, [SPEC]);
  const pair = present(seeded.pairs[0]);
  const keeper = present(engine.db.tables.messages.get(pair.keeperId));
  const loser = present(engine.db.tables.messages.get(pair.loserId));
  expect(keeper.emailId).not.toBeNull();
  expect(loser.emailId).toBe(keeper.emailId);
  expect(loser.threadId).toBe(keeper.threadId);
  const act = (action: ThreadAction) =>
    engine.services.actions.apply(USER_ID, keeper.threadId, action);
  return { ...seeded, keeper, loser, act };
};

const queuedMoves = (engine: TestEngine) => providerOps(engine).map(({ payload }) => payload);

describe('actions on an unmerged legacy Gmail pair', () => {
  it('queues one provider move when the pair is trashed', async () => {
    const engine = createTestEngine();
    const { server, inbox, keeper, act } = await legacyPair(engine);
    server.failConnect = 'offline';

    const trashed = await act({ type: 'trash' });

    expect(trashed.state).toBe('trash');
    expect(queuedMoves(engine)).toEqual([
      {
        messageId: keeper.id,
        change: { kind: 'move', role: 'trash' },
        source: { mailboxId: inbox.id, uid: 1 },
      },
    ]);
  });

  it('queues one provider move when the pair is archived', async () => {
    const engine = createTestEngine();
    const { server, inbox, keeper, act } = await legacyPair(engine);
    server.failConnect = 'offline';

    const archived = await act({ type: 'archive' });

    expect(archived.state).toBe('done');
    expect(queuedMoves(engine)).toEqual([
      {
        messageId: keeper.id,
        change: { kind: 'move', role: 'archive' },
        source: { mailboxId: inbox.id, uid: 1 },
      },
    ]);
  });

  it('moves the Gmail message to the trash once on the server', async () => {
    const engine = createTestEngine();
    const { account, server, act } = await legacyPair(engine);

    await act({ type: 'trash' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.mailbox('INBOX').messages.size).toBe(0);
    expect(server.mailbox('Trash').messages.size).toBe(1);
  });
});
