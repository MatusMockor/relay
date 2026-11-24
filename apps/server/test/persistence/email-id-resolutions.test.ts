import { describe, expect, it } from 'vitest';
import { legacyCopy, placed, seedMergeScene } from './support/merge-scene';
import { usePgTestContext } from './support/pg-test-context';

describe('PgEmailIdResolutions', () => {
  const context = usePgTestContext();

  it('lists placements without an email id per mailbox in uid order', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail } = scene.boxes;
    const third = await legacyCopy(scene, placed(inbox, 3), { emailId: null });
    await legacyCopy(scene, placed(inbox, 4), { emailId: 'gm-4' });
    const fifth = await legacyCopy(scene, placed(inbox, 5), { emailId: null });
    const ninth = await legacyCopy(scene, placed(inbox, 9), { emailId: null });
    await legacyCopy(scene, placed(inbox, 0), { emailId: null });
    await legacyCopy(scene, placed(allMail, 2), { emailId: null });
    const resolutions = context.repositories.emailIdResolutions;

    await expect(resolutions.listUnresolved(inbox.id, 0, 2)).resolves.toEqual([
      { messageId: third.id, uid: 3 },
      { messageId: fifth.id, uid: 5 },
    ]);
    await expect(resolutions.listUnresolved(inbox.id, 5, 10)).resolves.toEqual([
      { messageId: ninth.id, uid: 9 },
    ]);
  });

  it('fills only missing email ids of placements the mailbox still has', async () => {
    const scene = await seedMergeScene(context);
    const { inbox } = scene.boxes;
    const unresolved = await legacyCopy(scene, placed(inbox, 3), { emailId: null });
    const resolved = await legacyCopy(scene, placed(inbox, 4), { emailId: 'gm-4' });
    const { user } = scene.seeded;
    const resolutions = context.repositories.emailIdResolutions;

    await expect(
      resolutions.fillEmailIds(inbox.id, [
        { uid: 3, emailId: 'gm-3' },
        { uid: 4, emailId: 'gm-other' },
        { uid: 99, emailId: 'gm-99' },
      ]),
    ).resolves.toBe(1);
    await expect(resolutions.fillEmailIds(inbox.id, [])).resolves.toBe(0);

    await expect(
      context.repositories.messages.findById(user.id, unresolved.id),
    ).resolves.toMatchObject({ emailId: 'gm-3' });
    await expect(
      context.repositories.messages.findById(user.id, resolved.id),
    ).resolves.toMatchObject({
      emailId: 'gm-4',
    });
    await expect(resolutions.listUnresolved(inbox.id, 0, 10)).resolves.toEqual([]);
  });
});
