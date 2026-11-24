import { LabelIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { messageId, NO_HEADERS, threadId } from './support/fixtures';
import {
  at,
  expectMirrorParity,
  gmailIdentity,
  messageCount,
  newMessage,
  type PlacementMailboxes,
  placeRequest,
  seedPlacementMailboxes,
  storedState,
} from './support/place-fixtures';
import { placementRows } from './support/placement-rows';
import { seedAccount, type SeededAccount } from './support/seed';
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

const LABEL = LabelIdSchema.parse('lbl-1');

describe.each(locations)('message placement removal $name', ({ file }) => {
  let directory: TempDirectory | null = null;
  let store: TestStore;
  let seeded: SeededAccount;
  let boxes: PlacementMailboxes;

  beforeEach(async () => {
    directory = file ? createTempDirectory() : null;
    store = createTestStore(directory === null ? ':memory:' : tempDatabasePath(directory));
    seeded = await seedAccount(store.repositories);
    boxes = await seedPlacementMailboxes(store, seeded);
  });

  afterEach(() => {
    store.database.close();
    directory?.remove();
  });

  const gmailMessage = async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.inbox, 5), { emailId: 'gm-1' }),
      NO_HEADERS,
    );
    await messages.place(placeRequest(gmailIdentity(seeded, boxes.allMail, 40), null));
    return messages;
  };

  const labelRows = (): number =>
    store.database.sqlite
      .prepare<[], { count: number }>('select count(*) as count from message_labels')
      .get()?.count ?? 0;

  it('expunges one placement, keeps the message and deletes it with the last one', async () => {
    const messages = await gmailMessage();
    await store.repositories.labels.upsert({
      id: LABEL,
      accountId: seeded.account.id,
      name: 'Faktúry',
      color: null,
      kind: 'gmail',
      remoteName: 'Faktúry',
    });
    await messages.addLabel(messageId('msg-1'), LABEL);
    store.database.sqlite
      .prepare('insert into message_aliases (alias_id, message_id) values (?, ?)')
      .run('msg-merged', 'msg-1');

    expect(await messages.deleteByUids(boxes.inbox.id, [5, 0])).toEqual(['thr-1']);
    expectMirrorParity(store, boxes, await messages.findById(LOCAL_USER_ID, messageId('msg-1')));
    expect(storedState(store, 'msg-1')).toMatchObject(at(boxes.allMail, 40));

    expect(await messages.deleteByUids(boxes.allMail.id, [40])).toEqual(['thr-1']);
    expect(messageCount(store)).toBe(0);
    expect(placementRows(store)).toEqual([]);
    expect(labelRows()).toBe(0);
    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-merged'))).toBeNull();
  });

  it('ignores pending uids on expunge and lists only known uids', async () => {
    const messages = await gmailMessage();
    await messages.movePlacement(messageId('msg-1'), {
      from: boxes.allMail.id,
      to: at(boxes.spam, 0),
      keepSource: true,
    });

    expect(await messages.deleteByUids(boxes.spam.id, [0])).toEqual([]);
    expect(await messages.listUids(boxes.spam.id)).toEqual([]);
    expect(await messages.listUids(boxes.allMail.id)).toEqual([40]);
    expect(placementRows(store)).toHaveLength(3);
  });

  it('removes one placement, pending or not, through an alias', async () => {
    const messages = await gmailMessage();
    await messages.movePlacement(messageId('msg-1'), {
      from: boxes.inbox.id,
      to: at(boxes.spam, 0),
      keepSource: true,
    });
    store.database.sqlite
      .prepare('insert into message_aliases (alias_id, message_id) values (?, ?)')
      .run('msg-merged', 'msg-1');

    expect(await messages.removePlacement(messageId('msg-merged'), boxes.spam.id)).toEqual([
      'thr-1',
    ]);
    expect(await messages.removePlacement(messageId('msg-1'), boxes.spam.id)).toEqual([]);
    expect(await messages.removePlacement(messageId('msg-1'), boxes.inbox.id)).toEqual(['thr-1']);
    expectMirrorParity(store, boxes, await messages.findById(LOCAL_USER_ID, messageId('msg-1')));
    expect(await messages.removePlacement(messageId('msg-1'), boxes.allMail.id)).toEqual(['thr-1']);
    expect(messageCount(store)).toBe(0);
  });

  it('lets two messages fall back to pending mirrors in one mailbox', async () => {
    const { messages } = store.repositories;
    const pendingIn = async (id: string, source: PlacementMailboxes['inbox'], uid: number) => {
      await messages.upsert(
        newMessage(seeded, id, at(source, uid), { threadId: threadId(`thr-${id}`) }),
        NO_HEADERS,
      );
      await messages.movePlacement(messageId(id), {
        from: source.id,
        to: at(boxes.inbox, 0),
        keepSource: true,
      });
    };
    await pendingIn('msg-a', boxes.allMail, 40);
    await pendingIn('msg-b', boxes.allMail, 41);
    await pendingIn('msg-c', boxes.sent, 3);
    await pendingIn('msg-d', boxes.sent, 4);

    expect(await messages.deleteByUids(boxes.allMail.id, [40, 41])).toEqual([
      'thr-msg-a',
      'thr-msg-b',
    ]);
    expect(await messages.removePlacement(messageId('msg-c'), boxes.sent.id)).toEqual([
      'thr-msg-c',
    ]);
    expect(await messages.removePlacement(messageId('msg-d'), boxes.sent.id)).toEqual([
      'thr-msg-d',
    ]);

    ['msg-a', 'msg-b', 'msg-c', 'msg-d'].forEach((id) => {
      expect(storedState(store, id)).toMatchObject(at(boxes.inbox, 0));
    });
    expect(placementRows(store)).toHaveLength(4);
  });

  it('forgets a mailbox with its pending placements before the mailbox row goes', async () => {
    const messages = await gmailMessage();
    await messages.upsert(
      newMessage(seeded, 'msg-only', at(boxes.inbox, 0), {
        threadId: threadId('thr-2'),
        emailId: 'gm-2',
      }),
      NO_HEADERS,
    );
    expect(storedState(store, 'msg-1')).toMatchObject(at(boxes.inbox, 5));

    expect(await messages.forgetMailbox(boxes.inbox.id)).toEqual(['thr-1', 'thr-2']);
    await store.repositories.mailboxes.deleteMissing(seeded.account.id, [
      boxes.sent.path,
      boxes.allMail.path,
      boxes.spam.path,
    ]);

    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-1'))).toMatchObject({
      placements: [at(boxes.allMail, 40)],
      mailboxId: boxes.allMail.id,
      uid: 40,
    });
    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-only'))).toBeNull();
  });

  it('moves the mirror to the best placement so deleting the old primary mailbox keeps it', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.allMail, 40), { emailId: 'gm-1' }),
      NO_HEADERS,
    );
    await messages.place(placeRequest(gmailIdentity(seeded, boxes.inbox, 5), null));
    expect(storedState(store, 'msg-1')).toMatchObject(at(boxes.inbox, 5));

    await store.repositories.mailboxes.deleteMissing(seeded.account.id, [
      boxes.inbox.path,
      boxes.sent.path,
      boxes.spam.path,
    ]);

    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-1'))).toMatchObject({
      placements: [at(boxes.inbox, 5)],
    });
  });

  it('moves a placement, keeps the source on request and never forgets a known uid', async () => {
    const messages = await gmailMessage();
    const read = () => messages.findById(LOCAL_USER_ID, messageId('msg-1'));

    await messages.movePlacement(messageId('msg-1'), {
      from: boxes.inbox.id,
      to: at(boxes.spam, 7),
      keepSource: false,
    });
    expect((await read())?.placements).toEqual([at(boxes.allMail, 40), at(boxes.spam, 7)]);
    expectMirrorParity(store, boxes, await read());

    await messages.movePlacement(messageId('msg-1'), {
      from: boxes.allMail.id,
      to: at(boxes.inbox, 0),
      keepSource: true,
    });
    await messages.movePlacement(messageId('msg-1'), {
      from: boxes.inbox.id,
      to: at(boxes.spam, 0),
      keepSource: false,
    });
    expect((await read())?.placements).toEqual([at(boxes.allMail, 40), at(boxes.spam, 7)]);
    expectMirrorParity(store, boxes, await read());

    await messages.movePlacement(messageId('msg-missing'), {
      from: boxes.inbox.id,
      to: at(boxes.spam, 9),
      keepSource: false,
    });
    expect(placementRows(store)).toHaveLength(2);
  });
});
