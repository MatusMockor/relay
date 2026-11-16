import { DraftIdSchema, ScheduledSendIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, userId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const DRAFT_ID = DraftIdSchema.parse('drf-lease');
const SEND_ID = ScheduledSendIdSchema.parse('sch-lease');

const at = (minutes: number): string =>
  new Date(Date.parse('2026-11-12T08:00:00.000Z') + minutes * 60_000).toISOString();

describe('SQLite send lease renewal', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedAccount(store.repositories);
    await store.repositories.drafts.create(LOCAL_USER_ID, {
      id: DRAFT_ID,
      accountId: accountId('acc-1'),
      to: [{ name: 'Jana', email: 'jana@klient.sk' }],
      cc: [],
      bcc: [],
      subject: 'Ponuka',
      body: 'Dobrý deň',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
      createdAt: at(-60),
      updatedAt: at(-60),
    });
  });

  afterEach(() => {
    store.database.close();
  });

  it('renews a draft send claim only for its owner and keeps it from going stale', async () => {
    const { drafts } = store.repositories;
    const claim = (claimedAt: string, staleBefore: string) =>
      drafts.claimForSend(LOCAL_USER_ID, DRAFT_ID, { claimedAt, staleBefore });
    const renew = (claimedAt: string, renewedAt: string) =>
      drafts.renewSendClaim(LOCAL_USER_ID, DRAFT_ID, { claimedAt, renewedAt });

    expect(await renew(at(0), at(1))).toBe(false);
    expect(await claim(at(0), at(-10))).toBe(true);
    expect(await renew(at(0.5), at(8))).toBe(false);
    expect(
      await drafts.renewSendClaim(userId('intruder'), DRAFT_ID, {
        claimedAt: at(0),
        renewedAt: at(8),
      }),
    ).toBe(false);
    expect(await renew(at(0), at(8))).toBe(true);

    expect(await claim(at(15), at(5))).toBe(false);
    expect(await claim(at(20), at(9))).toBe(true);
    expect(await renew(at(0), at(21))).toBe(false);
    expect(await drafts.releaseSendClaim(LOCAL_USER_ID, DRAFT_ID, at(20))).toBe(true);
    expect(await claim(at(22), at(0))).toBe(true);
  });

  it('renews a scheduled send claim so stale recovery and cancel leave it in sending', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create({
      id: SEND_ID,
      userId: LOCAL_USER_ID,
      accountId: accountId('acc-1'),
      draftId: DRAFT_ID,
      scheduledAt: at(-5),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: at(-60),
    });
    const statusOf = async () => (await scheduledSends.findById(LOCAL_USER_ID, SEND_ID))?.status;

    expect(await scheduledSends.renew(SEND_ID, at(0), at(1))).toBe(false);
    expect(await scheduledSends.claim(SEND_ID, at(0))).toBe(true);
    expect(await scheduledSends.renew(SEND_ID, at(0.5), at(8))).toBe(false);
    expect(await scheduledSends.renew(SEND_ID, at(0), at(8))).toBe(true);

    expect(await scheduledSends.releaseStaleSending(at(5), [])).toBe(0);
    expect(await scheduledSends.cancel(LOCAL_USER_ID, SEND_ID, at(5))).toBe(false);
    expect(await statusOf()).toBe('sending');

    expect(await scheduledSends.releaseStaleSending(at(9), [])).toBe(1);
    expect(await scheduledSends.renew(SEND_ID, at(0), at(10))).toBe(false);
    expect(await scheduledSends.claim(SEND_ID, at(11))).toBe(true);
    expect(await scheduledSends.releaseStaleSending(at(10), [])).toBe(0);
    expect(await scheduledSends.markSent(SEND_ID, at(12), at(11))).toBe(true);
    expect(await scheduledSends.renew(SEND_ID, at(11), at(13))).toBe(false);
  });
});
