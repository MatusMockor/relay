import {
  type AccountId,
  type MailboxId,
  type MailboxRole,
  type Message,
  type MessageId,
  PENDING_UID,
  type ThreadId,
} from '@relay/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDatabase } from '../support/memory/memory-database';
import {
  MemoryEmailIdResolutions,
  MemoryMessageMerges,
} from '../support/memory/memory-message-merges';
import { MemoryMessageRepository } from '../support/memory/memory-message-repository';
import { ACCOUNT, ALL_MAIL, at, INBOX, placedMessage, SENT } from '../support/placement-fixtures';

const ROLES: readonly [MailboxId, MailboxRole][] = [
  [INBOX, 'inbox'],
  [ALL_MAIL, 'archive'],
  [SENT, 'sent'],
];
const OTHER_ACCOUNT = 'acc_other' as AccountId;
const THREAD_C = 'thr_c' as ThreadId;
const id = (value: string) => value as MessageId;

describe('MemoryMessageMerges', () => {
  let db: MemoryDatabase;
  let merges: MemoryMessageMerges;

  beforeEach(() => {
    db = new MemoryDatabase();
    ROLES.forEach(([mailboxId, role]) => {
      db.tables.mailboxes.set(mailboxId, {
        id: mailboxId,
        accountId: ACCOUNT,
        name: mailboxId,
        path: mailboxId,
        delimiter: '/',
        role,
        subscribed: true,
        uidValidity: null,
        unreadCount: 0,
        totalCount: 0,
      });
    });
    merges = new MemoryMessageMerges(db);
  });

  const put = (...messages: Message[]): void => {
    messages.forEach((message) => {
      db.tables.messages.set(message.id, message);
    });
  };

  const copies = (emailId: string, count: number, accountId = ACCOUNT): void => {
    const threadId = placedMessage(emailId, []).threadId;
    for (let index = 0; index < count; index += 1) {
      const location = at(ALL_MAIL, db.tables.messages.size + 1);
      put(
        placedMessage(`${emailId}-${String(index)}`, [location], { emailId, accountId, threadId }),
      );
    }
  };

  it('returns keyset chunks bounded by the message count', async () => {
    copies('gm-b', 2);
    copies('gm-a', 2);
    copies('gm-c', 3);
    copies('gm-single', 1);
    copies('gm-other', 2, OTHER_ACCOUNT);
    put(placedMessage('nullable', [at(SENT, 1)]), placedMessage('nullable-2', [at(SENT, 2)]));

    const first = await merges.nextGroups(ACCOUNT, null, 4);
    const second = await merges.nextGroups(ACCOUNT, first.last, 4);
    const end = await merges.nextGroups(ACCOUNT, second.last, 4);

    expect(first).toEqual({
      groups: [
        { emailId: 'gm-a', size: 2 },
        { emailId: 'gm-b', size: 2 },
      ],
      last: 'gm-b',
    });
    expect(second).toEqual({ groups: [{ emailId: 'gm-c', size: 3 }], last: 'gm-c' });
    expect(end).toEqual({ groups: [], last: null });
    expect((await merges.nextGroups(ACCOUNT, null, 1)).groups).toEqual([
      { emailId: 'gm-a', size: 2 },
    ]);
  });

  it('keeps the inbox copy, the most complete body and the earliest gates', async () => {
    put(
      placedMessage('old', [at(ALL_MAIL, 7)], {
        emailId: 'gm-1',
        textBody: 'Plný text správy',
      }),
      placedMessage('inbox', [at(INBOX, 3)], {
        emailId: 'gm-1',
        threadId: placedMessage('old', []).threadId,
        bodyState: 'remote',
        textBody: null,
      }),
    );
    db.tables.messageEffects.set(id('old'), { jira: '2026-11-01T00:00:00.000Z', invite: null });
    db.tables.messageAliases.set(id('older'), id('old'));

    const report = await merges.merge(ACCOUNT, [{ emailId: 'gm-1', size: 2 }]);

    expect(report).toEqual({
      merged: [{ emailId: 'gm-1', keeperId: 'inbox', loserIds: ['old'], threadId: 'thr_old' }],
      skipped: { 'spans-threads': 0, 'mailbox-conflict': 0 },
    });
    const keeper = db.tables.messages.get(id('inbox'));
    expect(keeper).toMatchObject({
      textBody: 'Plný text správy',
      mailboxId: INBOX,
      uid: 3,
      placements: [at(ALL_MAIL, 7), at(INBOX, 3)].sort((a, b) =>
        a.mailboxId.localeCompare(b.mailboxId),
      ),
    });
    expect(keeper?.bodyState).toBeUndefined();
    expect(db.tables.messageEffects.get(id('inbox'))).toEqual({
      jira: '2026-11-01T00:00:00.000Z',
      invite: null,
    });
    expect([...db.tables.messageAliases]).toEqual([
      ['older', 'inbox'],
      ['old', 'inbox'],
    ]);
    expect(await new MemoryMessageRepository(db).findByLocation(at(ALL_MAIL, 7))).toMatchObject({
      id: 'inbox',
    });
    await expect(merges.merge(ACCOUNT, [{ emailId: 'gm-1', size: 2 }])).resolves.toEqual({
      merged: [],
      skipped: { 'spans-threads': 0, 'mailbox-conflict': 0 },
    });
  });

  it('drops a pending placement that a positive UID in the same mailbox replaces', async () => {
    put(
      placedMessage('keeper', [at(INBOX, 1), at(SENT, PENDING_UID)], { emailId: 'gm-2' }),
      placedMessage('loser', [at(SENT, 9)], {
        emailId: 'gm-2',
        threadId: placedMessage('keeper', []).threadId,
      }),
    );

    await merges.merge(ACCOUNT, [{ emailId: 'gm-2', size: 2 }]);

    expect(db.tables.messages.get(id('keeper'))?.placements).toEqual([at(INBOX, 1), at(SENT, 9)]);
  });

  it('skips groups that span threads or hold two UIDs in one mailbox untouched', async () => {
    put(
      placedMessage('a', [at(INBOX, 1)], { emailId: 'gm-span' }),
      placedMessage('b', [at(ALL_MAIL, 1)], { emailId: 'gm-span' }),
      placedMessage('c', [at(INBOX, 2)], { emailId: 'gm-conflict', threadId: THREAD_C }),
      placedMessage('d', [at(INBOX, 3)], { emailId: 'gm-conflict', threadId: THREAD_C }),
    );
    const before = structuredClone(db.tables.messages);

    const report = await merges.merge(ACCOUNT, [
      { emailId: 'gm-span', size: 2 },
      { emailId: 'gm-conflict', size: 2 },
    ]);

    expect(report.skipped).toEqual({ 'spans-threads': 1, 'mailbox-conflict': 1 });
    expect(db.tables.messages).toEqual(before);
  });
});

describe('MemoryEmailIdResolutions', () => {
  it('lists positive UIDs of messages without an email id and never overwrites one', async () => {
    const db = new MemoryDatabase();
    [
      placedMessage('a', [at(ALL_MAIL, 5)]),
      placedMessage('b', [at(ALL_MAIL, 2)]),
      placedMessage('c', [at(ALL_MAIL, 9)], { emailId: 'gm-known' }),
      placedMessage('d', [at(ALL_MAIL, PENDING_UID)]),
      placedMessage('e', [at(INBOX, 4)]),
    ].forEach((message) => db.tables.messages.set(message.id, message));
    const resolutions = new MemoryEmailIdResolutions(db);

    const first = await resolutions.listUnresolved(ALL_MAIL, 0, 1);
    const rest = await resolutions.listUnresolved(ALL_MAIL, 2, 10);
    const filled = await resolutions.fillEmailIds(ALL_MAIL, [
      { uid: 2, emailId: 'gm-b' },
      { uid: 9, emailId: 'gm-other' },
      { uid: 77, emailId: 'gm-gone' },
    ]);

    expect(first).toEqual([{ messageId: 'b', uid: 2 }]);
    expect(rest).toEqual([{ messageId: 'a', uid: 5 }]);
    expect(filled).toBe(1);
    expect(db.tables.messages.get(id('b'))?.emailId).toBe('gm-b');
    expect(db.tables.messages.get(id('c'))?.emailId).toBe('gm-known');
  });
});
