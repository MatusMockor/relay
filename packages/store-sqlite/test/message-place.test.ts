import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { ftsCount } from './support/body-store-seed';
import { messageId, NO_HEADERS } from './support/fixtures';
import {
  ALL_GATES,
  at,
  expectMirrorParity,
  gmailIdentity,
  messageCount,
  newMessage,
  PLACED_AT,
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

describe.each(locations)('MessageRepository.place $name', ({ file }) => {
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

  const createAt = async (id: string, mailboxUid: number, emailId: string | null = 'gm-1') => {
    const location = at(boxes.inbox, mailboxUid);
    const outcome = await store.repositories.messages.place(
      placeRequest(
        gmailIdentity(seeded, boxes.inbox, mailboxUid, { emailId }),
        newMessage(seeded, id, location, { emailId, textBody: 'Vianočný večierok' }),
        ALL_GATES,
      ),
    );
    expect(outcome.kind).toBe('created');
    return outcome;
  };

  it('creates a message with its first placement and claims the gates', async () => {
    const outcome = await createAt('msg-1', 5);

    expect(outcome).toMatchObject({
      kind: 'created',
      previous: [],
      claimed: ALL_GATES,
      message: { id: 'msg-1', placements: [at(boxes.inbox, 5)] },
    });
    expect(storedState(store, 'msg-1')).toEqual({
      ...at(boxes.inbox, 5),
      jira: PLACED_AT,
      invite: PLACED_AT,
    });
  });

  it('attaches an All Mail copy to the message of the same email id', async () => {
    const { messages } = store.repositories;
    await createAt('msg-1', 5);

    const outcome = await messages.place(
      placeRequest(
        gmailIdentity(seeded, boxes.allMail, 40),
        newMessage(seeded, 'msg-2', at(boxes.allMail, 40)),
        ALL_GATES,
      ),
    );

    expect(outcome).toMatchObject({
      kind: 'attached',
      previous: [at(boxes.inbox, 5)],
      claimed: { jira: false, invite: false },
      message: { id: 'msg-1', placements: [at(boxes.inbox, 5), at(boxes.allMail, 40)] },
    });
    expect(messageCount(store)).toBe(1);
    expect(ftsCount(store, 'Vianočný')).toBe(1);
    expect(await messages.findByLocation(at(boxes.allMail, 40))).toMatchObject({ id: 'msg-1' });
    expectMirrorParity(store, boxes, await messages.findById(LOCAL_USER_ID, messageId('msg-1')));
  });

  it('refreshes the message at the location and fills a missing email id', async () => {
    const { messages } = store.repositories;
    await createAt('msg-1', 5, null);

    const outcome = await messages.place(
      placeRequest(gmailIdentity(seeded, boxes.inbox, 5), null, ALL_GATES),
    );

    expect(outcome).toMatchObject({
      kind: 'refreshed',
      claimed: { jira: false, invite: false },
      message: { id: 'msg-1', emailId: 'gm-1', placements: [at(boxes.inbox, 5)] },
    });
  });

  it('replaces a lower uid in the mailbox and leaves a stale lower fetch alone', async () => {
    const { messages } = store.repositories;
    await createAt('msg-1', 5);

    const replaced = await messages.place(
      placeRequest(gmailIdentity(seeded, boxes.inbox, 9), null),
    );
    const stale = await messages.place(placeRequest(gmailIdentity(seeded, boxes.inbox, 7), null));

    expect(replaced).toMatchObject({ kind: 'attached', message: { uid: 9 } });
    expect(stale).toMatchObject({ kind: 'refreshed', message: { uid: 9 } });
    expect(placementRows(store)).toEqual([
      { messageId: 'msg-1', mailboxId: boxes.inbox.id, uid: 9 },
    ]);
    expect(await messages.listUids(boxes.inbox.id)).toEqual([9]);
  });

  it('adopts a pending placement by email id and keeps the real uid as primary', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.allMail, 40), { emailId: 'gm-1' }),
      NO_HEADERS,
    );
    await messages.movePlacement(messageId('msg-1'), {
      from: boxes.allMail.id,
      to: at(boxes.inbox, 0),
      keepSource: true,
    });
    expect(storedState(store, 'msg-1')).toMatchObject(at(boxes.allMail, 40));

    const outcome = await messages.place(
      placeRequest(gmailIdentity(seeded, boxes.inbox, 12), null),
    );

    expect(outcome).toMatchObject({
      kind: 'adopted',
      previous: [at(boxes.inbox, 0), at(boxes.allMail, 40)],
      message: { placements: [at(boxes.inbox, 12), at(boxes.allMail, 40)] },
    });
    expectMirrorParity(store, boxes, await messages.findById(LOCAL_USER_ID, messageId('msg-1')));
    expect(storedState(store, 'msg-1')).toMatchObject(at(boxes.inbox, 12));
  });

  it('adopts exactly one Gmail placeholder by Message-ID and fills its email id', async () => {
    const { messages } = store.repositories;
    const header = '<draft@relay.test>';
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.inbox, 0), { messageIdHeader: header }),
      NO_HEADERS,
    );
    const identity = gmailIdentity(seeded, boxes.inbox, 14, { messageIdHeader: header });

    expect(await messages.matchPlacement(identity)).toMatchObject({
      kind: 'adopted',
      message: { id: 'msg-1' },
      gates: { jira: false, invite: false },
    });
    expect(await messages.place(placeRequest(identity, null))).toMatchObject({
      kind: 'adopted',
      message: { id: 'msg-1', emailId: 'gm-1', placements: [at(boxes.inbox, 14)] },
    });
  });

  it('keeps generic first-match adoption and never joins by email id there', async () => {
    const { messages } = store.repositories;
    const header = '<copy@relay.test>';
    for (const [id, uid, date] of [
      ['msg-new', 1, '2026-11-12T10:00:00.000Z'],
      ['msg-old', 2, '2026-11-11T10:00:00.000Z'],
    ] as const) {
      await messages.upsert(
        newMessage(seeded, id, at(boxes.sent, uid), { messageIdHeader: header, date }),
        NO_HEADERS,
      );
      await messages.movePlacement(messageId(id), {
        from: boxes.sent.id,
        to: at(boxes.inbox, 0),
        keepSource: true,
      });
    }
    const generic = { labelBased: false, emailId: 'obj-1', messageIdHeader: header };

    const adopted = await messages.place(
      placeRequest(gmailIdentity(seeded, boxes.inbox, 3, generic), null),
    );
    const separate = await messages.place(
      placeRequest(
        gmailIdentity(seeded, boxes.allMail, 4, { ...generic, messageIdHeader: null }),
        newMessage(seeded, 'msg-copy', at(boxes.allMail, 4), { emailId: 'obj-1' }),
      ),
    );

    expect(adopted).toMatchObject({
      kind: 'adopted',
      message: { id: 'msg-old', placements: [at(boxes.inbox, 3), at(boxes.sent, 2)] },
    });
    expect(separate).toMatchObject({ kind: 'created', message: { id: 'msg-copy' } });
  });

  it('places a new copy on the inbox keeper of legacy duplicates', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      newMessage(seeded, 'msg-sent', at(boxes.sent, 3), { emailId: 'gm-1' }),
      NO_HEADERS,
    );
    await messages.upsert(
      newMessage(seeded, 'msg-inbox', at(boxes.inbox, 8), { emailId: 'gm-1' }),
      NO_HEADERS,
    );

    const outcome = await messages.place(
      placeRequest(gmailIdentity(seeded, boxes.allMail, 40), null),
    );

    expect(outcome).toMatchObject({ kind: 'attached', message: { id: 'msg-inbox' } });
    expect(placementRows(store)).toEqual([
      { messageId: 'msg-inbox', mailboxId: boxes.inbox.id, uid: 8 },
      { messageId: 'msg-inbox', mailboxId: boxes.allMail.id, uid: 40 },
      { messageId: 'msg-sent', mailboxId: boxes.sent.id, uid: 3 },
    ]);
  });

  it('adopts the one Sent record without an email id', async () => {
    const { messages } = store.repositories;
    const header = '<sent@relay.test>';
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.sent, 30), { messageIdHeader: header }),
      NO_HEADERS,
    );

    const outcome = await messages.place(
      placeRequest(gmailIdentity(seeded, boxes.sent, 31, { messageIdHeader: header }), null),
    );

    expect(outcome).toMatchObject({
      kind: 'adopted',
      message: { id: 'msg-1', emailId: 'gm-1', placements: [at(boxes.sent, 31)] },
    });
  });

  it('claims each gate once and never lets upsert touch them', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.spam, 2), { emailId: 'gm-1' }),
      NO_HEADERS,
    );
    const inboxCopy = gmailIdentity(seeded, boxes.inbox, 5);

    const first = await messages.place(
      placeRequest(inboxCopy, null, { jira: true, invite: false }),
    );
    const second = await messages.place(placeRequest(inboxCopy, null, ALL_GATES));
    await messages.upsert(
      newMessage(seeded, 'msg-1', at(boxes.inbox, 5), { emailId: 'gm-1' }),
      NO_HEADERS,
    );

    expect(first).toMatchObject({ kind: 'attached', claimed: { jira: true, invite: false } });
    expect(second).toMatchObject({ kind: 'refreshed', claimed: { jira: false, invite: true } });
    expect(storedState(store, 'msg-1')).toMatchObject({ jira: PLACED_AT, invite: PLACED_AT });
    expect(await messages.matchPlacement(inboxCopy)).toMatchObject({
      kind: 'refreshed',
      gates: { jira: true, invite: true },
    });
  });

  it('reports a miss without writing when it may not create', async () => {
    const { messages } = store.repositories;
    const identity = gmailIdentity(seeded, boxes.inbox, 5);

    expect(await messages.matchPlacement(identity)).toBeNull();
    expect(await messages.place(placeRequest(identity, null, ALL_GATES))).toEqual({
      kind: 'unmatched',
    });
    expect(messageCount(store)).toBe(0);
    expect(placementRows(store)).toEqual([]);
  });
});
