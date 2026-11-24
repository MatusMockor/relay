import type { MergeReport, PlaceRequest } from '@relay/engine';
import type { Mailbox } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { PgMessageRepository } from '../../src/persistence/repositories/messages/pg-message-repository';
import { PgMessageMerges } from '../../src/persistence/repositories/messages/merges/pg-message-merges';
import { holdTransaction, whileHeld } from './support/held-transaction';
import { expectMergeInvariants } from './support/merge-invariants';
import {
  legacyCopy,
  mergeAll,
  type MergeScene,
  placed,
  seedMergeScene,
} from './support/merge-scene';
import { usePgTestContext } from './support/pg-test-context';
import { messageCount, placementRows } from './support/place-fixtures';

describe('PgMessageMerges races', () => {
  const context = usePgTestContext();

  const attachRequest = (scene: MergeScene, mailbox: Mailbox, uid: number): PlaceRequest => ({
    accountId: scene.seeded.account.id,
    location: placed(mailbox, uid),
    role: mailbox.role,
    emailId: 'gm-1',
    labelBased: true,
    messageIdHeader: null,
    create: null,
    claims: { jira: false, invite: false },
    at: '2026-11-24T09:00:00.000Z',
  });

  const heldMerge = (scene: MergeScene) =>
    holdTransaction<MergeReport>(context.db, (tx) =>
      new PgMessageMerges(tx).merge(scene.seeded.account.id, [{ emailId: 'gm-1', size: 2 }]),
    );

  it('attaches a placement that waited behind the merge to the keeper', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    const keeper = await legacyCopy(scene, placed(inbox, 5));
    await legacyCopy(scene, placed(allMail, 40));
    const merge = await heldMerge(scene);

    const placedLater = await whileHeld(context.url, merge, () =>
      context.repositories.messages.place(attachRequest(scene, work, 77)),
    );

    expect(merge.result.merged).toMatchObject([{ keeperId: keeper.id }]);
    expect(placedLater).toMatchObject({ kind: 'attached', message: { id: keeper.id } });
    await expect(messageCount(context.db, scene.seeded.account.id)).resolves.toBe(1);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });

  it('merges the placement a concurrent place() was adding', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    const keeper = await legacyCopy(scene, placed(inbox, 5));
    await legacyCopy(scene, placed(allMail, 40));
    const place = await holdTransaction(context.db, (tx) =>
      new PgMessageRepository(tx).place(attachRequest(scene, work, 77)),
    );

    const report = await whileHeld(context.url, place, () => mergeAll(scene, ['gm-1']));

    expect(report.merged).toMatchObject([{ keeperId: keeper.id }]);
    await expect(placementRows(context.db, scene.seeded.account.id)).resolves.toHaveLength(3);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });

  it('removes the placement of a loser that waited behind the merge from the keeper', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    const keeper = await legacyCopy(scene, placed(inbox, 5));
    const loser = await legacyCopy(scene, placed(allMail, 40));
    await legacyCopy(scene, placed(work, 7));
    const merge = await heldMerge(scene);

    const removal = await whileHeld(context.url, merge, () =>
      context.repositories.messages.removePlacement(loser.id, allMail.id),
    );

    expect(removal).toEqual({ threadIds: [scene.thread.id], retired: false });
    await expect(placementRows(context.db, scene.seeded.account.id)).resolves.toEqual(
      expect.arrayContaining([
        { messageId: keeper.id, mailboxId: inbox.id, uid: 5 },
        { messageId: keeper.id, mailboxId: work.id, uid: 7 },
      ]),
    );
    await expect(placementRows(context.db, scene.seeded.account.id)).resolves.toHaveLength(2);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });

  it('merges what is left after a removal it waited for', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    const keeper = await legacyCopy(scene, placed(inbox, 5));
    const loser = await legacyCopy(scene, placed(allMail, 40));
    const other = await legacyCopy(scene, placed(work, 7));
    const removal = await holdTransaction(context.db, (tx) =>
      new PgMessageRepository(tx).removePlacement(loser.id, allMail.id),
    );

    const report = await whileHeld(context.url, removal, () => mergeAll(scene, ['gm-1']));

    expect(removal.result).toEqual({ threadIds: [scene.thread.id], retired: true });
    expect(report.merged).toEqual([
      { emailId: 'gm-1', keeperId: keeper.id, loserIds: [other.id], threadId: scene.thread.id },
    ]);
    await expect(messageCount(context.db, scene.seeded.account.id)).resolves.toBe(1);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });
});
