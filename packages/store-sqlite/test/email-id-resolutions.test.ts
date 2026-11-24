import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addPlacement,
  insertCopy,
  type MergeAccount,
  seedMergeAccount,
} from './support/merge-seed';
import { createTestStore, type TestStore } from './support/test-database';

describe('SqliteEmailIdResolutions', () => {
  let store: TestStore;
  let account: MergeAccount;

  const emailIdOf = (id: string): unknown =>
    store.database.sqlite.prepare('select email_id as emailId from messages where id = ?').get(id);

  beforeEach(async () => {
    store = createTestStore();
    account = await seedMergeAccount(store);
    const { allMail, label } = account.boxes;
    insertCopy(store, account, { id: 'msg-1', mailbox: allMail, uid: 3, emailId: null });
    insertCopy(store, account, { id: 'msg-2', mailbox: allMail, uid: 5, emailId: 'gm-known' });
    insertCopy(store, account, { id: 'msg-3', mailbox: allMail, uid: 8, emailId: null });
    insertCopy(store, account, { id: 'msg-4', mailbox: allMail, uid: 9, emailId: null });
    insertCopy(store, account, { id: 'msg-5', mailbox: label, uid: 4, emailId: null });
    addPlacement(store, 'msg-5', allMail, 0);
  });

  afterEach(() => {
    store.database.close();
  });

  it('lists unresolved placements of a mailbox by uid with a keyset', async () => {
    const resolutions = store.repositories.emailIdResolutions;

    const first = await resolutions.listUnresolved(account.boxes.allMail.id, 0, 2);
    const rest = await resolutions.listUnresolved(account.boxes.allMail.id, 8, 10);

    expect(first).toEqual([
      { messageId: 'msg-1', uid: 3 },
      { messageId: 'msg-3', uid: 8 },
    ]);
    expect(rest).toEqual([{ messageId: 'msg-4', uid: 9 }]);
  });

  it('fills only missing email ids at the given uids', async () => {
    const filled = await store.repositories.emailIdResolutions.fillEmailIds(
      account.boxes.allMail.id,
      [
        { uid: 3, emailId: 'gm-1' },
        { uid: 5, emailId: 'gm-other' },
        { uid: 77, emailId: 'gm-missing' },
        { uid: 0, emailId: 'gm-pending' },
      ],
    );

    expect(filled).toBe(1);
    expect(emailIdOf('msg-1')).toEqual({ emailId: 'gm-1' });
    expect(emailIdOf('msg-2')).toEqual({ emailId: 'gm-known' });
    expect(emailIdOf('msg-5')).toEqual({ emailId: null });
  });
});
