import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectMergeInvariants, expectNoLoserReferences } from './support/merge-invariants';
import { insertPending } from './support/merge-references-seed';
import {
  insertCopy,
  insertGmailLabel,
  labelMessage,
  MERGE_THREAD,
  type MergeAccount,
  seedMergeAccount,
} from './support/merge-seed';
import { createTestStore, type TestStore } from './support/test-database';

const T1 = '2026-11-24T10:00:00.000Z';
const T2 = '2026-11-24T11:00:00.000Z';

interface PendingRow {
  readonly kind: string;
  readonly ref: string;
  readonly payload: string;
  readonly revision: string;
  readonly createdAt: string;
}

const flagOp = (messageId: string, value: boolean) => ({
  messageId,
  change: { kind: 'flag', flag: 'seen', value },
});

const effects = (messageId: string, arrival: boolean) => ({
  messageId,
  threadId: MERGE_THREAD,
  publish: false,
  arrival,
  headers: [],
});

describe('SqliteMessageMerges pending work', () => {
  let store: TestStore;
  let account: MergeAccount;

  const pending = (): PendingRow[] =>
    store.database.sqlite
      .prepare<
        [],
        PendingRow
      >('select kind, ref, payload, revision, created_at as createdAt from pending_work order by kind, ref')
      .all();

  const merge = () =>
    store.unitOfWork.run((repositories) =>
      repositories.messageMerges.merge(account.seeded.account.id, [{ emailId: 'gm-1', size: 3 }]),
    );

  beforeEach(async () => {
    store = createTestStore();
    account = await seedMergeAccount(store);
    insertCopy(store, account, { id: 'msg-k', mailbox: account.boxes.inbox, uid: 3 });
    insertCopy(store, account, { id: 'msg-l', mailbox: account.boxes.allMail, uid: 7, seen: true });
    insertCopy(store, account, { id: 'msg-m', mailbox: account.boxes.label, uid: 8 });
  });

  afterEach(() => {
    store.database.close();
  });

  it('keeps the latest flag intent with its revision and applies it to the keeper', async () => {
    insertPending(store, account, {
      kind: 'provider-op',
      ref: 'msg-k:flag:seen',
      payload: flagOp('msg-k', false),
      createdAt: T1,
    });
    insertPending(store, account, {
      kind: 'provider-op',
      ref: 'msg-l:flag:seen',
      payload: flagOp('msg-l', true),
      createdAt: T2,
      revision: 'rev-loser',
    });

    await merge();

    expect(pending()).toEqual([
      {
        kind: 'provider-op',
        ref: 'msg-k:flag:seen',
        payload: JSON.stringify(flagOp('msg-k', true)),
        revision: 'rev-loser',
        createdAt: T2,
      },
    ]);
    expect(
      store.database.sqlite.prepare("select seen from messages where id = 'msg-k'").get(),
    ).toEqual({ seen: 1 });
    expectMergeInvariants(store);
  });

  it('overrides the keeper labels with pending label ops of the group', async () => {
    const klienti = insertGmailLabel(store, account, 'Klienti');
    const faktury = insertGmailLabel(store, account, 'Faktury');
    labelMessage(store, 'msg-k', faktury);
    labelMessage(store, 'msg-m', klienti);
    const labelOp = (messageId: string, label: string, value: boolean) => ({
      messageId,
      change: { kind: 'label', label, value },
    });
    insertPending(store, account, {
      kind: 'provider-op',
      ref: 'msg-m:label:Klienti',
      payload: labelOp('msg-m', 'Klienti', true),
    });
    insertPending(store, account, {
      kind: 'provider-op',
      ref: 'msg-l:label:Faktury',
      payload: labelOp('msg-l', 'Faktury', false),
    });

    await merge();

    expect(
      store.database.sqlite.prepare('select message_id, label_id from message_labels').all(),
    ).toEqual([{ message_id: 'msg-k', label_id: klienti }]);
    expect(pending().map(({ ref }) => ref)).toEqual(['msg-k:label:Faktury', 'msg-k:label:Klienti']);
    expectMergeInvariants(store);
  });

  it('gives a legacy move of a loser its placement as the source', async () => {
    insertPending(store, account, {
      kind: 'provider-op',
      ref: 'msg-l:move',
      payload: { messageId: 'msg-l', change: { kind: 'move', role: 'trash' } },
    });

    await merge();

    const [move] = pending();
    expect(move?.ref).toBe(`msg-k:move:${account.boxes.allMail.id}`);
    expect(JSON.parse(move?.payload ?? '{}')).toEqual({
      messageId: 'msg-k',
      change: { kind: 'move', role: 'trash' },
      source: { mailboxId: account.boxes.allMail.id, uid: 7 },
    });
    expectNoLoserReferences(store, ['msg-l', 'msg-m']);
  });

  it('reduces effects, Jira events, origins and calendar replies to the keeper', async () => {
    insertPending(store, account, {
      kind: 'message-effects',
      ref: 'msg-k',
      payload: effects('msg-k', false),
    });
    insertPending(store, account, {
      kind: 'message-effects',
      ref: 'msg-l',
      payload: effects('msg-l', true),
    });
    insertPending(store, account, {
      kind: 'jira-event',
      ref: 'msg-m',
      payload: { threadId: MERGE_THREAD, title: 'RELAY-1' },
    });
    insertPending(store, account, {
      kind: 'trash-origin',
      ref: 'msg-l',
      payload: { messageId: 'msg-l', role: 'inbox' },
    });
    insertPending(store, account, {
      kind: 'calendar-reply',
      ref: 'uid-1',
      payload: { uid: 'uid-1', messageId: 'msg-m' },
    });

    await merge();

    expect(
      pending().map(({ kind, ref, payload }): unknown[] => [kind, ref, JSON.parse(payload)]),
    ).toEqual([
      ['calendar-reply', 'uid-1', { uid: 'uid-1', messageId: 'msg-k' }],
      ['jira-event', 'msg-k', { threadId: MERGE_THREAD, title: 'RELAY-1' }],
      ['message-effects', 'msg-k', effects('msg-k', true)],
      ['trash-origin', 'msg-k', { messageId: 'msg-k', role: 'inbox' }],
    ]);
    expectMergeInvariants(store);
    expectNoLoserReferences(store, ['msg-l', 'msg-m']);
  });
});
