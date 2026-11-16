import type { Draft, ScheduledSend, ScheduledSendId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, newId, seedAccount, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('Postgres send lease renewal', () => {
  const context = usePgTestContext();

  const createDraft = (seeded: SeededAccount): Promise<Draft> =>
    context.repositories.drafts.create(seeded.user.id, {
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

  const schedule = async (seeded: SeededAccount): Promise<ScheduledSend> =>
    context.repositories.scheduledSends.create({
      id: newId('scheduledSend'),
      userId: seeded.user.id,
      accountId: seeded.account.id,
      draftId: (await createDraft(seeded)).id,
      scheduledAt: at(5),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: at(0),
    });

  const statusOf = async (seeded: SeededAccount, id: ScheduledSendId) =>
    (await context.repositories.scheduledSends.findById(seeded.user.id, id))?.status;

  it('renews a draft send claim only for its owner and keeps it from going stale', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const { drafts } = context.repositories;
    const draft = await createDraft(seeded);
    const claim = (claimedAt: string, staleBefore: string) =>
      drafts.claimForSend(seeded.user.id, draft.id, { claimedAt, staleBefore });
    const renew = (claimedAt: string, renewedAt: string) =>
      drafts.renewSendClaim(seeded.user.id, draft.id, { claimedAt, renewedAt });

    await expect(renew(at(0), at(1))).resolves.toBe(false);
    await expect(claim(at(0), at(-10))).resolves.toBe(true);
    await expect(renew(at(0.5), at(8))).resolves.toBe(false);
    await expect(
      drafts.renewSendClaim(stranger.user.id, draft.id, { claimedAt: at(0), renewedAt: at(8) }),
    ).resolves.toBe(false);
    await expect(renew(at(0), at(8))).resolves.toBe(true);

    await expect(claim(at(15), at(5))).resolves.toBe(false);
    await expect(claim(at(20), at(9))).resolves.toBe(true);
    await expect(renew(at(0), at(21))).resolves.toBe(false);
    await expect(drafts.releaseSendClaim(seeded.user.id, draft.id, at(20))).resolves.toBe(true);
    await expect(claim(at(22), at(0))).resolves.toBe(true);
  });

  it('lets exactly one of a draft renewal and a stale takeover win', async () => {
    const seeded = await seedAccount(context.repositories);
    const { drafts } = context.repositories;
    const draft = await createDraft(seeded);
    await drafts.claimForSend(seeded.user.id, draft.id, { claimedAt: at(0), staleBefore: at(-1) });

    const [renewed, takenOver] = await Promise.all([
      drafts.renewSendClaim(seeded.user.id, draft.id, { claimedAt: at(0), renewedAt: at(12) }),
      drafts.claimForSend(seeded.user.id, draft.id, { claimedAt: at(12), staleBefore: at(10) }),
    ]);

    expect([renewed, takenOver].filter(Boolean)).toHaveLength(1);
  });

  it('renews a scheduled send claim so stale recovery and cancel leave it in sending', async () => {
    const seeded = await seedAccount(context.repositories);
    const { scheduledSends } = context.repositories;
    const item = await schedule(seeded);

    await expect(scheduledSends.renew(item.id, at(0), at(1))).resolves.toBe(false);
    await expect(scheduledSends.claim(item.id, at(0))).resolves.toBe(true);
    await expect(scheduledSends.renew(item.id, at(0.5), at(8))).resolves.toBe(false);
    await expect(scheduledSends.renew(item.id, at(0), at(8))).resolves.toBe(true);

    await expect(scheduledSends.releaseStaleSending(at(5), [])).resolves.toBe(0);
    await expect(scheduledSends.cancel(seeded.user.id, item.id, at(5))).resolves.toBe(false);
    await expect(statusOf(seeded, item.id)).resolves.toBe('sending');

    await expect(scheduledSends.releaseStaleSending(at(9), [])).resolves.toBe(1);
    await expect(scheduledSends.renew(item.id, at(0), at(10))).resolves.toBe(false);
    await expect(scheduledSends.claim(item.id, at(11))).resolves.toBe(true);
    await expect(scheduledSends.releaseStaleSending(at(10), [])).resolves.toBe(0);
    await expect(scheduledSends.markSent(item.id, at(12), at(11))).resolves.toBe(true);
    await expect(scheduledSends.renew(item.id, at(11), at(13))).resolves.toBe(false);
  });

  it('lets exactly one of a scheduled send renewal and stale recovery win', async () => {
    const seeded = await seedAccount(context.repositories);
    const { scheduledSends } = context.repositories;
    const item = await schedule(seeded);
    await scheduledSends.claim(item.id, at(0));

    const [renewed, released] = await Promise.all([
      scheduledSends.renew(item.id, at(0), at(12)),
      scheduledSends.releaseStaleSending(at(10), []),
    ]);

    expect([renewed, released === 1].filter(Boolean)).toHaveLength(1);
    await expect(statusOf(seeded, item.id)).resolves.toBe(renewed ? 'sending' : 'pending');
  });
});
