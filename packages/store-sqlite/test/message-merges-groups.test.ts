import { AccountIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedAccount } from './support/seed';
import { insertCopy, type MergeAccount, seedMergeAccount } from './support/merge-seed';
import { createTestStore, type TestStore } from './support/test-database';

const groupId = (index: number): string => `gm-${String(index).padStart(4, '0')}`;

describe('SqliteMessageMerges.nextGroups', () => {
  let store: TestStore;
  let account: MergeAccount;

  const next = (after: string | null, maxMessages = 500) =>
    store.repositories.messageMerges.nextGroups(account.seeded.account.id, after, maxMessages);

  beforeEach(async () => {
    store = createTestStore();
    account = await seedMergeAccount(store);
  });

  afterEach(() => {
    store.database.close();
  });

  it('walks the duplicate groups in email id order within the message bound', async () => {
    const { allMail, label, inbox } = account.boxes;
    const other = await seedAccount(store.repositories, {
      id: AccountIdSchema.parse('acc-other'),
      email: 'eva@firma.sk',
    });
    store.database.sqlite.transaction(() => {
      for (let index = 1; index <= 250; index += 1) {
        insertCopy(store, account, {
          id: `a-${String(index)}`,
          mailbox: allMail,
          uid: index,
          emailId: groupId(index),
        });
        insertCopy(store, account, {
          id: `b-${String(index)}`,
          mailbox: label,
          uid: index,
          emailId: groupId(index),
        });
      }
      for (let index = 1; index <= 600; index += 1) {
        insertCopy(store, account, {
          id: `big-${String(index)}`,
          mailbox: inbox,
          uid: index,
          emailId: 'gm-big',
        });
      }
      insertCopy(store, account, { id: 'solo', mailbox: allMail, uid: 900, emailId: 'gm-solo' });
      insertCopy(store, account, { id: 'null-1', mailbox: allMail, uid: 901, emailId: null });
      insertCopy(store, account, { id: 'null-2', mailbox: label, uid: 901, emailId: null });
      insertCopy(
        store,
        { ...account, seeded: other },
        { id: 'o-1', mailbox: other.inbox, uid: 1, emailId: 'gm-0001' },
      );
      insertCopy(
        store,
        { ...account, seeded: other },
        { id: 'o-2', mailbox: other.sent, uid: 1, emailId: 'gm-0001' },
      );
    })();

    const first = await next(null);
    const second = await next(first.last);
    const end = await next(second.last);

    expect(first.groups).toHaveLength(250);
    expect(first.groups.reduce((total, group) => total + group.size, 0)).toBe(500);
    expect(first.groups[0]).toEqual({ emailId: 'gm-0001', size: 2 });
    expect(first.last).toBe('gm-0250');
    expect(second).toEqual({ groups: [{ emailId: 'gm-big', size: 600 }], last: 'gm-big' });
    expect(end).toEqual({ groups: [], last: null });
  });

  it('stops before a group that would exceed the bound', async () => {
    const { allMail, label } = account.boxes;
    [1, 2, 3].forEach((index) => {
      insertCopy(store, account, {
        id: `a-${String(index)}`,
        mailbox: allMail,
        uid: index,
        emailId: groupId(index),
      });
      insertCopy(store, account, {
        id: `b-${String(index)}`,
        mailbox: label,
        uid: index,
        emailId: groupId(index),
      });
    });

    const chunk = await next(null, 5);

    expect(chunk).toEqual({
      groups: [
        { emailId: 'gm-0001', size: 2 },
        { emailId: 'gm-0002', size: 2 },
      ],
      last: 'gm-0002',
    });
    expect(await next(chunk.last, 5)).toEqual({
      groups: [{ emailId: 'gm-0003', size: 2 }],
      last: 'gm-0003',
    });
  });
});
