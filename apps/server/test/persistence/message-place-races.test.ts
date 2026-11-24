import type { MessageRepository } from '@relay/engine';
import { describe, expect, it, onTestFinished } from 'vitest';
import { PgMessageRepository } from '../../src/persistence/repositories/messages/pg-message-repository';
import { seedAccount } from './support/fixtures';
import { waitForLockWaiters } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';
import {
  at,
  gmailIdentity,
  messageCount,
  newMessage,
  NO_HEADERS,
  type PlacementScene,
  placementRows,
  placeRequest,
  seedPlacementScene,
} from './support/place-fixtures';

interface OpenTransaction<Result> {
  readonly result: Result;
  commit(): Promise<void>;
}

describe('PgMessageRepository.place races', () => {
  const context = usePgTestContext();

  const scene = async (): Promise<PlacementScene> =>
    seedPlacementScene(context.repositories, await seedAccount(context.repositories));

  const openTransaction = async <Result>(
    work: (messages: MessageRepository) => Promise<Result>,
  ): Promise<OpenTransaction<Result>> => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = (_result: Result): void => undefined;
    const ready = new Promise<Result>((resolve) => {
      started = resolve;
    });
    const committed = context.db.transaction(async (tx) => {
      started(await work(new PgMessageRepository(tx)));
      await gate;
    });
    const finished = committed.then(
      () => null,
      (error: unknown) => error,
    );
    onTestFinished(async () => {
      release();
      await finished;
    });
    const failedEarly = finished.then((error) => {
      expect(error).toBeNull();
      return ready;
    });
    const result = await Promise.race([ready, failedEarly]);
    return {
      result,
      commit: async () => {
        release();
        expect(await finished).toBeNull();
      },
    };
  };

  const whileHeld = async <Held, Competing>(
    held: OpenTransaction<Held>,
    compete: () => Promise<Competing>,
  ): Promise<Competing> => {
    const competing = compete();
    const observed = competing.then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await waitForLockWaiters(context.url);
    } finally {
      await held.commit();
    }
    expect(await observed).toBeNull();
    return competing;
  };

  it('creates one message when two mailboxes deliver the same email id at once', async () => {
    const placed = await scene();
    const { inbox, allMail } = placed.boxes;
    const inboxCopy = newMessage(placed, at(inbox, 5), { emailId: 'gm-1' });
    const allMailCopy = newMessage(placed, at(allMail, 40), { emailId: 'gm-1' });
    const first = await openTransaction((messages) =>
      messages.place(placeRequest(gmailIdentity(placed, inbox, 5), inboxCopy)),
    );

    const second = await whileHeld(first, () =>
      context.repositories.messages.place(
        placeRequest(gmailIdentity(placed, allMail, 40), allMailCopy),
      ),
    );

    expect(first.result).toMatchObject({ kind: 'created', message: { id: inboxCopy.id } });
    expect(second).toMatchObject({
      kind: 'attached',
      message: { id: inboxCopy.id },
    });
    await expect(messageCount(context.db, placed.seeded.account.id)).resolves.toBe(1);
  });

  it('creates one message when the Sent recorder and sync place the same location', async () => {
    const placed = await scene();
    const { sent } = placed.boxes;
    const header = '<sent@relay.test>';
    const recorded = newMessage(placed, at(sent, 31), { messageIdHeader: header });
    const fetched = newMessage(placed, at(sent, 31), { messageIdHeader: header, emailId: 'gm-1' });
    const recorder = await openTransaction((messages) =>
      messages.place(
        placeRequest(
          gmailIdentity(placed, sent, 31, { emailId: null, messageIdHeader: header }),
          recorded,
        ),
      ),
    );

    const sync = await whileHeld(recorder, () =>
      context.repositories.messages.place(
        placeRequest(gmailIdentity(placed, sent, 31, { messageIdHeader: header }), fetched),
      ),
    );

    expect(recorder.result).toMatchObject({ kind: 'created' });
    expect(sync).toMatchObject({
      kind: 'refreshed',
      message: { id: recorded.id, emailId: 'gm-1' },
    });
    await expect(messageCount(context.db, placed.seeded.account.id)).resolves.toBe(1);
  });

  it('keeps a placement attached while an expunge of the other copy waited', async () => {
    const placed = await scene();
    const { inbox, allMail } = placed.boxes;
    const message = newMessage(placed, at(inbox, 5), { emailId: 'gm-1' });
    await context.repositories.messages.upsert(message, NO_HEADERS);
    const attach = await openTransaction((messages) =>
      messages.place(placeRequest(gmailIdentity(placed, allMail, 40), null)),
    );

    const expunge = await whileHeld(attach, () =>
      context.repositories.messages.deleteByUids(inbox.id, [5]),
    );

    expect(attach.result).toMatchObject({ kind: 'attached' });
    expect(expunge).toEqual([placed.thread.id]);
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toEqual([
      { messageId: message.id, mailboxId: allMail.id, uid: 40 },
    ]);
  });

  it('creates the copy again when it waited behind the expunge of its last placement', async () => {
    const placed = await scene();
    const { inbox, allMail } = placed.boxes;
    const message = newMessage(placed, at(inbox, 5), { emailId: 'gm-1' });
    await context.repositories.messages.upsert(message, NO_HEADERS);
    const allMailCopy = newMessage(placed, at(allMail, 40), { emailId: 'gm-1' });
    const expunge = await openTransaction((messages) => messages.deleteByUids(inbox.id, [5]));

    const attach = await whileHeld(expunge, () =>
      context.repositories.messages.place(
        placeRequest(gmailIdentity(placed, allMail, 40), allMailCopy),
      ),
    );

    expect(expunge.result).toEqual([placed.thread.id]);
    expect(attach).toMatchObject({
      kind: 'created',
      message: { id: allMailCopy.id },
    });
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toEqual([
      { messageId: allMailCopy.id, mailboxId: allMail.id, uid: 40 },
    ]);
  });
});
