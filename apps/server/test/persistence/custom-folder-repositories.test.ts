import type { Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildMailbox, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

describe('Postgres repositories for custom folders and Gmail labels', () => {
  const context = usePgTestContext();

  it('stores subscribed and UIDVALIDITY and updates them on the next upsert', async () => {
    const seeded = await seedAccount(context.repositories);
    const { mailboxes } = context.repositories;
    const [folder] = await mailboxes.upsertMany(seeded.account.id, [
      buildMailbox(seeded.account.id, 'custom', {
        path: 'Projekty',
        name: 'Projekty',
        subscribed: false,
        uidValidity: 4_000_000_000,
      }),
    ]);
    expect(folder).toMatchObject({ subscribed: false, uidValidity: 4_000_000_000 });
    expect(folder).toBeDefined();
    const stored = folder ?? seeded.mailboxes.inbox;

    await mailboxes.upsertMany(seeded.account.id, [
      { ...stored, subscribed: true, uidValidity: 12 },
    ]);
    await mailboxes.saveUidValidity(seeded.mailboxes.inbox.id, 5);

    const listed = await mailboxes.listForSync(seeded.account.id);
    expect(
      listed.map((mailbox) => [mailbox.path, mailbox.subscribed, mailbox.uidValidity]),
    ).toEqual([
      ['INBOX', true, 5],
      ['Projekty', true, 12],
      ['sent', true, null],
    ]);
  });

  it('relocates a mailbox in place and keeps its messages and sync state', async () => {
    const seeded = await seedAccount(context.repositories);
    const { mailboxes, syncStates, messages } = context.repositories;
    const [folder] = await mailboxes.upsertMany(seeded.account.id, [
      buildMailbox(seeded.account.id, 'custom', { path: 'Projekty', name: 'Projekty' }),
    ]);
    expect(folder).toBeDefined();
    const moved = folder ?? seeded.mailboxes.inbox;
    const { message } = await seedThread(context.repositories, {
      ...seeded,
      mailboxes: { ...seeded.mailboxes, inbox: moved },
    });
    const state = {
      accountId: seeded.account.id,
      mailboxId: moved.id,
      uidValidity: 7,
      lastUid: message.uid,
      highestModseq: '3',
      uidNext: message.uid + 1,
      messageCount: 1,
      initialWindow: null,
      syncedAt: at(1),
    };
    await syncStates.save(state);

    await mailboxes.relocate(moved.id, {
      path: 'Archív.Projekty',
      name: 'Projekty',
      delimiter: '.',
    });

    await expect(mailboxes.findById(moved.id)).resolves.toMatchObject({
      path: 'Archív.Projekty',
      delimiter: '.',
    });
    await expect(mailboxes.findByPath(seeded.account.id, 'Projekty')).resolves.toBeNull();
    await expect(
      messages.findByLocation({ mailboxId: moved.id, uid: message.uid }),
    ).resolves.toMatchObject({ id: message.id });
    await expect(syncStates.find(moved.id)).resolves.toEqual(state);
  });

  it('keeps label kind and remote name and finds labels by them', async () => {
    const seeded = await seedAccount(context.repositories);
    const { labels } = context.repositories;
    const keyword: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'Faktury',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktury',
    };
    const gmail: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'Projekty/Alfa',
      color: null,
      kind: 'gmail',
      remoteName: 'Projekty/Alfa',
    };
    await labels.upsert(keyword);
    await labels.upsert(gmail);
    await labels.upsert({ ...gmail, name: 'Projekty/Beta', remoteName: 'Projekty/Beta' });

    await expect(
      labels.findByRemoteName(seeded.account.id, 'gmail', 'Projekty/Alfa'),
    ).resolves.toBeNull();
    await expect(
      labels.findByRemoteName(seeded.account.id, 'gmail', 'Projekty/Beta'),
    ).resolves.toEqual({ ...gmail, name: 'Projekty/Beta', remoteName: 'Projekty/Beta' });
    await expect(
      labels.findByRemoteName(seeded.account.id, 'keyword', 'Projekty/Beta'),
    ).resolves.toBeNull();
    await expect(labels.listByKind(seeded.account.id, 'keyword')).resolves.toEqual([keyword]);
  });

  it('stores the email id and finds every copy of a message by it', async () => {
    const seeded = await seedAccount(context.repositories);
    const inbox = await seedThread(context.repositories, seeded, {}, { emailId: '1789' });
    const sentCopy = await seedThread(
      context.repositories,
      { ...seeded, mailboxes: { ...seeded.mailboxes, inbox: seeded.mailboxes.sent } },
      { lastMessageAt: at(20) },
      { emailId: '1789' },
    );
    await seedThread(context.repositories, seeded);

    const copies = await context.repositories.messages.findByEmailId(seeded.account.id, '1789');
    expect(copies.map((message) => [message.id, message.emailId])).toEqual([
      [inbox.message.id, '1789'],
      [sentCopy.message.id, '1789'],
    ]);
    await expect(
      context.repositories.messages.findByEmailId(seeded.account.id, 'missing'),
    ).resolves.toEqual([]);
  });
});
