import type { AttachmentMeta } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { expectMergeInvariants } from './support/merge-invariants';
import {
  addPlacement,
  bulkCopies,
  legacyCopy,
  mergeAll,
  placed,
  seedMergeScene,
  suffixedId,
} from './support/merge-scene';
import { usePgTestContext } from './support/pg-test-context';
import { messageCount, placementRows, searchHits, storedState } from './support/place-fixtures';
import { newId } from './support/fixtures';

describe('PgMessageMerges', () => {
  const context = usePgTestContext();
  const scene = () => seedMergeScene(context);

  it('walks duplicate email ids in byte order in chunks bounded by the message count', async () => {
    const merging = await scene();
    const other = await seedMergeScene(context);
    await bulkCopies(merging, { prefix: 'Z-', rows: 2, perGroup: 2 });
    await bulkCopies(merging, { prefix: 'a-', rows: 498, perGroup: 2 });
    await bulkCopies(merging, { prefix: 'b-', rows: 600, perGroup: 600 });
    await bulkCopies(merging, { prefix: 'c-', rows: 3, perGroup: 1 });
    await bulkCopies(merging, { prefix: 'd-', rows: 2, perGroup: null });
    await bulkCopies(other, { prefix: 'a-', rows: 9, perGroup: 3 });
    const merges = context.repositories.messageMerges;
    const accountId = merging.seeded.account.id;

    const first = await merges.nextGroups(accountId, null, 500);
    const second = await merges.nextGroups(accountId, first.last, 500);
    const third = await merges.nextGroups(accountId, second.last, 500);

    expect(first.groups).toHaveLength(250);
    expect(first.groups.every((group) => group.size === 2)).toBe(true);
    expect(first.groups.map((group) => group.emailId).slice(0, 2)).toEqual([
      'Z-000001',
      'a-000001',
    ]);
    expect(first.last).toBe('a-000249');
    expect(second).toEqual({ groups: [{ emailId: 'b-000001', size: 600 }], last: 'b-000001' });
    expect(third).toEqual({ groups: [], last: null });
  });

  it('merges every copy into the inbox copy even when it is not the oldest', async () => {
    const merging = await scene();
    const base = newId('message');
    const { inbox, allMail, work } = merging.boxes;
    await legacyCopy(merging, placed(allMail, 40), { id: suffixedId(base, 'a') });
    const keeper = await legacyCopy(merging, placed(inbox, 5), { id: suffixedId(base, 'b') });
    await legacyCopy(merging, placed(work, 7), { id: suffixedId(base, 'c') });

    const report = await mergeAll(merging, ['gm-1']);

    expect(report).toEqual({
      merged: [
        {
          emailId: 'gm-1',
          keeperId: keeper.id,
          loserIds: [suffixedId(base, 'a'), suffixedId(base, 'c')],
          threadId: merging.thread.id,
        },
      ],
      skipped: { 'spans-threads': 0, 'mailbox-conflict': 0 },
    });
    const accountId = merging.seeded.account.id;
    await expect(messageCount(context.db, accountId)).resolves.toBe(1);
    await expect(placementRows(context.db, accountId)).resolves.toEqual(
      [
        { messageId: keeper.id, mailboxId: allMail.id, uid: 40 },
        { messageId: keeper.id, mailboxId: inbox.id, uid: 5 },
        { messageId: keeper.id, mailboxId: work.id, uid: 7 },
      ].sort((left, right) => (left.mailboxId < right.mailboxId ? -1 : 1)),
    );
    await expect(storedState(context.db, keeper.id)).resolves.toMatchObject({
      mailboxId: inbox.id,
      uid: 5,
    });
    await expect(
      context.repositories.messages.findById(merging.seeded.user.id, suffixedId(base, 'a')),
    ).resolves.toMatchObject({ id: keeper.id });
    await expect(searchHits(context.db, accountId, 'podklady')).resolves.toBe(1);
    await expectMergeInvariants(context.db, accountId);
  });

  it('keeps the lowest id without an inbox copy, the same keeper place() attaches to', async () => {
    const merging = await scene();
    const base = newId('message');
    const { allMail, work, spam } = merging.boxes;
    await legacyCopy(merging, placed(allMail, 40), { id: suffixedId(base, 'b') });
    await legacyCopy(merging, placed(work, 7), { id: suffixedId(base, 'a') });

    const attached = await context.repositories.messages.place({
      accountId: merging.seeded.account.id,
      location: placed(spam, 3),
      role: 'spam',
      emailId: 'gm-1',
      labelBased: true,
      messageIdHeader: null,
      create: null,
      claims: { jira: false, invite: false },
      at: '2026-11-24T09:00:00.000Z',
    });
    const report = await mergeAll(merging, ['gm-1']);

    expect(attached).toMatchObject({ kind: 'attached', message: { id: suffixedId(base, 'a') } });
    expect(report.merged).toMatchObject([
      { keeperId: suffixedId(base, 'a'), loserIds: [suffixedId(base, 'b')] },
    ]);
    await expectMergeInvariants(context.db, merging.seeded.account.id);
  });

  it('lets a real uid win over a pending one and keeps the pending one of the keeper', async () => {
    const merging = await scene();
    const { inbox, allMail, work, spam } = merging.boxes;
    const keeper = await legacyCopy(merging, placed(inbox, 5));
    const loser = await legacyCopy(merging, placed(allMail, 40));
    await addPlacement(merging, keeper.id, placed(work, 0));
    await addPlacement(merging, loser.id, placed(work, 12));
    await addPlacement(merging, keeper.id, placed(spam, 0));
    await addPlacement(merging, loser.id, placed(spam, 0));

    await mergeAll(merging, ['gm-1']);

    const rows = await placementRows(context.db, merging.seeded.account.id);
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        { messageId: keeper.id, mailboxId: inbox.id, uid: 5 },
        { messageId: keeper.id, mailboxId: allMail.id, uid: 40 },
        { messageId: keeper.id, mailboxId: work.id, uid: 12 },
        { messageId: keeper.id, mailboxId: spam.id, uid: 0 },
      ]),
    );
    await expectMergeInvariants(context.db, merging.seeded.account.id);
  });

  it('leaves groups with two uids in one mailbox or several threads untouched', async () => {
    const merging = await scene();
    const accountId = merging.seeded.account.id;
    const { inbox, allMail, work } = merging.boxes;
    await legacyCopy(merging, placed(inbox, 5), { emailId: 'gm-conflict' });
    await legacyCopy(merging, placed(inbox, 6), { emailId: 'gm-conflict' });
    await legacyCopy(merging, placed(allMail, 40), { emailId: 'gm-span' });
    await legacyCopy(merging, placed(work, 7), { emailId: 'gm-span', threadId: newId('thread') });
    const before = await placementRows(context.db, accountId);

    const report = await mergeAll(merging, ['gm-conflict', 'gm-span']);

    expect(report).toEqual({
      merged: [],
      skipped: { 'spans-threads': 1, 'mailbox-conflict': 1 },
    });
    await expect(placementRows(context.db, accountId)).resolves.toEqual(before);
    await expect(messageCount(context.db, accountId)).resolves.toBe(4);
  });

  it('takes the most complete body and the earliest effect gates onto the keeper', async () => {
    const merging = await scene();
    const { inbox, allMail } = merging.boxes;
    const attachment: AttachmentMeta = {
      id: newId('attachment'),
      filename: 'faktura.pdf',
      contentType: 'application/pdf',
      size: 120,
      contentId: null,
      inline: false,
    };
    const keeper = await legacyCopy(merging, placed(inbox, 5), { textBody: 'Ahoj' });
    const donor = await legacyCopy(merging, placed(allMail, 40), {
      textBody: 'Ahoj, posielam fakturu v prílohe.',
      htmlBody: '<p>Ahoj, posielam fakturu v prílohe.</p>',
      attachments: [attachment],
    });
    await context.db.execute(
      sql`update messages set headers = '{"x-relay": ["donor"]}'::jsonb,
          jira_effects_at = '2026-11-01T08:00:00.123456Z', invite_effects_at = '2026-11-03T08:00:00Z'
        where id = ${donor.id}`,
    );
    await context.db.execute(
      sql`update messages set invite_effects_at = '2026-11-02T08:00:00Z' where id = ${keeper.id}`,
    );

    await mergeAll(merging, ['gm-1']);

    const merged = await context.repositories.messages.findById(merging.seeded.user.id, keeper.id);
    expect(merged).toMatchObject({
      textBody: 'Ahoj, posielam fakturu v prílohe.',
      htmlBody: '<p>Ahoj, posielam fakturu v prílohe.</p>',
      attachments: [attachment],
    });
    await expect(
      context.repositories.messages.findHeaders(merging.seeded.user.id, keeper.id),
    ).resolves.toEqual(new Map([['x-relay', ['donor']]]));
    await expect(storedState(context.db, keeper.id)).resolves.toMatchObject({
      jira: '2026-11-01T08:00:00.123Z',
      invite: '2026-11-02T08:00:00.000Z',
    });
    await expect(searchHits(context.db, merging.seeded.account.id, 'fakturu')).resolves.toBe(1);
    const precise = await context.db.execute<{ jira: string }>(
      sql`select to_char(jira_effects_at at time zone 'UTC', 'HH24:MI:SS.US') as jira
        from messages where id = ${keeper.id}`,
    );
    expect(precise.rows).toEqual([{ jira: '08:00:00.123456' }]);
  });
});
