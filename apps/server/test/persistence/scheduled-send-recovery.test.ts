import type { ScheduledSend, ScheduledSendId } from '@relay/shared/domain';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { at, newId, seedAccount, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('PgScheduledSendRepository stale sending recovery', () => {
  const context = usePgTestContext();

  const schedule = async (seeded: SeededAccount): Promise<ScheduledSend> => {
    const draft = await context.repositories.drafts.create(seeded.user.id, {
      id: newId('draft'),
      accountId: seeded.account.id,
      to: [{ name: 'Eva', email: 'eva@firma.sk' }],
      cc: [],
      bcc: [],
      subject: 'Ponuka',
      body: 'Dobrý deň',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
      createdAt: at(0),
      updatedAt: at(0),
    });
    return context.repositories.scheduledSends.create({
      id: newId('scheduledSend'),
      userId: seeded.user.id,
      accountId: seeded.account.id,
      draftId: draft.id,
      scheduledAt: at(5),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: at(0),
    });
  };

  const statusOf = async (seeded: SeededAccount, id: ScheduledSendId) =>
    (await context.repositories.scheduledSends.findById(seeded.user.id, id))?.status;

  it('returns only sends claimed before the cutoff to pending', async () => {
    const seeded = await seedAccount(context.repositories);
    const stale = await schedule(seeded);
    const fresh = await schedule(seeded);
    const { scheduledSends } = context.repositories;
    await scheduledSends.claim(stale.id, at(0));
    await scheduledSends.claim(fresh.id, at(20));

    await expect(scheduledSends.releaseStaleSending(at(10))).resolves.toBe(1);

    await expect(statusOf(seeded, stale.id)).resolves.toBe('pending');
    await expect(statusOf(seeded, fresh.id)).resolves.toBe('sending');
    await expect(scheduledSends.listDue(at(30), 10)).resolves.toEqual([stale]);
    await expect(scheduledSends.claim(stale.id, at(30))).resolves.toBe(true);
  });

  it('treats sends stranded without a claim time as stale', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranded = await schedule(seeded);
    const client = new pg.Client({ connectionString: context.url });
    await client.connect();
    await client.query(
      "UPDATE scheduled_sends SET status = 'sending', claimed_at = NULL WHERE id = $1",
      [stranded.id],
    );
    await client.end();

    await expect(context.repositories.scheduledSends.releaseStaleSending(at(0))).resolves.toBe(1);
    await expect(statusOf(seeded, stranded.id)).resolves.toBe('pending');
  });

  it('cancels a stale sending send but not one that is still being sent', async () => {
    const seeded = await seedAccount(context.repositories);
    const stale = await schedule(seeded);
    const fresh = await schedule(seeded);
    const { scheduledSends } = context.repositories;
    await scheduledSends.claim(stale.id, at(0));
    await scheduledSends.claim(fresh.id, at(20));

    await expect(scheduledSends.cancel(seeded.user.id, fresh.id, at(10))).resolves.toBe(false);
    await expect(scheduledSends.cancel(seeded.user.id, stale.id, at(10))).resolves.toBe(true);
    await expect(scheduledSends.cancel(seeded.user.id, fresh.id, at(30))).resolves.toBe(true);

    await expect(statusOf(seeded, stale.id)).resolves.toBe('cancelled');
    await expect(statusOf(seeded, fresh.id)).resolves.toBe('cancelled');
  });
});
