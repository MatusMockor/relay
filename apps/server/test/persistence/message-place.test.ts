import type { MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';
import {
  ALL_GATES,
  at,
  expectMirrorParity,
  gmailIdentity,
  messageCount,
  newMessage,
  NO_HEADERS,
  PLACED_AT,
  type PlacementScene,
  placementRows,
  placeRequest,
  searchHits,
  seedPlacementScene,
  sortedPlacements,
  storedState,
} from './support/place-fixtures';

describe('PgMessageRepository.place', () => {
  const context = usePgTestContext();

  const scene = async (): Promise<PlacementScene> =>
    seedPlacementScene(context.repositories, await seedAccount(context.repositories));

  const createAt = async (placed: PlacementScene, uid: number, emailId: string | null = 'gm-1') => {
    const { inbox } = placed.boxes;
    const message = newMessage(placed, at(inbox, uid), { emailId, textBody: 'Vianočný večierok' });
    const outcome = await context.repositories.messages.place(
      placeRequest(gmailIdentity(placed, inbox, uid, { emailId }), message, ALL_GATES),
    );
    expect(outcome.kind).toBe('created');
    return message.id;
  };

  const seedAt = async (
    placed: PlacementScene,
    location: ReturnType<typeof at>,
    overrides: Parameters<typeof newMessage>[2] = {},
  ): Promise<MessageId> => {
    const message = newMessage(placed, location, overrides);
    await context.repositories.messages.upsert(message, NO_HEADERS);
    return message.id;
  };

  it('creates a message with its first placement and claims the gates', async () => {
    const placed = await scene();
    const { inbox } = placed.boxes;
    const message = newMessage(placed, at(inbox, 5), { emailId: 'gm-1' });

    const outcome = await context.repositories.messages.place(
      placeRequest(gmailIdentity(placed, inbox, 5), message, ALL_GATES),
    );

    expect(outcome).toMatchObject({
      kind: 'created',
      previous: [],
      claimed: ALL_GATES,
      message: { id: message.id, placements: [at(inbox, 5)] },
    });
    await expect(storedState(context.db, message.id)).resolves.toEqual({
      ...at(inbox, 5),
      jira: PLACED_AT,
      invite: PLACED_AT,
    });
  });

  it('attaches an All Mail copy to the message of the same email id', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, allMail } = placed.boxes;
    const id = await createAt(placed, 5);

    const outcome = await messages.place(
      placeRequest(
        gmailIdentity(placed, allMail, 40),
        newMessage(placed, at(allMail, 40), { emailId: 'gm-1' }),
        ALL_GATES,
      ),
    );

    expect(outcome).toMatchObject({
      kind: 'attached',
      previous: [at(inbox, 5)],
      claimed: { jira: false, invite: false },
      message: { id, placements: sortedPlacements([at(inbox, 5), at(allMail, 40)]) },
    });
    await expect(messageCount(context.db, placed.seeded.account.id)).resolves.toBe(1);
    await expect(searchHits(context.db, placed.seeded.account.id, 'Vianočný')).resolves.toBe(1);
    await expect(messages.findByLocation(at(allMail, 40))).resolves.toMatchObject({ id });
    await expectMirrorParity(
      context.db,
      placed.boxes,
      await messages.findById(placed.seeded.user.id, id),
    );
  });

  it('refreshes the message at the location and fills a missing email id', async () => {
    const placed = await scene();
    const { inbox } = placed.boxes;
    const id = await createAt(placed, 5, null);

    const outcome = await context.repositories.messages.place(
      placeRequest(gmailIdentity(placed, inbox, 5), null, ALL_GATES),
    );

    expect(outcome).toMatchObject({
      kind: 'refreshed',
      claimed: { jira: false, invite: false },
      message: { id, emailId: 'gm-1', placements: [at(inbox, 5)] },
    });
  });

  it('replaces a lower uid in the mailbox and leaves a stale lower fetch alone', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox } = placed.boxes;
    const id = await createAt(placed, 5);

    const replaced = await messages.place(placeRequest(gmailIdentity(placed, inbox, 9), null));
    const stale = await messages.place(placeRequest(gmailIdentity(placed, inbox, 7), null));

    expect(replaced).toMatchObject({ kind: 'attached', message: { uid: 9 } });
    expect(stale).toMatchObject({ kind: 'refreshed', message: { uid: 9 } });
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toEqual([
      { messageId: id, mailboxId: inbox.id, uid: 9 },
    ]);
    await expect(messages.listUids(inbox.id)).resolves.toEqual([9]);
  });

  it('adopts a pending placement by email id and keeps the real uid as primary', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, allMail } = placed.boxes;
    const id = await seedAt(placed, at(allMail, 40), { emailId: 'gm-1' });
    await messages.movePlacement(id, { from: allMail.id, to: at(inbox, 0), keepSource: true });
    await expect(storedState(context.db, id)).resolves.toMatchObject(at(allMail, 40));

    const outcome = await messages.place(placeRequest(gmailIdentity(placed, inbox, 12), null));

    expect(outcome).toMatchObject({
      kind: 'adopted',
      previous: sortedPlacements([at(inbox, 0), at(allMail, 40)]),
      message: { placements: sortedPlacements([at(inbox, 12), at(allMail, 40)]) },
    });
    await expectMirrorParity(
      context.db,
      placed.boxes,
      await messages.findById(placed.seeded.user.id, id),
    );
    await expect(storedState(context.db, id)).resolves.toMatchObject(at(inbox, 12));
  });

  it('adopts exactly one Gmail placeholder by Message-ID and fills its email id', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox } = placed.boxes;
    const header = '<draft@relay.test>';
    const id = await seedAt(placed, at(inbox, 0), { messageIdHeader: header });
    const identity = gmailIdentity(placed, inbox, 14, { messageIdHeader: header });

    await expect(messages.matchPlacement(identity)).resolves.toMatchObject({
      kind: 'adopted',
      message: { id },
      gates: { jira: false, invite: false },
    });
    await expect(messages.place(placeRequest(identity, null))).resolves.toMatchObject({
      kind: 'adopted',
      message: { id, emailId: 'gm-1', placements: [at(inbox, 14)] },
    });
  });

  it('keeps generic first-match adoption and never joins by email id there', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, sent, allMail, spam } = placed.boxes;
    const header = '<copy@relay.test>';
    const objectId = await seedAt(placed, at(spam, 9), {
      emailId: 'obj-1',
      messageIdHeader: '<object@relay.test>',
    });
    const ids: MessageId[] = [];
    for (const [uid, date] of [
      [1, '2026-11-12T10:00:00.000Z'],
      [2, '2026-11-11T10:00:00.000Z'],
    ] as const) {
      const id = await seedAt(placed, at(sent, uid), { messageIdHeader: header, date });
      await messages.movePlacement(id, { from: sent.id, to: at(inbox, 0), keepSource: true });
      ids.push(id);
    }
    const generic = { labelBased: false, emailId: 'obj-1', messageIdHeader: header };
    const copy = newMessage(placed, at(allMail, 4), { emailId: 'obj-1' });

    const adopted = await messages.place(
      placeRequest(gmailIdentity(placed, inbox, 3, generic), null),
    );
    const separate = await messages.place(
      placeRequest(gmailIdentity(placed, allMail, 4, { ...generic, messageIdHeader: null }), copy),
    );

    expect(adopted).toMatchObject({
      kind: 'adopted',
      message: { id: ids[1], placements: sortedPlacements([at(inbox, 3), at(sent, 2)]) },
    });
    expect(separate).toMatchObject({ kind: 'created', message: { id: copy.id } });
    await expect(
      context.repositories.messages.findById(placed.seeded.user.id, objectId),
    ).resolves.toMatchObject({ placements: [at(spam, 9)] });
  });

  it('places a new copy on the inbox keeper of legacy duplicates', async () => {
    const placed = await scene();
    const { inbox, sent, allMail } = placed.boxes;
    const sentId = await seedAt(placed, at(sent, 3), { emailId: 'gm-1' });
    const inboxId = await seedAt(placed, at(inbox, 8), { emailId: 'gm-1' });

    const outcome = await context.repositories.messages.place(
      placeRequest(gmailIdentity(placed, allMail, 40), null),
    );

    expect(outcome).toMatchObject({ kind: 'attached', message: { id: inboxId } });
    const rows = await placementRows(context.db, placed.seeded.account.id);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        { messageId: inboxId, mailboxId: inbox.id, uid: 8 },
        { messageId: inboxId, mailboxId: allMail.id, uid: 40 },
        { messageId: sentId, mailboxId: sent.id, uid: 3 },
      ]),
    );
  });

  it('places a new copy on the oldest row when no legacy duplicate is in the inbox', async () => {
    const placed = await scene();
    const { sent, spam, allMail } = placed.boxes;
    const first = await seedAt(placed, at(sent, 3), { emailId: 'gm-1' });
    const second = await seedAt(placed, at(spam, 4), { emailId: 'gm-1' });
    const keeper = [first, second].sort()[0];

    const outcome = await context.repositories.messages.place(
      placeRequest(gmailIdentity(placed, allMail, 40), null),
    );

    expect(outcome).toMatchObject({ kind: 'attached', message: { id: keeper } });
  });

  it('adopts the one Sent record without an email id', async () => {
    const placed = await scene();
    const { sent } = placed.boxes;
    const header = '<sent@relay.test>';
    const id = await seedAt(placed, at(sent, 30), { messageIdHeader: header });

    const outcome = await context.repositories.messages.place(
      placeRequest(gmailIdentity(placed, sent, 31, { messageIdHeader: header }), null),
    );

    expect(outcome).toMatchObject({
      kind: 'adopted',
      message: { id, emailId: 'gm-1', placements: [at(sent, 31)] },
    });
  });

  it('claims each gate once and never lets upsert touch them', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, spam } = placed.boxes;
    const id = await seedAt(placed, at(spam, 2), { emailId: 'gm-1' });
    const inboxCopy = gmailIdentity(placed, inbox, 5);

    const first = await messages.place(
      placeRequest(inboxCopy, null, { jira: true, invite: false }),
    );
    const second = await messages.place(placeRequest(inboxCopy, null, ALL_GATES));
    await messages.upsert(newMessage(placed, at(inbox, 5), { id, emailId: 'gm-1' }), NO_HEADERS);

    expect(first).toMatchObject({ kind: 'attached', claimed: { jira: true, invite: false } });
    expect(second).toMatchObject({ kind: 'refreshed', claimed: { jira: false, invite: true } });
    await expect(storedState(context.db, id)).resolves.toMatchObject({
      jira: PLACED_AT,
      invite: PLACED_AT,
    });
    await expect(messages.matchPlacement(inboxCopy)).resolves.toMatchObject({
      kind: 'refreshed',
      gates: { jira: true, invite: true },
    });
  });

  it('reports a miss without writing when it may not create', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const identity = gmailIdentity(placed, placed.boxes.inbox, 5);

    await expect(messages.matchPlacement(identity)).resolves.toBeNull();
    await expect(messages.place(placeRequest(identity, null, ALL_GATES))).resolves.toEqual({
      kind: 'unmatched',
    });
    await expect(messageCount(context.db, placed.seeded.account.id)).resolves.toBe(0);
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toEqual([]);
  });
});
