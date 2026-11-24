import type { Message } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { newId } from './support/fixtures';
import { expectMergeInvariants, referencesTo } from './support/merge-invariants';
import {
  seedActivity,
  seedAiJob,
  seedAiResult,
  seedAutomation,
  seedCalendarEvent,
  seedDraft,
  seedRun,
} from './support/merge-references-seed';
import {
  legacyCopy,
  mergeAll,
  type MergeScene,
  placed,
  seedMergeScene,
} from './support/merge-scene';
import { usePgTestContext } from './support/pg-test-context';

interface Group {
  readonly scene: MergeScene;
  readonly keeper: Message;
  readonly mail: Message;
  readonly work: Message;
}

interface Row extends Record<string, unknown> {
  readonly value: unknown;
}

describe('PgMessageMerges references', () => {
  const context = usePgTestContext();

  const group = async (): Promise<Group> => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    return {
      scene,
      keeper: await legacyCopy(scene, placed(inbox, 5)),
      mail: await legacyCopy(scene, placed(allMail, 40)),
      work: await legacyCopy(scene, placed(work, 7)),
    };
  };

  const rows = async (query: ReturnType<typeof sql>): Promise<unknown[]> =>
    (await context.db.execute<Row>(query)).rows.map((row) => row.value);

  it('remaps every column and json reference before the losers go', async () => {
    const { scene, keeper, mail, work } = await group();
    const first = await seedAutomation(scene);
    const second = await seedAutomation(scene);
    await seedRun(scene, first, keeper.id);
    await seedRun(scene, first, mail.id);
    await seedRun(scene, second, work.id);
    const draft = await seedDraft(scene, mail.id);
    const event = await seedCalendarEvent(scene, work.id);
    const result = await seedAiResult(scene, mail.id);
    const finished = await seedAiJob(scene, {
      sourceMessageId: work.id,
      status: 'done',
      input: { kind: 'summary', threadId: scene.thread.id, sourceMessageId: work.id },
    });
    const drafted = await seedAiJob(scene, {
      sourceMessageId: null,
      status: 'done',
      input: {
        kind: 'automationDraft',
        threadId: scene.thread.id,
        messageId: work.id,
        automationId: first,
        instructions: null,
      },
      output: {
        kind: 'automationDraft',
        threadId: scene.thread.id,
        messageId: work.id,
        body: 'Ok',
      },
    });
    const activity = await seedActivity(scene, first, mail.id, [
      {
        changed: [mail.id, keeper.id, work.id],
        labelled: [work.id],
        origins: [
          { messageId: mail.id, revision: 'r1' },
          { messageId: keeper.id, revision: 'r1' },
          { messageId: work.id, revision: 'r2' },
        ],
      },
    ]);
    const older = newId('message');
    await context.db.execute(
      sql`insert into message_aliases (alias_id, message_id) values (${older}, ${mail.id})`,
    );

    await mergeAll(scene, ['gm-1']);

    const runs = await rows(sql`select automation_id || ':' || message_id as value
      from automation_runs where user_id = ${scene.seeded.user.id} order by value`);
    expect(runs).toEqual([`${first}:${keeper.id}`, `${second}:${keeper.id}`].sort());
    await expect(
      rows(sql`select in_reply_to_message_id as value from drafts where id = ${draft}`),
    ).resolves.toEqual([keeper.id]);
    await expect(
      rows(sql`select message_id as value from calendar_events where id = ${event}`),
    ).resolves.toEqual([keeper.id]);
    await expect(
      rows(sql`select json_build_array(source_message_id, output->>'messageId') as value
        from ai_results where id = ${result}`),
    ).resolves.toEqual([[keeper.id, keeper.id]]);
    await expect(
      rows(sql`select json_build_array(source_message_id, input->>'sourceMessageId') as value
        from ai_jobs where id = ${finished}`),
    ).resolves.toEqual([[keeper.id, keeper.id]]);
    await expect(
      rows(sql`select json_build_array(input->>'messageId', output->>'messageId') as value
        from ai_jobs where id = ${drafted}`),
    ).resolves.toEqual([[keeper.id, keeper.id]]);
    await expect(
      rows(sql`select json_build_array(message_id, actions) as value
        from automation_activity where id = ${activity}`),
    ).resolves.toMatchObject([
      [
        keeper.id,
        [
          {
            changed: [keeper.id],
            labelled: [keeper.id],
            origins: [
              { messageId: keeper.id, revision: 'r1' },
              { messageId: keeper.id, revision: 'r2' },
            ],
          },
        ],
      ],
    ]);
    await expect(
      context.repositories.messages.findById(scene.seeded.user.id, older),
    ).resolves.toMatchObject({ id: keeper.id });
    await expect(referencesTo(context.db, [mail.id, work.id, older])).resolves.toEqual([]);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });

  it('keeps the loser id on an active ai job that would collide with the keeper job', async () => {
    const { scene, keeper, mail } = await group();
    const input = (sourceMessageId: string) => ({
      kind: 'oneLiner',
      threadId: scene.thread.id,
      sourceMessageId,
    });
    await seedAiJob(scene, {
      sourceMessageId: keeper.id,
      status: 'queued',
      input: input(keeper.id),
    });
    const colliding = await seedAiJob(scene, {
      sourceMessageId: mail.id,
      status: 'running',
      input: input(mail.id),
    });

    await mergeAll(scene, ['gm-1']);

    await expect(
      rows(sql`select json_build_array(source_message_id, input->>'sourceMessageId') as value
        from ai_jobs where id = ${colliding}`),
    ).resolves.toEqual([[mail.id, mail.id]]);
    await expect(referencesTo(context.db, [mail.id])).resolves.toEqual([
      { source: 'ai_jobs.input $.sourceMessageId', id: mail.id },
      { source: 'ai_jobs.source_message_id', id: mail.id },
    ]);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });
});
