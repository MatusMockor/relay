import type { Mailbox, MailboxId, ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../src';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const setup = async (engine: TestEngine, path = 'INBOX') => {
  const { account, server } = await seedAccount(engine);
  server.addMailbox('Junk', 'spam');
  server.addMailbox('Faktúry', 'custom');
  deliverMail(server, path, { id: 'm1', subject: 'Faktúra 12', date: DATE });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = present([...engine.db.tables.threads.values()][0]);
  const mailbox = async (target: string) =>
    present(await engine.repositories.mailboxes.findByPath(account.id, target));
  return { account, server, thread, folder: await mailbox('Faktúry'), mailbox };
};

const move = (engine: TestEngine, thread: ThreadSummary, mailboxId: MailboxId) =>
  engine.services.actions.apply(USER_ID, thread.id, { type: 'move', mailboxId });

const count = (server: FakeMailServer, path: string) => server.mailbox(path).messages.size;

const workOf = (engine: TestEngine, kind: string) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === kind);

const folderIds = async (engine: TestEngine, folder: Mailbox) =>
  (
    await engine.services.inbox.list(USER_ID, { view: 'mailbox', mailboxId: folder.id, limit: 20 })
  ).items.map((item) => item.id);

const storedState = (engine: TestEngine, thread: ThreadSummary) =>
  present(engine.db.tables.threads.get(thread.id)).state;

describe('moving a thread to a folder on plain IMAP', () => {
  it('moves inbox mail into a custom folder and marks the thread done', async () => {
    const engine = createTestEngine();
    const { account, server, thread, folder } = await setup(engine);

    expect((await move(engine, thread, folder.id)).state).toBe('done');

    expect(count(server, 'INBOX')).toBe(0);
    expect(count(server, 'Faktúry')).toBe(1);
    expect(workOf(engine, 'provider-op')).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(storedState(engine, thread)).toBe('done');
    expect(await folderIds(engine, folder)).toEqual([thread.id]);
  });

  it.each([
    ['reportSpam', 'Junk', 'spam-origin'],
    ['trash', 'Trash', 'trash-origin'],
  ] as const)('takes a thread out of %s into the folder', async (action, path, origin) => {
    const engine = createTestEngine();
    const { account, server, thread, folder } = await setup(engine);
    await engine.services.actions.apply(USER_ID, thread.id, { type: action });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await move(engine, thread, folder.id)).state).toBe('done');

    expect(count(server, path)).toBe(0);
    expect(count(server, 'Faktúry')).toBe(1);
    expect(workOf(engine, origin)).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(storedState(engine, thread)).toBe('done');
  });

  it('moves folder mail back to the inbox addressed by its mailbox', async () => {
    const engine = createTestEngine();
    const { account, server, thread, mailbox } = await setup(engine, 'Faktúry');

    expect((await move(engine, thread, (await mailbox('INBOX')).id)).state).toBe('inbox');

    expect(count(server, 'Faktúry')).toBe(0);
    expect(count(server, 'INBOX')).toBe(1);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(storedState(engine, thread)).toBe('inbox');
  });

  it('does nothing when the thread is already in the folder', async () => {
    const engine = createTestEngine();
    const { server, thread, folder } = await setup(engine, 'Faktúry');

    expect((await move(engine, thread, folder.id)).state).toBe(thread.state);

    expect(count(server, 'Faktúry')).toBe(1);
    expect(workOf(engine, 'move-origin')).toEqual([]);
    expect(workOf(engine, 'provider-op')).toEqual([]);
  });

  it('undoes a move by returning the mail to where it was', async () => {
    const engine = createTestEngine();
    const { account, server, thread, folder } = await setup(engine);
    await move(engine, thread, folder.id);

    const undone = await engine.services.actions.apply(USER_ID, thread.id, { type: 'undoMove' });

    expect(undone.state).toBe('inbox');
    expect(count(server, 'Faktúry')).toBe(0);
    expect(count(server, 'INBOX')).toBe(1);
    expect(workOf(engine, 'move-origin')).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(storedState(engine, thread)).toBe('inbox');
  });

  it('undoes a move out of the trash by putting the mail back into the trash', async () => {
    const engine = createTestEngine();
    const { account, server, thread, folder } = await setup(engine);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    await move(engine, thread, folder.id);

    const undone = await engine.services.actions.apply(USER_ID, thread.id, { type: 'undoMove' });

    expect(undone.state).toBe('trash');
    expect(count(server, 'Trash')).toBe(1);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(storedState(engine, thread)).toBe('trash');
  });

  it('forgets undo records of other threads once the undo window is over', async () => {
    const engine = createTestEngine();
    const { account, server, thread, folder, mailbox } = await setup(engine);
    await move(engine, thread, folder.id);
    deliverMail(server, 'INBOX', { id: 'm2', subject: 'Iná vec', date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const later = present(
      [...engine.db.tables.threads.values()].find((candidate) => candidate.id !== thread.id),
    );

    engine.clock.advance(61 * 60_000);
    await move(engine, later, (await mailbox('Archive')).id);

    expect(workOf(engine, 'move-origin').map((work) => work.ref)).toEqual(
      (await engine.repositories.messages.listByThread(USER_ID, later.id)).map(({ id }) => id),
    );
  });

  it('rejects targets that are not folders of the thread account', async () => {
    const engine = createTestEngine();
    const { thread, mailbox } = await setup(engine);
    const other = await seedAccount(engine, { email: 'bob@example.com' });
    await engine.services.sync.syncAccount(USER_ID, other.account.id);
    const foreign = present(
      await engine.repositories.mailboxes.findByPath(other.account.id, 'INBOX'),
    );

    await expect(move(engine, thread, (await mailbox('Sent')).id)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(move(engine, thread, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
