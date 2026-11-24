import { placementIn } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { providerOps } from '../support/gmail-move-setup';
import { joinPlacements } from '../support/placements';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC = { id: 'm1', date: '2026-11-14T08:00:00.000Z' };

const inboxAndTrashMessage = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  server.addMailbox('Projekty', 'custom');
  deliverMail(server, 'INBOX', SPEC);
  deliverMail(server, 'Trash', SPEC);
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const { mailboxes } = engine.repositories;
  const inbox = present(await mailboxes.findByPath(account.id, 'INBOX'));
  const trash = present(await mailboxes.findByPath(account.id, 'Trash'));
  const folder = present(await mailboxes.findByPath(account.id, 'Projekty'));
  const stored = [...engine.db.tables.messages.values()];
  const keeper = present(stored.find((message) => message.mailboxId === inbox.id));
  const others = stored.filter((message) => message.id !== keeper.id);
  expect(others).toHaveLength(1);
  const message = joinPlacements(engine, keeper, others);
  return { account, server, message, inbox, trash, folder };
};

const opsOf = (engine: TestEngine) =>
  providerOps(engine).map(({ ref, payload }) => ({ ref, payload }));

describe('undoing a pending move of one placement', () => {
  it('replaces the queued move of the moved placement instead of moving another one', async () => {
    const engine = createTestEngine();
    const { server, message, trash, folder } = await inboxAndTrashMessage(engine);
    const source = present(placementIn(message, trash.id));
    server.failConnect = 'offline';

    await engine.services.actions.apply(USER_ID, message.threadId, {
      type: 'move',
      mailboxId: folder.id,
    });
    expect(opsOf(engine)).toEqual([
      {
        ref: `${message.id}:move:${trash.id}`,
        payload: {
          messageId: message.id,
          change: { kind: 'move', role: 'custom', mailboxId: folder.id },
          source,
        },
      },
    ]);

    await engine.services.actions.apply(USER_ID, message.threadId, { type: 'undoMove' });

    expect(opsOf(engine)).toEqual([
      {
        ref: `${message.id}:move:${trash.id}`,
        payload: {
          messageId: message.id,
          change: { kind: 'move', role: 'trash', mailboxId: trash.id },
          source,
        },
      },
    ]);
  });
});
