import { type Message, placementIn } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ProviderOpBatches } from '../../src/services/actions/provider-op-batches';
import { mailboxRoleOf } from '../../src/services/shared/mailbox-role-of';
import { PendingMoves } from '../../src/services/shared/pending-moves';
import { recordProviderOps } from '../../src/services/shared/provider-ops';
import { present } from '../support/fixtures';
import { providerOps } from '../support/gmail-move-setup';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { gmailInboxAndAllMail } from '../support/placements';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const recordMoves = (server: FakeMailServer): string[] => {
  const moves: string[] = [];
  server.afterMove = (path) => {
    moves.push(path);
  };
  return moves;
};

const stored = (engine: TestEngine, message: Message): Message =>
  present(engine.db.tables.messages.get(message.id));

const uidsIn = (server: FakeMailServer, path: string): number[] => [
  ...server.mailbox(path).messages.keys(),
];

describe('sourced moves whose source placement is gone', () => {
  it('drops a queued archive without a MOVE once the archived INBOX copy is expunged', async () => {
    const engine = createTestEngine();
    const { account, server, message, inbox, allMail, act } = await gmailInboxAndAllMail(engine);
    server.failConnect = 'offline';
    await act({ type: 'done' });
    expect(providerOps(engine)).toHaveLength(1);
    server.failConnect = null;
    server.expunge('INBOX', 1);
    await engine.repositories.messages.deleteByUids(inbox.id, [1]);
    const moves = recordMoves(server);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(moves).toEqual([]);
    expect(providerOps(engine)).toEqual([]);
    expect(stored(engine, message).placements).toEqual([{ mailboxId: allMail.id, uid: 1 }]);
    expect(uidsIn(server, 'Archive')).toEqual([1]);
  });

  it('trashes from All Mail when the queued trash lost its INBOX source', async () => {
    const engine = createTestEngine();
    const { account, server, message, inbox, act } = await gmailInboxAndAllMail(engine);
    server.failConnect = 'offline';
    await act({ type: 'trash' });
    server.failConnect = null;
    server.expunge('INBOX', 1);
    await engine.repositories.messages.deleteByUids(inbox.id, [1]);
    const moves = recordMoves(server);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const trash = present(await engine.repositories.mailboxes.findByPath(account.id, 'Trash'));
    expect(moves).toEqual(['Archive']);
    expect(providerOps(engine)).toEqual([]);
    expect([uidsIn(server, 'Archive'), uidsIn(server, 'Trash')]).toEqual([[], [1]]);
    expect(stored(engine, message).placements).toEqual([{ mailboxId: trash.id, uid: 1 }]);
  });

  it('settles a stale move whose target placement the message already holds', async () => {
    const engine = createTestEngine();
    const { account, message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    const { messages, mailboxes, pendingWork } = engine.repositories;
    const trash = present(await mailboxes.findByPath(account.id, 'Trash'));
    const source = present(placementIn(message, inbox.id));
    await messages.movePlacement(message.id, {
      from: inbox.id,
      to: { mailboxId: trash.id, uid: 5 },
      keepSource: false,
    });
    const [op] = await recordProviderOps(
      pendingWork,
      account.id,
      [{ messageId: message.id, change: { kind: 'move', role: 'trash' }, source }],
      TEST_NOW,
    );
    const roleOf = mailboxRoleOf(await mailboxes.listForSync(account.id));
    const pending = await PendingMoves.load(pendingWork, account.id);
    const held = stored(engine, message);

    const batches = await new ProviderOpBatches({ messages, mailboxes, pendingWork }).of(account, [
      present(op),
    ]);

    expect(batches).toEqual([]);
    expect(providerOps(engine)).toEqual([]);
    expect(pending.targetOf(held, present(placementIn(held, allMail.id)), roleOf)).toBeUndefined();
  });
});
