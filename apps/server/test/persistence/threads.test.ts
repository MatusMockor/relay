import { ConflictError } from '@relay/engine';
import type { Label, Split } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildMessage, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('PgThreadRepository', () => {
  const context = usePgTestContext();

  it('stores a thread with splits and derives labels and draft presence', async () => {
    const seeded = await seedAccount(context.repositories);
    const split: Split = {
      id: newId('split'),
      userId: seeded.user.id,
      accountId: null,
      name: 'Jira',
      order: 0,
      rules: [{ type: 'jira', projectKeys: ['REL'] }],
      exclusive: false,
    };
    await context.repositories.splits.replaceAll(seeded.user.id, [split]);
    const label: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'VIP',
      color: null,
    };
    await context.repositories.labels.upsert(label);

    const { thread, message } = await seedThread(context.repositories, seeded, {
      splitIds: [split.id, newId('split')],
      jiraKey: 'REL-12',
      jiraActor: 'Peter Novák',
      labelIds: [newId('label')],
      hasDraft: true,
    });
    expect(thread).toMatchObject({
      splitIds: [split.id],
      labelIds: [],
      hasDraft: false,
      jiraKey: 'REL-12',
      jiraActor: 'Peter Novák',
    });

    await context.repositories.messages.updateLabels(message.id, [label.id]);
    await context.repositories.drafts.create(seeded.user.id, {
      id: newId('draft'),
      accountId: seeded.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re: Stretnutie',
      body: '',
      inReplyToThreadId: thread.id,
      inReplyToMessageId: message.id,
      attachments: [],
      createdAt: at(20),
      updatedAt: at(20),
    });

    await expect(context.repositories.threads.findById(seeded.user.id, thread.id)).resolves.toEqual(
      {
        ...thread,
        labelIds: [label.id],
        hasDraft: true,
      },
    );
    await expect(
      context.repositories.threads.findByIdForAccount(seeded.account.id, thread.id),
    ).resolves.toMatchObject({ id: thread.id });
  });

  it('updates an existing thread on upsert and keeps it scoped to the user', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const updated = await context.repositories.threads.upsert({
      ...thread,
      messageCount: 2,
      unread: false,
      lastMessageAt: at(50),
    });

    expect(updated).toEqual({ ...thread, messageCount: 2, unread: false, lastMessageAt: at(50) });
    await expect(
      context.repositories.threads.findById(stranger.user.id, thread.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.threads.findByIdForAccount(stranger.account.id, thread.id),
    ).resolves.toBeNull();
  });

  it('changes state, one-liner and deletes', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);

    await expect(
      context.repositories.threads.updateState(stranger.user.id, thread.id, {
        state: 'done',
        remindAt: null,
      }),
    ).resolves.toBeNull();
    await expect(
      context.repositories.threads.updateState(seeded.user.id, thread.id, {
        state: 'reminder',
        remindAt: at(120),
      }),
    ).resolves.toEqual({ ...thread, state: 'reminder', remindAt: at(120) });

    await context.repositories.threads.setAiOneLiner(thread.id, 'Eva chce stretnutie v piatok');
    await expect(
      context.repositories.threads.findById(seeded.user.id, thread.id),
    ).resolves.toMatchObject({
      aiOneLiner: 'Eva chce stretnutie v piatok',
    });

    await context.repositories.threads.delete(thread.id);
    await expect(
      context.repositories.threads.findById(seeded.user.id, thread.id),
    ).resolves.toBeNull();
  });

  it('removes thread splits when a split is deleted', async () => {
    const seeded = await seedAccount(context.repositories);
    const split: Split = {
      id: newId('split'),
      userId: seeded.user.id,
      accountId: seeded.account.id,
      name: 'Newsletter',
      order: 0,
      rules: [{ type: 'fromDomain', domain: 'news.sk' }],
      exclusive: true,
    };
    await context.repositories.splits.replaceAll(seeded.user.id, [split]);
    const { thread } = await seedThread(context.repositories, seeded, { splitIds: [split.id] });
    await context.repositories.messages.upsert(
      buildMessage(thread, seeded.mailboxes.inbox),
      new Map(),
    );

    await context.repositories.splits.replaceAll(seeded.user.id, [{ ...split, name: 'Novinky' }]);
    await expect(
      context.repositories.threads.findById(seeded.user.id, thread.id),
    ).resolves.toMatchObject({
      splitIds: [split.id],
    });
    await context.repositories.splits.replaceAll(seeded.user.id, []);
    await expect(
      context.repositories.threads.findById(seeded.user.id, thread.id),
    ).resolves.toMatchObject({
      splitIds: [],
    });
  });
});

describe('PgThreadRepository ownership', () => {
  const context = usePgTestContext();

  it('refuses to overwrite a thread or message of another user', async () => {
    const owner = await seedAccount(context.repositories);
    const intruder = await seedAccount(context.repositories);
    const split: Split = {
      id: newId('split'),
      userId: owner.user.id,
      accountId: null,
      name: 'Jira',
      order: 0,
      rules: [{ type: 'jira', projectKeys: ['REL'] }],
      exclusive: false,
    };
    await context.repositories.splits.replaceAll(owner.user.id, [split]);
    const { thread, message } = await seedThread(context.repositories, owner, {
      splitIds: [split.id],
    });

    await expect(
      context.repositories.threads.upsert({
        ...thread,
        accountId: intruder.account.id,
        splitIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      context.repositories.messages.upsert(
        { ...message, accountId: intruder.account.id, mailboxId: intruder.mailboxes.inbox.id },
        new Map(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(context.repositories.threads.findById(owner.user.id, thread.id)).resolves.toEqual(
      thread,
    );
    await expect(
      context.repositories.messages.findById(owner.user.id, message.id),
    ).resolves.toEqual(message);
  });
});
