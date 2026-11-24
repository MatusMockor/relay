import type { DbExecutor } from '../../src/persistence/database/database';
import { sql } from 'drizzle-orm';
import { describe, expect, it, onTestFinished } from 'vitest';
import { newId } from './support/fixtures';
import { expectMergeInvariants } from './support/merge-invariants';
import { seedAiResult, seedAutomation, seedDraft, seedRun } from './support/merge-references-seed';
import { legacyCopy, mergeAll, placed, seedMergeScene, suffixedId } from './support/merge-scene';
import { usePgTestContext } from './support/pg-test-context';
import { messageCount } from './support/place-fixtures';

const SNAPSHOT_TABLES = [
  'messages',
  'message_placements',
  'message_labels',
  'message_aliases',
  'automation_runs',
  'drafts',
  'ai_results',
  'pending_work',
] as const;

const snapshot = async (db: DbExecutor): Promise<Record<string, unknown[]>> => {
  const entries = await Promise.all(
    SNAPSHOT_TABLES.map(async (table) => {
      const result = await db.execute<{ row: string }>(
        sql`select t::text as row from ${sql.identifier(table)} t order by 1`,
      );
      return [table, result.rows.map((row) => row.row)] as const;
    }),
  );
  return Object.fromEntries(entries);
};

describe('PgMessageMerges recovery', () => {
  const context = usePgTestContext();

  it('is a no-op the second time and leaves only skipped groups to walk', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    await legacyCopy(scene, placed(inbox, 5));
    await legacyCopy(scene, placed(allMail, 40));
    await legacyCopy(scene, placed(inbox, 6), { emailId: 'gm-2' });
    await legacyCopy(scene, placed(inbox, 8), { emailId: 'gm-2' });
    await legacyCopy(scene, placed(work, 9), { emailId: 'gm-3' });
    await legacyCopy(scene, placed(allMail, 41), { emailId: 'gm-3' });
    const accountId = scene.seeded.account.id;

    const first = await mergeAll(scene, ['gm-1', 'gm-2', 'gm-3']);
    const before = await snapshot(context.db);
    const second = await mergeAll(scene, ['gm-1', 'gm-2', 'gm-3']);

    expect(first.merged).toHaveLength(2);
    expect(second).toEqual({ merged: [], skipped: { 'spans-threads': 0, 'mailbox-conflict': 1 } });
    await expect(snapshot(context.db)).resolves.toEqual(before);
    await expect(
      context.repositories.messageMerges.nextGroups(accountId, null, 500),
    ).resolves.toEqual({ groups: [{ emailId: 'gm-2', size: 2 }], last: 'gm-2' });
    await expectMergeInvariants(context.db, accountId);
  });

  it('rolls a failing chunk back completely and completes on the next run', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    const keeper = await legacyCopy(scene, placed(inbox, 5));
    const loser = await legacyCopy(scene, placed(allMail, 40));
    await legacyCopy(scene, placed(work, 7));
    const automation = await seedAutomation(scene);
    await seedRun(scene, automation, loser.id);
    await seedDraft(scene, loser.id);
    await seedAiResult(scene, loser.id);
    const trigger = `merge_boom_${newId('message').slice(-8)}`;
    await context.db.execute(
      sql.raw(`create function ${trigger}() returns trigger language plpgsql
      as $$ begin raise exception 'boom'; end $$`),
    );
    await context.db.execute(
      sql.raw(`create trigger ${trigger} before delete on messages
      for each row when (old.id = '${loser.id}') execute function ${trigger}()`),
    );
    onTestFinished(async () => {
      await context.db.execute(sql.raw(`drop trigger if exists ${trigger} on messages`));
      await context.db.execute(sql.raw(`drop function if exists ${trigger}()`));
    });
    const before = await snapshot(context.db);

    await expect(mergeAll(scene, ['gm-1'])).rejects.toThrow('delete from messages');

    await expect(snapshot(context.db)).resolves.toEqual(before);
    await context.db.execute(sql.raw(`drop trigger ${trigger} on messages`));
    await expect(mergeAll(scene, ['gm-1'])).resolves.toMatchObject({
      merged: [{ keeperId: keeper.id }],
    });
    await expect(messageCount(context.db, scene.seeded.account.id)).resolves.toBe(1);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });

  it('re-points older aliases when a former keeper is merged again', async () => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    const base = newId('message');
    const first = await legacyCopy(scene, placed(allMail, 40), { id: suffixedId(base, 'a') });
    const second = await legacyCopy(scene, placed(work, 7), { id: suffixedId(base, 'b') });
    await mergeAll(scene, ['gm-1']);
    const latest = await legacyCopy(scene, placed(inbox, 5), { id: suffixedId(base, 'c') });

    await mergeAll(scene, ['gm-1']);

    const { user } = scene.seeded;
    for (const id of [first.id, second.id, latest.id]) {
      await expect(context.repositories.messages.findById(user.id, id)).resolves.toMatchObject({
        id: latest.id,
      });
    }
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });
});
