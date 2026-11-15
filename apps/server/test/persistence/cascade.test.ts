import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/persistence/schema';
import { at, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('ownership cascades', () => {
  const context = usePgTestContext();

  it('deleting an account removes its mailboxes, messages, threads and drafts', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread, message } = await seedThread(context.repositories, seeded);
    const draft = await context.repositories.drafts.create(seeded.user.id, {
      id: newId('draft'),
      accountId: seeded.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: '',
      body: '',
      inReplyToThreadId: thread.id,
      inReplyToMessageId: message.id,
      attachments: [],
      createdAt: at(0),
      updatedAt: at(0),
    });

    await context.repositories.accounts.delete(seeded.user.id, seeded.account.id);

    await expect(
      context.repositories.mailboxes.findById(seeded.mailboxes.inbox.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.messages.findById(seeded.user.id, message.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.threads.findById(seeded.user.id, thread.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.drafts.findById(seeded.user.id, draft.id),
    ).resolves.toBeNull();
  });

  it('deleting a user removes everything they own', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    await context.db.delete(users).where(eq(users.id, seeded.user.id));

    await expect(context.repositories.accounts.listByUser(seeded.user.id)).resolves.toEqual([]);
    await expect(
      context.repositories.threads.findById(seeded.user.id, thread.id),
    ).resolves.toBeNull();
  });
});
