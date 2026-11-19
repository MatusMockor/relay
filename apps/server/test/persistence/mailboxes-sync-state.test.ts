import { NotFoundError } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildMailbox, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('PgMailboxRepository', () => {
  const context = usePgTestContext();

  it('upserts by path, keeping ids and counts of existing mailboxes', async () => {
    const seeded = await seedAccount(context.repositories);
    await context.repositories.mailboxes.updateCounts(seeded.mailboxes.inbox.id, {
      unreadCount: 3,
      totalCount: 10,
    });
    const [inbox, archive] = await context.repositories.mailboxes.upsertMany(seeded.account.id, [
      buildMailbox(seeded.account.id, 'inbox', { name: 'Doručená pošta' }),
      buildMailbox(seeded.account.id, 'archive', { path: 'Archív' }),
    ]);

    expect(inbox).toEqual({
      ...seeded.mailboxes.inbox,
      name: 'Doručená pošta',
      unreadCount: 3,
      totalCount: 10,
    });
    expect(archive).toMatchObject({ path: 'Archív', role: 'archive' });
    await expect(
      context.repositories.mailboxes.findByRole(seeded.account.id, 'archive'),
    ).resolves.toEqual(archive);
    await expect(
      context.repositories.mailboxes.findByPath(seeded.account.id, 'INBOX'),
    ).resolves.toEqual(inbox);
    await expect(
      context.repositories.mailboxes.findById(seeded.mailboxes.inbox.id),
    ).resolves.toEqual(inbox);
  });

  it('adjusts the unread count without going below zero', async () => {
    const seeded = await seedAccount(context.repositories);
    const { mailboxes } = context.repositories;
    const inboxId = seeded.mailboxes.inbox.id;
    await mailboxes.updateCounts(inboxId, { unreadCount: 3, totalCount: 10 });

    await mailboxes.adjustUnreadCount(inboxId, -2);
    await expect(mailboxes.findById(inboxId)).resolves.toMatchObject({
      unreadCount: 1,
      totalCount: 10,
    });
    await mailboxes.adjustUnreadCount(inboxId, -5);
    await expect(mailboxes.findById(inboxId)).resolves.toMatchObject({ unreadCount: 0 });
    await mailboxes.adjustUnreadCount(inboxId, 2);
    await expect(mailboxes.findById(inboxId)).resolves.toMatchObject({ unreadCount: 2 });
    await expect(mailboxes.findById(seeded.mailboxes.sent.id)).resolves.toEqual(
      seeded.mailboxes.sent,
    );
  });

  it('lists per account for the owner only and deletes missing paths', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    await expect(
      context.repositories.mailboxes.listByAccount(stranger.user.id, seeded.account.id),
    ).resolves.toEqual([]);
    await expect(
      context.repositories.mailboxes.listByAccount(seeded.user.id, seeded.account.id),
    ).resolves.toHaveLength(2);

    const removed = await context.repositories.mailboxes.deleteMissing(seeded.account.id, [
      'INBOX',
    ]);
    expect(removed).toEqual([seeded.mailboxes.sent.id]);
    await expect(context.repositories.mailboxes.listForSync(seeded.account.id)).resolves.toEqual([
      seeded.mailboxes.inbox,
    ]);
  });

  it('accepts duplicate paths in one batch, last one wins', async () => {
    const seeded = await seedAccount(context.repositories);
    const stored = await context.repositories.mailboxes.upsertMany(seeded.account.id, [
      buildMailbox(seeded.account.id, 'custom', { path: 'Projekty', name: 'Prvý' }),
      buildMailbox(seeded.account.id, 'custom', { path: 'Projekty', name: 'Druhý' }),
    ]);
    expect(stored.map((mailbox) => mailbox.name)).toEqual(['Druhý']);
  });

  it('fails for an unknown account', async () => {
    const accountId = 'account_missing' as AccountId;
    await expect(
      context.repositories.mailboxes.upsertMany(accountId, [buildMailbox(accountId, 'inbox')]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PgSyncStateRepository', () => {
  const context = usePgTestContext();

  it('saves, overwrites, lists and deletes the mailbox sync state', async () => {
    const seeded = await seedAccount(context.repositories);
    const state = {
      accountId: seeded.account.id,
      mailboxId: seeded.mailboxes.inbox.id,
      uidValidity: 4_000_000_000,
      lastUid: 42,
      highestModseq: '18446744073709551615',
      uidNext: 4_000_000_001,
      messageCount: 40,
      initialWindow: { floorUid: 37, cutoff: '2026-10-11T10:00:00.000Z' },
      syncedAt: at(1),
    };
    await context.repositories.syncStates.save(state);
    await expect(context.repositories.syncStates.find(state.mailboxId)).resolves.toEqual(state);
    await context.repositories.syncStates.save({
      ...state,
      lastUid: 50,
      initialWindow: null,
      syncedAt: at(2),
    });

    await expect(context.repositories.syncStates.find(state.mailboxId)).resolves.toEqual({
      ...state,
      lastUid: 50,
      initialWindow: null,
      syncedAt: at(2),
    });
    await expect(
      context.repositories.syncStates.listByAccount(seeded.account.id),
    ).resolves.toHaveLength(1);
    await context.repositories.syncStates.delete(state.mailboxId);
    await expect(context.repositories.syncStates.find(state.mailboxId)).resolves.toBeNull();
  });

  it('is removed together with its mailbox', async () => {
    const seeded = await seedAccount(context.repositories);
    await context.repositories.syncStates.save({
      accountId: seeded.account.id,
      mailboxId: seeded.mailboxes.sent.id,
      uidValidity: 1,
      lastUid: 1,
      highestModseq: null,
      uidNext: null,
      messageCount: null,
      initialWindow: null,
      syncedAt: at(1),
    });
    await context.repositories.mailboxes.deleteMissing(seeded.account.id, ['INBOX']);
    await expect(
      context.repositories.syncStates.find(seeded.mailboxes.sent.id),
    ).resolves.toBeNull();
  });
});
