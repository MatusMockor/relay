import { type AccountId, type MailboxId, type MessageId, placementIn } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { mailboxRoleOf } from '../../src/services/shared/mailbox-role-of';
import { PendingMoves } from '../../src/services/shared/pending-moves';
import {
  legacyMoveRef,
  providerOpRef,
  recordProviderOps,
} from '../../src/services/shared/provider-ops';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { providerOps } from '../support/gmail-move-setup';
import { gmailInboxAndAllMail } from '../support/placements';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const MESSAGE_ID = 'msg_1' as MessageId;

const roleOfIn = async (engine: TestEngine, accountId: AccountId) =>
  mailboxRoleOf(await engine.repositories.mailboxes.listForSync(accountId));

const putLegacyMove = (engine: TestEngine, accountId: AccountId, messageId: MessageId) =>
  engine.repositories.pendingWork.put({
    accountId,
    kind: 'provider-op',
    ref: legacyMoveRef(messageId),
    payload: { messageId, change: { kind: 'move', role: 'archive' } },
    createdAt: TEST_NOW,
  });

describe('provider op refs', () => {
  it('names the source mailbox in a move ref and keeps the other refs', () => {
    const move = { kind: 'move', role: 'trash' } as const;
    const source = 'mbx_inbox' as MailboxId;

    expect(providerOpRef(MESSAGE_ID, move, source)).toBe('msg_1:move:mbx_inbox');
    expect(providerOpRef(MESSAGE_ID, move)).toBe('msg_1:move');
    expect(legacyMoveRef(MESSAGE_ID)).toBe('msg_1:move');
    expect(providerOpRef(MESSAGE_ID, { kind: 'flag', flag: 'seen', value: true }, source)).toBe(
      'msg_1:flag:seen',
    );
    expect(providerOpRef(MESSAGE_ID, { kind: 'label', label: 'Work', value: true })).toBe(
      'msg_1:label:Work',
    );
  });

  it('replaces the legacy move op of a message when it records a sourced move', async () => {
    const engine = createTestEngine();
    const { account, message, inbox } = await gmailInboxAndAllMail(engine);
    const source = present(placementIn(message, inbox.id));
    await putLegacyMove(engine, account.id, message.id);

    await recordProviderOps(
      engine.repositories.pendingWork,
      account.id,
      [{ messageId: message.id, change: { kind: 'move', role: 'trash' }, source }],
      TEST_NOW,
    );

    expect(providerOps(engine).map(({ ref, payload }) => ({ ref, payload }))).toEqual([
      {
        ref: `${message.id}:move:${inbox.id}`,
        payload: { messageId: message.id, change: { kind: 'move', role: 'trash' }, source },
      },
    ]);
  });

  it('keeps sourced moves of different placements apart', async () => {
    const engine = createTestEngine();
    const { account, message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    const placementOf = (mailboxId: MailboxId) => present(placementIn(message, mailboxId));

    await recordProviderOps(
      engine.repositories.pendingWork,
      account.id,
      [
        {
          messageId: message.id,
          change: { kind: 'move', role: 'trash' },
          source: placementOf(inbox.id),
        },
        {
          messageId: message.id,
          change: { kind: 'move', role: 'spam' },
          source: placementOf(allMail.id),
        },
      ],
      TEST_NOW,
    );
    const pending = await PendingMoves.load(engine.repositories.pendingWork, account.id);
    const roleOf = await roleOfIn(engine, account.id);

    expect(providerOps(engine)).toHaveLength(2);
    expect(pending.targetOf(message, placementOf(inbox.id), roleOf)?.role).toBe('trash');
    expect(pending.targetOf(message, placementOf(allMail.id), roleOf)?.role).toBe('spam');
  });

  it('applies a legacy move op to the primary placement only', async () => {
    const engine = createTestEngine();
    const { account, message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    await putLegacyMove(engine, account.id, message.id);
    const pending = await PendingMoves.load(engine.repositories.pendingWork, account.id);
    const roleOf = await roleOfIn(engine, account.id);
    const placementOf = (mailboxId: MailboxId) => present(placementIn(message, mailboxId));

    expect(pending.targetOf(message, placementOf(inbox.id), roleOf)).toEqual({
      kind: 'move',
      role: 'archive',
    });
    expect(pending.targetOf(message, placementOf(allMail.id), roleOf)).toBeUndefined();
  });

  it('replays a queued legacy move op from the only placement and drops it', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const message = present([...engine.db.tables.messages.values()][0]);
    await putLegacyMove(engine, account.id, message.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const archive = present(await engine.repositories.mailboxes.findByPath(account.id, 'Archive'));
    expect(server.mailbox('INBOX').messages.size).toBe(0);
    expect(server.mailbox('Archive').messages.size).toBe(1);
    expect(providerOps(engine)).toEqual([]);
    const moved = present(await engine.repositories.messages.findById(USER_ID, message.id));
    expect(moved.placements.map(({ mailboxId }) => mailboxId)).toEqual([archive.id]);
  });

  it('moves the current primary placement when the recorded source was relocated', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const message = present([...engine.db.tables.messages.values()][0]);
    const { mailboxes } = engine.repositories;
    const inbox = present(await mailboxes.findByPath(account.id, 'INBOX'));
    const stale = present(placementIn(message, inbox.id));
    await engine.services.actions.apply(USER_ID, message.threadId, { type: 'done' });
    const archive = present(await mailboxes.findByPath(account.id, 'Archive'));
    const relocated = present(await engine.repositories.messages.findById(USER_ID, message.id));
    expect(relocated.placements.map(({ mailboxId }) => mailboxId)).toEqual([archive.id]);

    await recordProviderOps(
      engine.repositories.pendingWork,
      account.id,
      [{ messageId: message.id, change: { kind: 'move', role: 'trash' }, source: stale }],
      TEST_NOW,
    );
    const pending = await PendingMoves.load(engine.repositories.pendingWork, account.id);
    const roleOf = await roleOfIn(engine, account.id);
    const current = present(placementIn(relocated, archive.id));
    expect(pending.targetOf(relocated, current, roleOf)?.role).toBe('trash');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const trash = present(await mailboxes.findByPath(account.id, 'Trash'));
    expect(providerOps(engine)).toEqual([]);
    expect(server.mailbox('Archive').messages.size).toBe(0);
    expect(server.mailbox('Trash').messages.size).toBe(1);
    const moved = present(await engine.repositories.messages.findById(USER_ID, message.id));
    expect(moved.placements.map(({ mailboxId }) => mailboxId)).toEqual([trash.id]);
  });
});
