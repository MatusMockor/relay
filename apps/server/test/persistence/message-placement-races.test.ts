import { describe, expect, it } from 'vitest';
import { buildMessage, buildThread, seedAccount } from './support/fixtures';
import { openLockHolder, waitForLockWaiters } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';

describe('PgMessageRepository placement races', () => {
  const context = usePgTestContext();

  it('keeps a message that a concurrent move relocated before the expunge commits', async () => {
    const seeded = await seedAccount(context.repositories);
    const { inbox, sent } = seeded.mailboxes;
    const thread = await context.repositories.threads.upsert(buildThread(seeded.account.id));
    const message = buildMessage(thread, inbox, { uid: 7 });
    await context.repositories.messages.upsert(message, new Map());
    const holder = await openLockHolder(context.url);
    await holder.query('UPDATE messages SET mailbox_id = $2, uid = 3 WHERE id = $1', [
      message.id,
      sent.id,
    ]);
    await holder.query(
      'UPDATE message_placements SET mailbox_id = $2, uid = 3 WHERE message_id = $1',
      [message.id, sent.id],
    );

    const expunging = context.repositories.messages.deleteByUids(inbox.id, [7]);
    await waitForLockWaiters(context.url);
    await holder.commit();

    await expect(expunging).resolves.toEqual([]);
    await expect(
      context.repositories.messages.findByLocation({ mailboxId: sent.id, uid: 3 }),
    ).resolves.toMatchObject({ id: message.id, placements: [{ mailboxId: sent.id, uid: 3 }] });
  });
});
