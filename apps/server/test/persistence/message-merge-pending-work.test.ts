import type { PendingWork, ProviderChange } from '@relay/engine';
import type { JiraKey, Message, MessageId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { expectMergeInvariants, referencesTo } from './support/merge-invariants';
import { seedPending } from './support/merge-references-seed';
import {
  legacyCopy,
  mergeAll,
  type MergeScene,
  placed,
  seedGmailLabel,
  seedMergeScene,
} from './support/merge-scene';
import { usePgTestContext } from './support/pg-test-context';

const providerOpRef = (messageId: string, change: ProviderChange): string =>
  change.kind === 'flag'
    ? `${messageId}:flag:${change.flag}`
    : `${messageId}:label:${change.kind === 'label' ? change.label : ''}`;

const byKey = (left: Partial<PendingWork>, right: Partial<PendingWork>): number =>
  `${left.kind ?? ''}|${left.ref ?? ''}` < `${right.kind ?? ''}|${right.ref ?? ''}` ? -1 : 1;

const withoutAccount = ({ accountId: _accountId, ...row }: Partial<PendingWork>) => row;

describe('PgMessageMerges pending work', () => {
  const context = usePgTestContext();

  const group = async (): Promise<{
    scene: MergeScene;
    keeper: Message;
    mail: Message;
    work: Message;
  }> => {
    const scene = await seedMergeScene(context);
    const { inbox, allMail, work } = scene.boxes;
    return {
      scene,
      keeper: await legacyCopy(scene, placed(inbox, 5)),
      mail: await legacyCopy(scene, placed(allMail, 40)),
      work: await legacyCopy(scene, placed(work, 7)),
    };
  };

  const pendingRows = async (scene: MergeScene): Promise<Omit<PendingWork, 'accountId'>[]> => {
    const result = await context.db.execute<
      Omit<PendingWork, 'accountId'> & Record<string, unknown>
    >(
      sql`select kind, ref, payload, revision,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
        from pending_work where account_id = ${scene.seeded.account.id} order by kind, ref`,
    );
    return result.rows;
  };

  it('re-keys pending work with the per-kind reducers and applies pending ops to the keeper', async () => {
    const { scene, keeper, mail, work } = await group();
    const label = await seedGmailLabel(scene, 'Projekty');
    const seen = { kind: 'flag', flag: 'seen', value: true } as const;
    const unseen = { kind: 'flag', flag: 'seen', value: false } as const;
    await seedPending(
      scene,
      'provider-op',
      providerOpRef(keeper.id, unseen),
      {
        messageId: keeper.id,
        change: unseen,
      },
      '2026-11-20T08:00:00.000Z',
    );
    const later = await seedPending(
      scene,
      'provider-op',
      providerOpRef(mail.id, seen),
      {
        messageId: mail.id,
        change: seen,
      },
      '2026-11-21T08:00:00.000Z',
    );
    const labelled = { kind: 'label', label: 'Projekty', value: true } as const;
    await seedPending(scene, 'provider-op', providerOpRef(work.id, labelled), {
      messageId: work.id,
      change: labelled,
    });
    const trash = { kind: 'move', role: 'trash' } as const;
    const legacyMove = await seedPending(scene, 'provider-op', `${work.id}:move`, {
      messageId: work.id,
      change: trash,
    });
    const effects = (messageId: MessageId, arrival: boolean, publish: boolean) => ({
      messageId,
      threadId: scene.thread.id,
      publish,
      arrival,
      headers: [],
    });
    await seedPending(scene, 'message-effects', keeper.id, effects(keeper.id, false, true));
    await seedPending(scene, 'message-effects', mail.id, effects(mail.id, true, false));
    const jiraKey: JiraKey = 'REL-1';
    const jira = await seedPending(scene, 'jira-event', work.id, {
      threadId: scene.thread.id,
      classification: { jiraKey: jiraKey, eventKind: 'mention', actor: null },
      title: 'REL-1',
    });
    const origin = await seedPending(scene, 'trash-origin', mail.id, {
      messageId: mail.id,
      role: 'inbox',
    });

    const reply = await seedPending(scene, 'calendar-reply', 'uid-1', {
      uid: 'uid-1',
      recurrenceId: null,
      sequence: 0,
      dtstamp: null,
      attendee: { name: null, email: 'eva@firma.sk', partstat: 'accepted', role: null },
      messageId: work.id,
      parkedAt: '2026-11-20T08:00:00.000Z',
    });
    await mergeAll(scene, ['gm-1']);

    const pending = await pendingRows(scene);
    const expected: Partial<PendingWork>[] = [
      {
        ...later,
        ref: providerOpRef(keeper.id, seen),
        payload: { messageId: keeper.id, change: seen },
      },
      {
        kind: 'provider-op',
        ref: providerOpRef(keeper.id, labelled),
        payload: { messageId: keeper.id, change: labelled },
      },
      {
        ...legacyMove,
        ref: `${keeper.id}:move:${scene.boxes.work.id}`,
        payload: {
          messageId: keeper.id,
          change: trash,
          source: { mailboxId: scene.boxes.work.id, uid: 7 },
        },
      },
      { kind: 'message-effects', ref: keeper.id, payload: effects(keeper.id, true, true) },
      { ...jira, ref: keeper.id },
      { ...origin, ref: keeper.id, payload: { messageId: keeper.id, role: 'inbox' } },
      { ...reply, payload: { ...reply.payload, messageId: keeper.id } },
    ];
    expect([...pending].sort(byKey)).toMatchObject(expected.map(withoutAccount).sort(byKey));
    const merged = await context.repositories.messages.findById(scene.seeded.user.id, keeper.id);
    expect(merged).toMatchObject({ flags: { seen: true }, labelIds: [label] });
    await expect(referencesTo(context.db, [mail.id, work.id])).resolves.toEqual([]);
    await expectMergeInvariants(context.db, scene.seeded.account.id);
  });
});
