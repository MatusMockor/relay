import {
  type AccountId,
  type Mailbox,
  type Message,
  type MessageId,
  placementIn,
} from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { legacyMoveRef } from '../../src/services/shared/provider-ops';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { providerOps } from '../support/gmail-move-setup';
import { gmailInboxAndAllMail } from '../support/placements';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const placementOf = (message: Message, mailbox: Mailbox) =>
  present(placementIn(message, mailbox.id));

const opsOf = (engine: TestEngine) =>
  providerOps(engine).map(({ ref, payload }) => ({ ref, payload }));

const unreadIn = (engine: TestEngine, mailbox: Mailbox) =>
  present(engine.db.tables.mailboxes.get(mailbox.id)).unreadCount;

const originsOf = (engine: TestEngine, kind: string) =>
  [...engine.db.tables.pendingWork.values()]
    .filter((work) => work.kind === kind)
    .map(({ payload }) => payload);

const putLegacyMove = (engine: TestEngine, accountId: AccountId, messageId: MessageId) =>
  engine.repositories.pendingWork.put({
    accountId,
    kind: 'provider-op',
    ref: legacyMoveRef(messageId),
    payload: { messageId, change: { kind: 'move', role: 'archive' } },
    createdAt: TEST_NOW,
  });

describe('actions on a Gmail message with INBOX and All Mail placements', () => {
  it('archives the INBOX placement only with one sourced move op', async () => {
    const engine = createTestEngine();
    const { account, server, thread, message, inbox, allMail, act } =
      await gmailInboxAndAllMail(engine);
    const source = placementOf(message, inbox);
    const allMailUid = placementOf(message, allMail).uid;
    server.failConnect = 'offline';

    await act({ type: 'done' });

    expect(opsOf(engine)).toEqual([
      {
        ref: `${message.id}:move:${inbox.id}`,
        payload: { messageId: message.id, change: { kind: 'move', role: 'archive' }, source },
      },
    ]);
    server.failConnect = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(providerOps(engine)).toEqual([]);
    expect(server.mailbox('INBOX').messages.size).toBe(0);
    expect([...engine.db.tables.messages.keys()]).toEqual([message.id]);
    const archived = present(await engine.repositories.messages.findById(USER_ID, message.id));
    expect(archived.placements).toEqual([{ mailboxId: allMail.id, uid: allMailUid }]);
    expect(present(engine.db.tables.threads.get(thread.id)).state).toBe('done');
  });

  it('writes the read flag once and adjusts the unread count of every placement', async () => {
    const engine = createTestEngine();
    const { account, server, message, inbox, allMail, act } = await gmailInboxAndAllMail(engine);
    const unread = { inbox: unreadIn(engine, inbox), allMail: unreadIn(engine, allMail) };
    server.failConnect = 'offline';

    await act({ type: 'markRead' });

    expect(opsOf(engine)).toEqual([
      {
        ref: `${message.id}:flag:seen`,
        payload: { messageId: message.id, change: { kind: 'flag', flag: 'seen', value: true } },
      },
    ]);
    expect(unread.inbox).toBeGreaterThan(0);
    expect(unread.allMail).toBeGreaterThan(0);
    expect(unreadIn(engine, inbox)).toBe(unread.inbox - 1);
    expect(unreadIn(engine, allMail)).toBe(unread.allMail - 1);
    server.failConnect = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(providerOps(engine)).toEqual([]);
    expect(server.record('INBOX', placementOf(message, inbox).uid).flags.seen).toBe(true);
    expect(server.record('Archive', placementOf(message, allMail).uid).flags.seen).toBe(false);
  });

  it('stores read, unread and pin on the primary placement', async () => {
    const engine = createTestEngine();
    const { server, thread, message, inbox, allMail, act } = await gmailInboxAndAllMail(engine);
    const inboxRecord = () => server.record('INBOX', placementOf(message, inbox).uid);
    const allMailRecord = () => server.record('Archive', placementOf(message, allMail).uid);

    await act({ type: 'markRead' });
    expect(inboxRecord().flags.seen).toBe(true);
    await act({ type: 'markUnread' });
    expect(inboxRecord().flags.seen).toBe(false);
    await engine.services.actions.pin(USER_ID, thread.id);

    expect(inboxRecord().flags.flagged).toBe(true);
    expect(allMailRecord().flags).toEqual({ seen: false, flagged: false, answered: false });
    expect(providerOps(engine)).toEqual([]);
  });

  it('writes a Gmail label once through the All Mail placement', async () => {
    const engine = createTestEngine();
    const { server, message, label, allMail, act } = await gmailInboxAndAllMail(engine);
    const allMailUid = placementOf(message, allMail).uid;

    await act({ type: 'addLabel', labelId: label.id });
    expect(engine.db.tables.messages.get(message.id)?.labelIds).toEqual([label.id]);
    await act({ type: 'removeLabel', labelId: label.id });

    expect(server.labelWrites).toEqual([
      { path: 'Archive', uids: [allMailUid], add: ['Klienti'], remove: [] },
      { path: 'Archive', uids: [allMailUid], add: [], remove: ['Klienti'] },
    ]);
    expect(engine.db.tables.messages.get(message.id)?.labelIds).toEqual([]);
    expect(providerOps(engine)).toEqual([]);
  });

  it('moves to a Gmail label mailbox with one origin and one move sourced at INBOX', async () => {
    const engine = createTestEngine();
    const { server, message, label, target, inbox, act } = await gmailInboxAndAllMail(engine);
    const source = placementOf(message, inbox);
    server.failConnect = 'offline';

    await act({ type: 'move', mailboxId: target.id });

    expect(originsOf(engine, 'move-origin')).toEqual([
      {
        messageId: message.id,
        role: 'inbox',
        mailboxId: inbox.id,
        uid: source.uid,
        labelId: label.id,
      },
    ]);
    expect(opsOf(engine).filter(({ ref }) => ref.includes(':move'))).toEqual([
      {
        ref: `${message.id}:move:${inbox.id}`,
        payload: { messageId: message.id, change: { kind: 'move', role: 'archive' }, source },
      },
    ]);
  });

  it('undoes a pending label move with one move op back to INBOX', async () => {
    const engine = createTestEngine();
    const { server, message, target, inbox, act } = await gmailInboxAndAllMail(engine);
    const source = placementOf(message, inbox);
    server.failConnect = 'offline';

    await act({ type: 'move', mailboxId: target.id });
    await act({ type: 'undoMove' });

    expect(opsOf(engine).filter(({ ref }) => ref.includes(':move'))).toEqual([
      {
        ref: `${message.id}:move:${inbox.id}`,
        payload: {
          messageId: message.id,
          change: { kind: 'move', role: 'inbox', mailboxId: inbox.id },
          source,
        },
      },
    ]);
    expect(originsOf(engine, 'move-origin')).toEqual([]);
  });

  it('collapses a trash and a restore of the same placement into one move op', async () => {
    const engine = createTestEngine();
    const { server, message, inbox, act } = await gmailInboxAndAllMail(engine);
    const source = placementOf(message, inbox);
    server.failConnect = 'offline';

    await act({ type: 'trash' });
    await act({ type: 'restore' });

    expect(opsOf(engine)).toEqual([
      {
        ref: `${message.id}:move:${inbox.id}`,
        payload: { messageId: message.id, change: { kind: 'move', role: 'inbox' }, source },
      },
    ]);
    expect(originsOf(engine, 'trash-origin')).toEqual([]);
  });
});

describe('queued legacy move ops', () => {
  it('replaces a legacy move op with the sourced op of a new action and replays it once', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const message = present([...engine.db.tables.messages.values()][0]);
    const inbox = present(await engine.repositories.mailboxes.findByPath(account.id, 'INBOX'));
    await putLegacyMove(engine, account.id, message.id);
    server.failConnect = 'offline';

    await engine.services.actions.apply(USER_ID, message.threadId, { type: 'trash' });

    expect(opsOf(engine)).toEqual([
      {
        ref: `${message.id}:move:${inbox.id}`,
        payload: {
          messageId: message.id,
          change: { kind: 'move', role: 'trash' },
          source: placementOf(message, inbox),
        },
      },
    ]);
    server.failConnect = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(providerOps(engine)).toEqual([]);
    expect(server.mailbox('INBOX').messages.size).toBe(0);
    expect(server.mailbox('Archive').messages.size).toBe(0);
    expect(server.mailbox('Trash').messages.size).toBe(1);
  });
});
