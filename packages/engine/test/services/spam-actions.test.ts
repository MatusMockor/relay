import type { FolderView, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const remoteCount = (server: FakeMailServer, path: string): number =>
  server.mailbox(path).messages.size;

const viewIds = async (engine: TestEngine, view: FolderView): Promise<ThreadId[]> =>
  (await engine.services.inbox.list(USER_ID, { view, limit: 50 })).items.map((item) => item.id);

const syncedThread = async (
  engine: TestEngine,
  deliveries: readonly [string, MailSpec][],
  withSpam = true,
) => {
  const seeded = await seedAccount(engine);
  if (withSpam) {
    seeded.server.addMailbox('Spam', 'spam');
  }
  deliveries.forEach(([path, spec]) => deliverMail(seeded.server, path, spec));
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const [thread] = [...engine.db.tables.threads.values()];
  return { ...seeded, thread: present(thread) };
};

describe('report spam and not spam', () => {
  it('moves the received mail of a thread to the spam mailbox and out of every other view', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, [
      ['INBOX', { id: 'm1', date: DATE }],
      ['Sent', { id: 'r1', from: ME, inReplyTo: 'm1', references: ['m1'], date: DATE }],
    ]);
    engine.events.clear();

    const reported = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'reportSpam',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(reported.state).toBe('spam');
    expect(remoteCount(server, 'INBOX')).toBe(0);
    expect(remoteCount(server, 'Spam')).toBe(1);
    expect(remoteCount(server, 'Sent')).toBe(1);
    expect(await viewIds(engine, 'spam')).toEqual([thread.id]);
    for (const view of ['inbox', 'done', 'sent', 'trash'] as const) {
      expect(await viewIds(engine, view)).toEqual([]);
    }
    const states = engine.events.ofType('thread.upserted').map((event) => event.data.thread.state);
    expect(states[0]).toBe('spam');
    expect(states).not.toContain('inbox');
  });

  it('brings a reported inbox thread back to the inbox', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, [
      ['INBOX', { id: 'm1', date: DATE }],
    ]);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'reportSpam' });

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'notSpam' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(restored.state).toBe('inbox');
    expect(remoteCount(server, 'INBOX')).toBe(1);
    expect(remoteCount(server, 'Spam')).toBe(0);
    expect(await viewIds(engine, 'inbox')).toEqual([thread.id]);
    expect(await viewIds(engine, 'spam')).toEqual([]);
    const origins = [...engine.db.tables.pendingWork.values()].filter(
      (work) => work.kind === 'spam-origin',
    );
    expect(origins).toEqual([]);
  });

  it('returns a reported archived thread to the archive', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [['Archive', { id: 'a1', date: DATE }]]);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'reportSpam' });

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'notSpam' });

    expect(restored.state).toBe('done');
    expect(remoteCount(server, 'Archive')).toBe(1);
    expect(remoteCount(server, 'INBOX')).toBe(0);
  });

  it('sends mail found in the spam mailbox to the inbox', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [['Spam', { id: 's1', date: DATE }]]);
    expect(thread.state).toBe('spam');

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'notSpam' });

    expect(restored.state).toBe('inbox');
    expect(remoteCount(server, 'INBOX')).toBe(1);
    expect(remoteCount(server, 'Spam')).toBe(0);
  });

  it('restores a trashed spam thread to spam and keeps where it came from', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [['Archive', { id: 'a1', date: DATE }]]);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'reportSpam' });
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    expect(remoteCount(server, 'Trash')).toBe(1);

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });
    expect(restored.state).toBe('spam');
    expect(remoteCount(server, 'Spam')).toBe(1);

    const back = await engine.services.actions.apply(USER_ID, thread.id, { type: 'notSpam' });
    expect(back.state).toBe('done');
    expect(remoteCount(server, 'Archive')).toBe(1);
  });

  it('creates a Junk mailbox when the account has no spam mailbox', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(
      engine,
      [['INBOX', { id: 'm1', date: DATE }]],
      false,
    );

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'reportSpam' });

    expect(server.createdMailboxes).toEqual(['Junk']);
    expect(remoteCount(server, 'Junk')).toBe(1);
    const spam = present(await engine.repositories.mailboxes.findByRole(account.id, 'spam'));
    const [message] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(message?.mailboxId).toBe(spam.id);
  });

  it('refuses to report a thread with only your own sent mail', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [
      ['Sent', { id: 's1', from: ME, date: DATE }],
    ]);

    await expect(
      engine.services.actions.apply(USER_ID, thread.id, { type: 'reportSpam' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(remoteCount(server, 'Sent')).toBe(1);
    expect((await engine.repositories.threads.findById(USER_ID, thread.id))?.state).toBe('done');
  });

  it.each(['done', 'undone'] as const)('rejects %s on a spam thread', async (type) => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [['Spam', { id: 's1', date: DATE }]]);

    await expect(
      engine.services.actions.apply(USER_ID, thread.id, { type }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(remoteCount(server, 'Spam')).toBe(1);
    expect((await engine.repositories.threads.findById(USER_ID, thread.id))?.state).toBe('spam');
  });
});
