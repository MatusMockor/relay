import { NotFoundError } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { at, newId, seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('references to rows of another user', () => {
  const context = usePgTestContext();

  const seedPair = async () => {
    const owner = await seedAccount(context.repositories);
    const intruder = await seedAccount(context.repositories);
    const { thread, message } = await seedThread(context.repositories, owner);
    return { owner, intruder, thread, message };
  };

  const draftFor = (seeded: SeededAccount) => ({
    id: newId('draft'),
    accountId: seeded.account.id,
    to: [],
    cc: [],
    bcc: [],
    subject: 'Re',
    body: '',
    inReplyToThreadId: null,
    inReplyToMessageId: null,
    attachments: [],
    createdAt: at(0),
    updatedAt: at(0),
  });

  it('rejects reminders on a foreign thread and leaves the slot to the owner', async () => {
    const { owner, intruder, thread } = await seedPair();
    const reminder = {
      id: newId('reminder'),
      userId: intruder.user.id,
      threadId: thread.id,
      remindAt: at(60),
      firedAt: null,
      createdAt: at(0),
    };
    await expect(context.repositories.reminders.upsert(reminder)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      context.repositories.reminders.upsert({
        ...reminder,
        id: newId('reminder'),
        userId: owner.user.id,
      }),
    ).resolves.toMatchObject({ threadId: thread.id });
  });

  it('rejects drafts pointing at a foreign account, thread or message', async () => {
    const { owner, intruder, thread, message } = await seedPair();
    const repositories = context.repositories;
    const base = draftFor(intruder);

    await expect(
      repositories.drafts.create(intruder.user.id, { ...base, accountId: owner.account.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repositories.drafts.create(intruder.user.id, { ...base, inReplyToThreadId: thread.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repositories.drafts.create(intruder.user.id, { ...base, inReplyToMessageId: message.id }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const own = await repositories.drafts.create(intruder.user.id, base);
    await expect(
      repositories.drafts.update(
        intruder.user.id,
        own.id,
        { inReplyToThreadId: thread.id },
        { expected: own.updatedAt, next: at(1) },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(repositories.threads.findById(owner.user.id, thread.id)).resolves.toMatchObject({
      hasDraft: false,
    });
  });

  it('rejects moving an own task onto a foreign thread', async () => {
    const { owner, intruder, thread } = await seedPair();
    const own = await seedThread(context.repositories, intruder);
    const task = await context.repositories.tasks.upsert({
      id: newId('task'),
      userId: intruder.user.id,
      threadId: own.thread.id,
      jiraKey: null,
      title: 'X',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      createdAt: at(0),
      updatedAt: at(0),
    });

    await expect(
      context.repositories.tasks.update(intruder.user.id, task.id, {
        threadId: thread.id,
        updatedAt: at(1),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      context.repositories.tasks.findByThread(owner.user.id, thread.id),
    ).resolves.toEqual([]);
    await expect(
      context.repositories.tasks.update(intruder.user.id, task.id, {
        threadId: null,
        updatedAt: at(2),
      }),
    ).resolves.toMatchObject({ threadId: null });
  });

  it('rejects tasks, ai results and scheduled sends with foreign references', async () => {
    const { owner, intruder, thread } = await seedPair();
    await expect(
      context.repositories.tasks.upsert({
        id: newId('task'),
        userId: intruder.user.id,
        threadId: thread.id,
        jiraKey: null,
        title: 'X',
        aiWhat: null,
        state: 'open',
        source: 'manual',
        createdAt: at(0),
        updatedAt: at(0),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      context.repositories.aiResults.save({
        id: newId('aiResult'),
        userId: intruder.user.id,
        threadId: thread.id,
        sourceMessageId: null,
        runner: 'claude',
        output: { kind: 'oneLiner', text: 'X' },
        createdAt: at(0),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const ownerDraft = await context.repositories.drafts.create(owner.user.id, draftFor(owner));
    await expect(
      context.repositories.scheduledSends.create({
        id: newId('scheduledSend'),
        userId: intruder.user.id,
        accountId: intruder.account.id,
        draftId: ownerDraft.id,
        scheduledAt: at(10),
        status: 'pending',
        error: null,
        sentAt: null,
        createdAt: at(0),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects splits for a foreign account', async () => {
    const { owner, intruder } = await seedPair();
    await expect(
      context.repositories.splits.replaceAll(intruder.user.id, [
        {
          id: newId('split'),
          userId: intruder.user.id,
          accountId: owner.account.id,
          name: 'X',
          order: 0,
          match: 'any',
          exceptions: [],
          rules: [{ type: 'fromDomain', domain: 'x.sk' }],
          exclusive: false,
          hideTasks: false,
        },
      ]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a sync state whose mailbox belongs to another account', async () => {
    const { owner, intruder } = await seedPair();
    const ownerState = {
      accountId: owner.account.id,
      mailboxId: owner.mailboxes.inbox.id,
      uidValidity: 1,
      lastUid: 500,
      highestModseq: '9',
      uidNext: null,
      messageCount: null,
      initialWindow: null,
      syncedAt: at(1),
    };
    await context.repositories.syncStates.save(ownerState);

    await expect(
      context.repositories.syncStates.save({
        ...ownerState,
        accountId: intruder.account.id,
        lastUid: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(context.repositories.syncStates.find(ownerState.mailboxId)).resolves.toEqual(
      ownerState,
    );
  });
});
