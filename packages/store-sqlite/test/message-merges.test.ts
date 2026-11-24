import type { MergeGroup, MergeReport } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { ftsCount } from './support/body-store-seed';
import { messageId } from './support/fixtures';
import { expectMergeInvariants } from './support/merge-invariants';
import {
  addPlacement,
  insertCopy,
  type MergeAccount,
  seedMergeAccount,
} from './support/merge-seed';
import {
  at,
  gmailIdentity,
  messageCount,
  placeRequest,
  storedState,
} from './support/place-fixtures';
import { placementRows } from './support/placement-rows';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  type TestStore,
  tempDatabasePath,
} from './support/test-database';

const locations = [
  { name: 'in memory', file: false },
  { name: 'in a file', file: true },
] as const;

const NO_SKIPS = { 'spans-threads': 0, 'mailbox-conflict': 0 };

describe.each(locations)('SqliteMessageMerges.merge $name', ({ file }) => {
  let directory: TempDirectory | null = null;
  let store: TestStore;
  let account: MergeAccount;

  beforeEach(async () => {
    directory = file ? createTempDirectory() : null;
    store = createTestStore(directory === null ? ':memory:' : tempDatabasePath(directory));
    account = await seedMergeAccount(store);
  });

  afterEach(() => {
    store.database.close();
    directory?.remove();
  });

  const groups = async (): Promise<readonly MergeGroup[]> =>
    (await store.repositories.messageMerges.nextGroups(account.seeded.account.id, null, 500))
      .groups;

  const mergeAll = async (): Promise<MergeReport> => {
    const pending = await groups();
    return store.unitOfWork.run((repositories) =>
      repositories.messageMerges.merge(account.seeded.account.id, pending),
    );
  };

  it('merges three copies into the inbox copy even when it is not the oldest', async () => {
    const { allMail, label, inbox } = account.boxes;
    insertCopy(store, account, { id: 'msg-a', mailbox: allMail, uid: 10 });
    insertCopy(store, account, { id: 'msg-b', mailbox: label, uid: 11 });
    insertCopy(store, account, { id: 'msg-c', mailbox: inbox, uid: 12 });

    const report = await mergeAll();

    expect(report).toEqual({
      merged: [
        { emailId: 'gm-1', keeperId: 'msg-c', loserIds: ['msg-a', 'msg-b'], threadId: 'thr-merge' },
      ],
      skipped: NO_SKIPS,
    });
    expect(messageCount(store)).toBe(1);
    expect(placementRows(store)).toEqual([
      { messageId: 'msg-c', ...at(inbox, 12) },
      { messageId: 'msg-c', ...at(allMail, 10) },
      { messageId: 'msg-c', ...at(label, 11) },
    ]);
    expect(storedState(store, 'msg-c')).toMatchObject(at(inbox, 12));
    const viaAlias = await store.repositories.messages.findById(LOCAL_USER_ID, messageId('msg-a'));
    expect(viaAlias?.id).toBe('msg-c');
    expect(ftsCount(store, 'faktúru')).toBe(1);
    expectMergeInvariants(store);
  });

  it('keeps the oldest copy without an inbox placement, as place() does', async () => {
    const { allMail, label, inbox } = account.boxes;
    insertCopy(store, account, { id: 'msg-old', mailbox: allMail, uid: 5 });
    insertCopy(store, account, { id: 'msg-new', mailbox: label, uid: 6 });
    insertCopy(store, account, { id: 'msg-other', mailbox: allMail, uid: 7, emailId: 'gm-2' });
    insertCopy(store, account, {
      id: 'msg-inboxed',
      mailbox: inbox,
      uid: 8,
      emailId: 'gm-2',
    });
    const placed = await store.repositories.messages.place(
      placeRequest(
        gmailIdentity(account.seeded, account.boxes.trash, 9, { emailId: 'gm-2' }),
        null,
      ),
    );

    const report = await mergeAll();

    expect(placed).toMatchObject({ kind: 'attached', message: { id: 'msg-inboxed' } });
    expect(report.merged.map(({ keeperId }) => keeperId)).toEqual(['msg-old', 'msg-inboxed']);
    expectMergeInvariants(store);
  });

  it('takes the most complete body and the earliest gates onto the keeper', async () => {
    const { allMail, label, inbox } = account.boxes;
    const headers = '[["x-relay",["donor"]]]';
    insertCopy(store, account, {
      id: 'msg-keeper',
      mailbox: inbox,
      uid: 1,
      bodyState: 'remote',
      textBody: null,
      snippet: 'Hlavička',
      invite: '2026-11-22T10:00:00.000Z',
    });
    insertCopy(store, account, {
      id: 'msg-short',
      mailbox: label,
      uid: 2,
      textBody: 'Krátky text',
      jira: '2026-11-23T10:00:00.000Z',
      invite: '2026-11-20T10:00:00.000Z',
    });
    insertCopy(store, account, {
      id: 'msg-donor',
      mailbox: allMail,
      uid: 3,
      textBody: 'Dobrý deň, v prílohe posielam celú zmluvu o dielo.',
      htmlBody: '<p>Dobrý deň</p>',
      headers,
      jira: '2026-11-21T10:00:00.000Z',
      invite: '2026-11-24T10:00:00.000Z',
    });

    await mergeAll();

    const row = store.database.sqlite
      .prepare('select * from messages where id = ?')
      .get('msg-keeper');
    expect(row).toMatchObject({
      body_state: 'local',
      text_body: 'Dobrý deň, v prílohe posielam celú zmluvu o dielo.',
      html_body: '<p>Dobrý deň</p>',
      headers,
      snippet: 'Posielam faktúru',
      jira_effects_at: '2026-11-21T10:00:00.000Z',
      invite_effects_at: '2026-11-20T10:00:00.000Z',
      mailbox_id: inbox.id,
    });
    expect(ftsCount(store, 'zmluvu')).toBe(1);
    expect(ftsCount(store, 'Krátky')).toBe(0);
    expectMergeInvariants(store);
  });

  it('keeps one placement per mailbox, a real UID over a pending one', async () => {
    const { allMail, trash, inbox } = account.boxes;
    insertCopy(store, account, { id: 'msg-keeper', mailbox: inbox, uid: 3 });
    addPlacement(store, 'msg-keeper', allMail, 0);
    addPlacement(store, 'msg-keeper', trash, 0);
    insertCopy(store, account, { id: 'msg-loser', mailbox: allMail, uid: 9 });
    addPlacement(store, 'msg-loser', trash, 0);

    await mergeAll();

    expect(placementRows(store)).toEqual([
      { messageId: 'msg-keeper', ...at(inbox, 3) },
      { messageId: 'msg-keeper', ...at(allMail, 9) },
      { messageId: 'msg-keeper', ...at(trash, 0) },
    ]);
    expectMergeInvariants(store);
  });

  it('leaves mailbox conflicts and groups that span threads untouched', async () => {
    const { allMail, inbox } = account.boxes;
    insertCopy(store, account, { id: 'msg-c1', mailbox: allMail, uid: 4 });
    insertCopy(store, account, { id: 'msg-c2', mailbox: allMail, uid: 8 });
    insertCopy(store, account, { id: 'msg-t1', mailbox: inbox, uid: 5, emailId: 'gm-2' });
    insertCopy(store, account, {
      id: 'msg-t2',
      mailbox: allMail,
      uid: 6,
      emailId: 'gm-2',
      threadId: 'thr-other',
    });
    const before = placementRows(store);

    const report = await mergeAll();

    expect(report).toEqual({
      merged: [],
      skipped: { 'spans-threads': 1, 'mailbox-conflict': 1 },
    });
    expect(placementRows(store)).toEqual(before);
    expect(messageCount(store)).toBe(4);
    expectMergeInvariants(store);
  });

  it('is idempotent and leaves only skipped groups for the next pass', async () => {
    const { allMail, inbox, label } = account.boxes;
    insertCopy(store, account, { id: 'msg-k', mailbox: inbox, uid: 1 });
    insertCopy(store, account, { id: 'msg-l', mailbox: label, uid: 2 });
    insertCopy(store, account, { id: 'msg-c1', mailbox: allMail, uid: 3, emailId: 'gm-2' });
    insertCopy(store, account, { id: 'msg-c2', mailbox: allMail, uid: 4, emailId: 'gm-2' });
    const pending = await groups();

    const first = await mergeAll();
    const again = await store.unitOfWork.run((repositories) =>
      repositories.messageMerges.merge(account.seeded.account.id, pending),
    );

    expect(first.merged).toHaveLength(1);
    expect(again).toEqual({ merged: [], skipped: { ...NO_SKIPS, 'mailbox-conflict': 1 } });
    expect(await groups()).toEqual([{ emailId: 'gm-2', size: 2 }]);
    expect(
      await store.repositories.messageMerges.merge(account.seeded.account.id, [
        { emailId: 'gm-gone', size: 2 },
      ]),
    ).toEqual({ merged: [], skipped: NO_SKIPS });
    expectMergeInvariants(store);
  });
});
